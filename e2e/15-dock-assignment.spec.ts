import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { ACCOUNTS, API_URL, apiLogin, loginViaUi, nextWeekdayISO } from "./helpers";

/**
 * Kritik akis 15: rampa kategorizasyonu + otomatik atama + rampa degisimi.
 *
 * Urun kurallari (kullanici talebi):
 * - Rampaya atanan urun kategorileri randevu akisini SUZER; uyumsuz rampa
 *   kullaniciya hic sunulmaz.
 * - Rampa otomatik atanir; kullanici secmek zorunda degildir.
 * - Atanan rampa sonradan BOS bir alternatifle degistirilebilir ve bu islem
 *   revize DEGILDIR: saat ve randevu durumu korunur.
 *
 * Not: sayfa gecisleri uygulama ici link ile yapilir — tam sayfa `goto`
 * oturumu dusurur (bkz. diger admin spec'leri).
 */


/**
 * Admin token'ini iki test ARASINDA paylasir.
 *
 * /auth/login IP+email basina 60 saniyede 10 denemeyle sinirlidir ve suite
 * genelinde admin ile cok kez giris yapiliyor; her testte yeniden login olmak
 * siniri zorlayip testleri kirilgan yapar. Yalnizca DUZ VERI (token, facility)
 * saklanir — request context'i teste ozeldir ve test bitince kapanir.
 */
let cachedSession: { token: string; facilityId: string } | null = null;

