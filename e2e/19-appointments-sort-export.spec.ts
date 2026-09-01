import { expect, test } from "@playwright/test";
import { ACCOUNTS, loginViaUi } from "./helpers";

/**
 * Randevu listesinde sutun siralamasi ve CSV disa aktarim.
 *
 * TEK GIRIS kullanilir: login ucu paket kotasinin dibinde kosuyor ve her spec
 * icin ayri giris rastgele 429 uretiyor.
 */
test("randevu listesi sutundan siralanir ve CSV indirilir", async ({ page }) => {
  await loginViaUi(page, "Yönetim Paneli", ACCOUNTS.admin);
  await page.getByRole("link", { name: "Randevular" }).click();
  await expect(page.getByRole("heading", { name: "Randevular" })).toBeVisible();

  const supplierHeader = page.getByRole("columnheader", { name: /Tedarikçi/ });
  const supplierButton = supplierHeader.getByRole("button");

  // Baslangicta hicbir sutun siralama olcutu DEGIL.
  await expect(supplierHeader).toHaveAttribute("aria-sort", "none");

  // Ilk tiklama artan, ikinci tiklama azalan.
  await supplierButton.click();
  await expect(supplierHeader).toHaveAttribute("aria-sort", "ascending");
  await supplierButton.click();
  await expect(supplierHeader).toHaveAttribute("aria-sort", "descending");

  // Baska bir sutuna gecince ONCEKI sutun olcut olmaktan cikar.
  const dockHeader = page.getByRole("columnheader", { name: /Rampa/ });
  await dockHeader.getByRole("button").click();
  await expect(dockHeader).toHaveAttribute("aria-sort", "ascending");
  await expect(supplierHeader).toHaveAttribute("aria-sort", "none");

  // Tedarikci sutunu gercekten Turkce siraya girmis olmali.
  const names = await page.locator("tbody tr td:nth-child(2)").allTextContents();
  await supplierButton.click();
  const ascending = await page.locator("tbody tr td:nth-child(2)").allTextContents();
  const collator = new Intl.Collator("tr", { sensitivity: "base", numeric: true });
  const expected = [...ascending].sort(collator.compare);
  expect(ascending).toEqual(expected);
  expect(names.length).toBeGreaterThan(0);

  // CSV: dosya gercekten iniyor ve BOM + noktali virgul ayraci tasiyor
  // (ikisi de Excel'in Turkce yerelinde dogru acilmasi icin gerekli).
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "CSV indir" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^randevular-\d{4}-\d{2}-\d{2}\.csv$/);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");

  expect(text.charCodeAt(0)).toBe(0xfeff); // BOM
  const header = text.replace(/^﻿/, "").split("\r\n")[0];
  expect(header.split(";")).toEqual([
    "Tarih",
    "Saat",
    "Tedarikçi",
    "Ürün",
    "Miktar",
    "Birim",
    "Rampa",
    "Araç",
    "Durum",
    "Plaka",
    "Sürücü",
    "Süre (dk)",
  ]);
});
