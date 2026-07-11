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
      </Stack>
    </RoleGuard>
  );
}
