import { expect, test } from "@playwright/test";
import { ACCOUNTS, loginViaUi } from "./helpers";

/**
 * Destek talepleri — yönetim portalı akışı.
 *
 * KAPSAM NOTU: Bu paket Hermes OLMADAN koşar (dev'de Hermes destek
 * endpoint'i henüz yayında değil). Dolayısıyla burada doğrulanan şey
 * "route yapılandırılmamışken doğru davranış": ekran açılır, kullanıcı
 * neden talep açamadığını anlar ve HİÇBİR yerde grup seçici görünmez.
 * Kanonik TKT numarası üretimi cross-app E2E'nin konusudur.
 *
 * Rate limit notu (docs/…): paket login kotasının dibinde koşar; bu spec
 * BİLEREK tek `loginViaUi` kullanır.
 */
test("yönetim portalı destek talepleri ekranı — route yokken güvenli davranış", async ({
  page,
}) => {
  await loginViaUi(page, "Yönetim Paneli", ACCOUNTS.admin);
  await page.waitForURL(/\/admin/);

  // Sistem yöneticisi ticket.view iznine sahiptir → menüde görünür.
  const navLink = page.getByRole("link", { name: "Destek Talepleri" });
  await expect(navLink).toBeVisible();
  await navLink.click();
  await page.waitForURL(/\/admin\/tickets/);

  await expect(
    page.getByRole("heading", { name: "Destek Talepleri" }),
  ).toBeVisible();

  // Yönlendirme yapılandırılmamışken uyarı görünür ve yeni talep açılamaz.
  await expect(
    page.getByText("Destek yönlendirmesi henüz yapılandırılmamış.").first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Yeni Talep" })).toHaveCount(0);

  // Sekmeler çalışır (durum grupları).
  await page.getByRole("tab", { name: "Çözüldü / Kapalı" }).click();
  await expect(page.getByRole("tab", { name: "Çözüldü / Kapalı" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // Müşteri ekranında hedef ekip SEÇİCİSİ hiçbir koşulda bulunmaz.
  await expect(page.getByText("Hermes")).toHaveCount(0);
  await expect(page.getByLabel(/ekip seç/i)).toHaveCount(0);
});

test("platform portalı ticket yönlendirmesi ekranı erişilebilir", async ({ page }) => {
  await loginViaUi(page, "Platform Yönetimi", ACCOUNTS.platform);
  await page.waitForURL(/\/platform/);

  await page.getByRole("link", { name: "Ticket Yönlendirmesi" }).click();
  await page.waitForURL(/\/platform\/ticket-routing/);

  await expect(
    page.getByRole("heading", { name: "Ticket Yönlendirmesi" }),
  ).toBeVisible();

  // Müşteri hesabı satırı ve "Yapılandır" aksiyonu görünür.
  await expect(page.getByRole("button", { name: "Yapılandır" }).first()).toBeVisible();

  // Hermes bağlantısı yokken durum açıkça bildirilir; ekran boş kalmaz.
  await expect(
    page.getByText("Hermes bağlantısı yapılandırılmamış").first(),
  ).toBeVisible();

  // Platform yüzeyinde ticket İÇERİĞİ (başlık/talep sahibi/mesaj) YOKTUR.
  await expect(page.getByText("Sorun detayı")).toHaveCount(0);
});
