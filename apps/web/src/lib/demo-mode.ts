import { type Portal } from "@/components/auth/portals";

/**
 * Login ekranlarindaki "Demo hesap" ipucu ve form on-doldurma.
 *
 * Degerler KAYNAKTA TUTULMAZ, build sirasinda NEXT_PUBLIC_DEMO_CREDENTIALS ile
 * verilir. Prod image'i bu degiskeni gecmedigi icin prod bundle'inda demo
 * e-posta/parola hicbir bicimde bulunmaz.
 *
 * Kosullu render yeterli DEGILDI: dal olu olsa bile webpack modulu bundle'da
 * tutuyor ve dizeler public login chunk'indan okunabiliyordu — `Demo123!` ayni
 * zamanda yeni kullanici/tedarikci hesaplarinin sunucu tarafi varsayilan gecici
 * parolasi oldugu icin bu gercek bir sizinti. Tek kesin cozum dizeyi kaynaktan
 * cikarmak.
 *
 * Bicim: {"password":"...","emails":{"supplier":"...","admin":"...","platform":"..."}}
 */
interface DemoCredentialsConfig {
  password: string;
  emails: Partial<Record<Portal, string>>;
}

function parseDemoCredentials(): DemoCredentialsConfig | null {
  const raw = process.env.NEXT_PUBLIC_DEMO_CREDENTIALS;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DemoCredentialsConfig;
    if (!parsed?.password || !parsed?.emails) return null;
    return parsed;
  } catch {
    // Bozuk deger demo yardimcisini kapatir; login akisini asla dusurmez.
    return null;
  }
}

const DEMO_CREDENTIALS = parseDemoCredentials();

/** Portal icin demo hesap; demo modu kapaliysa (prod) null. */
export function demoCredentialsFor(
  portal: Portal,
): { email: string; password: string } | null {
  const email = DEMO_CREDENTIALS?.emails[portal];
  return email ? { email, password: DEMO_CREDENTIALS!.password } : null;
}
