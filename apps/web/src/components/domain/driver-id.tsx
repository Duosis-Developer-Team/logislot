"use client";

/**
 * Surucu kimlik numarasi (guvenlik; musteri karari 2026-11).
 *
 * - DriverIdInput : sihirbaz / yonetim formu girisi; istemci tarafi TCKN
 *                   algoritmasi (son karar sunucuda).
 * - DriverIdValue : detayda maskeli deger; izinli kullanicida "Goster"
 *                   (sunucu her goruntulemeyi denetim kaydina yazar).
 */

import { Eye, EyeOff, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { revealDriverId, searchByDriverId } from "@/lib/api/appointments";
import type { AppointmentDto, FormFieldMode } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { checkDriverId } from "@/lib/driver-id";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import { useT } from "@/lib/i18n/provider";
import { formatDateTime } from "@/lib/utils";

/** Bos ise null; aksi halde hata anahtari ya da null (gecerli). */
export function driverIdError(mode: FormFieldMode, value: string): string | null {
  if (mode === "hidden") return null;
  if (!value.trim()) return mode === "required" ? "required" : null;
  const check = checkDriverId(value);
  return check.ok ? null : check.reason;
}

export function DriverIdInput({
  mode,
  value,
  onChange,
  id = "driver-id",
}: {
  mode: FormFieldMode;
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) {
  const t = useT();
  const copy = t.driverId;
  const [touched, setTouched] = useState(false);
  if (mode === "hidden") return null;
  const error = driverIdError(mode, value);
  const shownError = touched && error && error !== "required" ? copy.errors[error] : null;
  return (
    <div>
      <Label htmlFor={id}>
        {copy.label} {mode === "required" ? copy.required : copy.optional}
      </Label>
      <Input
        id={id}
        value={value}
        maxLength={32}
        autoComplete="off"
        inputMode="text"
        placeholder={copy.placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={shownError ? true : undefined}
      />
      {shownError ? (
        <p className="mt-1 text-xs text-destructive">{shownError}</p>
      ) : (
        <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {copy.hint}
        </p>
      )}
    </div>
  );
}

const AUTO_HIDE_MS = 30_000;

export function DriverIdValue({ appointment }: { appointment: AppointmentDto }) {
  const t = useT();
  const copy = t.driverId;
  const errorMessage = useApiErrorMessage();
  const { activeFacilityId, can } = useSession();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Acik deger ekranda kalici durmasin: 30 sn sonra kendiliginden gizlenir.
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(null), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [revealed]);

  if (appointment.driver_id_purged_at) {
    return <span className="text-xs text-muted-foreground">{copy.purged}</span>;
  }
  if (!appointment.driver_id_masked) return <span>—</span>;

  async function onReveal() {
    if (!activeFacilityId) return;
    setError(null);
    setLoading(true);
    try {
      setRevealed((await revealDriverId(activeFacilityId, appointment.id)).value);
    } catch (err) {
      setError(errorMessage(err, copy.revealFailed));
    } finally {
      setLoading(false);
    }
  }

  const type = appointment.driver_id_type ? copy.types[appointment.driver_id_type] : "";
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-mono">{revealed ?? appointment.driver_id_masked}</span>
      {type && <span className="text-xs text-muted-foreground">{type}</span>}
      {can("appt.driver_id.view") && (
        <button
          type="button"
          onClick={() => (revealed ? setRevealed(null) : void onReveal())}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10"
        >
          {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {revealed ? copy.hide : copy.reveal}
        </button>
      )}
      {error && <span className="w-full text-xs text-destructive">{error}</span>}
    </span>
  );
}

/**
 * Guvenlik kapisi: surucu kimlik numarasiyla randevu bulma. Numara istek
 * GOVDESINDE gider (URL/gecmis/loglara dusmez); sonuca tiklamak detayi acar.
 */
export function DriverIdSearchDialog({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (appointmentId: string) => void;
}) {
  const t = useT();
  const copy = t.driverId;
  const errorMessage = useApiErrorMessage();
  const { activeFacilityId } = useSession();
  const [value, setValue] = useState("");
  const [results, setResults] = useState<AppointmentDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function close() {
    setValue("");
    setResults(null);
    setError(null);
    onClose();
  }

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!activeFacilityId) return;
    const check = checkDriverId(value);
    if (!check.ok) {
      setError(copy.errors[check.reason]);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      setResults(await searchByDriverId(activeFacilityId, check.value));
    } catch (err) {
      setError(errorMessage(err, copy.searchFailed));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} title={copy.searchTitle}>
      <form onSubmit={(e) => void onSearch(e)} className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">{copy.searchHint}</p>
        <div className="flex gap-2">
          <Input
            autoFocus
            autoComplete="off"
            value={value}
            maxLength={32}
            placeholder={copy.searchPlaceholder}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit" disabled={loading || !value.trim()}>
            <Search className="mr-1 h-4 w-4" /> {copy.searchButton}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {results && results.length === 0 && (
          <p className="text-sm text-muted-foreground">{copy.searchEmpty}</p>
        )}
        {results && results.length > 0 && (
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-auto">
            {results.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(a.id);
                    close();
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{a.supplier_name ?? "—"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDateTime(a.scheduled_start_at)}
                      {a.license_plate ? ` · ${a.license_plate}` : ""}
                      {a.driver_name ? ` · ${a.driver_name}` : ""}
                    </span>
                  </span>
                  <StatusBadge status={a.status as never} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={close}>
            {copy.close}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
