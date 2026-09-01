import { expect, test } from "@playwright/test";
import { ACCOUNTS, loginViaUi } from "./helpers";

/**
 * Iki gercek tikanma (2026-09-01, kullanici bildirimi):
 *
 * 1. Yanlislikla acilan kullanici yalnizca PASIFLESTIRILEBILIYORDU; listede
 *    kaliyor ve e-postasini sonsuza kadar rezerve ediyordu.
 * 2. Hesapsiz olusturulmus bir tedarikciye arayuzden portal hesabi ACILAMIYORDU
 *    ("Bu tedarikcinin portal hesabi yok." yaziyor, hicbir eylem sunmuyordu).
 *
 * NOT: Tek giris kullanilir — login rate limit'i IP+e-posta basina 60 sn'de
 * 10 denemedir (bkz. 17-config-multiselect).
 */
test("pasif kullanici kalici silinir; hesapsiz tedarikciye portal hesabi acilir", async ({
  page,
}) => {
  const stamp = Date.now();
  const userEmail = `e2e-yanlis-${stamp}@ornek.com`;

  await loginViaUi(page, "Yönetim Paneli", ACCOUNTS.admin);
  await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 30_000 });

  // ---------- 1) Yanlislikla acilan kullanici ----------
  await page.goto("/admin/settings/users");
  await page.getByRole("button", { name: "Yeni Kullanıcı" }).click();
  const userDrawer = page.getByRole("dialog", { name: "Yeni Kullanıcı" });
  // Etiketler input'a htmlFor ile bagli degil; placeholder ile secilir.
  await userDrawer.getByPlaceholder("Örn. Ayşe Yılmaz").fill("E2E Yanlis Acilan");
  await userDrawer.getByPlaceholder("kullanici@firma.com").fill(userEmail);
  await userDrawer.getByRole("checkbox", { name: /Izleyici/ }).click();
  await userDrawer.getByRole("button", { name: "Kaydet" }).click();
  await expect(userDrawer).toBeHidden({ timeout: 15_000 });

  const row = page.getByRole("row", { name: /E2E Yanlis Acilan/ });
  await expect(row).toBeVisible({ timeout: 15_000 });

  // Aktifken kalici silme SUNULMAZ — once pasiflestirilmeli.
  await expect(row.getByRole("button", { name: "Kalıcı olarak sil" })).toHaveCount(0);
  await row.getByRole("button", { name: "Pasifleştir" }).click();
  await page.getByRole("button", { name: "Pasifleştir" }).last().click();

  await row.getByRole("button", { name: "Kalıcı olarak sil" }).click();
  await page.getByRole("button", { name: "Kalıcı olarak sil" }).last().click();
  await expect(row).toHaveCount(0, { timeout: 15_000 });

  // ---------- 2) Hesapsiz tedarikciye portal hesabi ----------
  // Yonetici tedarikciyi ONCE Kullanicilar ekraninda ariyor; oradan
  // tedarikci ekranina KOPRU olmali (yoksa ekran cikmaz sokak gibi durur).
  await expect(
    page.getByText(/Tedarikçiler burada değil/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tedarikçi Ekle" }).click();
  await expect(page).toHaveURL(/\/admin\/settings\/suppliers/);
  await page.getByRole("button", { name: "Yeni Tedarikçi" }).click();
  const supplierDrawer = page.getByRole("dialog", { name: "Yeni Tedarikçi" });
  // Firma adi ve kod: etiketler input'a bagli degil, sirali secilir.
  await supplierDrawer.getByRole("textbox").first().fill(`E2E Hesapsiz ${stamp}`);
  await supplierDrawer.getByPlaceholder("SUP-004").fill(`E2E${stamp % 100000}`);
  // Hesapsiz olustur: portal hesabi anahtarini kapat.
  await supplierDrawer
    .getByRole("switch", { name: "Portal hesabı oluştur" })
    .click();
  await supplierDrawer.getByRole("button", { name: "Kaydet" }).click();
  await expect(supplierDrawer).toBeHidden({ timeout: 15_000 });

  // Duzenlemeye girince hesap acma formu SUNULMALI (eskiden cikmaz sokakti).
  const supplierRow = page.getByRole("row", { name: new RegExp(`E2E Hesapsiz ${stamp}`) });
  await supplierRow.getByRole("button", { name: "Düzenle" }).click();
  const editDrawer = page.getByRole("dialog", { name: "Tedarikçiyi Düzenle" });
  await expect(editDrawer.getByText("Bu tedarikçinin portal hesabı yok.")).toBeVisible();

  await editDrawer
    .getByPlaceholder("Boşsa iletişim e-postası kullanılır")
    .fill(`e2e-portal-${stamp}@ornek.com`);
  await editDrawer.getByRole("button", { name: "Portal hesabı oluştur" }).click();
  await expect(page.getByText(/Portal hesabı açıldı/)).toBeVisible({ timeout: 15_000 });
});
