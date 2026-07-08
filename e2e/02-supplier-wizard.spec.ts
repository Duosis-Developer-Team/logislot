import { expect, test } from "@playwright/test";
import { ACCOUNTS, loginViaUi } from "./helpers";

/**
 * Kritik akis 2: Tedarikci sihirbazdan randevu olusturur (urun -> arac -> zaman),
 * ardindan UI'dan iptal ederek seed evrenini temiz birakir.
 */
test("tedarikçi sihirbazdan randevu oluşturur ve iptal eder", async ({ page }) => {
  const productName = `E2E Ürün ${Date.now()}`;

  await loginViaUi(page, "Tedarikçi Portalı", ACCOUNTS.supplierAuto);
  await expect(page).toHaveURL(/\/supplier\/appointments/);

  await page.getByRole("link", { name: "Yeni Randevu" }).click();

  // Adim 1 — urun (Label'lar htmlFor tasimadigi icin placeholder/rol secicileri)
  await page.getByPlaceholder("Örn. Buğday Unu Tip 650").fill(productName);
  await page.getByRole("combobox").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: "Devam" }).click();

  // Adim 2 — arac & teslimat (varsayilan arac otomatik gelir)
  await page.getByPlaceholder("34 ABC 123").fill("34 E2E 001");
  await page.getByRole("button", { name: "Devam" }).click();

  // Adim 3 — zaman: gercek musaitlikten uygun slot sec.
  // Kargo tavsiyesi tasiyan slotlar (title=uyari metni) yerine temiz "Müsait"
  // slotu tercih edilir; yine de tavsiye diyalogu cikarsa onaylanir (engellemez).
  const slotGrid = page.locator("div.grid.grid-cols-3").first();
  await expect(slotGrid).toBeVisible({ timeout: 15_000 });
  const cleanSlot = slotGrid.locator('button[title="Müsait"]').first();
  if (await cleanSlot.count()) {
    await cleanSlot.click();
  } else {
    await slotGrid.locator("button:not([disabled])").first().click();
  }
  await page.getByRole("button", { name: "Randevu Talep Et" }).click();

  // Engellemeyen kargo tavsiye diyalogu cikarsa "Evet" ile devam
  const advisoryConfirm = page.getByRole("button", { name: "Evet, Talep Oluştur" });
  if (await advisoryConfirm.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await advisoryConfirm.click();
  }

  // Otomatik onayli tedarikci: aninda onay ekrani
  await expect(page.getByText("Randevunuz onaylandı")).toBeVisible({ timeout: 15_000 });

  // Temizlik: listeden ayni randevuyu UI ile iptal et
  // (basari ekrani + alt navigasyonda ayni link var -> ilkini kullan)
  await page.getByRole("link", { name: "Randevularım" }).first().click();
  await expect(page.getByText(productName).first()).toBeVisible();
  // Urun adini iceren kartin icindeki iptal butonu
  const card = page.locator("div.p-4", { hasText: productName }).last();
  await card.getByRole("button", { name: "İptal Et" }).click();
  // Onay diyalogu (overlay icindeki kirmizi buton)
  await page.locator("div.fixed.inset-0").getByRole("button", { name: "İptal Et" }).click();
  await expect(page.getByText("Randevu iptal edildi.")).toBeVisible({ timeout: 10_000 });
});
