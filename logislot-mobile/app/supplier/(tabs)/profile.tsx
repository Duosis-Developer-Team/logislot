import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSupplierProfile } from "@/api/supplier";
import { useSession } from "@/auth/session";
import { ThemeAndLogoutSection } from "@/components/settings";
import { Badge, Card, ErrorState, LoadingState, Screen, SectionTitle } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/** Tedarikçi profili — firma bilgisi + tema + çıkış.
 *
 * Bildirim tercihleri BURADA YOKTUR: tedarikçiye hangi bildirimin gideceğine
 * tesis yönetimi karar verir (yönetim panelindeki "Tedarikçi Bildirimleri").
 */
export default function SupplierProfile() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const profile = useSupplierProfile();

  if (profile.isLoading)
    return <Screen scroll={false}><LoadingState /></Screen>;
  if (profile.isError || !profile.data)
    return (
      <Screen scroll={false}>
        <ErrorState message="Profil yüklenemedi." onRetry={() => profile.refetch()} />
      </Screen>
    );

  const data = profile.data;

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <View style={{ gap: spacing.md }}>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>Profil</Text>

        <Card style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>
            {data.company_name}
          </Text>
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>{data.facility.name}</Text>
          <InfoRow label="Tedarikçi Kodu" value={data.code} />
          {data.category_label && <InfoRow label="Kategori" value={data.category_label} />}
          <InfoRow label="İletişim" value={data.contact_name ?? "—"} />
          <InfoRow label="E-posta" value={data.contact_email ?? "—"} />
          <InfoRow
            label="Süre Limiti"
            value={`${data.min_block_minutes ?? "—"}–${data.max_block_minutes ?? "—"} dk`}
          />
          <InfoRow
            label="Kota"
            value={`${data.weekly_quota ?? "∞"}/hafta · ${data.monthly_quota ?? "∞"}/ay`}
          />
          {data.auto_approval_enabled && (
            <Badge label="Otomatik onay aktif" color={colors.status.approved} />
          )}
        </Card>

        <SectionTitle title="Destek" />
        <Card
          onPress={() => router.push("/supplier/tickets")}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
        >
          <Ionicons name="help-buoy-outline" size={22} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
              Destek Talepleri
            </Text>
            <Text style={{ color: colors.mutedText, fontSize: 12 }}>
              Sorun bildirin, yanıtları takip edin
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.faintText} />
        </Card>

        <SectionTitle title="Hesap" />
        <Card style={{ gap: 4 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
            {session.me?.name}
          </Text>
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>{session.me?.email}</Text>
        </Card>

        <ThemeAndLogoutSection />
      </View>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: colors.mutedText, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "500" }}>{value}</Text>
    </View>
  );
}
