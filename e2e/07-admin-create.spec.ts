import { expect, test } from "@playwright/test";
import { ACCOUNTS, API_URL, apiLogin, loginViaUi } from "./helpers";

/**
 * Kritik akis 7 (Sprint 10): admin, tedarikci ADINA drawer'dan randevu acar
 * (onayli dogar). Temizlik API iptaliyle yapilir.
 */
test("admin tedarikçi adına randevu oluşturur", async ({ page, request }) => {
  const productName = `E2E Admin Create ${Date.now()}`;

  await loginViaUi(page, "Yönetim Paneli", ACCOUNTS.admin);
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await page.getByRole("link", { name: "Randevular" }).click();
  await page.getByRole("button", { name: "Yeni Randevu" }).click();

  // Header'daki tesis switcher'iyla karismamak icin drawer'a scope'la
  const drawer = page.locator("div.fixed.inset-0", {
    hasText: "Yeni Randevu (Tedarikçi Adına)",
  });
  await expect(drawer).toBeVisible();

  // Tedarikci sec -> yalnizca onun kategorileri gelir
  await drawer.getByRole("combobox").first().selectOption({ label: "Anadolu Un A.S." });
  await drawer.getByRole("combobox").nth(1).selectOption({ index: 1 });
  await drawer.getByPlaceholder("Örn. Acil teslimat").fill(productName);

  // Ilk uygun slotu sec (gercek availability)
  const slotGrid = drawer.locator("div.grid.grid-cols-4").first();
  await expect(slotGrid).toBeVisible({ timeout: 15_000 });
  await slotGrid.locator("button:not([disabled])").first().click();

  await drawer.getByRole("button", { name: "Randevu Oluştur" }).click();

  // Basari: drawer kapanir, liste yenilenir ve randevu ONAYLI gorunur
  await expect(drawer).toBeHidden({ timeout: 15_000 });
  const row = page.getByRole("row", { name: new RegExp(productName) });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("Onaylandı");

  // Temizlik: API ile iptal et
  const adminToken = await apiLogin(request, "/auth/login", ACCOUNTS.admin);
  const me = await request.get(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const fid = (await me.json()).data.default_facility_id;
  const listing = await request.get(
    `${API_URL}/facilities/${fid}/appointments?limit=500`,
    { headers: { Authorization: `Bearer ${adminToken}` } },
  );
  const created = (await listing.json()).data.find(
    (a: { product_name: string }) => a.product_name === productName,
  );
  expect(created).toBeTruthy();
  const cancel = await request.post(
    `${API_URL}/facilities/${fid}/appointments/${created.id}/cancel`,
    {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { reason: "E2E temizligi" },
    },
  );
  expect(cancel.ok()).toBeTruthy();
});
