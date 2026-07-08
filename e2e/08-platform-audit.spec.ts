import { expect, test } from "@playwright/test";
import { ACCOUNTS, loginViaUi } from "./helpers";

/** Sprint 12: platform denetim izleri sayfasi yuklenir ve kayitlari listeler. */
test("platform denetim izleri sayfası yüklenir", async ({ page }) => {
  await loginViaUi(page, "Platform Yönetimi", ACCOUNTS.platform);
  await expect(page).toHaveURL(/\/platform\/tenants/);

  await page.getByRole("link", { name: "Denetim İzleri" }).click();
  await expect(
    page.getByRole("heading", { name: "Platform Denetim İzleri" }),
  ).toBeVisible();
  // Canli demo DB'sinde platform aksiyonlari mevcut (tenant/plan islemleri)
  await expect(page.getByText(/Toplam \d+ kayıt/)).toBeVisible({ timeout: 10_000 });
});
