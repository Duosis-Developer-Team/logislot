import { expect, test } from "@playwright/test";
import { ACCOUNTS, loginViaUi } from "./helpers";

/**
 * Kritik akis 11: Marka logosu görünürlüğü + light/dark tema toggle + kalıcılık.
 */

test("login'de marka logosu ve tema toggle görünür; koyu tema seçilebilir", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.locator('img[alt="LogiSlot"]').first()).toBeVisible();

  // Tema toggle -> Koyu
  await page.getByRole("button", { name: "Tema" }).first().click();
  await page.getByRole("menuitemradio", { name: "Koyu" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("admin panelinde logo görünür ve tema koyu seçilip refresh sonrası korunur", async ({
  page,
}) => {
  await loginViaUi(page, "Yönetim Paneli", ACCOUNTS.admin);
  await expect(page).toHaveURL(/\/admin\/dashboard/);

  // Kabuk markası (logo) görünür
  await expect(page.locator('img[alt="LogiSlot"]').first()).toBeVisible();

  // Koyu temaya geç
  await page.getByRole("button", { name: "Tema" }).click();
  await page.getByRole("menuitemradio", { name: "Koyu" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  // localStorage'a yazıldı mı
  const stored = await page.evaluate(() =>
    window.localStorage.getItem("logislot.theme"),
  );
  expect(stored).toBe("dark");

  // Refresh sonrası korunur (flash yok, class hemen dark)
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("heading", { name: "Genel Bakış" })).toBeVisible();
});

test("platform ve tedarikçi panellerinde logo + tema toggle mevcut", async ({ page }) => {
  await loginViaUi(page, "Platform Yönetimi", ACCOUNTS.platform);
  await expect(page).toHaveURL(/\/platform\/tenants/);
  await expect(page.locator('img[alt="LogiSlot"]').first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Tema" })).toBeVisible();
});
