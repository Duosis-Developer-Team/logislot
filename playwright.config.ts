import { defineConfig } from "@playwright/test";

/**
 * LogiSlot kritik E2E akislari.
 *
 * Kosum icin compose stack'inin ayakta ve seed'in yuklu olmasi gerekir:
 *   docker compose up -d && docker compose exec logislot-api python -m app.seed_cli
 *   npx playwright test
 *
 * E2E_BASE_URL / E2E_API_URL ile hedef ortam degistirilebilir.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1, // seed verisi paylasildigi icin seri kosulur
  retries: 0,
  reporter: [["list"]],
  outputDir: "e2e/test-results",
  // Cerez bilgilendirme banner'i onceden ack'lenir (bkz. e2e/global-setup.ts);
  // banner'in kendisi 13-landing-marketing'de storageState override ile test edilir.
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3010",
    storageState: "./e2e/.artifacts/storage-state.json",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
  },
});
