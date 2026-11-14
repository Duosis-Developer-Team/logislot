"use client";

/**
 * Tedarikci Excel sablonu + ice aktarma (bkz. apps/api/app/services/supplier_import.py).
 * Dosya sunucuda SAKLANMAZ: onizleme ve uygulama ayni dosyayi yeniden yukler.
 */

import { ApiError, authorizedFetch } from "@/lib/api/client";

export interface SupplierImportRow {
  row: number;
  code: string;
  company_name: string;
  action: "create" | "update" | "unchanged";
  errors: string[];
  warnings: string[];
  changes: string[];
  create_account: boolean;
}

export interface SupplierImportSummary {
  total: number;
  create: number;
  update: number;
  unchanged: number;
  error_rows: number;
  accounts: number;
  file_warnings: string[];
}

export interface SupplierImportResult {
  summary: SupplierImportSummary;
  rows: SupplierImportRow[];
  accounts?: { code: string; company_name: string; email: string; password: string }[];
}

export async function downloadSupplierTemplate(facilityId: string): Promise<void> {
  const response = await authorizedFetch(`/facilities/${facilityId}/supplier-import/template`);
  if (!response.ok) throw new ApiError("download_failed", "Şablon indirilemedi");
  saveBlob(await response.blob(), "logislot-tedarikci-sablonu.xlsx");
}

export async function uploadSupplierImport(
  facilityId: string,
  step: "preview" | "commit",
  file: File,
): Promise<SupplierImportResult> {
  const form = new FormData();
  form.append("file", file);
  const response = await authorizedFetch(`/facilities/${facilityId}/supplier-import/${step}`, {
    method: "POST",
    body: form,
  });
  const envelope = (await response.json().catch(() => null)) as {
    success: boolean;
    data: SupplierImportResult;
    error?: { code: string; message: string; details?: unknown };
  } | null;
  if (!response.ok || !envelope?.success) {
    const err = envelope?.error ?? { code: "UNKNOWN", message: "Bilinmeyen hata" };
    throw new ApiError(err.code, err.message, err.details);
  }
  return envelope.data;
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
