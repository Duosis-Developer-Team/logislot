/** Takvim İstisnaları CRUD — web (admin)/admin/settings/overrides karşılığı. */

import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { dockOverrides, docks } from "@/api/resources";
import type { OverrideDto } from "@/api/types";
import { useSession } from "@/auth/session";
import { ActiveBadge, ConfigList } from "@/components/config";
import { OverrideModal } from "@/components/override-modal";
import { Badge, Button, Card } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

export default function OverridesScreen() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;
  const list = dockOverrides.useList(facilityId);
  const dockList = docks.useList(facilityId);
  const deactivate = dockOverrides.useDeactivate(facilityId);

  const [editing, setEditing] = useState<OverrideDto | null>(null);
  const [open, setOpen] = useState(false);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(row: OverrideDto) {
    setEditing(row);
    setOpen(true);
  }

  function onDeactivate(row: OverrideDto) {
    Alert.alert(
      "İstisnayı pasifleştir",
      "Bu istisna pasifleştirilecek ve rampa o gün normal çalışma düzenine döner.",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Pasifleştir",
          style: "destructive",
          onPress: () =>
            deactivate.mutate(row.id, {
              onError: (err) =>
                Alert.alert(
                  "İşlem başarısız",
                  err instanceof ApiError ? err.message : "İşlem başarısız",
                ),
            }),
        },
      ],
    );
  }

  const dockName = (id: string) => dockList.data?.find((d) => d.id === id)?.name ?? "?";

  return (
    <>
      <ConfigList
        query={list}
        createLabel="Yeni İstisna"
        onCreate={openCreate}
        description="Kapalı gün müsaitlikte sert engel üretir; ek mesai o günün çalışma penceresinin yerine geçer ve normal saat dışına slot açabilir."
        searchText={(r) => `${dockName(r.dock_id)} ${r.date} ${r.reason ?? ""}`}
        keyExtractor={(r) => r.id}
        emptyTitle="Takvim istisnası yok"
        emptyDescription="Bakım için kapalı gün ya da bayram öncesi ek mesai tanımlayın; müsaitlik anında güncellenir."
        renderItem={(row) => (
          <Card style={{ gap: spacing.sm }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: spacing.sm,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                  {new Date(row.date).toLocaleDateString("tr-TR", {
                    day: "2-digit",
                    month: "long",
                    weekday: "long",
                  })}
                </Text>
                <Text style={{ color: colors.mutedText, fontSize: 12 }}>
                  {dockName(row.dock_id)}
                  {row.reason ? ` · ${row.reason}` : ""}
                </Text>
              </View>
              <ActiveBadge active={row.is_active} />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              <Badge
                label={row.type === "closed" ? "Kapalı" : "Ek Mesai"}
                color={row.type === "closed" ? colors.status.rejected : colors.status.approved}
              />
              <Badge
                label={
                  row.start_time && row.end_time
                    ? `${row.start_time.slice(0, 5)}–${row.end_time.slice(0, 5)}`
                    : "Tüm gün"
                }
                color={colors.mutedText}
              />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button
                title="Düzenle"
                variant="secondary"
                onPress={() => openEdit(row)}
                style={{ flex: 1, height: 40 }}
              />
              {row.is_active && (
                <Button
                  title="Pasifleştir"
                  variant="ghost"
                  onPress={() => onDeactivate(row)}
                  style={{ flex: 1, height: 40 }}
                />
              )}
            </View>
          </Card>
        )}
      />

      <OverrideModal
        visible={open}
        editing={editing}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
