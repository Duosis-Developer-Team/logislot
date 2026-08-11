/**
 * Config CRUD ekranları için ortak parçalar — web components/config/*
 * (page-shell, states, multi-select, working-hours-editor) karşılığı.
 */

import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
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
import { radius, spacing } from "@/theme/tokens";

export type ActiveFilter = "all" | "active" | "inactive";

/**
 * Arama karsilastirmasi icin metni normalize eder — web lib/utils.ts
 * normalizeSearch karsiligi ("urun" yazan "Ürün"u de bulur).
 */
const SEARCH_FOLD: Record<string, string> = {
  ı: "i",
  ş: "s",
  ğ: "g",
  ü: "u",
  ö: "o",
  ç: "c",
  â: "a",
  î: "i",
  û: "u",
};

export function normalizeSearch(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/[ışğüöçâîû]/g, (ch) => SEARCH_FOLD[ch] ?? ch);
}

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

export interface MultiSelectOption {
  value: string;
  label: string;
}

/** Aynı anda basılan maksimum satır; gerisi arama ile daraltılır. */
const MAX_RENDERED = 50;

/** Küçük metin aksiyonu (link görünümlü buton). */
function TextAction({
  label,
  onPress,
  color,
  disabled,
}: {
  label: string;
  onPress: () => void;
  color: string;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8}>
      {({ pressed }) => (
        <Text
          style={{
            color,
            fontSize: 12,
            fontWeight: "600",
            opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * Aranabilir çoklu seçim — web MultiSelectField karşılığı.
 *
 * Not: modal içerikleri zaten dikey ScrollView; iç içe kaydırma kapsayıcısı
 * (Android'de bilinen sorun) KULLANILMAZ. Uzun listeler arama + MAX_RENDERED
 * sınırıyla kısaltılır.
 */
export function MultiSelectField({
  options,
  value,
  onChange,
  emptyHint,
  searchPlaceholder = "Ara…",
}: {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  emptyHint?: string;
  searchPlaceholder?: string;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(value), [value]);
  const byValue = useMemo(
    () => new Map(options.map((o) => [o.value, o] as const)),
    [options],
  );

  const filtered = useMemo(() => {
    const q = normalizeSearch(query.trim());
    if (!q) return options;
    return options.filter((o) => normalizeSearch(o.label).includes(q));
  }, [options, query]);

  const visible = filtered.slice(0, MAX_RENDERED);
  const hiddenCount = filtered.length - visible.length;
  const selectedOptions = value
    .map((v) => byValue.get(v))
    .filter((o): o is MultiSelectOption => o !== undefined);
  // options boşken (veri yüklenirken) yanlış alarm vermemek için koşullu.
  const orphanCount = options.length > 0 ? value.length - selectedOptions.length : 0;
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((o) => selectedSet.has(o.value));

  function toggle(id: string) {
    onChange(selectedSet.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  function toggleFiltered() {
    if (allFilteredSelected) {
      const filteredSet = new Set(filtered.map((o) => o.value));
      onChange(value.filter((v) => !filteredSet.has(v)));
      return;
    }
    onChange([...value, ...filtered.map((o) => o.value).filter((v) => !selectedSet.has(v))]);
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing.sm,
        }}
      >
        <Text style={{ color: colors.mutedText, fontSize: 12 }}>
          {value.length} / {options.length} seçili
        </Text>
        {options.length > 0 && (
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <TextAction
              label={
                allFilteredSelected
                  ? query
                    ? "Sonuçları kaldır"
                    : "Tümünü kaldır"
                  : query
                    ? "Sonuçları seç"
                    : "Tümünü seç"
              }
              onPress={toggleFiltered}
              color={colors.primary}
              disabled={filtered.length === 0}
            />
            {value.length > 0 && (
              <TextAction
                label="Temizle"
                onPress={() => onChange([])}
                color={colors.mutedText}
              />
            )}
          </View>
        )}
      </View>

      {selectedOptions.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {selectedOptions.map((o) => (
            <Pressable
              key={o.value}
              onPress={() => toggle(o.value)}
              accessibilityLabel={`${o.label} seçimini kaldır`}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingLeft: 12,
                paddingRight: 8,
                paddingVertical: 7,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.primary,
                backgroundColor: `${colors.primary}1A`,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>
                {o.label}
              </Text>
              <Ionicons name="close" size={14} color={colors.primary} />
            </Pressable>
          ))}
        </View>
      )}

      {/* Arama kutusu HER listede durur (kullanıcı kararı); yalnızca hiç
          seçenek yokken gizlenir. */}
      {options.length > 0 && (
        <Field
          value={query}
          onChangeText={setQuery}
          placeholder={searchPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={{ height: 44 }}
        />
      )}

      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          backgroundColor: colors.card,
          overflow: "hidden",
        }}
      >
        {options.length === 0 ? (
          <Text
            style={{
              color: colors.faintText,
              fontSize: 12,
              textAlign: "center",
              paddingVertical: spacing.md,
            }}
          >
            Seçenek yok
          </Text>
        ) : visible.length === 0 ? (
          <Text
            style={{
              color: colors.faintText,
              fontSize: 12,
              textAlign: "center",
              paddingVertical: spacing.md,
            }}
          >
            “{query}” için sonuç yok
          </Text>
        ) : (
          visible.map((o, index) => {
            const selected = selectedSet.has(o.value);
            return (
              <Pressable
                key={o.value}
                onPress={() => toggle(o.value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                  backgroundColor: selected ? `${colors.primary}12` : colors.card,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    borderWidth: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primary : "transparent",
                  }}
                >
                  {selected && <Ionicons name="checkmark" size={13} color={colors.primaryText} />}
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    color: selected ? colors.text : colors.mutedText,
                    fontSize: 14,
                    fontWeight: selected ? "600" : "400",
                  }}
                >
                  {o.label}
                </Text>
              </Pressable>
            );
          })
        )}
      </View>

      {hiddenCount > 0 && (
        <Text style={{ color: colors.faintText, fontSize: 12 }}>
          {hiddenCount} sonuç daha var — aramayla daraltın.
        </Text>
      )}

      {orphanCount > 0 && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Text style={{ color: colors.mutedText, fontSize: 12, flex: 1 }}>
            {orphanCount} seçim listede olmayan (pasifleştirilmiş/silinmiş) bir kayda ait;
            kaydedildiğinde korunur.
          </Text>
          <TextAction
            label="Kaldır"
            onPress={() => onChange(value.filter((v) => byValue.has(v)))}
            color={colors.destructive}
          />
        </View>
      )}

      {emptyHint && value.length === 0 && (
        <Text style={{ color: colors.faintText, fontSize: 12 }}>{emptyHint}</Text>
      )}
    </View>
  );
}

// ------------------------------------------------------------- izin seçici

export interface PermissionItem {
  code: string;
  label: string;
}

export interface PermissionGroup {
  title: string;
  items: PermissionItem[];
}

/**
 * Rol izin seçici — web PermissionPicker karşılığı.
 * Toplu seçim YALNIZCA ekranda görünen (katalogla filtrelenmiş) kodları ekler.
 */
export function PermissionPicker({
  groups,
  value,
  onChange,
  disabled = false,
}: {
  groups: PermissionGroup[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(value), [value]);
  const totalItems = useMemo(
    () => groups.reduce((sum, g) => sum + g.items.length, 0),
    [groups],
  );

  const visibleGroups = useMemo(() => {
    const q = normalizeSearch(query.trim());
    return groups
      .map((group) => ({
        ...group,
        items: q
          ? group.items.filter(
              (item) =>
                normalizeSearch(item.label).includes(q) ||
                normalizeSearch(item.code).includes(q),
            )
          : group.items,
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  /** Rolde olup bu ekranda listelenmeyen izinler — bilgi amaçlı; asla silinmez. */
  const unmanagedCount = useMemo(() => {
    const known = new Set(groups.flatMap((g) => g.items.map((i) => i.code)));
    return value.filter((code) => !known.has(code)).length;
  }, [groups, value]);

  function toggle(code: string) {
    if (disabled) return;
    onChange(selectedSet.has(code) ? value.filter((c) => c !== code) : [...value, code]);
  }

  function toggleGroup(items: PermissionItem[]) {
    if (disabled) return;
    if (items.every((i) => selectedSet.has(i.code))) {
      const codes = new Set(items.map((i) => i.code));
      onChange(value.filter((c) => !codes.has(c)));
      return;
    }
    onChange([...value, ...items.map((i) => i.code).filter((c) => !selectedSet.has(c))]);
  }

  return (
    <View style={{ gap: spacing.sm, opacity: disabled ? 0.6 : 1 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing.sm,
        }}
      >
        <Text style={{ color: colors.mutedText, fontSize: 12 }}>
          {value.length} / {totalItems} izin seçili
        </Text>
        {!disabled && value.length > 0 && (
          <TextAction
            label="Tümünü kaldır"
            onPress={() => onChange([])}
            color={colors.mutedText}
          />
        )}
      </View>

      {/* Arama kutusu her listede durur (kullanıcı kararı). */}
      {totalItems > 0 && (
        <Field
          value={query}
          onChangeText={setQuery}
          placeholder="İzin ara…"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={{ height: 44 }}
        />
      )}

      {unmanagedCount > 0 && (
        <Text style={{ color: colors.mutedText, fontSize: 12 }}>
          {unmanagedCount} izin bu ekranda listelenmiyor; kaydettiğinizde olduğu gibi korunur.
        </Text>
      )}

      {visibleGroups.length === 0 ? (
        <Text style={{ color: colors.faintText, fontSize: 12 }}>
          {totalItems === 0 ? "İzin tanımı yok" : `“${query}” için sonuç yok`}
        </Text>
      ) : (
        visibleGroups.map((group) => {
          const selectedInGroup = group.items.filter((i) => selectedSet.has(i.code)).length;
          const allSelected = selectedInGroup === group.items.length;
          return (
            <View
              key={group.title}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.md,
                backgroundColor: colors.card,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing.sm,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Text
                  style={{
                    color: colors.mutedText,
                    fontSize: 11,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                  }}
                >
                  {group.title} ({selectedInGroup}/{group.items.length})
                </Text>
                <TextAction
                  label={allSelected ? "Kaldır" : "Tümünü seç"}
                  onPress={() => toggleGroup(group.items)}
                  color={colors.primary}
                  disabled={disabled}
                />
              </View>
              {group.items.map((item, index) => {
                const selected = selectedSet.has(item.code);
                return (
                  <Pressable
                    key={item.code}
                    onPress={() => toggle(item.code)}
                    disabled={disabled}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected, disabled }}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 11,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: colors.border,
                      opacity: pressed && !disabled ? 0.8 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        borderWidth: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary : "transparent",
                      }}
                    >
                      {selected && (
                        <Ionicons name="checkmark" size={13} color={colors.primaryText} />
                      )}
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{
                        flex: 1,
                        color: selected ? colors.text : colors.mutedText,
                        fontSize: 14,
                        fontWeight: selected ? "600" : "400",
                      }}
                    >
                      {item.label}
                    </Text>
                    <Text style={{ color: colors.faintText, fontSize: 10 }}>{item.code}</Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })
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
  if (!hours) return "Varsayılan";
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
