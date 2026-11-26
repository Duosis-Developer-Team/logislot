import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { AppModal, Button, Chip, Field } from "@/components/ui";
import {
  MAX_OCCURRENCES,
  RECURRENCE_COPY_TR,
  RECURRENCE_ERRORS_TR,
  type RecurrenceResult,
  type RecurrenceRule,
  type WeekOfMonth,
  describeRule,
  generateOccurrenceDates,
  normalizeRule,
} from "@/lib/recurrence";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

const C = RECURRENCE_COPY_TR;

export function useRecurrencePreview(startDate: string, rule: RecurrenceRule): RecurrenceResult {
  return useMemo(() => generateOccurrenceDates(startDate, rule), [startDate, rule]);
}

function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("tr-TR", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function PreviewList({ result, footer }: { result: RecurrenceResult; footer?: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        gap: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
      }}
    >
      {result.error ? (
        <Text style={{ color: colors.destructive, fontSize: 12, fontWeight: "700" }}>
          {RECURRENCE_ERRORS_TR[result.error]}
        </Text>
      ) : (
        <>
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
            {result.dates.length} randevu oluşturulacak:
          </Text>
          {result.dates.map((d, i) => (
            <Text key={d} style={{ color: colors.mutedText, fontSize: 12 }}>
              {i + 1}. {formatDay(d)}
            </Text>
          ))}
        </>
      )}
      {footer ? (
        <Text style={{ color: colors.faintText, fontSize: 11, marginTop: 2 }}>{footer}</Text>
      ) : null}
    </View>
  );
}

function NumberInput({
  value,
  onChange,
  min = 1,
  max = 99,
}: {
  value: number | null | undefined;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  const { colors } = useTheme();
  return (
    <TextInput
      keyboardType="number-pad"
      value={value == null ? "" : String(value)}
      onChangeText={(text) => {
        const n = parseInt(text, 10);
        onChange(Math.max(min, Math.min(max, Number.isNaN(n) ? min : n)));
      }}
      style={{
        width: 56,
        height: 40,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        textAlign: "center",
        fontSize: 15,
        color: colors.text,
      }}
    />
  );
}

function Option({
  selected,
  onPress,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}
    >
      <Ionicons
        name={selected ? "radio-button-on" : "radio-button-off"}
        size={20}
        color={selected ? colors.primary : colors.mutedText}
      />
      {children}
    </Pressable>
  );
}

