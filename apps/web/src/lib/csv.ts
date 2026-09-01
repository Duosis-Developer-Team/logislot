/**
 * Tarayicida CSV uretimi ve indirme.
 *
 * Excel icin iki ayrinti onemli ve ikisi de bilerek boyle:
 *   * BOM (﻿) — olmadan Excel dosyayi UTF-8 saymaz ve Turkce karakterler
 *     bozuk gorunur ("Tedarikçi" -> "TedarikÃ§i").
 *   * `;` ayraci — Turkce Windows yerelinde Excel'in liste ayraci noktali
 *     virguldur; virgul kullanilirsa tum satir TEK hucreye duser.
 */

const SEPARATOR = ";";

/** Ayrac/tirnak/satir sonu iceren degerleri RFC 4180'e gore tirnaklar. */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (
    text.includes(SEPARATOR) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(SEPARATOR));
  // CRLF: Excel'in beklentisi ve Notepad dahil her yerde dogru goruntulenir.
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Dosyayi indirir. Tarayici disinda (SSR/test) cagrilmaz. */
export function downloadCsv(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Blob'u serbest birak: yoksa sekme kapanana kadar bellekte kalir.
  URL.revokeObjectURL(url);
}

/** "randevular-2026-09-01.csv" — dosyalar tarihe gore siralanabilsin diye ISO. */
export function timestampedFileName(prefix: string, date: Date = new Date()): string {
  const iso = date.toISOString().slice(0, 10);
  return `${prefix}-${iso}.csv`;
}
