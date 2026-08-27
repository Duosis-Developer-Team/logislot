/**
 * Login ekranindaki "Demo hesap" ipucu ve form on-doldurma.
 *
 * Web tarafiyla ayni kural (apps/web/src/lib/demo-mode.ts): degerler kaynakta
 * TUTULMAZ, build sirasinda EXPO_PUBLIC_DEMO_CREDENTIALS ile verilir. Prod
 * build'i degiskeni gecmedigi icin demo e-posta/parola bundle'da bulunmaz.
 *
 * Bicim: {"password":"...","emails":{"supplier":"...","admin":"..."}}
 */
type MobilePortal = "supplier" | "admin";

interface DemoCredentialsConfig {
  password: string;
  emails: Partial<Record<MobilePortal, string>>;
}

function parseDemoCredentials(): DemoCredentialsConfig | null {
  const raw = process.env.EXPO_PUBLIC_DEMO_CREDENTIALS;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DemoCredentialsConfig;
    if (!parsed?.password || !parsed?.emails) return null;
    return parsed;
  } catch {
    // Bozuk deger yalnizca yardimciyi kapatir, login akisini dusurmez.
    return null;
  }
}

const DEMO_CREDENTIALS = parseDemoCredentials();

/** Portal icin demo hesap; demo modu kapaliysa (prod) null. */
export function demoCredentialsFor(
  portal: MobilePortal,
): { email: string; password: string } | null {
  const email = DEMO_CREDENTIALS?.emails[portal];
  return email ? { email, password: DEMO_CREDENTIALS!.password } : null;
}
