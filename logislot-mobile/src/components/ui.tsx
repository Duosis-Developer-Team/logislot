/**
 * LogiSlot mobil UI kiti — tema token'larıyla beslenen native primitifler.
 * Web'deki components/ui ailesinin mobile-native karşılığı.
 */

import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/theme";
import { radius, spacing } from "@/theme/tokens";

// ------------------------------------------------------------------- Screen

export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const base: StyleProp<ViewStyle> = [
    { flex: 1, backgroundColor: colors.background },
    style,
  ];
  if (!scroll) {
    return (
      <View style={base}>
        <View style={{ flex: 1, padding: padded ? spacing.lg : 0 }}>{children}</View>
      </View>
    );
  }
  return (
    <View style={base}>
      <ScrollView
        contentContainerStyle={{
          padding: padded ? spacing.lg : 0,
          paddingBottom: insets.bottom + spacing.xl * 2,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

// --------------------------------------------------------------------- Card

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const cardStyle: StyleProp<ViewStyle> = [
    {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    style,
  ];
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [cardStyle, pressed && { opacity: 0.85 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={cardStyle}>{children}</View>;
}

// ------------------------------------------------------------------- Button

type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "destructive"
        ? colors.destructive
        : "transparent";
  const fg =
    variant === "primary"
      ? colors.primaryText
      : variant === "destructive"
        ? "#FFFFFF"
        : variant === "secondary"
          ? colors.text
          : colors.mutedText;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          height: 50,
          borderRadius: radius.md,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: spacing.sm,
          backgroundColor: bg,
          borderWidth: variant === "secondary" ? 1 : 0,
          borderColor: colors.border,
          opacity: disabled || loading ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading && <ActivityIndicator size="small" color={fg} />}
      <Text style={{ color: fg, fontSize: 16, fontWeight: "600" }}>{title}</Text>
    </Pressable>
  );
}

// -------------------------------------------------------------------- Input

export function Field({
  label,
  ...props
}: TextInputProps & { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label && (
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
          {label}
        </Text>
      )}
      <TextInput
        placeholderTextColor={colors.faintText}
        {...props}
        style={[
          {
            height: 50,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            paddingHorizontal: 14,
            fontSize: 16,
            color: colors.text,
          },
          props.style,
        ]}
      />
    </View>
  );
}

// -------------------------------------------------------------------- Badge

export function Badge({
  label,
  color,
  style,
}: {
  label: string;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          alignSelf: "flex-start",
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 4,
          backgroundColor: `${color}22`,
        },
        style,
      ]}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

// --------------------------------------------------------------- Chip (seçim)

export function Chip({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primary : colors.card,
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      })}
    >
      <Text
        style={{
          color: selected ? colors.primaryText : colors.text,
          fontSize: 13,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ----------------------------------------------------------------- Durumlar

export function LoadingState({ label = "Yükleniyor…" }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stateBox}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={{ color: colors.mutedText, fontSize: 14 }}>{label}</Text>
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.stateBox}>
      <Ionicons name="alert-circle-outline" size={34} color={colors.destructive} />
      <Text style={{ color: colors.mutedText, fontSize: 14, textAlign: "center" }}>
        {message}
      </Text>
      {onRetry && (
        <Button title="Tekrar Dene" variant="secondary" onPress={onRetry} style={{ paddingHorizontal: 24, height: 42 }} />
      )}
    </View>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.stateBox}>
      <Ionicons name="file-tray-outline" size={34} color={colors.faintText} />
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>{title}</Text>
      {description && (
        <Text style={{ color: colors.mutedText, fontSize: 13, textAlign: "center" }}>
          {description}
        </Text>
      )}
    </View>
  );
}

// -------------------------------------------------------------- Metrik kartı

export function MetricCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: string;
}) {
  const { colors } = useTheme();
  const color = tone ?? colors.accent;
  return (
    <Card style={{ flex: 1, minWidth: 100, padding: spacing.md, gap: 6 }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `${color}1E`,
        }}
      >
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{value}</Text>
      <Text style={{ color: colors.mutedText, fontSize: 12 }}>{label}</Text>
    </Card>
  );
}

// ------------------------------------------------------------- Bölüm başlığı

export function SectionTitle({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        color: colors.text,
        fontSize: 17,
        fontWeight: "700",
        marginBottom: spacing.sm,
        marginTop: spacing.sm,
      }}
    >
      {title}
    </Text>
  );
}

// ------------------------------------------------------- Modal (bottom sheet)

/** Web'deki Dialog karşılığı — alttan açılan, kaydırılabilir sheet. */
export function AppModal({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: "#00000088" }]}
          onPress={onClose}
          accessibilityLabel="Kapat"
        />
        <View
          style={{
            maxHeight: "88%",
            backgroundColor: colors.background,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingBottom: insets.bottom + spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
              paddingBottom: spacing.sm,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700", flex: 1 }}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Kapat">
              <Ionicons name="close" size={24} color={colors.mutedText} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------- Switch satırı

export function SwitchRow({
  label,
  hint,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.md,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>{label}</Text>
        {hint && <Text style={{ color: colors.faintText, fontSize: 12 }}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.accent }}
      />
    </View>
  );
}

// ------------------------------------------------------------- Seçim alanı

/** Web'deki Select karşılığı — dokununca modal listesi açılır. */
export function PickerField({
  label,
  value,
  placeholder = "— Seçin —",
  options,
  onChange,
  disabled,
}: {
  label?: string;
  value: string | null;
  placeholder?: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;
  return (
    <View style={{ gap: 6 }}>
      {label && (
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>{label}</Text>
      )}
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        style={{
          height: 50,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: selected ? colors.text : colors.faintText,
            fontSize: 16,
            flex: 1,
          }}
        >
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.mutedText} />
      </Pressable>
      <AppModal visible={open} onClose={() => setOpen(false)} title={label ?? "Seçin"}>
        <View style={{ gap: spacing.sm }}>
          {options.map((o) => (
            <Pressable
              key={o.value}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: spacing.md,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: o.value === value ? colors.accent : colors.border,
                backgroundColor: o.value === value ? `${colors.accent}14` : colors.card,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text
                style={{
                  color: o.value === value ? colors.accent : colors.text,
                  fontSize: 15,
                  fontWeight: o.value === value ? "600" : "400",
                  flex: 1,
                }}
              >
                {o.label}
              </Text>
              {o.value === value && (
                <Ionicons name="checkmark" size={18} color={colors.accent} />
              )}
            </Pressable>
          ))}
        </View>
      </AppModal>
    </View>
  );
}

// ------------------------------------------------------------- Anahtar-değer

export function KeyValueRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: colors.mutedText, fontSize: 13 }}>{label}</Text>
      <Text
        style={{ color: colors.text, fontSize: 13, fontWeight: "500", flexShrink: 1, textAlign: "right" }}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stateBox: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 48,
    paddingHorizontal: spacing.xl,
  },
});
