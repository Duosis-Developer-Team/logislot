/**
 * Destek talepleri — mobil ekran bileşenleri.
 *
 * Yönetim ve tedarikçi portalları AYNI bileşeni kullanır; fark yalnızca
 * `api` (yol öneki) ve başlık metnidir. Görünürlük/yetki kararı backend'dedir.
 *
 * Mobile-native uyarlama (web'in kopyası DEĞİL): tablo yerine kart listesi,
 * drawer yerine bottom-sheet modal, sekmeler yerine yatay chip şeridi.
 */

import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_HINTS,
  TICKET_CATEGORY_LABELS,
  TICKET_IMPACTS,
  TICKET_IMPACT_LABELS,
  TICKET_RESOLUTION_CODE_LABELS,
  TICKET_STATUS_GROUPS,
  ticketCategoryLabel,
  ticketImpactLabel,
  ticketStatusLabel,
} from "@/api/shared";
import type { TicketApi } from "@/api/tickets";
import type { TicketConfigDto, TicketDetailDto, TicketRowDto } from "@/api/types";
import {
  AppModal,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  KeyValueRow,
  LoadingState,
  PickerField,
  Screen,
  SectionTitle,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { radius, spacing, type ThemeColors } from "@/theme/tokens";

/** Durum rengi — web'deki status token'larının mobil karşılığı. */
function statusColor(status: string, colors: ThemeColors): string {
  switch (status) {
    case "open":
      return colors.status.pending;
    case "reopened":
      return colors.status.revision;
    case "in_progress":
      return colors.status.completed;
    case "waiting_customer":
      return colors.accent;
    case "resolved":
      return colors.status.approved;
    case "closed":
    case "cancelled":
      return colors.status.cancelled;
    default:
      return colors.mutedText;
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TicketsScreen({
  api,
  title,
  description,
  showRequester = false,
}: {
  api: TicketApi;
  title: string;
  description: string;
  showRequester?: boolean;
}) {
  const { colors } = useTheme();
  const [statusGroup, setStatusGroup] = useState<string>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const config = api.useConfig();
  const list = api.useList({ statusGroup });

  if (config.isLoading) return <LoadingState label="Destek ekranı hazırlanıyor…" />;
  if (config.isError || !config.data) {
    return (
      <ErrorState message="Destek ekranı yüklenemedi." onRetry={() => config.refetch()} />
    );
  }
  if (!config.data.enabled) {
    return (
      <EmptyState
        title="Destek talepleri kapalı"
        description="Bu kurulumda destek talebi özelliği devre dışı."
      />
    );
  }

  if (selectedId) {
    return (
      <TicketDetailScreen
        api={api}
        ticketId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  const rows = list.data ?? [];

  return (
    <Screen>
      <View style={{ gap: spacing.md }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
            {title}
          </Text>
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>{description}</Text>
        </View>

        {!config.data.routing.ready ? (
          <Card style={{ borderColor: colors.status.pending }}>
            <Text style={{ color: colors.status.pending, fontWeight: "700" }}>
              Destek yönlendirmesi yapılandırılmamış
            </Text>
            <Text style={{ color: colors.mutedText, fontSize: 13, marginTop: 4 }}>
              Yeni talep açılamıyor. Platform yöneticinizin hedef destek ekibini
              tanımlaması gerekiyor; mevcut talepleriniz etkilenmez.
            </Text>
          </Card>
        ) : (
          config.data.can_create && (
            <Button title="Yeni Talep" onPress={() => setCreateOpen(true)} />
          )
        )}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {TICKET_STATUS_GROUPS.map((group) => (
            <Chip
              key={group.key}
              label={group.label}
              selected={statusGroup === group.key}
              onPress={() => setStatusGroup(group.key)}
            />
          ))}
        </View>

        {list.isLoading ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState message="Talepler yüklenemedi." onRetry={() => list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Bu sekmede talep yok"
            description="Bir sorun yaşadığınızda buradan talep açabilirsiniz."
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {rows.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                showRequester={showRequester}
                onPress={() => setSelectedId(ticket.id)}
              />
            ))}
          </View>
        )}
      </View>

      <TicketCreateModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        api={api}
        config={config.data}
        onCreated={(ticket) => {
          setCreateOpen(false);
          setSelectedId(ticket.id);
        }}
      />
    </Screen>
  );
}

function TicketCard({
  ticket,
  showRequester,
  onPress,
}: {
  ticket: TicketRowDto;
  showRequester: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const resolved = ticket.status === "resolved";
  return (
    <Card
      onPress={onPress}
      style={
        resolved
          ? { borderLeftWidth: 4, borderLeftColor: colors.status.approved }
          : undefined
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Text style={{ color: colors.faintText, fontSize: 12 }}>
          {ticket.ticket_number ?? "Gönderiliyor…"}
        </Text>
        <Badge
          label={ticketStatusLabel(ticket.status)}
          color={statusColor(ticket.status, colors)}
        />
      </View>
      <Text
        style={{ color: colors.text, fontSize: 15, fontWeight: "600", marginTop: 6 }}
        numberOfLines={2}
      >
        {ticket.title}
      </Text>
      <Text style={{ color: colors.mutedText, fontSize: 12, marginTop: 4 }}>
        {ticketCategoryLabel(ticket.category)}
        {showRequester && ticket.requester_name ? ` · ${ticket.requester_name}` : ""}
        {ticket.updated_at ? ` · ${formatWhen(ticket.updated_at)}` : ""}
      </Text>
      {ticket.delivery_status === "failed" && (
        <Text style={{ color: colors.destructive, fontSize: 12, marginTop: 4 }}>
          Destek merkezine iletilemedi — otomatik olarak yeniden denenecek.
        </Text>
      )}
    </Card>
  );
}

function TicketCreateModal({
  visible,
  onClose,
  api,
  config,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  api: TicketApi;
  config: TicketConfigDto;
  onCreated: (ticket: TicketDetailDto) => void;
}) {
  const { colors } = useTheme();
  const { create } = api.useMutations();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("bug");
  const [impact, setImpact] = useState<string>("single_user");
  const [error, setError] = useState<string | null>(null);

  const valid = title.trim().length >= 8 && description.trim().length >= 20;

  async function submit() {
    setError(null);
    try {
      const ticket = await create.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        category,
        impact,
        // Mobil tanılama: web ile aynı ALLOWLIST mantığı — cihaz/dil/zaman
        // dilimi dışında hiçbir şey gönderilmez.
        client_context: {
          device_class: "mobil",
          locale: "tr-TR",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          client_timestamp: new Date().toISOString(),
        },
        attachment_upload_ids: [],
      });
      setTitle("");
      setDescription("");
      onCreated(ticket);
    } catch (e) {
      // Yazılanlar KORUNUR: kullanıcı yeniden yazmak zorunda kalmaz.
      setError(e instanceof Error ? e.message : "Talep gönderilemedi");
    }
  }

  return (
    <AppModal visible={visible} onClose={onClose} title="Yeni Destek Talebi">
      <Card>
        <Text style={{ color: colors.text, fontSize: 14 }}>
          Talebiniz{" "}
          <Text style={{ fontWeight: "700" }}>{config.routing.group_display_name}</Text>{" "}
          ekibine otomatik olarak iletilecektir.
        </Text>
        <Text style={{ color: colors.faintText, fontSize: 12, marginTop: 4 }}>
          Hedef ekip yönetim tarafından belirlenir; bu talepte değiştirilemez.
        </Text>
      </Card>

      <PickerField
        label="Kategori"
        value={category}
        onChange={setCategory}
        options={TICKET_CATEGORIES.map((c) => ({
          value: c,
          label: `${TICKET_CATEGORY_LABELS[c]} — ${TICKET_CATEGORY_HINTS[c]}`,
        }))}
      />

      <Field
        label="Başlık"
        value={title}
        onChangeText={setTitle}
        placeholder="Kısa ve ayırt edici bir başlık"
      />

      <Field
        label="Sorun detayı"
        value={description}
        onChangeText={setDescription}
        placeholder="Ne yapmaya çalıştınız, ne oldu?"
        multiline
        style={{ height: 120, paddingTop: 12, textAlignVertical: "top" }}
      />

      <PickerField
        label="Etki"
        value={impact}
        onChange={setImpact}
        options={TICKET_IMPACTS.map((i) => ({
          value: i,
          label: TICKET_IMPACT_LABELS[i],
        }))}
      />

      <Text style={{ color: colors.faintText, fontSize: 12 }}>
        Ekran görüntüsü eklemek için web portalını kullanın. Gizli form verileri ve
        oturum bilgileri gönderilmez.
      </Text>

      {error && (
        <Text style={{ color: colors.destructive, fontSize: 13 }}>
          {error} — yazdıklarınız korunuyor.
        </Text>
      )}

      <Button
        title="Talebi Gönder"
        onPress={submit}
        disabled={!valid || create.isPending}
        loading={create.isPending}
      />
    </AppModal>
  );
}

function TicketDetailScreen({
  api,
  ticketId,
  onBack,
}: {
  api: TicketApi;
  ticketId: string;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const detail = api.useDetail(ticketId);
  const { reply, reopen, confirmClose } = api.useMutations();
  const [body, setBody] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ticket = detail.data;
  const messages = useMemo(
    () =>
      [...(ticket?.messages ?? [])].sort((a, b) =>
        (a.created_at ?? "").localeCompare(b.created_at ?? ""),
      ),
    [ticket],
  );

  if (detail.isLoading) return <LoadingState label="Talep yükleniyor…" />;
  if (detail.isError || !ticket) {
    return <ErrorState message="Talep bulunamadı." onRetry={() => detail.refetch()} />;
  }

  const closed = ticket.status === "closed" || ticket.status === "cancelled";

  return (
    <Screen>
      <View style={{ gap: spacing.md }}>
        <Pressable
          onPress={onBack}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={20} color={colors.accent} />
          <Text style={{ color: colors.accent, fontSize: 14 }}>Taleplerim</Text>
        </Pressable>

        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Text style={{ color: colors.faintText, fontSize: 12 }}>
              {ticket.ticket_number ?? "Gönderiliyor…"}
            </Text>
            <Badge
              label={ticketStatusLabel(ticket.status)}
              color={statusColor(ticket.status, colors)}
            />
          </View>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>
            {ticket.title}
          </Text>
          <Text style={{ color: colors.mutedText, fontSize: 12 }}>
            {ticketCategoryLabel(ticket.category)} · {ticketImpactLabel(ticket.impact)}
            {ticket.group_name ? ` · ${ticket.group_name}` : ""}
          </Text>
        </View>

        {ticket.status === "waiting_customer" && (
          <Card style={{ borderColor: colors.accent }}>
            <Text style={{ color: colors.accent, fontWeight: "700" }}>
              Destek ekibi sizden bilgi bekliyor
            </Text>
            <Text style={{ color: colors.mutedText, fontSize: 13, marginTop: 4 }}>
              Yanıt verdiğinizde talep otomatik olarak işleme geri alınır.
            </Text>
          </Card>
        )}

        {ticket.resolution && (
          <Card
            style={{ borderLeftWidth: 4, borderLeftColor: colors.status.approved }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={colors.status.approved}
              />
              <Text style={{ color: colors.status.approved, fontWeight: "700" }}>
                Çözüm
                {ticket.resolution.code
                  ? ` · ${
                      TICKET_RESOLUTION_CODE_LABELS[ticket.resolution.code] ??
                      ticket.resolution.code
                    }`
                  : ""}
              </Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 14, marginTop: 8 }}>
              {ticket.resolution.summary}
            </Text>
            <Text style={{ color: colors.faintText, fontSize: 12, marginTop: 6 }}>
              {ticket.resolution.resolved_by_group_name}
              {ticket.resolution.resolved_at
                ? ` · ${formatWhen(ticket.resolution.resolved_at)}`
                : ""}
              {ticket.resolution.fix_version
                ? ` · Sürüm ${ticket.resolution.fix_version}`
                : ""}
            </Text>

            {error && (
              <Text
                style={{ color: colors.destructive, fontSize: 12, marginTop: 8 }}
              >
                {error}
              </Text>
            )}

            {ticket.status === "resolved" && ticket.permissions.can_reopen && (
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                <Button
                  title="Çözümü onayla ve kapat"
                  loading={confirmClose.isPending}
                  onPress={async () => {
                    setError(null);
                    try {
                      await confirmClose.mutateAsync(ticket.id);
                    } catch (e) {
                      // Ticket bu arada agent tarafindan kapatilmis olabilir;
                      // sessiz kalirsa kullanici butona basmayi surdurur.
                      setError(
                        e instanceof Error ? e.message : "İşlem tamamlanamadı",
                      );
                    }
                  }}
                />
                <Button
                  title="Sorun devam ediyor"
                  variant="secondary"
                  onPress={() => setReopenOpen(true)}
                />
              </View>
            )}
          </Card>
        )}

        <Card>
          <SectionTitle title="Talep özeti" />
          <KeyValueRow label="Kategori" value={ticketCategoryLabel(ticket.category)} />
          <KeyValueRow label="Etki" value={ticketImpactLabel(ticket.impact)} />
          {ticket.reproduction_steps && (
            <KeyValueRow label="Adımlar" value={ticket.reproduction_steps} />
          )}
          {ticket.error_code && (
            <KeyValueRow label="Hata kodu" value={ticket.error_code} />
          )}
          <KeyValueRow label="Oluşturma" value={formatWhen(ticket.created_at)} />
        </Card>

        <SectionTitle title="Yazışma" />
        <View style={{ gap: spacing.sm }}>
          {messages.map((message) => {
            const fromAgent = message.author_type !== "requester";
            return (
              <View
                key={message.id}
                style={{
                  backgroundColor: fromAgent ? `${colors.accent}12` : colors.card,
                  borderColor: fromAgent ? colors.accent : colors.border,
                  borderWidth: 1,
                  borderRadius: radius.md,
                  padding: spacing.md,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>
                  {message.author_display_name ?? (fromAgent ? "Destek Ekibi" : "Siz")}
                  <Text style={{ color: colors.faintText, fontWeight: "400" }}>
                    {message.is_pending
                      ? " · gönderiliyor"
                      : ` · ${formatWhen(message.created_at)}`}
                  </Text>
                </Text>
                <Text style={{ color: colors.text, fontSize: 14, marginTop: 6 }}>
                  {message.body}
                </Text>
              </View>
            );
          })}
        </View>

        {ticket.attachments.length > 0 && (
          <Card>
            <SectionTitle title="Ekler" />
            {ticket.attachments.map((attachment) => (
              <KeyValueRow
                key={attachment.id}
                label={attachment.file_name}
                value={
                  attachment.downloadable
                    ? "Web portalından indirilebilir"
                    : "Güvenlik kontrolü yapılıyor"
                }
              />
            ))}
          </Card>
        )}

        {closed ? (
          <Card>
            <Text style={{ color: colors.mutedText, fontSize: 13 }}>
              Bu talep kapatıldı. Sorun tekrar ederse yeni bir talep açabilirsiniz.
            </Text>
          </Card>
        ) : (
          ticket.permissions.can_reply && (
            <Card>
              <Field
                label="Yanıt yaz"
                value={body}
                onChangeText={setBody}
                placeholder="Destek ekibine iletmek istediğiniz bilgi…"
                multiline
                style={{ height: 100, paddingTop: 12, textAlignVertical: "top" }}
              />
              {error && (
                <Text
                  style={{ color: colors.destructive, fontSize: 12, marginTop: 6 }}
                >
                  {error} — yazdıklarınız korunuyor.
                </Text>
              )}
              <Button
                title="Gönder"
                style={{ marginTop: spacing.md }}
                disabled={!body.trim() || reply.isPending}
                loading={reply.isPending}
                onPress={async () => {
                  setError(null);
                  try {
                    await reply.mutateAsync({ id: ticket.id, body: body.trim() });
                    setBody("");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Yanıt gönderilemedi");
                  }
                }}
              />
            </Card>
          )
        )}
      </View>

      <AppModal
        visible={reopenOpen}
        onClose={() => setReopenOpen(false)}
        title="Talebi yeniden aç"
      >
        <Field
          label="Neden yeniden açıyorsunuz?"
          value={reopenReason}
          onChangeText={setReopenReason}
          multiline
          style={{ height: 100, paddingTop: 12, textAlignVertical: "top" }}
        />
        {reopenError && (
          <Text style={{ color: colors.destructive, fontSize: 13 }}>
            {reopenError}
          </Text>
        )}
        <Button
          title="Yeniden Aç"
          disabled={reopenReason.trim().length < 5 || reopen.isPending}
          loading={reopen.isPending}
          onPress={async () => {
            setReopenError(null);
            try {
              await reopen.mutateAsync({
                id: ticket.id,
                reason: reopenReason.trim(),
              });
              setReopenReason("");
              setReopenOpen(false);
            } catch (e) {
              // HATA YUTULURSA modal acik kalir ama sebebi gorunmez:
              // await'ten SONRAKI kapatma satirlari zaten calismaz.
              setReopenError(
                e instanceof Error ? e.message : "Yeniden açılamadı",
              );
            }
          }}
        />
      </AppModal>
    </Screen>
  );
}
