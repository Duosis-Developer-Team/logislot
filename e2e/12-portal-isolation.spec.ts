import { expect, test } from "@playwright/test";
import { ACCOUNTS } from "./helpers";

/**
 * Portal izolasyonu (bkz. docs/PORTAL_ISOLATION_AND_ROUTING.md):
 * - Public entry YALNIZCA Tedarikçi + Yönetim gösterir; Platform görünmez.
 * - Portal login'lerinde switcher yoktur.
 * - Yanlış rol, doğru parolayla bile net hata alır ve oturum açılmaz.
 */

test("public entry yalnızca tedarikçi + yönetim gösterir; platform görünmez", async ({
  page,
}) => {
  await page.goto("/");
  // Landing page'de portal adları birden çok yerde geçer (topbar/hero/footer)
  await expect(page.getByText("Tedarikçi Portalı").first()).toBeVisible();
  await expect(page.getByText("Yönetim Paneli").first()).toBeVisible();
  // Platform portalı hiçbir şekilde geçmez (kart/link/metin).
  // Not: "…operasyon platformu" footer sloganı serbesttir; yasak olan
  // internal portalın adları/varyantlarıdır.
  for (const forbidden of [
    "Platform Yönetimi",
    "Supervendor",
    "Platform Admin",
    "Internal Admin",
    "Tenant Directory",
  ]) {
    await expect(page.getByText(forbidden)).toHaveCount(0);
  }
  // Platform login rotası da entry'den servis edilmez ("all" modda /login/platform
  // var ama entry'de LİNKLENMEZ — link yokluğunu doğrula):
  await expect(page.getByRole("link", { name: /platform/i })).toHaveCount(0);
  // Entry'de email/parola yoktur
  await expect(page.getByLabel("E-posta")).toHaveCount(0);
});

test("portal login'lerinde portal switcher yok", async ({ page }) => {
  for (const path of ["/login/supplier", "/login/admin", "/login/platform"]) {
    await page.goto(path);
    // Eski switcher radio kartları kaldırıldı
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByLabel("E-posta")).toBeVisible();
  }
  // Supplier login'de diğer portalların kimliği görünmez
  await page.goto("/login/supplier");
  await expect(page.getByText("Yönetim Paneli")).toHaveCount(0);
  await expect(page.getByText("Platform Yönetimi")).toHaveCount(0);
});

test("yanlış rol doğru parolayla bile reddedilir (net hata + oturum yok)", async ({
  page,
}) => {
  // Admin hesabı tedarikçi login'inden deniyor
  await page.goto("/login/supplier");
  await page.getByLabel("E-posta").fill(ACCOUNTS.admin);
  await page.getByLabel("Parola", { exact: true }).fill("Demo123!");
  await page.getByRole("button", { name: /Giriş$/ }).click();
  // Backend hata mesajlari ASCII convention'indadir ("Tedarikci Portali...")
  await expect(
    page.getByText(/Tedarik(c|ç)i Portal(i|ı) i(c|ç)in yetkili de(g|ğ)il/),
  ).toBeVisible({ timeout: 10_000 });
  // Login sayfasında kalır (dashboard'a gitmez)
  await expect(page).toHaveURL(/\/login\/supplier/);
});
