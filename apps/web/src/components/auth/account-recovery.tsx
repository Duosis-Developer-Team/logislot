"use client";

/**
 * Self-servis hesap kurtarma ekranları: şifremi unuttum, kullanıcı adımı
 * unuttum, yeni şifre belirleme. Portal bağlamı server wrapper'dan prop olarak
 * gelir (bkz. lib/auth/recovery.ts); platform portalı bu ekranlara asla gelmez.
 *
 * Güvenlik: istek ekranları her durumda AYNI başarı mesajını gösterir — API de
 * hesap var/yok bilgisini döndürmez.
 */

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { LoginBackground } from "@/components/auth/login-background";
import { LogiSlotLogo } from "@/components/brand/logo";
import { LanguageToggle } from "@/components/shell/language-toggle";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import { accountRecoveryApi, type RecoveryPortal } from "@/lib/api/account-recovery";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import { useT } from "@/lib/i18n/provider";

function RecoveryShell({
  icon: Icon,
  title,
  subtitle,
  loginUrl,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  loginUrl: string;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-white via-sky-50 to-sky-100 px-5 py-10 dark:from-background dark:via-background dark:to-background sm:px-6">
      <LoginBackground />
      <div className="absolute right-3 top-3 z-20">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <div className="relative z-10 w-full max-w-md">
        <div className="animate-scale-in rounded-3xl border border-border bg-card/95 p-6 shadow-pop backdrop-blur-xl sm:p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <LogiSlotLogo size="lg" priority />
          </div>
          <div className="mt-6 flex flex-col items-center gap-2 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="mt-6 animate-fade-in">{children}</div>
          <a
            href={loginUrl}
            className="mt-5 flex items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t.accountRecovery.backToLogin}
          </a>
        </div>
        <p className="mt-5 text-center text-xs text-muted-foreground">{t.auth.loginFooter}</p>
      </div>
    </main>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex animate-fade-in items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function SuccessBox({ title, message }: { title: string; message: string }) {
  return (
    <div
      role="status"
      className="flex animate-fade-in items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3.5 text-sm"
    >
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

/** Tek e-posta alanlı istek formu (şifre sıfırlama / kullanıcı adı). */
function EmailRequestForm({
  submitLabel,
  sentTitle,
  sentMessage,
  onRequest,
}: {
  submitLabel: string;
  sentTitle: string;
  sentMessage: string;
  onRequest: (email: string) => Promise<unknown>;
}) {
  const t = useT();
  const errorMessage = useApiErrorMessage();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onRequest(email.trim());
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, t.accountRecovery.failed));
    } finally {
      setLoading(false);
    }
  }

  if (sent) return <SuccessBox title={sentTitle} message={sentMessage} />;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="recovery-email">{t.accountRecovery.email}</Label>
        <Input
          id="recovery-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          autoFocus
          className="h-12"
        />
      </div>
      {error && <ErrorBox message={error} />}
      <Button type="submit" size="lg" disabled={loading} className="w-full">
        {loading ? (
          <>
            <Loader2 className="animate-spin" />
            {t.accountRecovery.sending}
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  );
}

export function ForgotPasswordScreen({
  portal,
  loginUrl,
}: {
  portal: RecoveryPortal;
  loginUrl: string;
}) {
  const t = useT();
  const copy = t.accountRecovery.forgotPassword;
  return (
    <RecoveryShell icon={KeyRound} title={copy.title} subtitle={copy.subtitle} loginUrl={loginUrl}>
      <EmailRequestForm
        submitLabel={copy.submit}
        sentTitle={copy.sentTitle}
        sentMessage={copy.sent}
        onRequest={(email) => accountRecoveryApi.requestPasswordReset(email, portal)}
      />
    </RecoveryShell>
  );
}

export function ForgotUsernameScreen({
  portal,
  loginUrl,
}: {
  portal: RecoveryPortal;
  loginUrl: string;
}) {
  const t = useT();
  const copy = t.accountRecovery.forgotUsername;
  if (portal === "admin") {
    // Yönetim: kullanıcı adı = e-posta; arama YAPILMAZ.
    return (
      <RecoveryShell icon={UserRound} title={copy.title} loginUrl={loginUrl}>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3.5 text-sm">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p>{copy.adminInfo}</p>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {copy.adminForgotPasswordHint}{" "}
            <a
              href={`/forgot-password?portal=admin`}
              className="font-medium text-primary hover:underline"
            >
              {t.accountRecovery.forgotPasswordLink}
            </a>
          </p>
        </div>
      </RecoveryShell>
    );
  }
  return (
    <RecoveryShell
      icon={UserRound}
      title={copy.title}
      subtitle={copy.supplierSubtitle}
      loginUrl={loginUrl}
    >
      <EmailRequestForm
        submitLabel={copy.submit}
        sentTitle={copy.sentTitle}
        sentMessage={copy.sent}
        onRequest={(email) => accountRecoveryApi.requestUsernameReminder(email)}
      />
    </RecoveryShell>
  );
}

export function ResetPasswordScreen({
  portal,
  token,
  loginUrl,
}: {
  portal: RecoveryPortal;
  token: string | null;
  loginUrl: string;
}) {
  const t = useT();
  const copy = t.accountRecovery.resetPassword;
  const errorMessage = useApiErrorMessage();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenInvalid, setTokenInvalid] = useState(!token);

  // Token'ı adres çubuğundan/geçmişten temizle (paylaşılan ekran, geçmiş).
  useEffect(() => {
    if (token && typeof window !== "undefined") {
      window.history.replaceState(null, "", `/reset-password?portal=${portal}`);
    }
  }, [token, portal]);

  const requestNewUrl = `/forgot-password?portal=${portal}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) return;
    if (password !== confirm) {
      setError(copy.mismatch);
      return;
    }
    setLoading(true);
    try {
      await accountRecoveryApi.confirmPasswordReset(token, password, portal);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVALID_RESET_TOKEN") {
        setTokenInvalid(true);
      } else {
        setError(errorMessage(err, t.accountRecovery.failed));
      }
    } finally {
      setLoading(false);
    }
  }

  let content: React.ReactNode;
  if (done) {
    content = (
      <div className="flex flex-col gap-4">
        <SuccessBox title={copy.doneTitle} message={copy.done} />
        <a href={loginUrl} className={buttonVariants({ size: "lg", className: "w-full" })}>
          {copy.goToLogin}
        </a>
      </div>
    );
  } else if (tokenInvalid) {
    content = (
      <div className="flex flex-col gap-4">
        <ErrorBox message={token ? copy.invalidToken : copy.missingToken} />
        <a
          href={requestNewUrl}
          className={buttonVariants({ size: "lg", variant: "outline", className: "w-full" })}
        >
          {copy.requestNew}
        </a>
      </div>
    );
  } else {
    content = (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="new-password">{copy.new}</Label>
          <Input
            id="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            autoFocus
            className="h-12"
          />
          <p className="mt-1 text-xs text-muted-foreground">{copy.policy}</p>
        </div>
        <div>
          <Label htmlFor="confirm-password">{copy.confirm}</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            className="h-12"
          />
        </div>
        {error && <ErrorBox message={error} />}
        <Button type="submit" size="lg" disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="animate-spin" />
              {copy.saving}
            </>
          ) : (
            copy.submit
          )}
        </Button>
      </form>
    );
  }

  return (
    <RecoveryShell icon={KeyRound} title={copy.title} subtitle={copy.subtitle} loginUrl={loginUrl}>
      {content}
    </RecoveryShell>
  );
}

/** Login kartının altındaki "Şifremi unuttum · Kullanıcı adımı unuttum" linkleri. */
export function RecoveryLinks({ portal }: { portal: RecoveryPortal }) {
  const t = useT();
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm">
      <a
        href={`/forgot-password?portal=${portal}`}
        className="font-medium text-primary transition-colors hover:underline"
      >
        {t.accountRecovery.forgotPasswordLink}
      </a>
      <span aria-hidden className="text-muted-foreground">
        ·
      </span>
      <a
        href={`/forgot-username?portal=${portal}`}
        className="font-medium text-primary transition-colors hover:underline"
      >
        {t.accountRecovery.forgotUsernameLink}
      </a>
    </div>
  );
}
