import { Stack } from "expo-router";
import { RoleGuard } from "@/auth/guard";
import { useTheme } from "@/theme/theme";

export default function SupplierLayout() {
  const { colors } = useTheme();
  return (
    <RoleGuard userType="supplier">
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="appointment/[id]"
          options={{
            headerShown: true,
            title: "Randevu Detayı",
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.text,
            headerBackTitle: "Geri",
          }}
        />
        <Stack.Screen
          name="notifications"
          options={{
            headerShown: true,
            title: "Bildirimler",
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.text,
            headerBackTitle: "Geri",
          }}
        />
        <Stack.Screen
          name="tickets"
          options={{
            headerShown: true,
            title: "Destek",
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.text,
            headerBackTitle: "Geri",
          }}
        />
      </Stack>
    </RoleGuard>
  );
}
