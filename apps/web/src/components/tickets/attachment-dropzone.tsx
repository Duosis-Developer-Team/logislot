"use client";

/**
 * Ek dosya alani: surukle-birak + panodan yapistir + dosya secici.
 *
 * Uc giris yolunun UCU DE gereklidir: destek talebinin en degerli eki ekran
 * goruntusudur ve kullanicilarin cogu onu panoya alir, dosyaya kaydetmez.
 *
 * Klavye erisimi: dropzone bir <button>'dur (Enter/Space ile secici acilir);
 * yalnizca fare ile calisan bir alan erisilebilirlik acisindan kabul edilmez.
 */

import {
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { resolveMimeType } from "@/lib/api/tickets";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n/dictionaries/tr";
import { useT } from "@/lib/i18n/provider";

/**
 * Liste anahtari icin surec-omurlu sayac.
 *
 * Anahtari dosya adi + boyut + indeksten uretmek YANLIS: bir dosya silinip
 * yeniden eklendiginde sayaclar eski bir kombinasyona donebilir, iki satir
 * ayni anahtari paylasir ve ilerleme/silme ikisine birden uygulanir.
 */
let attachmentKeySeq = 0;

export interface PendingAttachment {
  /** Yerel liste anahtari (yukleme bitmeden upload_id yoktur). */
  key: string;
  file: File;
  progress: number;
  uploadId: string | null;
  scanStatus: string | null;
  error: string | null;
}

interface AttachmentDropzoneProps {
  attachments: PendingAttachment[];
  onChange: (next: PendingAttachment[]) => void;
  upload: (file: File, onProgress: (percent: number) => void) => Promise<{
    upload_id: string;
    scan_status: string;
  }>;
  maxFiles: number;
  maxFileSizeBytes: number;
  maxTotalBytes: number;
  allowedMimeTypes: string[];
  disabled?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function scanLabel(
  t: Dictionary,
  status: string | null,
): { text: string; tone: string } | null {
  switch (status) {
    case "clean":
      return { text: t.tickets.attachments.clean, tone: "text-status-approved" };
    case "rejected":
      return { text: t.tickets.attachments.rejected, tone: "text-destructive" };
    case "scan_failed":
      return { text: t.tickets.attachments.rejected, tone: "text-status-pending" };
    case "scanning":
    case "pending_scan":
      return { text: t.tickets.attachments.scanning, tone: "text-muted-foreground" };
    default:
      return null;
  }
}

export function AttachmentDropzone({
  attachments,
  onChange,
  upload,
  maxFiles,
  maxFileSizeBytes,
  maxTotalBytes,
  allowedMimeTypes,
  disabled = false,
}: AttachmentDropzoneProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [limitError, setLimitError] = useState<string | null>(null);
  // En guncel listeyi asenkron yukleme geri cagrimlarinda gorebilmek icin:
  // closure'daki eski dizi ile calismak, es zamanli yuklemelerde birbirini
  // ezen guncellemeler uretirdi.
  const latest = useRef(attachments);
  useEffect(() => {
    latest.current = attachments;
  }, [attachments]);

  const patch = useCallback(
    (key: string, changes: Partial<PendingAttachment>) => {
      const next = latest.current.map((a) => (a.key === key ? { ...a, ...changes } : a));
      latest.current = next;
      onChange(next);
    },
    [onChange],
  );

  const startUpload = useCallback(
    async (item: PendingAttachment) => {
      try {
        const result = await upload(item.file, (percent) =>
          patch(item.key, { progress: percent }),
        );
        patch(item.key, {
          uploadId: result.upload_id,
          scanStatus: result.scan_status,
          progress: 100,
          error: null,
        });
      } catch (error) {
        patch(item.key, {
          error: error instanceof Error ? error.message : t.tickets.attachments.uploadFailed,
        });
      }
    },
    [patch, upload, t.tickets.attachments.uploadFailed],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      if (disabled || files.length === 0) return;
      setLimitError(null);
      const current = latest.current;
      const accepted: PendingAttachment[] = [];
      let total = current.reduce((sum, a) => sum + a.file.size, 0);

      for (const file of files) {
        if (current.length + accepted.length >= maxFiles) {
          setLimitError(`En fazla ${maxFiles} dosya ekleyebilirsiniz.`);
          break;
        }
        // Tarayicilar `.log` icin BOS tur bildirir; uzantidan turetilmis tur
        // kullanilir (bkz. resolveMimeType).
        if (!allowedMimeTypes.includes(resolveMimeType(file))) {
          setLimitError(
            `"${file.name}" desteklenmiyor. PNG, JPEG, WEBP, PDF ve TXT/LOG kabul edilir.`,
          );
          continue;
        }
        if (file.size > maxFileSizeBytes) {
          setLimitError(
            t.tickets.attachments.tooLarge(
              file.name,
              Math.round(maxFileSizeBytes / (1024 * 1024)),
            ),
          );
          continue;
        }
        if (total + file.size > maxTotalBytes) {
          setLimitError(
            t.tickets.attachments.totalTooLarge(Math.round(maxTotalBytes / (1024 * 1024))),
          );
          break;
        }
        total += file.size;
        accepted.push({
          key: `att-${(attachmentKeySeq += 1)}`,
          file,
          progress: 0,
          uploadId: null,
          scanStatus: null,
          error: null,
        });
      }

      if (accepted.length === 0) return;
      const next = [...current, ...accepted];
      latest.current = next;
      onChange(next);
      accepted.forEach((item) => void startUpload(item));
    },
    [
      allowedMimeTypes,
      disabled,
      maxFileSizeBytes,
      t.tickets.attachments,
      maxFiles,
      maxTotalBytes,
      onChange,
      startUpload,
    ],
  );

  // Panodan ekran goruntusu yapistirma — destek taleplerinin en sik eki.
  useEffect(() => {
    if (disabled) return;
    function onPaste(event: ClipboardEvent) {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) {
        event.preventDefault();
        addFiles(files);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles, disabled]);

  function remove(key: string) {
    const next = latest.current.filter((a) => a.key !== key);
    latest.current = next;
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          addFiles(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
          dragActive
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/30 hover:border-primary/40",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <UploadCloud className="h-6 w-6 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">
          {t.tickets.attachments.dropHint}
        </span>
        <span className="text-xs text-muted-foreground">
          {t.tickets.attachments.pasteLead}{" "}
          <kbd className="rounded border px-1">Ctrl/⌘ + V</kbd>{" "}
          {t.tickets.attachments.pasteTail} ·{" "}
          {t.tickets.attachments.limits(
            maxFiles,
            Math.round(maxFileSizeBytes / (1024 * 1024)),
          )}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        // `.log`/`.txt` uzantilari ACIKCA eklenir: tarayici bu dosyalara
        // MIME turu atamadigi icin yalnizca tur listesiyle secilemezlerdi.
        accept={[...allowedMimeTypes, ".log", ".txt"].join(",")}
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {t.tickets.attachments.allowedHint}
      </p>

      {limitError && (
        <p
          role="alert"
          className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {limitError}
        </p>
      )}

      {attachments.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {attachments.map((item) => {
            const scan = scanLabel(t, item.scanStatus);
            const uploading = item.uploadId === null && item.error === null;
            const Icon = item.file.type.startsWith("image/") ? ImageIcon : FileText;
            return (
              <li
                key={item.key}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(item.file.size)}
                    {scan && <span className={cn(" · ", scan.tone)}>{scan.text}</span>}
                    {item.error && (
                      <span className="text-destructive"> · {item.error}</span>
                    )}
                  </p>
                  {uploading && (
                    <div
                      className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={item.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={t.tickets.attachments.retryLabel(item.file.name)}
                    >
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                </div>
                {uploading && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
                )}
                {item.error && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      patch(item.key, { error: null, progress: 0 });
                      void startUpload(item);
                    }}
                  >
                    Tekrar dene
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => remove(item.key)}
                  aria-label={t.tickets.attachments.removeLabel(item.file.name)}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AttachmentSummary({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Paperclip className="h-3.5 w-3.5" aria-hidden />
      {count} ek
    </span>
  );
}
