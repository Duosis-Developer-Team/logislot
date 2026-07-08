import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:8010";
export const DEMO_PASSWORD = "Demo123!";

export const ACCOUNTS = {
  admin: "admin@cakesbakes.com",
  platform: "admin@logislot.com",
  supplierAuto: "tedarikci@anadoluun.com",
  supplierManual: "tedarikci@marmarasoguk.com",
} as const;

/** Login sayfasindan portal secip giris yapar (UI akisi). */
export async function loginViaUi(
  page: Page,
  portal: "Tedarikçi Portalı" | "Yönetim Paneli" | "Platform Yönetimi",
  email: string,
) {
  await page.goto("/login");
  // Ayni metin submit butonunda da gectigi icin ilk eslesme = portal karti
  await page.getByRole("button", { name: portal }).first().click();
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(DEMO_PASSWORD);
  // Buton metni portala gore degisir: "...'na Giriş"
  await page.getByRole("button", { name: /Giriş$/ }).click();
}

/** API'den token alir (fixture kurulum/temizligi icin). */
export async function apiLogin(
  request: APIRequestContext,
  endpoint: "/auth/login" | "/auth/supplier-login" | "/auth/platform-login",
  email: string,
): Promise<string> {
  const response = await request.post(`${API_URL}${endpoint}`, {
    data: { email, password: DEMO_PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data.access_token;
}

/** Hafta ici bir sonraki gun (cumartesi/pazar kisitina takilmamak icin). */
export function nextWeekdayISO(offsetDays = 1): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
