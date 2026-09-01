import { expect, test } from "@playwright/test";
import { ACCOUNTS, loginViaUi } from "./helpers";

/**
 * Kritik akis 16: konfigurasyon formlarindaki coklu secim alanlari.
 *
 * - Rol izin secici: arama filtreler, ENTER formu GONDERMEZ, grup toplu secimi
 *   yalnizca kendi grubunu etkiler (drawer iptal edilir; yazma yok).
 * - Rampa duzenleme: liste gorunumunden secim kaydedilir, tabloda gorunur ve
 *   ayni yoldan geri alinir.
 *
 * NOT: Tek test + TEK giris kullanilir. Login rate limit'i IP+email basina
 * 60 sn'de 10 denemedir; suite sonunda ek girisler limiti asiyordu.
 */
test("çoklu seçim alanları: izin araması, Enter güvenliği ve rampa seçimi", async ({
  page,
}) => {
  await loginViaUi(page, "Yönetim Paneli", ACCOUNTS.admin);
  await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 30_000 });

  // ---------- 1) Rol izin secici (yazma yok) ----------
  await page.goto("/admin/settings/users");
  await page.getByRole("button", { name: /^Roller/ }).click();
  await page.getByRole("button", { name: "Yeni Rol" }).click();

  const roleDrawer = page.getByRole("dialog", { name: "Yeni Rol" });
  await expect(roleDrawer).toBeVisible();

  // Arama Turkce/aksan duyarsiz: "rampalari" -> "Rampaları yönet"
  const permSearch = roleDrawer.getByPlaceholder("İzin ara…");
  await permSearch.fill("rampalari");
  await expect(roleDrawer.getByText("Rampaları yönet")).toBeVisible();
  await expect(roleDrawer.getByText("Randevu onayla")).toBeHidden();

  // ENTER formu GONDERMEMELI: drawer acik kalir.
  await permSearch.press("Enter");
  await expect(roleDrawer).toBeVisible();
  await expect(roleDrawer.getByText("Rampaları yönet")).toBeVisible();
  await permSearch.fill("");

  // Grup toplu secimi yalnizca kendi grubunu etkiler.
  const takvimGroup = roleDrawer
    .locator("div")
    .filter({ hasText: /^TAKVIM \(0\/2\)/i })
    .last();
  await takvimGroup.getByRole("button", { name: "Tümünü seç" }).click();
  await expect(roleDrawer.getByText(/^2 \/ \d+ izin seçili$/)).toBeVisible();

  // Vazgec butonu uygulama genelinde ortak metni (`t.common.cancel`) kullanir.
  await roleDrawer.getByRole("button", { name: "Vazgeç" }).click();
  await expect(roleDrawer).toBeHidden();

  // ---------- 2) Rampa: sec -> kaydet -> geri al ----------
  await page.goto("/admin/settings/docks");
  const firstRow = page.getByRole("row").nth(1);
  const dockName = (await firstRow.getByRole("cell").first().innerText()).split("\n")[0];
  await firstRow.getByRole("button", { name: "Düzenle" }).click();

  const dockDrawer = page.getByRole("dialog", { name: "Rampayı Düzenle" });
  await expect(dockDrawer).toBeVisible();
  const productField = dockDrawer
    .locator("div")
    .filter({ hasText: /^Kabul Edilen Ürün Kategorileri/ })
    .last();

  const unchecked = productField.getByRole("checkbox", { checked: false });
  test.skip((await unchecked.count()) === 0, "Rampada seçilmemiş kategori kalmamış.");
  const target = (await unchecked.first().innerText()).trim();

  // Arama KISA listelerde de vardir (esik kaldirildi) ve "bos = tumu kabul"
  // ipucu artik yazilmaz.
  const productSearch = productField.getByPlaceholder("Ürün kategorisi ara…");
  await expect(productSearch).toBeVisible();
  await expect(
    dockDrawer.getByText("Boş bırakılırsa tüm ürün kategorileri kabul edilir."),
  ).toBeHidden();
  await productSearch.fill(target.slice(0, 4));
  await expect(productField.getByRole("checkbox", { name: target })).toBeVisible();
  await productSearch.fill("");

  await productField.getByRole("checkbox", { name: target }).click();
  await expect(
    productField.getByRole("button", { name: `${target} seçimini kaldır` }),
  ).toBeVisible();
  await dockDrawer.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Rampa güncellendi.")).toBeVisible({ timeout: 15_000 });

  // Kalicilik: tablo listeyi API'den yeniler; rozet gorunur olmali.
  const row = page.getByRole("row", { name: new RegExp(dockName) }).first();
  await expect(row.getByText(target, { exact: true })).toBeVisible({ timeout: 15_000 });

  // Geri al: ayni yoldan secimi kaldir.
  await row.getByRole("button", { name: "Düzenle" }).click();
  await expect(dockDrawer).toBeVisible();
  await productField.getByRole("checkbox", { name: target }).click();
  await dockDrawer.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Rampa güncellendi.")).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText(target, { exact: true })).toBeHidden({ timeout: 15_000 });
});
