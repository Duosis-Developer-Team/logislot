"use client";

/**
 * Tedarikcileri Excel'den ice aktarma (musteri karari 2026-11).
 *
 * 1) Sablonu indir  2) Dosyayi sec -> onizleme (hicbir sey yazilmaz)
 * 3) Hata yoksa "Ice aktar" -> sonuc; acilan portal hesaplarinin gecici
 *    parolalari YALNIZCA burada bir kez gosterilir.
 * Dosya sunucuda saklanmaz; uygulama adiminda ayni dosya yeniden yuklenir.
 */

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/client";
import {
  type SupplierImportResult,
  downloadSupplierTemplate,
  saveBlob,
  uploadSupplierImport,
} from "@/lib/api/supplier-import";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

type Phase = "idle" | "previewing" | "previewed" | "committing" | "done";

export function SupplierImportDialog({
  facilityId,
  open,
  onClose,
}: {
  facilityId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const copy = t.admin.supplierImport;
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<SupplierImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setPhase("idle");
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    reset();
    onClose();
  }

  async function onTemplate() {
    if (!facilityId) return;
    setError(null);
    try {
      await downloadSupplierTemplate(facilityId);
    } catch (err) {
      setError(errorMessage(err, copy.templateFailed));
    }
  }

  async function onPick(picked: File | null) {
    if (!facilityId || !picked) return;
    setFile(picked);
    setResult(null);
    setError(null);
    setPhase("previewing");
    try {
      setResult(await uploadSupplierImport(facilityId, "preview", picked));
      setPhase("previewed");
    } catch (err) {
      setError(errorMessage(err, copy.previewFailed));
      setPhase("idle");
    }
  }

  async function onCommit() {
    if (!facilityId || !file) return;
    setError(null);
    setPhase("committing");
    try {
      setResult(await uploadSupplierImport(facilityId, "commit", file));
      setPhase("done");
      queryClient.invalidateQueries({ queryKey: ["config", "suppliers"] });
    } catch (err) {
      // Sunucu satir hatalarini geri dondurur (baska bir sekmede degisiklik olduysa).
      if (err instanceof ApiError && err.code === "IMPORT_HAS_ERRORS" && err.details) {
        setResult(err.details as SupplierImportResult);
      }
      setError(errorMessage(err, copy.commitFailed));
      setPhase("previewed");
    }
  }

  function downloadCredentials() {
    if (!result?.accounts?.length) return;
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      [copy.columns.code, copy.columns.company, copy.columns.email, copy.columns.password].map(escape).join(","),
      ...result.accounts.map((a) => [a.code, a.company_name, a.email, a.password].map(escape).join(",")),
    ];
    saveBlob(
      new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }),
      "logislot-tedarikci-hesaplari.csv",
    );
  }

  const summary = result?.summary;
  const hasErrors = (summary?.error_rows ?? 0) > 0;
  const nothingToDo = summary ? summary.create + summary.update === 0 : true;
  const rows = result?.rows ?? [];
  const visibleRows =
    phase === "done" ? rows.filter((r) => r.action !== "unchanged") : rows;

  return (
    <Dialog open={open} onClose={close} title={copy.title} className="max-w-3xl">
      <div className="flex flex-col gap-4">
        {phase !== "done" && (
          <ol className="grid gap-2 sm:grid-cols-2">
            <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <span className="text-xs font-semibold text-muted-foreground">1 · {copy.stepTemplate}</span>
              <p className="text-xs text-muted-foreground">{copy.templateHint}</p>
              <Button variant="secondary" size="sm" onClick={() => void onTemplate()}>
                <Download className="mr-1 h-4 w-4" />
                {copy.downloadTemplate}
              </Button>
            </li>
            <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <span className="text-xs font-semibold text-muted-foreground">2 · {copy.stepUpload}</span>
              <p className="text-xs text-muted-foreground">{copy.uploadHint}</p>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
              />
              <Button
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={phase === "previewing" || phase === "committing"}
              >
                <Upload className="mr-1 h-4 w-4" />
                {phase === "previewing" ? copy.previewing : file ? copy.chooseAnother : copy.chooseFile}
              </Button>
              {file && (
                <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" /> {file.name}
                </span>
              )}
            </li>
          </ol>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {summary && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Stat label={copy.summary.create} value={summary.create} tone="approved" />
            <Stat label={copy.summary.update} value={summary.update} tone="primary" />
            <Stat label={copy.summary.unchanged} value={summary.unchanged} />
            {summary.accounts > 0 && <Stat label={copy.summary.accounts} value={summary.accounts} />}
            {hasErrors && <Stat label={copy.summary.errors} value={summary.error_rows} tone="destructive" />}
          </div>
        )}
        {summary?.file_warnings.map((w) => (
          <p key={w} className="text-xs text-status-pending">{w}</p>
        ))}

        {phase === "done" && (
          <p className="flex items-center gap-2 rounded-lg border border-status-approved/40 bg-status-approved/10 px-3 py-2 text-sm text-status-approved">
            <CheckCircle2 className="h-4 w-4" /> {copy.done}
          </p>
        )}

        {phase === "done" && result?.accounts && result.accounts.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-status-pending/40 bg-status-pending/5 p-3">
            <p className="flex items-start gap-2 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-pending" />
              {copy.passwordsOnce}
            </p>
            <div className="max-h-48 overflow-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 text-left font-medium">{copy.columns.code}</th>
                    <th className="py-1 text-left font-medium">{copy.columns.email}</th>
                    <th className="py-1 text-left font-medium">{copy.columns.password}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.accounts.map((a) => (
                    <tr key={a.email} className="border-t border-border">
                      <td className="py-1 font-mono">{a.code}</td>
                      <td className="py-1">{a.email}</td>
                      <td className="py-1 font-mono">{a.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="secondary" size="sm" onClick={downloadCredentials}>
              <Download className="mr-1 h-4 w-4" /> {copy.downloadCredentials}
            </Button>
          </div>
        )}

        {visibleRows.length > 0 && (
          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">{copy.columns.row}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{copy.columns.code}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{copy.columns.company}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{copy.columns.result}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.row} className={cn("border-t border-border align-top", r.errors.length && "bg-destructive/5")}>
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.row}</td>
                    <td className="px-2 py-1.5 font-mono">{r.code || "—"}</td>
                    <td className="px-2 py-1.5">{r.company_name || "—"}</td>
                    <td className="px-2 py-1.5">
                      {r.errors.length > 0 ? (
                        <ul className="text-destructive">
                          {r.errors.map((e) => (
                            <li key={e}>{e}</li>
                          ))}
                        </ul>
                      ) : (
                        <>
                          <span
                            className={cn(
                              "font-medium",
                              r.action === "create" && "text-status-approved",
                              r.action === "update" && "text-primary",
                              r.action === "unchanged" && "text-muted-foreground",
                            )}
                          >
                            {copy.actions[r.action]}
                            {r.create_account ? ` · ${copy.withAccount}` : ""}
                          </span>
                          {r.action === "update" && r.changes.length > 0 && (
                            <div className="text-muted-foreground">
                              {r.changes.map((c) => copy.fields[c] ?? c).join(", ")}
                            </div>
                          )}
                        </>
                      )}
                      {r.warnings.map((w) => (
                        <div key={w} className="text-status-pending">{w}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {phase === "done" ? (
            <>
              <Button variant="secondary" onClick={reset}>{copy.importAnother}</Button>
              <Button onClick={close}>{t.common.close}</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={close}>{t.common.cancel}</Button>
              <Button
                onClick={() => void onCommit()}
                disabled={phase !== "previewed" || hasErrors || nothingToDo}
              >
                {phase === "committing" ? copy.committing : copy.commit(summary ? summary.create + summary.update : 0)}
              </Button>
            </>
          )}
        </div>
        {phase === "previewed" && hasErrors && (
          <p className="text-right text-xs text-destructive">{copy.fixErrors}</p>
        )}
      </div>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "approved" | "primary" | "destructive";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 font-medium",
        tone === "approved" && "bg-status-approved/10 text-status-approved",
        tone === "primary" && "bg-primary/10 text-primary",
        tone === "destructive" && "bg-destructive/10 text-destructive",
        !tone && "bg-muted text-muted-foreground",
      )}
    >
      {label}: {value}
    </span>
  );
}
