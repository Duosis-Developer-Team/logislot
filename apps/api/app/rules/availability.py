"""AvailabilityService: dort kural ailesini tek yuzeyden degerlendirir.

1. Kategori-Sure kurallari (v1.0'dan korunur)
2. Arac-Rampa uyumlulugu (sert)
3. Rampa cakisma gruplari (sert)
4. Bilgilendirme/uyari katmani (tavsiye — asla engellemez)
"""

import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.core.enums import (
    BLOCKING_APPOINTMENT_STATUSES,
    CargoWindow,
    ConflictRelationType,
    DeliveryType,
    DockOverrideType,
)
from app.models import Appointment, Dock, DockOverride
from app.rules.context import (
    HardRuleCode,
    HardRuleResult,
    RuleEvaluationContext,
    SlotEvaluation,
    WarningCode,
    WarningRuleResult,
)
from app.services.overrides import pick_override

#: Randevu slot izgarasinin adimi (dakika).
SLOT_MINUTES = 30
#: Hicbir yerde ust sinir tanimli degilse uygulanan SISTEM VARSAYILANI (dakika).
#: Onceden tanimsiz ust sinir "sinirsiz" demekti ve tek randevu tum gunu
#: kapatabiliyordu. Acikca girilen kategori/tedarikci limiti bunu EZER.
#: Frontend karsiligi: packages/shared DEFAULT_MAX_BLOCK_MINUTES.
DEFAULT_MAX_BLOCK_MINUTES = 120
WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
# Kargo kaba pencereleri (tesis yerel saati)
CARGO_WINDOW_BOUNDS: dict[CargoWindow, tuple[time, time]] = {
    CargoWindow.morning: (time(8, 0), time(12, 0)),
    CargoWindow.afternoon: (time(12, 0), time(18, 0)),
    CargoWindow.all_day: (time(8, 0), time(18, 0)),
}


def _parse_hhmm(value: str) -> time:
    hour, minute = value.split(":")
    return time(int(hour), int(minute))


