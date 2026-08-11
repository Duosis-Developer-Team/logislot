import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { ACCOUNTS, API_URL, apiLogin, loginViaUi, nextWeekdayISO } from "./helpers";

/**
 * Kritik akis 16: takvimden tek tikla istisna + coklu rampa secimi.
 *
 * Urun kurallari (kullanici talebi):
 * - Ayni istisna tek islemde BIRDEN FAZLA rampaya atanabilmeli.
 * - Istisna eklemek icin Ayarlar'a gitmek gerekmemeli: Takvim sekmesindeki tek
 *   buton, goruntulenen gunu on-secili getirerek modali acmali.
 *
 * Not: sayfa gecisleri uygulama ici link ile yapilir — tam sayfa `goto`
 * oturumu dusurur (bkz. diger admin spec'leri).
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

test("takvimden acilan istisna modali secilen gunu ve coklu rampayi kaydeder", async ({
  page,
  request,
}) => {
  const { facilityId, headers, get } = await adminApi(request);
  type Override = { id: string; dock_id: string; date: string; type: string; is_active: boolean };
  type Dock = { id: string; name: string; is_active: boolean };

  // Cakismasin diye ileri bir hafta ici gun secilir ve o gunun kalinti
  // istisnalari (onceki kosumlar) pasiflestirilir.
  const day = nextWeekdayISO(21);
  const existing: Override[] = await get(`/facilities/${facilityId}/dock-overrides`);
  for (const row of existing.filter((o) => o.date === day && o.is_active)) {
    await request.delete(`${API_URL}/facilities/${facilityId}/dock-overrides/${row.id}`, {
      headers,
    });
  }
  const docks: Dock[] = (await get(`/facilities/${facilityId}/docks`)).filter(
    (d: Dock) => d.is_active,
  );
  expect(docks.length, "coklu secim icin en az 2 aktif rampa gerekir").toBeGreaterThan(1);

  await loginViaUi(page, "Yönetim Paneli", ACCOUNTS.admin);
  await page.getByRole("link", { name: "Takvim" }).click();
  await expect(page.getByRole("heading", { name: "Takvim", exact: true })).toBeVisible();

  // Gunu sec: takvim tarih girisi (istisna modali bu gunu devralmali)
  await page.locator('input[type="date"]').first().fill(day);

  // TEK BUTON: Ayarlar'a gitmeden istisna modali
  await page.getByRole("button", { name: "İstisna Ekle" }).click();
  const drawer = page.locator("div.fixed.inset-0").last();
  await expect(drawer.getByRole("heading", { name: "Yeni Takvim İstisnası" })).toBeVisible();

  // Gun on-secili gelmeli
  await expect(drawer.locator('input[type="date"]')).toHaveValue(day);

  // Coklu rampa secimi: ilk iki rampa (aranabilir liste; satirlar checkbox)
  const [first, second] = docks;
  await drawer.getByRole("checkbox", { name: first.name, exact: true }).click();
  await drawer.getByRole("checkbox", { name: second.name, exact: true }).click();
  await drawer.getByRole("button", { name: "Kaydet" }).click();
  await expect(drawer).toBeHidden();

  // Iki rampa icin de AYRI kayit olusmali
  const after: Override[] = await get(`/facilities/${facilityId}/dock-overrides`);
  const created = after.filter((o) => o.date === day && o.is_active);
  expect(created.map((o) => o.dock_id).sort()).toEqual([first.id, second.id].sort());
  expect(created.every((o) => o.type === "closed")).toBe(true);

  // Takvim ayni gunde iki rampayi da kapali gostermeli
  await page.locator('input[type="date"]').first().fill(day);
  for (const dock of [first, second]) {
    const row = page.locator("div").filter({ hasText: new RegExp(`^${dock.name}`) });
    await expect(row.getByText("Bugün kapalı").first()).toBeVisible();
  }

  // Temizlik: olusturulan istisnalari pasiflestir (suite tekrar kosulabilsin)
  for (const row of created) {
    await request.delete(`${API_URL}/facilities/${facilityId}/dock-overrides/${row.id}`, {
      headers,
    });
  }
});
