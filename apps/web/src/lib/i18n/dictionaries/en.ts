import type { Dictionary } from "@/lib/i18n/dictionaries/tr";

/**
 * English dictionary.
 *
 * Typed as `Dictionary`, so a missing or renamed key is a COMPILE error — the
 * two dictionaries can never drift apart silently.
 *
 * Wording follows the product, not the Turkish sentence: e.g. "Rampa" is a
 * loading dock, "Randevu" is a delivery appointment/slot, "Tedarikçi" is a
 * supplier. Literal translations would read wrong to a logistics audience.
 */
export const en: Dictionary = {
  common: {
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    delete: "Delete",
    edit: "Edit",
    create: "Create",
    search: "Search",
    retry: "Try again",
    loading: "Loading…",
    detail: "Details",
    actions: "Actions",
    active: "Active",
    inactive: "Inactive",
    optional: "Optional",
    required: "Required",
    yes: "Yes",
    no: "No",
    all: "All",
    none: "—",
    back: "Back",
    next: "Next",
    submit: "Submit",
    confirm: "Confirm",
    home: "Home",
    menu: "Menu",
    closeMenu: "Close menu",
    user: "User",
    logout: "Sign out",
    downloadCsv: "Download CSV",
    exportHint: "Download the rows currently shown as CSV",
  },

  language: {
    label: "Language",
    switchTo: "Türkçe'ye geç",
    tr: "Türkçe",
    en: "English",
  },

  theme: {
    toLight: "Switch to light mode",
    toDark: "Switch to dark mode",
    light: "Light mode",
    dark: "Dark mode",
  },

  states: {
    errorGeneric: "Something went wrong.",
    emptyTitle: "No records found",
    verifyingSession: "Verifying your session…",
    unauthorizedTitle: "You don't have access to this panel",
    goToLogin: "Back to sign in",
  },

  nav: {
    admin: {
      dashboard: "Overview",
      calendar: "Calendar",
      appointments: "Appointments",
      series: "Recurring series",
      reports: "Reports",
      tickets: "Support requests",
      settings: "Administration",
    },
    supplier: {
      appointments: "My appointments",
      newAppointment: "New appointment",
      tickets: "Support",
      profile: "Profile",
    },
    platform: {
      tenants: "Customer accounts",
      usage: "Usage & health",
      plans: "Plans",
      support: "System health",
      ticketRouting: "Ticket routing",
      auditLogs: "Audit trail",
    },
    role: {
      admin: "Operations",
      supplier: "Supplier",
      platform: "Platform",
    },
  },
};
