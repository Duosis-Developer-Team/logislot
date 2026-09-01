import { expect, test } from "@playwright/test";
import { ACCOUNTS, DEMO_PASSWORD } from "./helpers";

/**
 * TR/EN dil anahtari.
 *
 * Iki AYRI render yolunu birden dogrular; ikisi de gecmeden ozellik calisiyor
 * sayilmaz:
 *  - Landing/hukuki sayfalar SUNUCUDA, dili `logislot.lang` cookie'sinden
 *    okuyarak render edilir (metadata dahil).
 *  - Portal ekranlari ISTEMCIDE sozlukten render edilir.
 *
 * NOT: Tek giris kullanilir — login rate limit'i IP+e-posta basina 60 sn'de
 * 10 denemedir (bkz. 17-config-multiselect).
 */

test("dil anahtari landing ve hukuki sayfalari ingilizceye cevirir", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Demo Talep Et/ }).first()).toBeVisible();

  // Tema anahtarinin YANINDA durur ve o an aktif dili yazar.
  const toggle = page.getByRole("button", { name: /Switch to English/ });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveText(/tr/i);
  await toggle.click();

  // Ingilizce metin + `<html lang>` guncellenir.
  await expect(page.getByRole("link", { name: /Request a demo/ }).first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  // Sunucuda render edilen hukuki sayfa da cookie'yi okur (metadata dahil).
  await page.goto("/kvkk");
  await expect(page.getByRole("heading", { name: "KVKK privacy notice" })).toBeVisible();
  await expect(page).toHaveTitle(/KVKK privacy notice/);

  await page.goto("/cerez-politikasi");
  await expect(page.getByRole("heading", { name: "Cookie Policy" })).toBeVisible();

  // Geri donus: secim kalicidir, sayfa yenilense de korunur.
  await page.getByRole("button", { name: /Türkçe'ye geç|Switch to English/ }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Çerez Politikası" })).toBeVisible();
});

test("dil secimi yonetim panelinde de gecerlidir ve oturumla tasinir", async ({ page }) => {
  // Cookie'yi login'den ONCE kur: giris ekrani da cevrilmis olmali.
  await page.context().addCookies([
    { name: "logislot.lang", value: "en", url: "http://localhost:3010" },
  ]);

  await page.goto("/login/admin");
  await page.getByLabel("E-mail").fill(ACCOUNTS.admin);
  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /Sign in/ }).click();

  await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Appointments" })).toBeVisible();

  // Panel icinden Turkce'ye donulebilir (istemci tarafi sozluk).
  await page.getByRole("button", { name: /Türkçe/ }).click();
  await expect(page.getByRole("link", { name: "Randevular" })).toBeVisible();
});
