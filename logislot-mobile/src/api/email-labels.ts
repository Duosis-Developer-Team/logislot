/**
 * E-posta log alanlarının okunabilir Türkçe etiketleri — web
 * apps/web/src/lib/email-labels.ts ile senkron kopya.
 */

function humanize(key: string): string {
  return key
    .replace(/[_.]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toLocaleUpperCase("tr-TR"));
}

const TEMPLATE_LABELS: Record<string, string> = {
  appointment_created: "Randevu oluşturuldu",
  appointment_approved: "Randevu onaylandı",
  appointment_rejected: "Randevu reddedildi",
  appointment_revised: "Randevu revize edildi",
  appointment_revised_team: "Ekip revize bilgilendirmesi",
  appointment_cancelled: "Randevu iptal edildi",
  appointment_completed: "Randevu tamamlandı",
  appointment_series_created: "Seri oluşturuldu",
  appointment_series_cancelled: "Seri iptal edildi",
  appointment_series_revised: "Seri revize edildi",
  cargo_advisory: "Kargo uyarısı",
};

const STATUS_LABELS: Record<string, string> = {
  queued: "Kuyrukta",
  pending: "Bekliyor",
  sent: "Gönderildi",
  failed: "Başarısız",
  skipped: "Atlandı",
  retrying: "Yeniden deneniyor",
};

const PROVIDER_LABELS: Record<string, string> = {
  log_only: "Kayıt (log)",
  smtp: "SMTP",
  ses: "Amazon SES",
  sendgrid: "SendGrid",
};

export const emailTemplateLabel = (key: string): string =>
  TEMPLATE_LABELS[key] ?? humanize(key);
export const emailStatusLabel = (status: string): string =>
  STATUS_LABELS[status] ?? humanize(status);
export const emailProviderLabel = (provider: string): string =>
  PROVIDER_LABELS[provider] ?? humanize(provider);
