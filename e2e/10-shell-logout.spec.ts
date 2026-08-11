import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, loginViaUi } from "./helpers";

/**
 * Kritik akis 10: Birlesik webapp kabugu + ortak cikis akisi.
 *
 * Uc portal da ayni AppShell'i kullanir: sag-ustte UserMenu, icinde GORUNUR
 * "Cikis Yap". Cikis; backend /auth/logout cagirir, token'lari + query cache'i
 * temizler ve /login'e doner. Cikis sonrasi korumali rotaya erisim engellenir.
 */

/** UserMenu'yu acip "Cikis Yap"a tiklar ve login yuzeyine donusu bekler.
 *  Portal izolasyonu: "all" modda /login -> / (public selector) redirect'i
 *  oldugundan cikis "/" ya da "/login*"e donebilir — ikisi de gecerlidir. */
async function logoutViaUserMenu(page: Page) {
  await page.getByRole("button", { name: "Kullanıcı menüsü" }).click();
  await page.getByRole("menuitem", { name: "Çıkış Yap" }).click();
  await expect(page).toHaveURL(/\/(login(\/.*)?)?$/, { timeout: 15_000 });
}

test("admin: kullanıcı menüsünden çıkış token'ları temizler ve korumalı rotayı kilitler", async ({
  page,
}) => {
  await loginViaUi(page, "Yönetim Paneli", ACCOUNTS.admin);
  await expect(page).toHaveURL(/\/admin\/dashboard/);

  // Ortak kabuk: rol rozeti + UserMenu gorunur
  await expect(page.getByRole("button", { name: "Kullanıcı menüsü" })).toBeVisible();

  await logoutViaUserMenu(page);

  // Istemci oturumu temizlendi
  const token = await page.evaluate(() =>
    window.localStorage.getItem("logislot.access_token"),
  );
  expect(token).toBeNull();

  // Cikistan sonra korumali rotaya gidilince panel icerigi GORUNMEZ
  await page.goto("/admin/dashboard");
  await expect(
    page.getByRole("button", { name: "Giriş Ekranına Dön" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Genel Bakış" })).toHaveCount(0);
});

test("platform: çıkış artık görünür ve çalışır", async ({ page }) => {
  await loginViaUi(page, "Platform Yönetimi", ACCOUNTS.platform);
  await expect(page).toHaveURL(/\/platform\/tenants/);

  await expect(page.getByRole("button", { name: "Kullanıcı menüsü" })).toBeVisible();
  await logoutViaUserMenu(page);

  await page.goto("/platform/tenants");
  await expect(
    page.getByRole("button", { name: "Giriş Ekranına Dön" }),
  ).toBeVisible();
});

test("tedarikçi: çıkış artık kabukta görünür ve çalışır", async ({ page }) => {
  await loginViaUi(page, "Tedarikçi Portalı", ACCOUNTS.supplierAuto);
  await expect(page).toHaveURL(/\/supplier\/appointments/);

  await expect(page.getByRole("button", { name: "Kullanıcı menüsü" })).toBeVisible();
  await logoutViaUserMenu(page);

  await page.goto("/supplier/appointments");
  await expect(
    page.getByRole("button", { name: "Giriş Ekranına Dön" }),
  ).toBeVisible();
});

test("tedarikçi portalı mobilde webapp gibi: sidebar gizlenir, hamburger drawer'ı açar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginViaUi(page, "Tedarikçi Portalı", ACCOUNTS.supplierAuto);
  await expect(page).toHaveURL(/\/supplier\/appointments/);

  // Mobilde masaustu sidebar linki gizli, hamburger gorunur
  await expect(page.getByRole("link", { name: "Randevularım" }).first()).toBeHidden();
  const hamburger = page.getByRole("button", { name: "Menü", exact: true });
  await expect(hamburger).toBeVisible();

  // Drawer nav + gorunur cikis
  await hamburger.click();
  await expect(page.getByRole("link", { name: "Yeni Randevu" }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Çıkış Yap" })).toBeVisible();
});

test("tedarikçi portalı masaüstünde sidebar navigasyonu gösterir", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await loginViaUi(page, "Tedarikçi Portalı", ACCOUNTS.supplierAuto);
  await expect(page).toHaveURL(/\/supplier\/appointments/);

  // Masaustu: sidebar nav gorunur, hamburger gizli
  await expect(page.getByRole("link", { name: "Randevularım" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Yeni Randevu" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Menü", exact: true })).toBeHidden();
});
