import { expect, test } from "@playwright/test";
import { ACCOUNTS, API_URL, apiLogin } from "./helpers";

/**
 * Kritik akis 6 (Sprint 9): gecici parolali kullanici login olunca
 * /change-password'a yonlendirilir; parolayi degistirince panele girer.
 * Temizlik: kullanici API ile pasiflestirilir.
 */
test("geçici parolalı kullanıcı ilk girişte parola değiştirir", async ({ page, request }) => {
  const email = `e2e-pwd-${Date.now()}@cakesbakes.com`;
  const tempPassword = "GeciciE2E1!";
  const newPassword = "E2EYeniGuclu123!";

  // Fixture: admin API'siyle gecici parolali kullanici (izleyici rolu)
  const adminToken = await apiLogin(request, "/auth/login", ACCOUNTS.admin);
  const me = await request.get(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const fid = (await me.json()).data.default_facility_id;
  const roles = await request.get(`${API_URL}/facilities/${fid}/roles`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const viewerRole = (await roles.json()).data.find(
    (r: { name: string }) => r.name === "Izleyici / Planlama",
  );
  const createResponse = await request.post(`${API_URL}/facilities/${fid}/users`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: {
      name: "E2E Parola Kullanicisi",
      email,
      role_ids: [viewerRole.id],
      temporary_password: tempPassword,
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
  const userId = (await createResponse.json()).data.id;

  try {
    // UI login -> must_change_password -> /change-password'a duser
    await page.goto("/login");
    await page.getByRole("radio", { name: "Yönetim Paneli" }).click();
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Parola", { exact: true }).fill(tempPassword);
    await page.getByRole("button", { name: /Giriş$/ }).click();
    await expect(page).toHaveURL(/\/change-password/);
    await expect(page.getByRole("heading", { name: "Parola Değiştir" })).toBeVisible();

    // Parola politikasina uyan yeni parola -> panele kesintisiz devam
    await page.getByLabel("Mevcut Parola").fill(tempPassword);
    await page.getByLabel("Yeni Parola", { exact: true }).fill(newPassword);
    await page.getByLabel("Yeni Parola (Tekrar)").fill(newPassword);
    await page.getByRole("button", { name: "Parolayı Değiştir" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Genel Bakış" })).toBeVisible();

    // Yeni parolayla dogrudan login artik yonlendirmesiz calisir
    const relogin = await request.post(`${API_URL}/auth/login`, {
      data: { email, password: newPassword },
    });
    expect((await relogin.json()).data.must_change_password).toBe(false);
  } finally {
    // Temizlik: kullaniciyi pasiflestir
    await request.delete(`${API_URL}/facilities/${fid}/users/${userId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  }
});
