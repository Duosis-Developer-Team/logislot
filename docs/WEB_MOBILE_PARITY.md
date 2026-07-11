# Web/Mobile Feature Parity — Definition of Done

**Kural:** Bundan sonra hiçbir feature yalnızca web'de kalmaz. Bir feature web'de
geliştirildiyse mobile karşılığı (veya bilinçli, matrise işlenmiş bir erteleme
kararı) **aynı sprint DoD'sinin parçasıdır**. Mobile eksik bırakılamaz.

Uygulamalar aynı backend'i paylaşır:
- Web: `apps/web` (Next.js) — API client: `apps/web/src/lib/api/`
- Mobile: `logislot-mobile` (Expo RN) — API client: `logislot-mobile/src/api/`
- Backend: `apps/api` (FastAPI) — **tek doğruluk kaynağı** (RBAC, kurallar, audit)

## Her yeni feature için Definition of Done

### Backend
- [ ] API endpoint hazır ve **backward-compatible** (mevcut client'lar kırılmaz)
- [ ] RBAC / permission kontrolleri backend'de (client'a güvenilmez)
- [ ] Validation backend'de
- [ ] Pytest testleri
- [ ] API contract'ı iki client type dosyasına yansıtıldı:
      `apps/web/src/lib/api/types.ts` **ve** `logislot-mobile/src/api/types.ts`
      (bu iki dosya senkron tutulur; ileride tek shared pakete taşınacak)

### Web
- [ ] UI hazır (paylaşılan primitiflerle, token'lı renkler)
- [ ] Loading / error / empty state'ler
- [ ] Rol/permission görünürlüğü (`can()`)
- [ ] Light + dark mode
- [ ] Playwright smoke (kritik akışsa)

### Mobile
- [ ] Ekran/flow hazır (mobile-native UX; web kopyası değil — tablo→card/list/detail)
- [ ] **Aynı API contract** (endpoint + DTO webdekiyle birebir)
- [ ] Rol/permission görünürlüğü (`can()` + RoleGuard) ve backend 403 handle
- [ ] Loading / error / empty state'ler
- [ ] Light + dark + system tema
- [ ] Navigation entegrasyonu (tab/stack, role-based)
- [ ] `npm run typecheck` + `npm run lint` + `npx expo export` yeşil

### QA
- [ ] Web smoke (dev'e karşı Playwright)
- [ ] Mobile iOS smoke (simulator)
- [ ] Mobile Android smoke (emulator)
- [ ] **Cross-platform veri tutarlılığı:**
  - [ ] Mobile'da yapılan değişiklik web'de görünür
  - [ ] Web'de yapılan değişiklik mobile'da görünür (pull-to-refresh/refetch sonrası)

## Erteleme kuralı

Bir feature'ın mobile karşılığı aynı sprintte teslim edilemiyorsa:
1. `docs/FEATURE_PARITY_MATRIX.md`'de satırı **Partial/Missing** olarak işaretle,
2. Notes'a gerekçe + hedef sprint yaz,
3. Rapora "Eksikler / Backlog" bölümünde açıkça geçir.

Sessiz eksik bırakmak DoD ihlalidir.
