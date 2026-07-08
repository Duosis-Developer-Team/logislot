import { expect, test, type Browser } from "@playwright/test";
import { ACCOUNTS, loginViaUi } from "./helpers";

const E2E_PRIMARY = "#10b981";
// hexToHslTriplet("#10b981") ile ayni sonuc — supplier portalda dogrulanir.
const E2E_PRIMARY_HSL = "160 84% 39%";

async function supplierPrimaryVar(browser: Browser): Promise<string> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginViaUi(page, "Tedarikçi Portalı", ACCOUNTS.supplierAuto);
  await expect(page).toHaveURL(/\/supplier\/appointments/);
  // ApplyBranding effect'inin kosmasi icin kisa bekleme yerine network idle
  await page.waitForLoadState("networkidle");
  const value = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue("--primary"),
  );
  await context.close();
  return value.trim();
}

/**
 * Kritik akis 4: Admin markayi degistirir -> tedarikci portali yeni rengi
 * yansitir -> varsayilana sifirlanir (statu renkleri markadan bagimsizdir).
 */
test("branding değişikliği tedarikçi portalına yansır ve sıfırlanır", async ({
  page,
  browser,
}) => {
  await loginViaUi(page, "Yönetim Paneli", ACCOUNTS.admin);
  await expect(page).toHaveURL(/\/admin\/dashboard/); // token yazilmadan goto yapma
  await page.goto("/admin/settings/branding");
  await expect(page.getByRole("heading", { name: "Marka / White-Label" })).toBeVisible();

  // Marka adi + ana renk degistir, kaydet
  await page.getByPlaceholder("Cakes & Bakes", { exact: true }).fill("E2E Marka");
  await page.getByPlaceholder("#2563EB").first().fill(E2E_PRIMARY);
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(
    page.getByText("Marka ayarları kaydedildi; tema anında uygulandı."),
  ).toBeVisible({ timeout: 10_000 });

  try {
    // Tedarikci portali yeni markayi gorur
    const applied = await supplierPrimaryVar(browser);
    expect(applied).toBe(E2E_PRIMARY_HSL);
  } finally {
    // Sifirla: varsayilana don
    await page.getByRole("button", { name: "Varsayılana Sıfırla" }).click();
    await page.locator("div.fixed.inset-0").getByRole("button", { name: "Sıfırla" }).click();
    await expect(page.getByText("Marka LogiSlot varsayılanına sıfırlandı.")).toBeVisible({
      timeout: 10_000,
    });
  }

  // Sifirlama sonrasi tedarikci portalinda inline override kalmaz
  const afterReset = await supplierPrimaryVar(browser);
  expect(afterReset).toBe("");
});
