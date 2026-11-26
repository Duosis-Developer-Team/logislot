/**
 * Surucu kimlik numarasi istemci dogrulamasi — sunucudaki
 * apps/api/app/services/driver_id.py ile ayni kural (son karar sunucuda).
 */

export type DriverIdCheck =
  | { ok: true; type: "tckn" | "passport"; value: string }
  | { ok: false; reason: "tcknLength" | "tcknChecksum" | "format" };

export function normalizeDriverId(raw: string): string {
  return raw.replace(/[\s.-]/g, "").toUpperCase();
}

export function isValidTckn(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = value.split("").map(Number);
  const tenth = ((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10;
  const eleventh = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return ((tenth + 10) % 10) === d[9] && eleventh === d[10];
}

export function checkDriverId(raw: string): DriverIdCheck {
  const value = normalizeDriverId(raw);
  if (/^\d+$/.test(value)) {
    if (value.length !== 11) return { ok: false, reason: "tcknLength" };
    return isValidTckn(value) ? { ok: true, type: "tckn", value } : { ok: false, reason: "tcknChecksum" };
  }
  return /^[A-Z0-9]{5,20}$/.test(value)
    ? { ok: true, type: "passport", value }
    : { ok: false, reason: "format" };
}
