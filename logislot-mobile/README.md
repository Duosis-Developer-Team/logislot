# LogiSlot Mobile

LogiSlot'un iOS + Android uygulaması — **Expo + React Native + TypeScript + Expo Router**.
Web uygulamasıyla (apps/web) **aynı FastAPI backend'ini ve aynı API contract'larını** kullanır;
mobilden yapılan işlem web'de, web'den yapılan işlem mobilde görünür.

## Kurulum

```bash
cd logislot-mobile
npm install
```

> Not: `logislot-mobile` bilinçli olarak kök npm workspace'inin **DIŞINDADIR**
> (kendi `node_modules` + `package-lock.json`'ı vardır). Sebep: web'in Docker
> build'i kök lockfile ile `npm ci` çalıştırır ve mobile RN bağımlılıkları
> lockfile'a girerse web imaj build'i kırılır. Ortak paket çıkarımı
> (packages/shared'ın mobile'dan tüketimi) backlog'dadır.

## Backend URL (env)

`.env` dosyası oluşturun (bkz. `.env.example`):

```bash
# dev cluster (varsayılan — .env yoksa da bu kullanılır)
EXPO_PUBLIC_API_URL=http://84.247.180.172:30081
```

Lokal backend ile çalışırken platforma göre host farkına dikkat:

| Ortam | URL |
|---|---|
| iOS Simulator | `http://localhost:8010` |
| Android Emulator | `http://10.0.2.2:8010` (emülatörde localhost = cihazın kendisi) |
| Fiziksel cihaz | `http://<Mac'inizin-LAN-IP'si>:8010` (aynı Wi-Fi'da) |

## Çalıştırma

```bash
npm run ios        # iOS Simulator (macOS + Xcode gerekir)
npm run android    # Android Emulator (Android Studio gerekir)
npm start          # Expo Dev Server — Expo Go ile fiziksel cihazda QR okutun
```

## Doğrulama

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # expo lint (eslint-config-expo)
npx expo export --platform ios --platform android   # Metro bundle derlemesi
```

## Demo Hesaplar (dev seed)

| Rol | E-posta | Parola |
|---|---|---|
| Tenant/Yönetim | admin@cakesbakes.com | Demo123! |
| Tedarikçi (manuel onay) | tedarikci@anadoluun.com | Demo123! |
| Tedarikçi (otomatik onaylı) | tedarikci@marmarasoguk.com | Demo123! |
| Rampa Yöneticisi | rampa@cakesbakes.com | Demo123! |
| İzleyici | izleyici@cakesbakes.com | Demo123! |

## Mimari

```
app/                    # Expo Router dosya-tabanlı rotalar
  _layout.tsx           # Theme + QueryClient + Session provider'ları
  index.tsx             # role-based yönlendirme (supplier/admin)
  login.tsx             # public portal seçimi (YALNIZ Tedarikçi + Yönetim)
  supplier-login.tsx    # tedarikçi portal girişi (switcher yok)
  admin-login.tsx       # yönetim portal girişi (switcher yok)
  change-password.tsx   # geçici parola akışı
  supplier/             # Tedarikçi: tabs (Randevular, Yeni Randevu, Profil) + detay
  admin/                # Yönetim: tabs (Genel Bakış, Takvim, Randevular, Menü) + detay
  platform/             # (erişilemez) Platform hidden web portalıdır; mobile'da giriş YOKTUR
src/
  api/                  # client (envelope+refresh), auth, supplier, admin, platform, types
  auth/                 # SessionProvider + RoleGuard
  components/           # ui kiti, randevu kartları, ayarlar bölümü, marka
  theme/                # light/dark/system tema + tokenlar (web paletiyle aynı)
  utils/                # tarih/saat yardımcıları (web lib/utils karşılıkları)
assets/brand/           # web'dekiyle aynı logo/ikon assetleri
```

## Auth / Session

- Token'lar **Expo SecureStore**'da (access + refresh + portal).
- 401'de **tek-uçuş refresh** (web client'ıyla aynı algoritma, rotation uyumlu).
- Refresh de düşerse: SecureStore + query cache temizlenir, login'e resetlenir.
- Logout: backend `/auth/logout` (best-effort) → SecureStore temizliği →
  query cache temizliği → login'e navigation reset.
- Soğuk başlangıçta oturum SecureStore'dan geri yüklenir (`/auth/me` doğrular).
- `must_change_password` → change-password ekranına yönlenir.

## Tema

Açık / Koyu / Sistem — profil/menü ekranlarından değiştirilir, SecureStore'da
kalıcıdır. Renk tokenları web `globals.css` paletiyle aynıdır (derin navy marka +
logistics mavi accent + aynı statü renkleri).

## Bilinen Sınırlar (backlog: docs/FEATURE_PARITY_MATRIX.md)

- **Platform Yönetimi mobile'da BİLİNÇLİ olarak yoktur** (hidden internal web
  portalı — bkz. `docs/PORTAL_ISOLATION_AND_ROUTING.md`). Platform hesabıyla
  mobile public akışlarından giriş yapılamaz.
- Shared types paketi çıkarımı backlog'da (şimdilik senkron kopya).
- Native push bildirimleri backlog'da (in-app bildirim merkezi mevcut).

## Feature Parity Kuralı

Bundan sonra her feature web + mobile birlikte teslim edilir —
bkz. `docs/WEB_MOBILE_PARITY.md` (Definition of Done) ve
`docs/FEATURE_PARITY_MATRIX.md` (durum matrisi).
