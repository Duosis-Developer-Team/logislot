import { expect, test } from "@playwright/test";

/**
 * Landing pazarlama katmanı (strateji + KVKK dokümanları):
 * - Demo hunisi: hero CTA → /demo formu.
 * - Örnek senaryo bölümü AÇIKÇA "temsili" etiketli; benchmark sektör kaynaklı.
 * - Güvenilir altyapı bölümünde ince Duosis satırı.
 * - Footer'da yasal linkler; /kvkk taslak uyarılı, /cerez-politikasi dolu.
 * - Çerez bilgilendirme banner'ı: görünür → "Anladım" → reload'da gelmez.
 */

test("landing: demo CTA'ları ve yeni bölümler görünür", async ({ page }) => {
  await page.goto("/");
  // Hero + topbar + final CTA'da demo linki (en az 2)
  const demoLinks = page.getByRole("link", { name: /Demo Talep Et/ });
  expect(await demoLinks.count()).toBeGreaterThanOrEqual(2);

  // Örnek senaryo bölümü — açıkça etiketli + benchmark
  await expect(page.getByText("Temsili örnek senaryo")).toBeVisible();
  await expect(page.getByText("%30–50")).toBeVisible();
  await expect(page.getByText(/sektör genelinin bildirdiği aralıktır/)).toBeVisible();

  // Güvenilir altyapı + ince Duosis güven cümlesi
  await expect(
    page.getByText(/Duosis güvencesiyle kurulur ve 7\/24 izlenir/),
  ).toBeVisible();

  // Entegrasyon işaretleri
  await expect(page.getByText("Mevcut sistemlerinize bağlanır mı?")).toBeVisible();

  // Footer yasal linkleri + altyapı ortağı satırı (banner'da da link olabilir → .first)
  await expect(
    page.getByRole("link", { name: "KVKK Aydınlatma Metni" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Çerez Politikası" }).first(),
  ).toBeVisible();
  await expect(page.getByText("Altyapı ortağı:")).toBeVisible();
});

test("demo sayfası: form alanları ve iletişim bilgisi", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Demo Talep Et" })).toBeVisible();
  await expect(page.getByLabel("Ad Soyad")).toBeVisible();
  await expect(page.getByLabel("Firma")).toBeVisible();
  await expect(page.getByLabel("Kurumsal E-posta")).toBeVisible();
  await expect(page.getByLabel("Tesis Sayısı")).toBeVisible();
  await expect(page.getByRole("button", { name: "Demo Talebi Gönder" })).toBeVisible();
});

test("kvkk sayfası: taslak uyarısı + aydınlatma ve açık rıza bölümleri", async ({
  page,
}) => {
  await page.goto("/kvkk");
  await expect(page.getByText("Taslak metin.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Tesis \/ Yönetim Kullanıcısı/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Tedarikçi \/ Sürücü/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Açık Rıza Bilgilendirmesi/ }),
  ).toBeVisible();
});

test("çerez politikası: depolama tablosu ve kvkk linki", async ({ page }) => {
  await page.goto("/cerez-politikasi");
  await expect(page.getByText("logislot.access_token", { exact: false })).toBeVisible();
  await expect(page.getByText(/Analitik, reklam veya pazarlama amaçlı çerez/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "KVKK Aydınlatma Metni" }).first(),
  ).toBeVisible();
});

test.describe("çerez banner'ı (temiz depolama)", () => {
  // Global setup banner'ı ack'lediği için bu blokta storage sıfırlanır.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("görünür, kapatılır ve reload'da geri gelmez", async ({ page }) => {
    await page.goto("/");
    const region = page.getByRole("region", { name: "Çerez bilgilendirmesi" });
    await expect(region).toBeVisible();
    await region.getByRole("button", { name: "Anladım" }).click();
    await expect(region).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Çerez bilgilendirmesi" }),
    ).toHaveCount(0);
  });
});
