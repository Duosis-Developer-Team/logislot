import { expect, test } from "@playwright/test";
import { ACCOUNTS, loginViaUi } from "./helpers";

/** Kritik akis 1: Admin girisi -> dashboard -> takvim. */
test("admin girer, dashboard ve takvim yüklenir", async ({ page }) => {
  await loginViaUi(page, "Yönetim Paneli", ACCOUNTS.admin);

  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await expect(page.getByRole("heading", { name: "Genel Bakış" })).toBeVisible();
  // Dashboard gercek verisi: KPI kartlari render edilmis olmali
  await expect(page.getByText("Bugünkü Randevular")).toBeVisible();
  await expect(page.getByText("Onay Bekleyen", { exact: true })).toBeVisible();

  // Takvime gec: rampa kolonlari gorunur
  await page.getByRole("link", { name: "Takvim" }).click();
  await expect(page.getByRole("heading", { name: "Takvim" })).toBeVisible();
  await expect(page.getByText("Rampa 1").first()).toBeVisible();
  await expect(page.getByText("Rampa 2").first()).toBeVisible();
});
