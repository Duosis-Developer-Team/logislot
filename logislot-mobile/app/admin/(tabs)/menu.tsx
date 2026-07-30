import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "@/auth/session";
import { ThemeAndLogoutSection } from "@/components/settings";
import { Card, Chip, Screen, SectionTitle } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/**
 * Yönetim — Menü: tesis seçici + operasyon/konfigürasyon kısayolları +
 * hesap + tema + çıkış. Web'deki topbar tesis seçici, sidebar navigasyonu
 * ve UserMenu'nün mobile karşılığı. Girişler web ile aynı RBAC izinlerine
 * göre gösterilir.
 */

interface MenuEntry {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  permission?: string;
}

const OPERATION_ENTRIES: MenuEntry[] = [
  {
    title: "Yeni Randevu (Tedarikçi Adına)",
    icon: "add-circle-outline",
    route: "/admin/new-appointment",
    permission: "appt.create",
  },
  { title: "Tekrarlayan Seriler", icon: "repeat-outline", route: "/admin/series" },
  { title: "Bildirimler", icon: "notifications-outline", route: "/admin/notifications" },
  {
    title: "Raporlar",
    icon: "bar-chart-outline",
    route: "/admin/reports",
    permission: "report.view",
  },
];

const CONFIG_ENTRIES: MenuEntry[] = [
  {
    title: "Ürün Kategorileri",
    icon: "pricetags-outline",
    route: "/admin/settings/categories",
    permission: "category.manage",
  },
  {
    title: "Araç Kategorileri",
    icon: "car-outline",
    route: "/admin/settings/vehicle-categories",
    permission: "vehicle_category.manage",
  },
  {
    title: "Rampalar",
    icon: "business-outline",
    route: "/admin/settings/docks",
    permission: "dock.manage",
  },
  {
    title: "Çakışma Grupları",
    icon: "git-branch-outline",
    route: "/admin/settings/conflict-groups",
    permission: "dock_conflict_group.manage",
  },
  {
    title: "Takvim İstisnaları",
    icon: "calendar-clear-outline",
    route: "/admin/settings/overrides",
    permission: "calendar.override",
  },
  {
    title: "Tedarikçiler",
    icon: "people-outline",
    route: "/admin/settings/suppliers",
    permission: "supplier.manage",
  },
  {
    title: "Kullanıcılar & Roller",
    icon: "shield-checkmark-outline",
    route: "/admin/settings/users",
    permission: "user.manage",
  },
  {
    title: "E-posta Logları",
    icon: "mail-outline",
    route: "/admin/settings/email-logs",
  },
  {
    title: "Denetim İzleri",
    icon: "document-text-outline",
    route: "/admin/settings/audit-logs",
  },
  {
    title: "Bildirim Tercihleri",
    icon: "options-outline",
    route: "/admin/settings/notification-preferences",
  },
];

export default function AdminMenu() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSession();

  const visible = (entries: MenuEntry[]) =>
    entries.filter((e) => !e.permission || session.can(e.permission));

  const facilities = session.me?.facilities ?? [];
  const operations = visible(OPERATION_ENTRIES);
  const configs = visible(CONFIG_ENTRIES);

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <View style={{ gap: spacing.md }}>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>Menü</Text>

        <SectionTitle title="Hesap" />
        <Card style={{ gap: 4 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
            {session.me?.name}
          </Text>
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>{session.me?.email}</Text>
          {facilities.length === 1 && (
            <Text style={{ color: colors.mutedText, fontSize: 13 }}>{facilities[0].name}</Text>
          )}
        </Card>

        {/* 1 tenant = 1 tesis: tek kapsamda secim YOK, yalnizca hesap kartinda ad
            gorunur. Coklu kapsam yalnizca eski kayitlarda olusabilir. */}
        {facilities.length > 1 && (
          <>
            <SectionTitle title="Aktif Kapsam" />
            <Card style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {facilities.map((f) => (
                  <Chip
                    key={f.id}
                    label={f.name}
                    selected={session.activeFacilityId === f.id}
                    onPress={() => session.setActiveFacilityId(f.id)}
                  />
                ))}
              </View>
            </Card>
          </>
        )}

        {operations.length > 0 && (
          <>
            <SectionTitle title="Operasyon" />
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {operations.map((entry, i) => (
                <MenuRow key={entry.route} entry={entry} showBorder={i > 0} />
              ))}
            </Card>
          </>
        )}

        {configs.length > 0 && (
          <>
            <SectionTitle title="Konfigürasyon" />
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {configs.map((entry, i) => (
                <MenuRow key={entry.route} entry={entry} showBorder={i > 0} />
              ))}
            </Card>
          </>
        )}

        <ThemeAndLogoutSection />
      </View>
    </Screen>
  );
}

function MenuRow({ entry, showBorder }: { entry: MenuEntry; showBorder: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => router.push(entry.route as never)}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: 14,
        borderTopWidth: showBorder ? 1 : 0,
        borderTopColor: colors.border,
        backgroundColor: pressed ? `${colors.mutedText}12` : "transparent",
      })}
    >
      <Ionicons name={entry.icon} size={20} color={colors.accent} />
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500", flex: 1 }}>
        {entry.title}
      </Text>
      <Ionicons name="chevron-forward" size={17} color={colors.faintText} />
    </Pressable>
  );
}
