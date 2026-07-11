/**
 * Config CRUD ekranları için ortak parçalar — web components/config/*
 * (page-shell, states, multi-select, working-hours-editor) karşılığı.
 */

import { useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import type { UseQueryResult } from "@tanstack/react-query";
import type { WorkingHours } from "@/api/types";
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  SwitchRow,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

export type ActiveFilter = "all" | "active" | "inactive";

/** Web'deki filterRows ile aynı: arama + aktif/pasif filtresi. */
export function filterRows<T extends { is_active: boolean }>(
  rows: T[],
  search: string,
  filter: ActiveFilter,
  text: (row: T) => string,
): T[] {
  const q = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter === "active" && !row.is_active) return false;
    if (filter === "inactive" && row.is_active) return false;
    if (q && !text(row).toLowerCase().includes(q)) return false;
    return true;
  });
}

export function ActiveBadge({ active }: { active: boolean }) {
  const { colors } = useTheme();
  return (
    <Badge
      label={active ? "Aktif" : "Pasif"}
      color={active ? colors.status.approved : colors.mutedText}
    />
  );
}

/** Liste kabuğu: arama + filtre chip'leri + yeni butonu + FlatList. */
export function ConfigList<T extends { is_active: boolean }>({
  query,
  createLabel,
  onCreate,
  searchText,
  renderItem,
  emptyTitle,
  emptyDescription,
  description,
  keyExtractor,
}: {
  query: UseQueryResult<T[]>;
  createLabel: string;
  onCreate: () => void;
  searchText: (row: T) => string;
  renderItem: (row: T) => React.ReactElement;
  emptyTitle: string;
  emptyDescription: string;
  description?: string;
  keyExtractor: (row: T) => string;
}) {
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ActiveFilter>("all");

  if (query.isLoading)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <LoadingState />
      </View>
    );
  if (query.isError)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <ErrorState message="Liste yüklenemedi." onRetry={() => query.refetch()} />
      </View>
    );

  const rows = filterRows(query.data ?? [], search, filter, searchText);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={rows}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 64 }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            {description && (
              <Text style={{ color: colors.mutedText, fontSize: 13 }}>{description}</Text>
            )}
            <Button title={createLabel} onPress={onCreate} style={{ height: 44 }} />
            <Field
              value={search}
              onChangeText={setSearch}
              placeholder="Ara…"
              autoCapitalize="none"
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {(
                [
                  ["all", "Tümü"],
                  ["active", "Aktif"],
                  ["inactive", "Pasif"],
                ] as const
              ).map(([key, label]) => (
                <Chip
                  key={key}
                  label={label}
                  selected={filter === key}
                  onPress={() => setFilter(key)}
                />
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState title={emptyTitle} description={emptyDescription} />}
        renderItem={({ item }) => renderItem(item)}
      />
    </View>
  );
}

// ------------------------------------------------------------- çoklu seçim

/** Web'deki MultiSelectChips karşılığı. */
export function MultiSelectChips({
  options,
  value,
  onChange,
  emptyHint,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  emptyHint?: string;
}) {
  const { colors } = useTheme();
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {options.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            selected={value.includes(o.value)}
            onPress={() => toggle(o.value)}
          />
        ))}
      </View>
      {emptyHint && value.length === 0 && (
        <Text style={{ color: colors.faintText, fontSize: 12 }}>{emptyHint}</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------- çalışma saatleri editörü

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Pazartesi" },
  { key: "tue", label: "Salı" },
  { key: "wed", label: "Çarşamba" },
  { key: "thu", label: "Perşembe" },
  { key: "fri", label: "Cuma" },
  { key: "sat", label: "Cumartesi" },
  { key: "sun", label: "Pazar" },
];

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  mon: { start: "08:00", end: "17:00" },
  tue: { start: "08:00", end: "17:00" },
  wed: { start: "08:00", end: "17:00" },
  thu: { start: "08:00", end: "17:00" },
  fri: { start: "08:00", end: "17:00" },
  sat: null,
  sun: null,
};

export function WorkingHoursEditor({
  value,
  onChange,
}: {
  value: WorkingHours;
  onChange: (value: WorkingHours) => void;
}) {
  const { colors } = useTheme();
  function setDay(key: string, day: { start: string; end: string } | null) {
    onChange({ ...value, [key]: day });
  }
  return (
    <View
      style={{
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        padding: spacing.md,
      }}
    >
      {DAYS.map(({ key, label }) => {
        const day = value[key] ?? null;
        const open = day !== null;
        return (
          <View key={key} style={{ gap: 6 }}>
            <SwitchRow
              label={label}
              value={open}
              onValueChange={(checked) =>
                setDay(key, checked ? { start: "08:00", end: "17:00" } : null)
              }
            />
            {open && day && (
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Field
                    value={day.start}
                    onChangeText={(t) => setDay(key, { ...day, start: t })}
                    placeholder="08:00"
                    autoCapitalize="none"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    value={day.end}
                    onChangeText={(t) => setDay(key, { ...day, end: t })}
                    placeholder="17:00"
                    autoCapitalize="none"
                  />
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Liste görünümü için kısa özet: "Her gün 08:00–17:00" vb. */
export function summarizeWorkingHours(hours: WorkingHours | null): string {
  if (!hours) return "Tesis varsayılanı";
  const openDays = DAYS.filter((d) => hours[d.key]);
  if (openDays.length === 0) return "Tüm günler kapalı";
  const first = hours[openDays[0].key]!;
  const allSame = openDays.every(
    (d) => hours[d.key]!.start === first.start && hours[d.key]!.end === first.end,
  );
  if (allSame && openDays.length === 7) return `Her gün ${first.start}–${first.end}`;
  if (allSame) return `${openDays.length} gün ${first.start}–${first.end}`;
  return `${openDays.length} gün açık`;
}
