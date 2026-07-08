import { expect, test } from "@playwright/test";
import { ACCOUNTS, API_URL, apiLogin, loginViaUi, nextWeekdayISO } from "./helpers";

/**
 * Kritik akis 3: API ile pending randevu olusturulur (manuel onayli tedarikci),
 * admin listeden onaylar; temizlik API iptaliyle yapilir.
 */
test("admin bekleyen randevuyu listeden onaylar", async ({ page, request }) => {
  const productName = `E2E Onay ${Date.now()}`;
  const day = nextWeekdayISO(3); // seed'in yogun oldugu yarindan uzak dur

  // Fixture: manuel onay akisindaki tedarikciyle pending randevu
  const supplierToken = await apiLogin(request, "/auth/supplier-login", ACCOUNTS.supplierManual);
  const createResponse = await request.post(`${API_URL}/supplier/appointments`, {
    headers: { Authorization: `Bearer ${supplierToken}` },
    data: {
      product_category_id: await firstAllowedCategoryId(),
      product_name: productName,
      quantity: 2,
      quantity_unit: "box",
      target_date: day,
      start_at: `${day}T13:00:00+03:00`,
      duration_minutes: 90,
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
  const created = (await createResponse.json()).data;
  expect(created.status).toBe("pending");

  async function firstAllowedCategoryId(): Promise<string> {
    const catalog = await request.get(`${API_URL}/supplier/catalog`, {
      headers: { Authorization: `Bearer ${supplierToken}` },
    });
    return (await catalog.json()).data.product_categories[0].id;
  }

  try {
    await loginViaUi(page, "Yönetim Paneli", ACCOUNTS.admin);
    await page.getByRole("link", { name: "Randevular" }).click();
    await expect(page.getByRole("heading", { name: "Randevular" })).toBeVisible();

    // Bekleyen filtresine gec ve olusturulan kaydi bul
    // "Revize Bekliyor" ile karismamasi icin bas eslesmesi
    await page.locator("button", { hasText: /^Bekliyor/ }).first().click();
    const row = page.getByRole("row", { name: new RegExp(productName) });
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.getByRole("button", { name: "Onayla" }).click();
    await page.locator("div.fixed.inset-0").getByRole("button", { name: "Onayla" }).click();

    await expect(
      page.getByText("Randevu onaylandı; tedarikçiye bildirim gönderildi."),
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    // Temizlik: randevuyu tedarikci uzerinden iptal et
    await request.post(`${API_URL}/supplier/appointments/${created.id}/cancel`, {
      headers: { Authorization: `Bearer ${supplierToken}` },
    });
  }
});
