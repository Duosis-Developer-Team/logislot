/**
 * Turkce sozluk — KAYNAK dildir ve sekli `en.ts` icin tip sozlesmesidir.
 *
 * Nesne olarak kullanilir (`t.common.save`), dize anahtarla degil: eksik ya da
 * yanlis yazilmis bir anahtar DERLEMEDE yakalanir. Degisken tasiyan metinler
 * fonksiyondur (`t.common.showingCount({ count })`) — sablon parcalarini
 * bilesende birlestirmek, kelime sirasi degisen dillerde bozulurdu.
 */
export const tr = {
  common: {
    save: "Kaydet",
    cancel: "Vazgeç",
    close: "Kapat",
    delete: "Sil",
    edit: "Düzenle",
    create: "Oluştur",
    search: "Ara",
    retry: "Tekrar Dene",
    loading: "Yükleniyor…",
    detail: "Detay",
    actions: "İşlem",
    active: "Aktif",
    inactive: "Pasif",
    optional: "Opsiyonel",
    required: "Zorunlu",
    yes: "Evet",
    no: "Hayır",
    all: "Tümü",
    none: "—",
    back: "Geri",
    next: "İleri",
    submit: "Gönder",
    confirm: "Onayla",
    home: "Ana sayfa",
    menu: "Menü",
    closeMenu: "Menüyü kapat",
    user: "Kullanıcı",
    logout: "Çıkış Yap",
    downloadCsv: "CSV indir",
    exportHint: "Ekranda görünen kayıtları CSV olarak indir",
  },

  language: {
    label: "Dil",
    switchTo: "Switch to English",
    tr: "Türkçe",
    en: "English",
  },

  theme: {
    toLight: "Aydınlık moda geç",
    toDark: "Karanlık moda geç",
    light: "Aydınlık mod",
    dark: "Karanlık mod",
  },

  states: {
    errorGeneric: "Bir şeyler ters gitti.",
    emptyTitle: "Kayıt bulunamadı",
    verifyingSession: "Oturum doğrulanıyor…",
    unauthorizedTitle: "Bu panele erişim yetkiniz yok",
    goToLogin: "Giriş sayfasına dön",
  },

  errors: {
    /** API hata KODUNA gore metin. Backend Turkce mesaj doner; kod stabil
     *  oldugu icin ceviri burada yapilir — sunucuda dil tutmaya gerek kalmaz.
     *  Listede olmayan kod icin sunucunun mesaji gosterilir. */
    byCode: {
      UNAUTHORIZED: "E-posta veya parola hatalı.",
      FORBIDDEN: "Bu işlem için yetkiniz yok.",
      NOT_FOUND: "Kayıt bulunamadı.",
      VALIDATION_ERROR: "Gönderilen bilgiler geçersiz.",
      RATE_LIMITED: "Çok fazla deneme yapıldı; lütfen biraz bekleyin.",
      DUPLICATE_EMAIL: "Bu e-posta zaten bir kullanıcıya ait.",
      DUPLICATE_NAME: "Bu ad zaten kullanılıyor.",
      DUPLICATE_CODE: "Bu kod zaten kullanılıyor.",
      ACCOUNT_EXISTS: "Bu tedarikçinin zaten bir portal hesabı var.",
      ACCOUNT_NOT_FOUND: "Portal hesabı bulunamadı.",
      INVALID_CURRENT_PASSWORD: "Mevcut parola hatalı.",
      SAME_PASSWORD: "Yeni parola mevcut parolayla aynı olamaz.",
      WEAK_PASSWORD: "Parola politikaya uymuyor.",
      PASSWORD_CHANGE_REQUIRED: "Devam etmeden önce parolanızı değiştirmeniz gerekiyor.",
      LAST_ADMIN: "Son yönetici hesabı pasifleştirilemez.",
      SYSTEM_ROLE_LOCKED: "Sistem rolleri değiştirilemez.",
      INVALID_PERMISSION: "Geçersiz yetki tanımı.",
      INVALID_REFERENCE: "Seçilen kayıt bu tesise ait değil.",
      INVALID_STATUS_TRANSITION: "Bu durum değişikliği yapılamaz.",
      RULE_VIOLATION: "İşlem kurallara aykırı.",
      BULK_TOO_LARGE: "Tek seferde çok fazla kayıt gönderildi.",
      RANGE_TOO_LARGE: "Seçilen tarih aralığı çok geniş.",
      APPOINTMENT_IN_PAST: "Geçmiş bir zamana randevu oluşturulamaz.",
      SLOT_NO_LONGER_AVAILABLE: "Seçilen zaman aralığı artık müsait değil.",
      DOCK_TIME_CONFLICT: "Rampa bu saatte dolu.",
      DOCK_CLOSED_BY_OVERRIDE: "Rampa o gün kapalı.",
      DOCK_OUTSIDE_WORKING_HOURS: "Seçilen saat çalışma saatleri dışında.",
      DOCK_CONFLICT_GROUP_BLOCKED: "Çakışan bir rampa aynı saatte kullanılıyor.",
      NO_COMPATIBLE_DOCK: "Bu yükü kabul eden uygun rampa yok.",
      SUPPLIER_INACTIVE: "Tedarikçi hesabı pasif durumda.",
      SUPPLIER_QUOTA_EXCEEDED: "Randevu kotanız doldu.",
      SUPPLIER_CATEGORY_NOT_ALLOWED: "Bu ürün kategorisi için yetkiniz yok.",
      CARGO_NOT_ENABLED: "Bu tedarikçi için kargo teslimat kapalı.",
      RECURRING_CARGO_NOT_SUPPORTED: "Kargo teslimat için tekrarlayan seri oluşturulamaz.",
      NO_FUTURE_OCCURRENCES: "İleri tarihli tekrar bulunmuyor.",
      NO_REVISION_PENDING_OCCURRENCES: "Revize bekleyen tekrar bulunmuyor.",
      TENANT_ARCHIVED: "Arşivlenmiş müşteri hesabı üzerinde işlem yapılamaz.",
      TENANT_FACILITY_EXISTS: "Bu müşteri hesabının zaten bir tesisi var.",
      TENANT_DATASTORE_NOT_READY: "Müşteri veri alanı henüz hazır değil.",
      PLAN_NOT_ASSIGNABLE: "Bu plan atanabilir durumda değil.",
      PLAN_TENANT_LIMIT_REACHED: "Plan müşteri sınırına ulaşıldı.",
      NO_BRANDED_HOST: "Bu hesap için markalı alan adı tanımlı değil.",
      TICKET_FEATURE_DISABLED: "Destek talebi özelliği kapalı.",
      TICKET_ROUTE_NOT_READY: "Destek yönlendirmesi henüz hazır değil.",
      TICKET_STATE_INVALID: "Talep bu işlem için uygun durumda değil.",
      TICKET_ATTACHMENT_TYPE: "Bu dosya türü desteklenmiyor.",
      TICKET_ATTACHMENT_TOO_LARGE: "Dosya boyutu sınırı aşıldı.",
      TICKET_ATTACHMENT_LIMIT: "Ek dosya sayısı sınırı aşıldı.",
      TICKET_ATTACHMENT_TOTAL_LIMIT: "Toplam ek dosya boyutu sınırı aşıldı.",
      TICKET_ATTACHMENT_NOT_READY: "Dosya henüz hazır değil; güvenlik kontrolü sürüyor.",
      TICKET_ATTACHMENT_IN_USE: "Ek dosya başka bir talebe bağlı.",
      TICKET_ATTACHMENT_UNKNOWN: "Ek dosya bulunamadı.",
    } as Record<string, string>,
    network: "Sunucuya ulaşılamadı; bağlantınızı kontrol edin.",
    unexpected: "Beklenmeyen bir hata oluştu.",
  },

  nav: {
    admin: {
      dashboard: "Genel Bakış",
      calendar: "Takvim",
      appointments: "Randevular",
      series: "Seriler",
      reports: "Raporlar",
      tickets: "Destek Talepleri",
      settings: "Yönetim",
    },
    supplier: {
      appointments: "Randevularım",
      newAppointment: "Yeni Randevu",
      tickets: "Destek",
      profile: "Profil",
    },
    platform: {
      tenants: "Müşteri Hesapları",
      usage: "Kullanım & Sağlık",
      plans: "Planlar",
      support: "Sistem Sağlığı",
      ticketRouting: "Ticket Yönlendirmesi",
      auditLogs: "Denetim İzleri",
    },
    role: {
      admin: "Yönetim",
      supplier: "Tedarikçi",
      platform: "Platform",
    },
  },
};

/** Sozluk SEKLI. `as const` KULLANILMAZ: literal tipler `en.ts`'in her degerini
 *  Turkce dizeye esitler ve ceviri yazilamaz hale gelirdi. */
export type Dictionary = typeof tr;
