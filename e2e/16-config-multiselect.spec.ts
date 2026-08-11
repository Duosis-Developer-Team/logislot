import { expect, test } from "@playwright/test";
import { ACCOUNTS, API_URL, apiLogin, loginViaUi } from "./helpers";

/**
 * Kritik akis 16: konfigurasyon formlarindaki coklu secim alanlari.
 *
 * Kapsam:
 * - Rol izin secici: arama filtreler, ENTER formu GONDERMEZ, grup toplu secimi
 *   yalnizca kendi grubunu etkiler. (Hicbir yazma yapmaz; drawer iptal edilir.)
 * - Rampa duzenleme: liste gorunumunden secim kaydedilir ve testin sonunda
 *   orijinal duruma geri alinir.
 */

test("rol izin seçici: arama + Enter güvenliği + grup toplu seçimi", async ({ page }) => {
  await loginViaUi(page, "Yönetim Paneli", ACCOUNTS.admin);
  await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 30_000 });

  await page.goto("/admin/settings/users");
  await page.getByRole("button", { name: /^Roller/ }).click();
  await page.getByRole("button", { name: "Yeni Rol" }).click();

  const drawer = page.getByRole("dialog", { name: "Yeni Rol" });
  await expect(drawer).toBeVisible();

  // Arama: aksan/Turkce duyarsiz eslesme ("rampalari" -> "Rampaları yönet")
  const search = drawer.getByPlaceholder("İzin ara…");
  await search.fill("rampalari");
  await expect(drawer.getByText("Rampaları yönet")).toBeVisible();
  await expect(drawer.getByText("Randevu onayla")).toBeHidden();

  // ENTER formu GONDERMEMELI: drawer acik kalir.
  await search.press("Enter");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Rampaları yönet")).toBeVisible();

  await search.fill("");

  // Grup toplu secimi yalnizca kendi grubunu etkiler.
  const takvimGroup = drawer.locator("div").filter({ hasText: /^TAKVIM \(0\/2\)/i }).last();
  await takvimGroup.getByRole("button", { name: "Tümünü seç" }).click();
  await expect(drawer.getByText("2 / 18 izin seçili")).toBeVisible();

  await drawer.getByRole("button", { name: "İptal" }).click();
  await expect(drawer).toBeHidden();
});

test("rampa düzenleme: liste görünümünden seçim kaydedilir ve geri alınır", async ({
  page,
  request,
}) => {
  const token = await apiLogin(request, "/auth/login", ACCOUNTS.admin);
  const me = await request.get(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const facilityId = (await me.json()).data.default_facility_id;
  const headers = { Authorization: `Bearer ${token}` };

  const docksRes = await request.get(`${API_URL}/facilities/${facilityId}/docks`, { headers });
  const dock = (await docksRes.json()).data.find((d: { is_active: boolean }) => d.is_active);
  expect(dock).toBeTruthy();
  const originalCategoryIds: string[] = dock.accepted_product_category_ids;

  const catsRes = await request.get(`${API_URL}/facilities/${facilityId}/categories`, {
    headers,
  });
  const categories = (await catsRes.json()).data.filter((c: { is_active: boolean }) => c.is_active);
  // Rampada HENUZ secili olmayan bir kategori: testin toggle hedefi.
  const target = categories.find(
    (c: { id: string }) => !originalCategoryIds.includes(c.id),
  );
  test.skip(!target, "Seed'de rampaya eklenebilecek serbest kategori yok.");

  await loginViaUi(page, "Yönetim Paneli", ACCOUNTS.admin);
  await page.goto("/admin/settings/docks");

  const row = page.getByRole("row", { name: new RegExp(dock.name) }).first();
  await row.getByRole("button", { name: "Düzenle" }).click();

  const drawer = page.getByRole("dialog", { name: "Rampayı Düzenle" });
  await expect(drawer).toBeVisible();

  const productField = drawer
    .locator("div")
    .filter({ hasText: /^Kabul Edilen Ürün Kategorileri/ })
    .last();
  await expect(
    productField.getByText(`${originalCategoryIds.length} / ${categories.length} seçili`),
  ).toBeVisible();

  await productField.getByRole("checkbox", { name: target.display_name }).click();
  await expect(
    productField.getByText(`${originalCategoryIds.length + 1} / ${categories.length} seçili`),
  ).toBeVisible();

  await drawer.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Rampa güncellendi.")).toBeVisible({ timeout: 15_000 });

  // Kalicilik: API secimi gercekten aldi mi?
  const afterRes = await request.get(`${API_URL}/facilities/${facilityId}/docks`, { headers });
  const after = (await afterRes.json()).data.find((d: { id: string }) => d.id === dock.id);
  expect(after.accepted_product_category_ids).toContain(target.id);
  expect(after.accepted_product_category_ids).toHaveLength(originalCategoryIds.length + 1);

  // Temizlik: orijinal secim listesine geri don (API ile, deterministik).
  const restore = await request.patch(`${API_URL}/facilities/${facilityId}/docks/${dock.id}`, {
    headers,
    data: { accepted_product_category_ids: originalCategoryIds },
  });
  expect(restore.ok()).toBeTruthy();
});
