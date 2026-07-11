/** Pilot Destek — web (platform)/platform/support karşılığı.
 *  Platform genel sağlık + scheduler durumu (yalnızca agregat; PII yok). */

import { ScrollView, Text, View } from "react-native";
import { useSupportHealth } from "@/api/platform";
import { Badge, Card, ErrorState, LoadingState, SectionTitle } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

export default function PlatformSupport() {
  const { colors } = useTheme();
  const health = useSupportHealth();

  if (health.isLoading)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <LoadingState />
      </View>
    );
  if (health.isError || !health.data)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <ErrorState message="Destek verileri yüklenemedi." onRetry={() => health.refetch()} />
      </View>
    );

  const data = health.data;
  const cards: { label: string; value: number; alertWhenPositive?: boolean; hint?: string }[] = [
    {
      label: "Başarısız e-posta",
      value: data.failed_email_count,
      alertWhenPositive: true,
      hint: "Tesis yönetimindeki E-posta Logları ekranından yeniden gönderilebilir",
    },
    {
      label: "Retry bekleyen e-posta",
      value: data.due_email_retry_count,
      alertWhenPositive: true,
      hint: "Scheduler 5 dakikada bir otomatik dener",
    },
    {
      label: "Okunmamış kritik bildirim",
      value: data.unread_critical_notification_count,
      alertWhenPositive: true,
    },
    { label: "Onay bekleyen randevu", value: data.pending_appointment_count },
    { label: "Revize bekleyen randevu", value: data.revision_pending_appointment_count },
    { label: "Plan kullanım uyarısı", value: data.plan_warning_count, alertWhenPositive: true },
    { label: "Tenant", value: data.tenant_count },
    { label: "Aktif tesis", value: data.active_facility_count },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 64 }}>
        <Text style={{ color: colors.mutedText, fontSize: 13 }}>
          Platform genel sağlık ve aksiyon bekleyenler (yalnızca agregat; operasyonel
          detay/PII içermez). Her dakika yenilenir.
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {cards.map((card) => (
            <Card
              key={card.label}
              style={{
                width: "47%",
                flexGrow: 1,
                alignItems: "center",
                gap: 4,
                padding: spacing.md,
              }}
            >
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: "800",
                  color:
                    card.alertWhenPositive && card.value > 0
                      ? colors.status.rejected
                      : colors.text,
                }}
              >
                {card.value}
              </Text>
              <Text style={{ color: colors.mutedText, fontSize: 11, textAlign: "center" }}>
                {card.label}
              </Text>
              {card.hint && card.value > 0 && (
                <Text style={{ color: colors.faintText, fontSize: 10, textAlign: "center" }}>
                  {card.hint}
                </Text>
              )}
            </Card>
          ))}
        </View>

        <SectionTitle title="Scheduler" />
        {Object.entries(data.scheduler).map(([job, run]) => (
          <Card key={job} style={{ gap: 6 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing.sm,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
                {job === "email_retry" ? "E-posta retry" : "Bildirim temizliği"}
              </Text>
              {run ? (
                <Badge
                  label={
                    run.last_status === "success"
                      ? "başarılı"
                      : run.last_status === "skipped_locked"
                        ? "kilitli atlandı"
                        : "hata"
                  }
                  color={
                    run.last_status === "success"
                      ? colors.status.approved
                      : run.last_status === "skipped_locked"
                        ? colors.status.pending
                        : colors.status.rejected
                  }
                />
              ) : (
                <Badge label="henüz koşmadı" color={colors.mutedText} />
              )}
            </View>
            {run && (
              <>
                <Text style={{ color: colors.mutedText, fontSize: 12 }}>
                  Son koşum:{" "}
                  {run.last_finished_at
                    ? new Date(run.last_finished_at).toLocaleString("tr-TR")
                    : "—"}{" "}
                  · {run.processed_count} kayıt
                </Text>
                {run.error_message && (
                  <Text style={{ color: colors.status.rejected, fontSize: 12 }}>
                    {run.error_message}
                  </Text>
                )}
              </>
            )}
          </Card>
        ))}

        <Text style={{ color: colors.faintText, fontSize: 12 }}>
          Ortam: {data.config.environment} · e-posta: {data.config.email_provider} · docs:{" "}
          {data.config.docs_enabled ? "açık" : "kapalı"} · rate limit:{" "}
          {data.config.rate_limit_enabled ? "açık" : "kapalı"} · scheduler:{" "}
          {data.config.scheduler_enabled ? "açık" : "kapalı"}
        </Text>
      </ScrollView>
    </View>
  );
}
