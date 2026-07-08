import { expect, test } from "@playwright/test";
import { ACCOUNTS, API_URL, apiLogin, nextWeekdayISO } from "./helpers";

// Responsive smoke: 390px (dar mobil) goruntude tedarikci seri bolumu
test.use({ viewport: { width: 390, height: 844 } });

/**
 * Sprint 12: tedarikci "Tekrarlayan Randevular" bolumu (mobil viewport'ta).
 * Fixture API ile kurulur; temizlik supplier series cancel ile yapilir.
 */
test("tedarikçi seri bölümü mobil görünümde çalışır", async ({ page, request }) => {
  const token = await apiLogin(request, "/auth/supplier-login", ACCOUNTS.supplierAuto);
  const day = nextWeekdayISO(3);
  const created = await request.post(`${API_URL}/supplier/appointments`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      product_category_id: await firstCategoryId(),
      product_name: `E2E Seri UX ${Date.now()}`,
      quantity: 1,
      target_date: day,
      start_at: `${day}T15:00:00+03:00`,
      duration_minutes: 45,
      recurring: { frequency: "weekly", occurrence_count: 2 },
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const seriesId = (await created.json()).data.series_id;

  async function firstCategoryId(): Promise<string> {
    const catalog = await request.get(`${API_URL}/supplier/catalog`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return (await catalog.json()).data.product_categories[0].id;
  }

  try {
    await page.goto("/login");
    await page.getByRole("button", { name: "Tedarikçi Portalı" }).first().click();
    await page.getByLabel("E-posta").fill(ACCOUNTS.supplierAuto);
    await page.getByLabel("Parola").fill("Demo123!");
    await page.getByRole("button", { name: /Giriş$/ }).click();
    await expect(page).toHaveURL(/\/supplier\/appointments/);

    // Seri bolumu ve kart gorunur (390px'te yatay tasma olmadan)
    await expect(page.getByText("Tekrarlayan Randevular")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Haftalık × 2/).first()).toBeVisible();

    // Detay dialogu acilir
    await page.getByRole("button", { name: "Detay" }).first().click();
    await expect(page.getByText("Seri Detayı")).toBeVisible();
    await page.getByRole("button", { name: "Kapat" }).click();
  } finally {
    // Temizlik: seriyi tedarikci endpoint'iyle iptal et
    await request.post(`${API_URL}/supplier/appointment-series/${seriesId}/cancel`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { reason: "E2E temizligi" },
    });
  }
});
