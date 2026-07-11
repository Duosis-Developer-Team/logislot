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
      </Stack>
    </RoleGuard>
  );
}
