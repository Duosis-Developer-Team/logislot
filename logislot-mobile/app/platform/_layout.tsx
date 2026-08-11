import { Stack } from "expo-router";
import { RoleGuard } from "@/auth/guard";
import { useTheme } from "@/theme/theme";

export default function PlatformLayout() {
  const { colors } = useTheme();
  return (
    <RoleGuard userType="platform">
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        {(
          [
            ["plans", "Planlar"],
            ["support", "Pilot Destek"],
            ["audit-logs", "Denetim İzleri"],
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