async function adminApi(request: APIRequestContext) {
  if (!cachedSession) {
    const token = await apiLogin(request, "/auth/login", ACCOUNTS.admin);
    const me = await (
      await request.get(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
    ).json();
    cachedSession = { token, facilityId: me.data.default_facility_id };
  }
  const { token, facilityId } = cachedSession;
  const headers = { Authorization: `Bearer ${token}`, "X-Facility-Id": facilityId };
  return {
    headers,
    facilityId,
    get: async (path: string) =>
      (await (await request.get(`${API_URL}${path}`, { headers })).json()).data,
  };
}

/**
 * Iki dogrulama TEK oturumda yapilir: /auth/login IP+email basina 60 saniyede
 * 10 denemeyle sinirli ve suite genelinde admin ile cok kez giris yapiliyor.
 * Ayri testler fazladan login uretip tum suite'i kirilganlastiriyordu.
 *
 * Fixture randevusu ACMIYORUZ: liste tarihe gore sirali ve 100 kayitla sinirli,
 * ileri tarihli bir kaydin listede gorunmesi garanti degil. Bunun yerine
 * mevcut randevular uzerinden calisiliyor; sunucu tarafi kurallari zaten
 * apps/api/tests/test_dock_assignment.py'de kanitlaniyor.
 */
test("rampa kategoriye gore suzulur ve durum bozulmadan degistirilebilir", async ({
  page,
  request,
}) => {
  const { facilityId, get } = await adminApi(request);
  const docks = await get(`/facilities/${facilityId}/docks`);
  const categories = await get(`/facilities/${facilityId}/categories`);
  const suppliers = await get(`/facilities/${facilityId}/suppliers`);

  type Dock = { id: string; name: string; is_active: boolean; accepted_product_category_ids: string[] };
  type Category = { id: string; display_name: string };
  type Supplier = { id: string; status: string; allowed_product_category_ids?: string[] };
  const activeDocks = (docks as Dock[]).filter((d) => d.is_active);
  const accepts = (d: Dock, categoryId: string) =>
    d.accepted_product_category_ids.length === 0 ||
    d.accepted_product_category_ids.includes(categoryId);

  // Suzmenin GORUNUR oldugu kategori: en az bir rampa reddetmeli.
  const restricted = (categories as Category[])
    .map((c) => ({
      category: c,
      rejecting: activeDocks.filter((d) => !accepts(d, c.id)),
      accepting: activeDocks.filter((d) => accepts(d, c.id)),
      supplier: (suppliers as Supplier[]).find(
        (s) =>
          s.status === "active" &&
          (!s.allowed_product_category_ids?.length ||
            s.allowed_product_category_ids.includes(c.id)),
      ),
    }))
    .find((x) => x.rejecting.length > 0 && x.accepting.length > 0 && x.supplier);
  expect(restricted, "en az bir rampanin reddettigi bir kategori bulunmali").toBeTruthy();

  await loginViaUi(page, "Yönetim Paneli", ACCOUNTS.admin);
  await page.getByRole("link", { name: "Randevular" }).click();
  await expect(page.getByRole("heading", { name: "Randevular" })).toBeVisible();

  // --- 1) Olusturma formunda kategori bazli suzme ---
  await page.getByRole("button", { name: "Yeni Randevu" }).click();
  const drawer = page.locator("div.fixed.inset-0").last();
  await expect(drawer.getByText("Tedarikçi").first()).toBeVisible();
  await drawer.locator("select").first().selectOption(restricted!.supplier!.id);
  await expect(drawer.getByText("Kategori").first()).toBeVisible();
  await drawer.locator("select").nth(1).selectOption(restricted!.category.id);
  await drawer.locator("select").filter({ hasText: "Otomatik ata" }).selectOption("manual");

  const listed = (await drawer.locator("select").last().locator("option").allInnerTexts())
    .map((t) => t.trim())
    .filter((t) => t.startsWith("Rampa"));
  expect(listed.length, "uyumlu rampalar sunulmali").toBeGreaterThan(0);
  for (const rejected of restricted!.rejecting) {
    expect(
      listed.some((t) => t.startsWith(rejected.name)),
      `${rejected.name} bu kategoriyi kabul etmiyor; listelenmemeli`,
    ).toBe(false);
  }
  // ESC ile kapat: "İptal" metni durum filtresi butonuyla cakisiyor.
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  // --- 2) Rampa degisimi: durum korunur ---
  // Once "Onaylandı" filtresi: rampasi degistirilebilir randevu buradadir.
  // Tum listeyi tarayip her satirin detayini acmak 60 sn'lik test butcesini
  // yiyor (her detay ayri istek zinciri tetikliyor).
  await page.locator("button", { hasText: /^Onaylandı/ }).first().click();
  const rows = page.locator("table").first().locator("tbody tr");
  // Filtre uygulanana kadar ESKI liste render'da kalir; satir sayisini erken
  // okursak filtrelenmemis listeyle calisiriz.
  await expect(rows.first()).toContainText("Onaylandı");

  // Liste tarihe gore ARTAN sirali; gecmis randevular revize edilemez, bu
  // yuzden SONDAN (gelecege dogru) tariyoruz.
  const rowCount = await rows.count();
  let changeable = false;
  for (let i = rowCount - 1; i >= Math.max(0, rowCount - 6); i--) {
    await rows.nth(i).getByRole("button", { name: "Detay" }).click();
    const opened = page.getByRole("dialog").first();
    await expect(opened).toBeVisible();
    // Detay ASENKRON yuklenir; yuklenmeden aksiyon butonlari render edilmez.
    // Beklemeden count() okursak her zaman 0 goruruz.
    const dockButton = page.getByRole("button", { name: "Rampa Değiştir" });
    try {
      await dockButton.waitFor({ state: "visible", timeout: 5_000 });
      changeable = true;
      break;
    } catch {
      await page.keyboard.press("Escape");
      await expect(opened).toBeHidden();
    }
  }
  expect(changeable, "rampasi degistirilebilir bir randevu bulunmali").toBe(true);

  const detail = page.getByRole("dialog").first();
  const statusBefore = (await detail.innerText()).match(
    /Onaylandı|Revizyon Bekliyor|Bekliyor/,
  )?.[0];

  await page.getByRole("button", { name: "Rampa Değiştir" }).click();
  // Detay cekmecesi de role="dialog" tasir; basligiyla daraltiyoruz.
  const dialog = page.getByRole("dialog").filter({ hasText: "Rampa değiştir" });
  await expect(dialog.getByText(/randevu durumu korunur/)).toBeVisible();

  // Secenekler sunucudan gelir; yuklenene kadar select render EDILMEZ.
  const dockSelect = dialog.locator("select").first();
  await expect(dockSelect).toBeVisible({ timeout: 15_000 });
  const options = await dockSelect.locator("option").evaluateAll((els) =>
    (els as HTMLOptionElement[]).map((o) => ({
      value: o.value,
      text: (o.textContent ?? "").trim(),
      disabled: o.disabled,
    })),
  );
  expect(options[0].value, "otomatik atama secenegi her zaman sunulur").toBe("auto");
  // Uyumsuz rampa listeye HIC girmez; dolu olan girer ama secilemez.
  expect(options.every((o) => o.value === "auto" || o.text.startsWith("Rampa"))).toBe(true);

  const alternative = options.find(
    (o) => o.value !== "auto" && !o.disabled && !o.text.includes("(mevcut)"),
  );
  if (!alternative) {
    test.info().annotations.push({
      type: "note",
      description: "bos alternatif rampa yok; degisim adimi atlandi",
    });
    return;
  }

  await dockSelect.selectOption(alternative.value);
  await dialog.getByRole("button", { name: "Rampayı Değiştir" }).click();
  await expect(page.getByText(/Rampa değiştirildi/)).toBeVisible({ timeout: 15_000 });

  // Revize DEGIL: durum etiketi aynen kalir.
  const statusAfter = (await page.getByRole("dialog").first().innerText()).match(
    /Onaylandı|Revizyon Bekliyor|Bekliyor/,
  )?.[0];
  expect(statusAfter).toBe(statusBefore);
});
