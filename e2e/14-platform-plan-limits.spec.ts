import { expect, test } from "@playwright/test";
import { ACCOUNTS, loginViaUi } from "./helpers";

/**
 * Kritik akis 14: "1 tenant = 1 tesis" + DINAMIK plan limitleri.
 *
 * Iki urun kararini birden korur:
 * 1. Ayri bir "Tesis" kavrami YOKTUR — navigasyonda giris yok, eski rota
 *    musteri hesaplarina yonlenir, hesap acilisi tek adimdir.
 * 2. Plan kotalari sabit DEGILDIR — platform yoneticisi rakamlari UI'dan
 *    degistirebilir ve degisiklik kalicidir.
 */

test("platform navigasyonunda tesis kavrami yok; eski rota yonlenir", async ({ page }) => {
  await loginViaUi(page, "Platform Yönetimi", ACCOUNTS.platform);
  await expect(page).toHaveURL(/\/platform\/tenants/);

  await expect(page.getByRole("link", { name: /Tesis/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Müşteri Hesapları" })).toBeVisible();

  // Kayitli link/yer imi kirilmasin: eski tesis rotasi yonlendirir.
  await page.goto("/platform/facilities");
  await expect(page).toHaveURL(/\/platform\/tenants/);

  // Hesap acilisi TEK adim: kapsam + kurulum + ilk yonetici ayni formda.
  await page.getByRole("button", { name: /Yeni Müşteri Hesabı/ }).first().click();
  const form = page.getByRole("dialog");
  await expect(form.getByText("Adres")).toBeVisible();
  await expect(form.getByText(/Başlangıç konfigürasyonunu kur/)).toBeVisible();
  await expect(form.getByText(/İlk yönetici hesabını oluştur/)).toBeVisible();
});

test("plan limitleri UI'dan degistirilebilir ve kalicidir", async ({ page }) => {
  await loginViaUi(page, "Platform Yönetimi", ACCOUNTS.platform);
  await page.getByRole("link", { name: "Planlar" }).click();
  await expect(page.getByRole("heading", { name: "Planlar" })).toBeVisible();

  const row = page.getByRole("row", { name: /Starter/ });
  await row.getByRole("button", { name: "Düzenle" }).click();
  await expect(page.getByText("Plan Limitleri")).toBeVisible();

  // Rakam STATIK degil: ayni alan iki farkli degere ayarlanabiliyor.
  const maxTenants = page.getByLabel(/Maksimum müşteri hesabı limiti/);
  await maxTenants.fill("300");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(row).toContainText("Maksimum müşteri hesabı: 300");

  await page.reload();
  await expect(page.getByRole("row", { name: /Starter/ })).toContainText(
    "Maksimum müşteri hesabı: 300",
  );

  // Bos birakmak = sinirsiz (limit kaldirilabilir olmali).
  await page.getByRole("row", { name: /Starter/ }).getByRole("button", { name: "Düzenle" }).click();
  await page.getByLabel(/Maksimum müşteri hesabı limiti/).fill("");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("row", { name: /Starter/ })).not.toContainText(
    "Maksimum müşteri hesabı",
  );

  // Testi tekrar calistirilabilir birakmak icin baslangic degerine don.
  await page.getByRole("row", { name: /Starter/ }).getByRole("button", { name: "Düzenle" }).click();
  await page.getByLabel(/Maksimum müşteri hesabı limiti/).fill("300");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("row", { name: /Starter/ })).toContainText(
    "Maksimum müşteri hesabı: 300",
  );
});
