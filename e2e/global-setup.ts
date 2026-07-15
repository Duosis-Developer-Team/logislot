import fs from "node:fs";
import path from "node:path";

/**
 * E2E global setup — çerez bilgilendirme banner'ı her testte yeniden
 * çıkmasın diye ack anahtarını içeren bir storageState üretir (banner'ın
 * kendisi 13-landing-marketing.spec.ts'te storageState override edilerek
 * ayrıca test edilir).
 */
export default async function globalSetup(): Promise<void> {
  const base = process.env.E2E_BASE_URL ?? "http://localhost:3010";
  const state = {
    cookies: [],
    origins: [
      {
        origin: base,
        localStorage: [{ name: "logislot.cookie_notice_ack", value: "e2e" }],
      },
    ],
  };
  const dir = path.join(__dirname, ".artifacts");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "storage-state.json"), JSON.stringify(state));
}
