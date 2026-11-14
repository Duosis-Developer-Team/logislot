/**
 * Ek e-posta listesi girişi — web components/domain/email-list-input.tsx
 * karşılığı. Müşteri kararı 2026-11: tedarikçiye 10'a kadar ek bildirim adresi.
 */

import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTheme } from "@/theme/theme";
import { radius } from "@/theme/tokens";

const SPLIT = /[,;\s]+/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailListField({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  max: number;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add(raw: string) {
    const next = [...value];
    let invalid: string | null = null;
    for (const part of raw.split(SPLIT)) {
      const email = part.trim();
      if (!email) continue;
      if (!EMAIL.test(email)) {
        invalid = email;
        continue;
      }
      if (next.some((v) => v.toLowerCase() === email.toLowerCase())) continue;
      if (next.length >= max) break;
      next.push(email);
    }
    onChange(next);
    setError(invalid ? `“${invalid}” geçerli bir e-posta adresi değil.` : null);
    setDraft(invalid ?? "");
  }

  const full = value.length >= max;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={draft}
          editable={!full}
          placeholder={full ? `En fazla ${max} adres` : "ornek@firma.com"}
          placeholderTextColor={colors.faintText}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(text) => (/[,;\s]$/.test(text) ? add(text) : setDraft(text))}
          onSubmitEditing={() => add(draft)}
          returnKeyType="done"
          style={{
            flex: 1,
            height: 46,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            paddingHorizontal: 12,
            fontSize: 15,
            color: colors.text,
          }}
        />
        <Pressable
          onPress={() => add(draft)}
          disabled={full || !draft.trim()}
          accessibilityLabel="E-postayı ekle"
          style={{
            width: 46,
            height: 46,
            borderRadius: radius.md,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.primary,
            opacity: full || !draft.trim() ? 0.4 : 1,
          }}
        >
          <Ionicons name="add" size={22} color={colors.primaryText} />
        </Pressable>
      </View>
      {error && <Text style={{ color: colors.destructive, fontSize: 12 }}>{error}</Text>}
      {value.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {value.map((email) => (
            <Pressable
              key={email}
              onPress={() => onChange(value.filter((v) => v !== email))}
              accessibilityLabel={`${email} adresini kaldır`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingLeft: 10,
                paddingRight: 6,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: `${colors.primary}1A`,
              }}
            >
              <Text style={{ color: colors.primary, fontSize: 13 }}>{email}</Text>
              <Ionicons name="close" size={14} color={colors.primary} />
            </Pressable>
          ))}
        </View>
      )}
      <Text style={{ color: colors.faintText, fontSize: 12 }}>
        Tedarikçiye giden onay, red, revize ve iptal e-postaları bu adreslerin hepsine de gider
        (en fazla {max}).
      </Text>
    </View>
  );
}