function RecurrenceForm({
  startDate,
  rule,
  onChange,
}: {
  startDate: string;
  rule: RecurrenceRule;
  onChange: (r: RecurrenceRule) => void;
}) {
  const { colors } = useTheme();
  const r = normalizeRule(rule, startDate);
  const result = useRecurrencePreview(startDate, rule);
  const set = (patch: Partial<RecurrenceRule>) => onChange({ ...r, ...patch });
  const txt = { color: colors.text, fontSize: 14 } as const;
  const heading = { color: colors.text, fontSize: 15, fontWeight: "700" } as const;

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={heading}>Yineleme deseni</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {(
          [
            ["daily", "Günlük"],
            ["weekly", "Haftalık"],
            ["monthly", "Aylık"],
          ] as const
        ).map(([type, label]) => (
          <Chip key={type} label={label} selected={r.type === type} onPress={() => set({ type })} />
        ))}
      </View>

      {r.type === "daily" && (
        <View style={{ gap: 10 }}>
          <Option selected={!r.weekdays_only} onPress={() => set({ weekdays_only: false })}>
            <Text style={txt}>Her</Text>
            <NumberInput value={r.interval} onChange={(interval) => set({ interval })} />
            <Text style={txt}>günde bir</Text>
          </Option>
          <Option selected={!!r.weekdays_only} onPress={() => set({ weekdays_only: true })}>
            <Text style={txt}>Her iş günü (Pzt–Cum)</Text>
          </Option>
        </View>
      )}

      {r.type === "weekly" && (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={txt}>Her</Text>
            <NumberInput value={r.interval} onChange={(interval) => set({ interval })} />
            <Text style={txt}>haftada bir, şu günlerde:</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {C.weekdaysShort.map((label, day) => {
              const on = (r.weekdays ?? []).includes(day);
              return (
                <Chip
                  key={label}
                  label={label}
                  selected={on}
                  onPress={() => {
                    const current = r.weekdays ?? [];
                    const next = on ? current.filter((d) => d !== day) : [...current, day];
                    if (next.length > 0) set({ weekdays: next.sort() });
                  }}
                />
              );
            })}
          </View>
        </View>
      )}

      {r.type === "monthly" && (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={txt}>Her</Text>
            <NumberInput value={r.interval} onChange={(interval) => set({ interval })} />
            <Text style={txt}>ayda bir</Text>
          </View>
          <Option
            selected={r.monthly_mode !== "nth_weekday"}
            onPress={() => set({ monthly_mode: "day_of_month" })}
          >
            <Text style={txt}>Ayın</Text>
            <NumberInput
              value={r.day_of_month}
              max={31}
              onChange={(day_of_month) => set({ day_of_month, monthly_mode: "day_of_month" })}
            />
            <Text style={txt}>. günü</Text>
          </Option>
          <Option
            selected={r.monthly_mode === "nth_weekday"}
            onPress={() =>
              onChange(normalizeRule({ ...r, monthly_mode: "nth_weekday" }, startDate))
            }
          >
            <Text style={txt}>Ayın … günü</Text>
          </Option>
          {r.monthly_mode === "nth_weekday" && (
            <View style={{ gap: 6, paddingLeft: 28 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {([1, 2, 3, 4, -1] as WeekOfMonth[]).map((w, i) => (
                  <Chip
                    key={w}
                    label={C.ordinals[i]}
                    selected={r.week_of_month === w}
                    onPress={() => set({ week_of_month: w })}
                  />
                ))}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {C.weekdaysShort.map((label, day) => (
                  <Chip
                    key={label}
                    label={label}
                    selected={r.weekday === day}
                    onPress={() => set({ weekday: day })}
                  />
                ))}
              </View>
            </View>
          )}
          <Text style={{ color: colors.faintText, fontSize: 11 }}>
            Ayda bu gün yoksa (ör. 31) ayın son günü kullanılır.
          </Text>
        </View>
      )}

      <View style={{ height: 1, backgroundColor: colors.border }} />
      <Text style={heading}>Yineleme aralığı</Text>
      <Text style={{ color: colors.mutedText, fontSize: 13 }}>Başlangıç: {startDate}</Text>
      <Option selected={r.end_type === "count"} onPress={() => set({ end_type: "count" })}>
        <Text style={txt}>Şu kadar tekrardan sonra bitir:</Text>
        <NumberInput
          value={r.count ?? 4}
          min={2}
          max={MAX_OCCURRENCES}
          onChange={(count) => set({ count, end_type: "count" })}
        />
      </Option>
      <Option
        selected={r.end_type === "until"}
        onPress={() =>
          set({
            end_type: "until",
            until: r.until ?? result.dates[result.dates.length - 1] ?? startDate,
          })
        }
      >
        <Text style={txt}>Şu tarihte bitir:</Text>
      </Option>
      {r.end_type === "until" && (
        <Field
          value={r.until ?? ""}
          placeholder="YYYY-AA-GG"
          onChangeText={(until) => set({ until })}
          autoCapitalize="none"
        />
      )}

      <PreviewList result={result} />
    </View>
  );
}

/** Tekrar ozeti + "Tekrarı ayarla" alt sayfasi (web RecurrenceEditor'un aynasi). */
export function RecurrenceEditor({
  startDate,
  value,
  onChange,
  footer,
}: {
  startDate: string;
  value: RecurrenceRule;
  onChange: (rule: RecurrenceRule) => void;
  footer?: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RecurrenceRule>(value);
  const result = useRecurrencePreview(startDate, value);
  const draftResult = useRecurrencePreview(startDate, draft);

  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable
        onPress={() => {
          setDraft(normalizeRule(value, startDate));
          setOpen(true);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.md,
        }}
      >
        <Ionicons name="repeat" size={18} color={colors.primary} />
        <Text style={{ flex: 1, color: colors.text, fontSize: 14, fontWeight: "600" }}>
          {describeRule(value, C, startDate)}
        </Text>
        <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>
          Tekrarı ayarla
        </Text>
      </Pressable>
      <PreviewList result={result} footer={footer} />
      <AppModal visible={open} onClose={() => setOpen(false)} title="Tekrarı ayarla">
        <RecurrenceForm startDate={startDate} rule={draft} onChange={setDraft} />
        <Button
          title="Uygula"
          disabled={draftResult.error !== null}
          onPress={() => {
            onChange(draft);
            setOpen(false);
          }}
        />
      </AppModal>
    </View>
  );
}
