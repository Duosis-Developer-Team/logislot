/** E-posta Logları — web (admin)/admin/settings/email-logs karşılığı.
 *  Filtreler + sayfalama + tekil/toplu resend (resend lifecycle'ı tekrar ÇALIŞTIRMAZ). */

import { router } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/api/client";
import { emailProviderLabel, emailStatusLabel, emailTemplateLabel } from "@/api/email-labels";
import { useEmailLogsPage, type EmailLogFilters } from "@/api/reports";
import { useSession } from "@/auth/session";
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  SwitchRow,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

const TEMPLATE_OPTIONS = [
  ["", "Tümü"],
  ["appointment_approved", "Onay"],
  ["appointment_rejected", "Red"],
  ["appointment_revised", "Revize (tedarikçi)"],
  ["appointment_revised_team", "Revize (ekip)"],
  ["appointment_cancelled", "İptal"],
  ["appointment_series_cancelled", "Seri iptal"],
  ["appointment_series_revised", "Seri revize"],
] as const;

const STATUS_OPTIONS = [
  ["", "Tümü"],
  ["sent", "Gönderildi"],
  ["failed", "Başarısız"],
  ["queued", "Kuyrukta"],
  ["skipped", "Atlandı"],
] as const;

export default function EmailLogsScreen() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;
  const queryClient = useQueryClient();

  const [status, setStatus] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [recipient, setRecipient] = useState("");
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filters: EmailLogFilters = {
    status: status || undefined,
    recipient_email: recipient || undefined,
    template_key: templateKey || undefined,
    has_error: onlyErrors ? true : undefined,
    limit: 50,
    offset,
  };
  const page = useEmailLogsPage(facilityId, filters);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["email-logs", facilityId ?? "none"] });

  const singleResend = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ status: string; error_message: string | null }>(
        `/facilities/${facilityId}/email-logs/${id}/resend`,
        { method: "POST" },
      ),
    onSuccess: invalidate,
  });
  const bulkResend = useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest<{ sent: number; requested: number }>(
        `/facilities/${facilityId}/email-logs/bulk-resend`,
        { method: "POST", body: { email_log_ids: ids, only_failed: true } },
      ),
    onSuccess: invalidate,
  });

  async function onSingleResend(id: string) {
    try {
      const result = await singleResend.mutateAsync(id);
      Alert.alert(
        result.status === "sent" ? "Gönderildi" : "Başarısız",
        result.status === "sent"
          ? "E-posta yeniden gönderildi."
          : `Gönderim yine başarısız: ${result.error_message ?? ""}`,
      );
    } catch (err) {
      Alert.alert("Gönderilemedi", err instanceof ApiError ? err.message : "Gönderilemedi");
    }
  }

  async function onBulkResend() {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      const result = await bulkResend.mutateAsync(ids);
      setSelected(new Set());
      Alert.alert("Toplu gönderim", `${result.sent}/${result.requested} e-posta gönderildi.`);
    } catch (err) {
      Alert.alert("Gönderilemedi", err instanceof ApiError ? err.message : "Gönderilemedi");
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (page.isLoading)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <LoadingState />
      </View>
    );
  if (page.isError || !page.data)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <ErrorState message="E-posta logları yüklenemedi." onRetry={() => page.refetch()} />
      </View>
    );

  const data = page.data;
  const statusColor = (s: string) =>
    s === "sent"
      ? colors.status.approved
      : s === "failed"
        ? colors.status.rejected
        : s === "queued" || s === "retrying"
          ? colors.status.pending
          : colors.mutedText;
  const canBulk = session.can("user.manage");

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={data.items}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 64 }}
        refreshControl={
          <RefreshControl
            refreshing={page.isRefetching}
            onRefresh={() => void page.refetch()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              <Badge label={`Gönderildi: ${data.summary.sent}`} color={colors.status.approved} />
              <Badge label={`Başarısız: ${data.summary.failed}`} color={colors.status.rejected} />
              <Badge label={`Kuyrukta: ${data.summary.queued}`} color={colors.status.pending} />
              <Badge label={`Atlandı: ${data.summary.skipped}`} color={colors.mutedText} />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {STATUS_OPTIONS.map(([value, label]) => (
                <Chip
                  key={value || "all"}
                  label={label}
                  selected={status === value}
                  onPress={() => {
                    setStatus(value);
                    setOffset(0);
                  }}
                />
              ))}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {TEMPLATE_OPTIONS.map(([value, label]) => (
                <Chip
                  key={value || "all"}
                  label={label}
                  selected={templateKey === value}
                  onPress={() => {
                    setTemplateKey(value);
                    setOffset(0);
                  }}
                />
              ))}
            </View>
            <Field
              value={recipient}
              onChangeText={(t) => {
                setRecipient(t);
                setOffset(0);
              }}
              placeholder="Alıcı e-postası ara…"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <SwitchRow
              label="Yalnızca hatalılar"
              value={onlyErrors}
              onValueChange={(v) => {
                setOnlyErrors(v);
                setOffset(0);
              }}
            />
            {canBulk && selected.size > 0 && (
              <Button
                title={
                  bulkResend.isPending
                    ? "Gönderiliyor…"
                    : `Seçili ${selected.size} başarısızı yeniden gönder`
                }
                loading={bulkResend.isPending}
                onPress={() => void onBulkResend()}
                style={{ height: 44 }}
              />
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="Kayıt yok"
            description="Filtrelerle eşleşen e-posta kaydı bulunamadı."
          />
        }
        ListFooterComponent={
          data.total > 50 ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: spacing.md,
              }}
            >
              <Button
                title="← Önceki"
                variant="secondary"
                disabled={offset === 0}
                onPress={() => setOffset(Math.max(0, offset - 50))}
                style={{ height: 40, paddingHorizontal: 16 }}
              />
              <Text style={{ color: colors.mutedText, fontSize: 12 }}>
                {offset + 1}–{Math.min(offset + 50, data.total)} / {data.total}
              </Text>
              <Button
                title="Sonraki →"
                variant="secondary"
                disabled={offset + 50 >= data.total}
                onPress={() => setOffset(offset + 50)}
                style={{ height: 40, paddingHorizontal: 16 }}
              />
            </View>
          ) : null
        }
        renderItem={({ item: log }) => (
          <Card style={{ gap: spacing.sm }}>
            <Pressable
              onPress={() =>
                log.appointment_id &&
                router.push(`/admin/appointment/${log.appointment_id}` as never)
              }
              onLongPress={() => canBulk && log.status === "failed" && toggleSelect(log.id)}
              style={{ gap: 4 }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: spacing.sm,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}
                  >
                    {log.subject}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 12 }}>
                    {log.recipient_email}
                  </Text>
                </View>
                <Badge label={emailStatusLabel(log.status)} color={statusColor(log.status)} />
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                <Badge label={emailTemplateLabel(log.template_key)} color={colors.accent} />
                <Badge label={emailProviderLabel(log.provider)} color={colors.mutedText} />
                {selected.has(log.id) && <Badge label="Seçili" color={colors.primary} />}
              </View>
              <Text style={{ color: colors.faintText, fontSize: 11 }}>
                {new Date(log.created_at).toLocaleString("tr-TR")}
                {log.retry_count > 0 ? ` · ${log.retry_count}/${log.max_attempts} deneme` : ""}
              </Text>
              {log.error_message && (
                <Text style={{ color: colors.status.rejected, fontSize: 12 }} numberOfLines={2}>
                  {log.error_message}
                </Text>
              )}
            </Pressable>
            {log.status === "failed" && (
              <Button
                title={singleResend.isPending ? "Gönderiliyor…" : "Yeniden Gönder"}
                variant="secondary"
                loading={singleResend.isPending}
                onPress={() => void onSingleResend(log.id)}
                style={{ height: 40 }}
              />
            )}
          </Card>
        )}
      />
    </View>
  );
}
