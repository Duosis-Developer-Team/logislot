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