class AvailabilityService:
    def __init__(self, ctx: RuleEvaluationContext) -> None:
        self.ctx = ctx
        self.tz = ZoneInfo(ctx.facility.timezone)

    # ---------- yardimcilar ----------

    def _aware(self, dt: datetime) -> datetime:
        """SQLite naive datetime dondurur; UTC varsayip normalize et."""
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.astimezone(self.tz)

    def _local(self, day: date, t: time) -> datetime:
        return datetime.combine(day, t, tzinfo=self.tz)

    # ---------- sert kural 1: talep dogrulama ----------

    def validate_duration(self) -> HardRuleResult:
        """Sure limitleri: kategori araligi + tedarikci araligi.

        `validate_request`ten AYRI durur cunku revize akisi yalnizca bu
        kismi yeniden dogrular — kota/izin kontrolleri mevcut bir randevunun
        saatini tasimayi engellememelidir.
        """
        ctx = self.ctx

        if ctx.duration_minutes < ctx.product_category.min_block_minutes:
            return HardRuleResult.failed(HardRuleCode.DURATION_BELOW_CATEGORY_MINIMUM)

        if (
            ctx.product_category.max_block_minutes is not None
            and ctx.duration_minutes > ctx.product_category.max_block_minutes
        ):
            return HardRuleResult.failed(HardRuleCode.DURATION_ABOVE_CATEGORY_MAXIMUM)

        if (
            ctx.supplier.min_block_minutes is not None
            and ctx.duration_minutes < ctx.supplier.min_block_minutes
        ) or (
            ctx.supplier.max_block_minutes is not None
            and ctx.duration_minutes > ctx.supplier.max_block_minutes
        ):
            return HardRuleResult.failed(HardRuleCode.DURATION_OUTSIDE_SUPPLIER_LIMITS)

        # Hicbir yerde ust sinir tanimli degilse sistem varsayilani devreye girer:
        # tanimsiz limit artik "sinirsiz" DEGIL (tek randevu gunu kapatamasin).
        if (
            ctx.product_category.max_block_minutes is None
            and ctx.supplier.max_block_minutes is None
            and ctx.duration_minutes > DEFAULT_MAX_BLOCK_MINUTES
        ):
            return HardRuleResult.failed(HardRuleCode.DURATION_ABOVE_CATEGORY_MAXIMUM)

        return HardRuleResult.passed()

    def validate_request(self) -> HardRuleResult:
        ctx = self.ctx

        allowed_ids = {c.id for c in ctx.supplier.allowed_product_categories}
        if ctx.product_category.id not in allowed_ids:
            return HardRuleResult.failed(HardRuleCode.SUPPLIER_CATEGORY_NOT_ALLOWED)

        # Gecmis GUN: kargo randevusunun kesin saati yoktur, bu yuzden
        # interval_status korumasi ona islemez — gun bazli kontrol burada.
        if ctx.target_date < ctx.now.astimezone(self.tz).date():
            return HardRuleResult.failed(HardRuleCode.START_TIME_IN_PAST)

        duration_check = self.validate_duration()
        if not duration_check.ok:
            return duration_check

        if (
            ctx.supplier.weekly_quota is not None
            and ctx.supplier_week_count >= ctx.supplier.weekly_quota
        ) or (
            ctx.supplier.monthly_quota is not None
            and ctx.supplier_month_count >= ctx.supplier.monthly_quota
        ):
            return HardRuleResult.failed(HardRuleCode.SUPPLIER_QUOTA_EXCEEDED)

        return HardRuleResult.passed()

    # ---------- sert kural 2: arac-rampa uyumlulugu ----------

    def compatible_docks(self) -> list[Dock]:
        ctx = self.ctx
        result: list[Dock] = []
        for dock in ctx.docks:
            if not dock.is_active:
                continue
            product_ids = {c.id for c in dock.accepted_product_categories}
            if product_ids and ctx.product_category.id not in product_ids:
                continue
            vehicle_ids = {v.id for v in dock.accepted_vehicle_categories}
            # BOS liste = tum arac kategorileri kabul (geriye uyumluluk).
            if (
                vehicle_ids
                and ctx.vehicle_category_id is not None
                and ctx.vehicle_category_id not in vehicle_ids
            ):
                continue
            result.append(dock)
        return sorted(result, key=lambda d: d.name)

    # ---------- calisma saatleri + override ----------

    def dock_day_window(self, dock: Dock) -> tuple[datetime, datetime] | None:
        """Rampanin hedef gundeki acik penceresi; kapaliysa None."""
        day = self.ctx.target_date
        override = self._override_for(dock.id)
        if override is not None:
            if override.type == DockOverrideType.closed:
                return None
            if override.start_time and override.end_time:
                return (
                    self._local(day, override.start_time),
                    self._local(day, override.end_time),
                )

        hours = dock.working_hours_json or self.ctx.facility.default_working_profile_json
        if not hours:
            return None
        day_conf = hours.get(WEEKDAY_KEYS[day.weekday()])
        if not day_conf:
            return None
        return (
            self._local(day, _parse_hhmm(day_conf["start"])),
            self._local(day, _parse_hhmm(day_conf["end"])),
        )

    def _override_for(self, dock_id: uuid.UUID) -> DockOverride | None:
        return pick_override(self.ctx.overrides, dock_id, self.ctx.target_date)

    # ---------- sert kural 3: cakisma kontrolu ----------

    def _blocking_appointments(self, dock_id: uuid.UUID) -> list[Appointment]:
        """Rampanin zamanini fiilen isgal eden randevular.

        Kargo randevulari SERT blokaj uretmez (tavsiye katmani); yalnizca
        standart randevular zaman isgal eder.
        """
        return [
            a
            for a in self.ctx.existing_appointments
            if a.dock_id == dock_id
            and a.status in BLOCKING_APPOINTMENT_STATUSES
            and a.delivery_type == DeliveryType.standard
        ]

    def _group_siblings(self, dock_id: uuid.UUID) -> list[uuid.UUID]:
        """Aktif cakisma gruplari uzerinden bu rampayla catisan kardes rampalar."""
        siblings: list[uuid.UUID] = []
        for group in self.ctx.conflict_groups:
            if not group.is_active:
                continue
            member_ids = [m.dock_id for m in group.members]
            if dock_id not in member_ids:
                continue
            if group.relation_type == ConflictRelationType.conditional:
                trigger = group.trigger_condition_json or {}
                trigger_vehicles = {
                    uuid.UUID(v) for v in trigger.get("vehicle_category_ids", [])
                }
                if (
                    self.ctx.vehicle_category_id is None
                    or self.ctx.vehicle_category_id not in trigger_vehicles
                ):
                    continue
            # mutual_block ve shared_capacity ilk surumde ayni davranir;
            # model bilincli olarak ayrik tutulur.
            siblings.extend(m for m in member_ids if m != dock_id)
        return siblings

    def interval_status(
        self, dock: Dock, start: datetime, end: datetime
    ) -> HardRuleResult:
        """Rampa + kardes rampalar icin zaman araliginin uygunlugu."""
        # Gecmis saat: takvim/manuel/otomatik tum yollar bu fonksiyondan gectigi
        # icin koruma tek noktada durur (create, revize, rampa secimi).
        if start < self.ctx.now:
            return HardRuleResult.failed(HardRuleCode.START_TIME_IN_PAST)

        override = self._override_for(dock.id)
        if override is not None and override.type == DockOverrideType.closed:
            return HardRuleResult.failed(HardRuleCode.DOCK_CLOSED_BY_OVERRIDE)

        window = self.dock_day_window(dock)
        if window is None:
            return HardRuleResult.failed(HardRuleCode.DOCK_OUTSIDE_WORKING_HOURS)
        if start < window[0] or end > window[1]:
            return HardRuleResult.failed(HardRuleCode.DOCK_OUTSIDE_WORKING_HOURS)

        for appt in self._blocking_appointments(dock.id):
            if self._overlaps(appt, start, end):
                return HardRuleResult.failed(HardRuleCode.DOCK_TIME_CONFLICT)

        for sibling_id in self._group_siblings(dock.id):
            for appt in self._blocking_appointments(sibling_id):
                if self._overlaps(appt, start, end):
                    return HardRuleResult.failed(HardRuleCode.DOCK_CONFLICT_GROUP_BLOCKED)

        return HardRuleResult.passed()

    def _overlaps(self, appt: Appointment, start: datetime, end: datetime) -> bool:
        appt_start = self._aware(appt.scheduled_start_at)
        appt_end = self._aware(appt.scheduled_end_at)
        return appt_start < end and appt_end > start

    # ---------- tavsiye katmani (asla engellemez) ----------

    def advisory_warnings(
        self, dock_id: uuid.UUID, start: datetime, end: datetime
    ) -> list[WarningRuleResult]:
        warnings: list[WarningRuleResult] = []
        cargo_appts = [
            a
            for a in self.ctx.existing_appointments
            if a.dock_id == dock_id
            and a.delivery_type == DeliveryType.cargo
            and a.status in BLOCKING_APPOINTMENT_STATUSES
        ]
        if cargo_appts:
            first = cargo_appts[0]
            warnings.append(
                WarningRuleResult(
                    code=WarningCode.CARGO_DAY_WARNING,
                    message="Bu gun bu rampada kargo bekleniyor; bosluk birakin",
                    dock_id=dock_id,
                    appointment_id=first.id,
                    window=first.cargo_window.value if first.cargo_window else None,
                )
            )
            for appt in cargo_appts:
                if self._overlaps(appt, start, end):
                    warnings.append(
                        WarningRuleResult(
                            code=WarningCode.CARGO_WINDOW_OVERLAP,
                            message="Bu zaman araliginda ayni rampada kargo bekleniyor",
                            dock_id=dock_id,
                            appointment_id=appt.id,
                            window=appt.cargo_window.value if appt.cargo_window else None,
                        )
                    )
                    break
        return warnings

    # ---------- musaitlik: 30 dk slot izgarasi ----------

    def evaluate_day(self) -> list[SlotEvaluation]:
        docks = self.compatible_docks()
        if not docks:
            return []

        windows = {d.id: self.dock_day_window(d) for d in docks}
        open_windows = [w for w in windows.values() if w is not None]
        if not open_windows:
            return []
        grid_start = min(w[0] for w in open_windows)
        grid_end = max(w[1] for w in open_windows)

        slots: list[SlotEvaluation] = []
        cursor = grid_start
        duration = timedelta(minutes=self.ctx.duration_minutes)
        while cursor + duration <= grid_end:
            # Gecmis slotlar HIC sunulmaz. (interval_status bunlari zaten
            # reddederdi ama o durumda "dolu" gibi gorunur, oysa dolu degil.)
            if cursor < self.ctx.now:
                cursor += timedelta(minutes=SLOT_MINUTES)
                continue
            slot_end = cursor + duration
            free_ids: list[uuid.UUID] = []
            reasons: list[str] = []
            warnings: list[WarningRuleResult] = []
            for dock in docks:
                status = self.interval_status(dock, cursor, slot_end)
                if status.ok:
                    free_ids.append(dock.id)
                    warnings.extend(self.advisory_warnings(dock.id, cursor, slot_end))
                elif status.code:
                    reasons.append(status.code)

            if free_ids and len(free_ids) == len(docks):
                slot_status = "available"
            elif free_ids:
                slot_status = "partial"
            else:
                slot_status = "full"

            slots.append(
                SlotEvaluation(
                    start=cursor,
                    end=slot_end,
                    status=slot_status,
                    candidate_dock_ids=free_ids,
                    blocking_reasons=sorted(set(reasons)),
                    advisory_warnings=warnings,
                )
            )
            cursor += timedelta(minutes=SLOT_MINUTES)
        return slots

    # ---------- akilli rampa atamasi ----------

    def booked_minutes_on_target_day(self, dock_id: uuid.UUID) -> int:
        """Rampanin HEDEF gundeki dolulugu (en-az-dolu secimi icin).

        Yuklenen pencere +-1 gunu kapsar; secim yalnizca hedef gune bakmali.
        """
        day_start = self._local(self.ctx.target_date, time(0, 0))
        day_end = day_start + timedelta(days=1)
        total = 0
        for appt in self._blocking_appointments(dock_id):
            start = max(self._aware(appt.scheduled_start_at), day_start)
            end = min(self._aware(appt.scheduled_end_at), day_end)
            if end > start:
                total += int((end - start).total_seconds() // 60)
        return total

    def choose_dock(self, start: datetime, end: datetime) -> Dock | None:
        """Hedef gunde en az dolu uygun rampa; esitlikte ada gore deterministik."""
        candidates = [
            d for d in self.compatible_docks() if self.interval_status(d, start, end).ok
        ]
        if not candidates:
            return None
        return min(
            candidates, key=lambda d: (self.booked_minutes_on_target_day(d.id), d.name)
        )

    def choose_dock_for_cargo(self) -> Dock | None:
        """Kargo icin rampa secimi: gun icinde acik, hedef gunde en az dolu rampa.

        Kargo sert blokaj uretmedigi icin aralik bosluk kontrolu yapilmaz.
        """
        open_docks = [d for d in self.compatible_docks() if self.dock_day_window(d) is not None]
        if not open_docks:
            return None
        return min(
            open_docks, key=lambda d: (self.booked_minutes_on_target_day(d.id), d.name)
        )

    # ---------- kargo penceresi ----------

    def cargo_bounds(self) -> tuple[datetime, datetime]:
        window = self.ctx.cargo_window or CargoWindow.all_day
        start_t, end_t = CARGO_WINDOW_BOUNDS[window]
        return (
            self._local(self.ctx.target_date, start_t),
            self._local(self.ctx.target_date, end_t),
        )
