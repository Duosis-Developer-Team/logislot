import { Stack } from "expo-router";
import { RoleGuard } from "@/auth/guard";
import { useTheme } from "@/theme/theme";

export default function AdminLayout() {
  const { colors } = useTheme();
  return (
    <RoleGuard userType="tenant">
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        {(
          [
            ["appointment/[id]", "Randevu Detayı"],
            ["new-appointment", "Yeni Randevu (Tedarikçi Adına)"],
            ["series", "Tekrarlayan Seriler"],
            ["notifications", "Bildirimler"],
            ["reports", "Raporlar"],
            ["settings/categories", "Ürün Kategorileri"],
            ["settings/vehicle-categories", "Araç Kategorileri"],
            ["settings/docks", "Rampalar"],
            ["settings/conflict-groups", "Çakışma Grupları"],
            ["settings/overrides", "Takvim İstisnaları"],
            ["settings/suppliers", "Tedarikçiler"],
            ["settings/users", "Kullanıcılar & Roller"],
            ["settings/email-logs", "E-posta Logları"],
            ["settings/audit-logs", "Denetim İzleri"],
            ["settings/notification-preferences", "Bildirim Tercihleri"],
          ] as const
        ).map(([name, title]) => (
          <Stack.Screen
            key={name}
            name={name}
            options={{
              headerShown: true,
              title,
              headerStyle: { backgroundColor: colors.card },
              headerTintColor: colors.text,
              headerBackTitle: "Geri",
            }}
          />
        ))}
      </Stack>
    </RoleGuard>
  );
}
