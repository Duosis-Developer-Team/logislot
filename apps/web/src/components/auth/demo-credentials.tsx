"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Demo hesap yardımcısı — rafine muted panel + kopyala butonu.
 */
export function DemoCredentials({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${email} / ${password}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* pano erişimi yoksa sessizce geç */
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <KeyRound className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Demo hesap
        </div>
        <div className="truncate font-mono text-xs text-foreground">
          {email} <span className="text-muted-foreground">/ {password}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label="Demo hesabı kopyala"
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground",
          copied && "border-status-approved/40 text-status-approved",
        )}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
