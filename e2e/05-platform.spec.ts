import { expect, test } from "@playwright/test";
import { ACCOUNTS, loginViaUi } from "./helpers";

/** Kritik akis 5: Platform kullanim + plan yonetimi goruntulenir (agregat, PII yok). */
test("platform kullanım ve planlar sayfaları yüklenir", async ({ page }) => {
  await loginViaUi(page, "Platform Yönetimi", ACCOUNTS.platform);
  await expect(page).toHaveURL(/\/platform\/tenants/);

  // Tenant dizini: seed tenant'i listede
  await expect(page.getByText("BTA / Cakes & Bakes")).toBeVisible();

  // Kullanim: agregat metrikler render edilir
  await page.getByRole("link", { name: /Kullanım/ }).click();
  await expect(page.getByRole("heading", { name: "Kullanım & Sağlık" })).toBeVisible();
  await expect(page.getByText("Oluşturulan Randevu").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Aktif Tedarikçi").first()).toBeVisible();

  // Planlar: seed planlari listelenir
  await page.getByRole("link", { name: "Planlar" }).click();
  await expect(page.getByRole("heading", { name: "Planlar" })).toBeVisible();
  await expect(page.getByText("Professional").first()).toBeVisible();
  await expect(page.getByText("Starter").first()).toBeVisible();
});
