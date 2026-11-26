/**
 * Sürücü kimlik numarası (güvenlik) — web components/domain/driver-id.tsx karşılığı.
 *
 * - DriverIdField  : sihirbaz / yönetim formu girişi (istemci TCKN kontrolü).
 * - DriverIdRow    : detayda maskeli değer; izinli kullanıcıda "Göster"
 *                    (sunucu her görüntülemeyi denetim kaydına yazar; 30 sn sonra gizlenir).
 * - DriverIdSearch : güvenlik kapısı; numarayla randevu bulma (numara gövdede).
 */

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { revealDriverId, searchByDriverId } from "@/api/admin";
import { ApiError } from "@/api/client";
import type { AppointmentDto, FormFieldMode } from "@/api/types";
import { useSession } from "@/auth/session";
import { StatusBadge } from "@/components/appointment";
import { AppModal, Button, Field } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { radius } from "@/theme/tokens";
import { formatDate, timeInTz } from "@/utils/format";
import { checkDriverId } from "@/utils/driver-id";

const ERRORS: Record<string, string> = {
  tcknLength: "T.C. kimlik numarası 11 haneli olmalıdır.",
  tcknChecksum: "T.C. kimlik numarası geçersiz.",
  format: "T.C. kimlik no (11 hane) ya da pasaport no (5–20 harf/rakam) girin.",
};
const TYPES: Record<string, string> = { tckn: "T.C.", passport: "Pasaport" };

/** null = geçerli; "required" ya da hata anahtarı. */
export function driverIdError(mode: FormFieldMode, value: string): string | null {
  if (mode === "hidden") return null;
  if (!value.trim()) return mode === "required" ? "required" : null;
  const check = checkDriverId(value);
  return check.ok ? null : check.reason;
}

export function driverIdErrorText(key: string): string {
  return key === "required" ? "Sürücü kimlik numarası zorunludur." : ERRORS[key] ?? key;
}

export function DriverIdField({
  mode,
  value,
  onChange,
}: {
  mode: FormFieldMode;
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors } = useTheme();
  const [touched, setTouched] = useState(false);
  if (mode === "hidden") return null;
  const error = driverIdError(mode, value);
  return (
    <View style={{ gap: 4 }}>
      <Field
        label={`Sürücü T.C. kimlik / pasaport no ${mode === "required" ? "(zorunlu)" : "(isteğe bağlı)"}`}
        value={value}
        onChangeText={onChange}
        onBlur={() => setTouched(true)}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={32}
        placeholder="11 haneli T.C. kimlik no ya da pasaport no"
      />
      {touched && error && error !== "required" ? (
        <Text style={{ color: colors.destructive, fontSize: 12 }}>{ERRORS[error]}</Text>
      ) : (
        <Text style={{ color: colors.faintText, fontSize: 12 }}>
          Tesis güvenlik girişi için. Şifreli saklanır, yalnızca yetkili personel görebilir ve
          randevudan sonra otomatik silinir.
        </Text>
      )}
    </View>
  );
}

export function DriverIdRow({ appointment }: { appointment: AppointmentDto }) {
  const { colors } = useTheme();
  const { activeFacilityId, can } = useSession();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(null), 30_000);
    return () => clearTimeout(timer);
  }, [revealed]);

  if (!appointment.driver_id_masked && !appointment.driver_id_purged_at) return null;

  async function onReveal() {
    if (!activeFacilityId) return;
    setError(null);
    setLoading(true);
    try {
      setRevealed((await revealDriverId(activeFacilityId, appointment.id)).value);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kimlik numarası gösterilemedi.");
    } finally {
      setLoading(false);
    }
  }

  const type = appointment.driver_id_type ? TYPES[appointment.driver_id_type] : "";
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ color: colors.mutedText, fontSize: 13 }}>Sürücü kimlik</Text>
        {appointment.driver_id_purged_at ? (
          <Text style={{ color: colors.faintText, fontSize: 12 }}>Saklama süresi doldu; silindi.</Text>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
              {revealed ?? appointment.driver_id_masked}
            </Text>
            {type ? <Text style={{ color: colors.faintText, fontSize: 11 }}>{type}</Text> : null}
            {can("appt.driver_id.view") && (
              <Pressable
                accessibilityRole="button"
                disabled={loading}
                onPress={() => (revealed ? setRevealed(null) : void onReveal())}
                hitSlop={8}
                style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
              >
                <Ionicons name={revealed ? "eye-off-outline" : "eye-outline"} size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>
                  {revealed ? "Gizle" : "Göster"}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
      {error && <Text style={{ color: colors.destructive, fontSize: 12 }}>{error}</Text>}
    </View>
  );
}

export function DriverIdSearchModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { activeFacilityId, activeFacility } = useSession();
  const tz = activeFacility?.timezone ?? "Europe/Istanbul";
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

  async function onSearch() {
    if (!activeFacilityId) return;
    const check = checkDriverId(value);
    if (!check.ok) {
      setError(ERRORS[check.reason]);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      setResults(await searchByDriverId(activeFacilityId, check.value));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Arama yapılamadı.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppModal visible={visible} onClose={close} title="Kimlikle bul">
      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.mutedText, fontSize: 12 }}>
          Güvenlik girişi: sürücünün T.C. kimlik ya da pasaport numarasıyla randevusunu bulun.
        </Text>
        <Field
          value={value}
          onChangeText={setValue}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={32}
          placeholder="T.C. kimlik / pasaport no"
          returnKeyType="search"
          onSubmitEditing={() => void onSearch()}
        />
        <Button title="Bul" loading={loading} disabled={!value.trim()} onPress={() => void onSearch()} />
        {error && <Text style={{ color: colors.destructive, fontSize: 13 }}>{error}</Text>}
        {results && results.length === 0 && (
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>Bu kimlikle randevu bulunamadı.</Text>
        )}
        {results?.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => {
              close();
              router.push(`/admin/appointment/${a.id}`);
            }}
            style={{
              gap: 4,
              padding: 10,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", flex: 1 }}>
                {a.supplier_name ?? "—"}
              </Text>
              <StatusBadge status={a.status} />
            </View>
            <Text style={{ color: colors.mutedText, fontSize: 12 }}>
              {formatDate(a.scheduled_start_at)} {timeInTz(a.scheduled_start_at, tz)}
              {a.license_plate ? ` · ${a.license_plate}` : ""}
              {a.driver_name ? ` · ${a.driver_name}` : ""}
            </Text>
          </Pressable>
        ))}
      </View>
    </AppModal>
  );
}
