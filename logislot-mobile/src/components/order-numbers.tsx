/**
 * Sipariş numarası girişi — web components/domain/order-numbers-input.tsx
 * karşılığı. Müşteri kararı 2026-11: bir sevkiyatta birden fazla sipariş olabilir.
 *
 * "Ekle" düğmesi veya klavyedeki gönder tuşu numarayı ekler; virgülle
 * yapıştırılan liste otomatik bölünür. Sunucu da aynı normalizasyonu yapar.
 */

import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { FormFieldMode } from "@/api/types";
import { useTheme } from "@/theme/theme";
import { radius } from "@/theme/tokens";

const SPLIT = /[,;\n\r\t]+/;
const MAX_LENGTH = 64;

export function OrderNumbersField({
  mode,
  value,
  onChange,
  max,
}: {
  mode: FormFieldMode;
  value: string[];
  onChange: (next: string[]) => void;
  max: number;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState("");
  if (mode === "hidden") return null;

  function add(raw: string) {
    const next = [...value];
    for (const part of raw.split(SPLIT)) {
      const item = part.trim().slice(0, MAX_LENGTH);
      if (!item) continue;
      if (next.some((v) => v.toLocaleLowerCase("tr-TR") === item.toLocaleLowerCase("tr-TR")))
        continue;
      if (next.length >= max) break;
      next.push(item);
    }
    onChange(next);
    setDraft("");
  }

  const full = value.length >= max;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
        Sipariş no {mode === "required" ? "(zorunlu)" : "(isteğe bağlı)"}
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={draft}
          editable={!full}
          placeholder={full ? `En fazla ${max} sipariş` : "Sipariş numarası"}
          placeholderTextColor={colors.faintText}
          onChangeText={(text) => (SPLIT.test(text) ? add(text) : setDraft(text))}
          onSubmitEditing={() => add(draft)}
          onBlur={() => draft.trim() && add(draft)}
          returnKeyType="done"
          autoCapitalize="characters"
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
          accessibilityLabel="Sipariş numarasını ekle"
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
      {value.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {value.map((item) => (
            <Pressable
              key={item}
              onPress={() => onChange(value.filter((v) => v !== item))}
              accessibilityLabel={`${item} numarasını kaldır`}
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
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>{item}</Text>
              <Ionicons name="close" size={14} color={colors.primary} />
            </Pressable>
          ))}
        </View>
      )}
      <Text style={{ color: colors.faintText, fontSize: 12 }}>
        Birden fazla sipariş varsa her birini ayrı ekleyin ya da virgülle yapıştırın.
      </Text>
    </View>
  );
}
