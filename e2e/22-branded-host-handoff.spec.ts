import { expect, test } from "@playwright/test";
import { ACCOUNTS, API_URL, DEMO_PASSWORD, apiLogin } from "./helpers";

/**
 * Markali alan adi devri IKI portalda da calismali (kullanici bildirimi
 * 2026-09-01: yonetim devrediliyordu, tedarikci devredilmiyordu).
 *
 * Hedef alan adlari testte cozulmez; Playwright ile stub'lanip yalnizca
 * DEVRIN DENENDIGI dogrulanir — asil regresyon "hic denenmemesi"ydi.
 */
const ADMIN_HOST = "cknb.ornek.test";
const SUPPLIER_HOST = "cknbtedarik.ornek.test";

test.beforeAll(async ({ request }) => {
  const token = await apiLogin(request, "/auth/platform-login", ACCOUNTS.platform);
  const tenants = await request.get(`${API_URL}/platform/tenants`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const tenantId = (await tenants.json()).data[0].id;
  const patched = await request.patch(`${API_URL}/platform/tenants/${tenantId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { admin_host: ADMIN_HOST, supplier_host: SUPPLIER_HOST },
  });
  expect(patched.ok()).toBeTruthy();
});

for (const portal of [
  { name: "yönetim", path: "/login/admin", email: ACCOUNTS.admin, host: ADMIN_HOST },
  {
    name: "tedarikçi",
    path: "/login/supplier",
    email: ACCOUNTS.supplierManual,
    host: SUPPLIER_HOST,
  },
]) {
  test(`${portal.name} girisi markali alan adina devreder`, async ({ page }) => {
    // Markali alan adi testte cozulmez; istegi karsilayip URL'i dogruluyoruz.
    await page.route(`https://${portal.host}/**`, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<html>ok</html>" }),
    );

    await page.goto(portal.path);
    await page.getByLabel("E-posta").fill(portal.email);
    await page.getByLabel("Parola", { exact: true }).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: /Giriş$/ }).click();

    await page.waitForURL(new RegExp(`^https://${portal.host.replace(/\./g, "\\.")}/handoff`), {
      timeout: 20_000,
    });
    // Token URL'e ASLA konmaz; yalnizca tek kullanimlik kod tasinir.
    const url = new URL(page.url());
    expect(url.searchParams.get("code")).toBeTruthy();
    expect(page.url()).not.toContain("token");
  });
}
