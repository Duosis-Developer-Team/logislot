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

  landing: {
    hero: {
      chips: [
        "Facility-specific rules",
        "Smart dock allocation",
        "Live availability",
        "Supplier portal",
      ],
      titleLead: "Smart goods receiving and",
      titleAccent: "dock scheduling",
      titleTail: "platform",
      subtitle:
        "Manage supplier bookings, dock availability and the whole delivery flow in one modern operations platform.",
      requestDemo: "Request a demo",
      alreadyUser: "Already a user? Pick your portal below.",
      choosePortal: "Choose your portal",
      cardDockTime: "Dock 2 · 09:30",
      cardApproved: "Approved",
      cardCargoTitle: "Courier alert",
      cardCargoWindow: "Morning window",
      cardVehicle: "Vehicle class: Semi-trailer",
      cardSlotsToday: "Today's slots",
    },
    features: {
      eyebrow: "What it does",
      title: "A booking engine that understands how your yard actually works",
      items: [
        {
          title: "Smart dock allocation",
          text: "Product type, vehicle class and facility rules are weighed together, so suppliers only ever see real availability.",
        },
        {
          title: "Facility-specific rules",
          text: "Each site configures its own docks, working pattern, handling times per category and vehicle compatibility.",
        },
        {
          title: "Dock conflict groups",
          text: "Adjacent docks or areas sharing physical capacity are modelled as rules, so clashes are blocked automatically.",
        },
        {
          title: "Supplier portal",
          text: "Suppliers book slots, follow their status and take part in cancellation or change flows when needed.",
        },
        {
          title: "Courier alert layer",
          text: "Deliveries with no fixed arrival appear as a separate alert layer on the schedule, so planners see them coming.",
        },
        {
          title: "Multi-site SaaS architecture",
          text: "Customers and locations are kept safely apart through the tenant and facility model.",
        },
      ],
    },
    problems: {
      title: "Is goods-in still being run out of an inbox?",
      subtitle:
        "When unbooked vehicles, full docks and last-minute surprises set the day's plan, the problem isn't the people — it's the process.",
      footnote:
        "The result: vehicles queueing, dock hours going to waste and a day run over the phone.",
      items: [
        {
          title: "Scattered requests",
          text: "Supplier requests arrive by e-mail and phone; nothing is captured in one place.",
        },
        {
          title: "Invisible utilisation",
          text: "Dock occupancy isn't visible in real time, so planning is guesswork.",
        },
        {
          title: "Mismatches found too late",
          text: "Vehicle type and dock compatibility only surface once the lorry is at the gate.",
        },
        {
          title: "Courier uncertainty",
          text: "Courier arrival times are unknown, and the day's plan falls apart around them.",
        },
        {
          title: "Disconnected teams",
          text: "Planning, warehouse and supplier never see the same list.",
        },
      ],
    },
    solution: {
      title: "LogiSlot brings every booking into one flow.",
      subtitle:
        "The supplier enters the goods, vehicle and delivery details; the system shows real availability based on your facility's rules. The operations panel handles approvals, changes, the schedule and day-to-day tracking in one place.",
      columns: [
        {
          title: "Easy booking for suppliers",
          text: "Goods, vehicle and delivery details in a few steps — available times appear instantly.",
        },
        {
          title: "Rule-based approvals and schedule for operations",
          text: "Approve, reschedule and cancel on one calendar, with every action recorded.",
        },
        {
          title: "Real capacity and conflict checks for the site",
          text: "Dock suitability, working hours and physical constraints are evaluated automatically.",
        },
      ],
    },
    howItWorks: {
      eyebrow: "How it works",
      title: "A simple booking flow with strong rules behind it.",
      step: (index: number) => `Step ${index}`,
      steps: [
        {
          title: "Pick the goods and category",
          text: "The supplier enters the product, quantity and category.",
          chips: ["Bakery", "Chilled", "Packaging"],
        },
        {
          title: "Set the vehicle and delivery type",
          text: "Vehicle class, number plate, driver and scheduled/courier delivery type.",
          chips: ["Semi-trailer", "34 ABC 123", "Scheduled"],
        },
        {
          title: "Take a slot from live availability",
          text: "The system weighs dock, vehicle and conflict rules, then offers the times that actually work.",
          chips: ["08:30", "09:30", "11:00"],
        },
      ],
    },
  },

  auth: {
    portals: {
      supplier: {
        title: "Supplier Portal",
        short: "Supplier",
        description: "Request and track delivery slots",
        subtitle:
          "Book your delivery appointments, track them and see their current status.",
        buttonLabel: "Sign in to the Supplier Portal",
        wrongRole:
          "This account isn't authorised for the Supplier Portal. Please sign in through the right portal.",
      },
      admin: {
        title: "Operations Panel",
        short: "Operations",
        description: "Schedule, approvals and facility settings",
        subtitle: "Manage your dock schedule, approval flow and facility operations.",
        buttonLabel: "Sign in to the Operations Panel",
        wrongRole:
          "This account isn't authorised for the Operations Panel. Please sign in through the right portal.",
      },
      platform: {
        title: "Platform Administration",
        short: "Platform",
        description: "Customer accounts, usage and plans",
        subtitle: "Manage customer accounts, facilities, plans and system health.",
        buttonLabel: "Sign in to Platform Administration",
        wrongRole: "This account isn't authorised for Platform Administration.",
      },
    },
    email: "E-mail",
    password: "Password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    signingIn: "Signing in…",
    failed: "Sign-in failed — check that the API is reachable.",
    backToPortals: "Back to portal selection",
    handoffPending: "Signing you in…",
    handoffFailed: "We couldn't transfer your session. The link may have expired.",
    handoffBackToLogin: "Back to sign in",
    changePassword: {
      title: "Change password",
      subtitle: "You signed in with a temporary password — please choose a new one.",
      current: "Current password",
      new: "New password",
      confirm: "New password (repeat)",
      policy: "At least 10 characters, including a letter, a number and a symbol.",
      mismatch: "The new passwords don't match.",
      failed: "We couldn't change your password — please try again.",
      saving: "Saving…",
      submit: "Change password",
    },
    copyDemo: "Copy demo account",
  },

  errors: {
    byCode: {
      UNAUTHORIZED: "Incorrect e-mail or password.",
      FORBIDDEN: "You don't have permission to do this.",
      NOT_FOUND: "Record not found.",
      VALIDATION_ERROR: "Some of the details you entered are invalid.",
      RATE_LIMITED: "Too many attempts — please wait a moment.",
      DUPLICATE_EMAIL: "This e-mail already belongs to another user.",
      DUPLICATE_NAME: "That name is already in use.",
      DUPLICATE_CODE: "That code is already in use.",
      ACCOUNT_EXISTS: "This supplier already has a portal account.",
      ACCOUNT_NOT_FOUND: "Portal account not found.",
      INVALID_CURRENT_PASSWORD: "Your current password is incorrect.",
      SAME_PASSWORD: "The new password must differ from the current one.",
      WEAK_PASSWORD: "That password doesn't meet the policy.",
      PASSWORD_CHANGE_REQUIRED: "You need to change your password before continuing.",
      LAST_ADMIN: "The last administrator account cannot be deactivated.",
      SYSTEM_ROLE_LOCKED: "System roles cannot be changed.",
      INVALID_PERMISSION: "Invalid permission.",
      INVALID_REFERENCE: "The selected record doesn't belong to this facility.",
      INVALID_STATUS_TRANSITION: "That status change isn't allowed.",
      RULE_VIOLATION: "This action breaks a scheduling rule.",
      BULK_TOO_LARGE: "Too many records were sent at once.",
      RANGE_TOO_LARGE: "The selected date range is too wide.",
      APPOINTMENT_IN_PAST: "An appointment cannot be booked in the past.",
      SLOT_NO_LONGER_AVAILABLE: "That time slot is no longer available.",
      DOCK_TIME_CONFLICT: "The dock is already booked at that time.",
      DOCK_CLOSED_BY_OVERRIDE: "The dock is closed on that day.",
      DOCK_OUTSIDE_WORKING_HOURS: "That time falls outside working hours.",
      DOCK_CONFLICT_GROUP_BLOCKED: "A conflicting dock is in use at the same time.",
      NO_COMPATIBLE_DOCK: "No dock can accept this load.",
      SUPPLIER_INACTIVE: "This supplier account is inactive.",
      SUPPLIER_QUOTA_EXCEEDED: "You have used up your booking quota.",
      SUPPLIER_CATEGORY_NOT_ALLOWED: "You aren't approved for this product category.",
      CARGO_NOT_ENABLED: "Courier delivery is disabled for this supplier.",
      RECURRING_CARGO_NOT_SUPPORTED: "Courier deliveries can't be booked as a recurring series.",
      NO_FUTURE_OCCURRENCES: "There are no upcoming occurrences.",
      NO_REVISION_PENDING_OCCURRENCES: "No occurrence is awaiting a change.",
      TENANT_ARCHIVED: "This customer account is archived.",
      TENANT_FACILITY_EXISTS: "This customer account already has a facility.",
      TENANT_DATASTORE_NOT_READY: "The customer's data area isn't ready yet.",
      PLAN_NOT_ASSIGNABLE: "This plan can't be assigned.",
      PLAN_TENANT_LIMIT_REACHED: "The plan's customer limit has been reached.",
      NO_BRANDED_HOST: "No branded domain is set for this account.",
      TICKET_FEATURE_DISABLED: "Support requests are disabled.",
      TICKET_ROUTE_NOT_READY: "Support routing isn't ready yet.",
      TICKET_STATE_INVALID: "The request isn't in a state that allows this.",
      TICKET_ATTACHMENT_TYPE: "That file type isn't supported.",
      TICKET_ATTACHMENT_TOO_LARGE: "The file exceeds the size limit.",
      TICKET_ATTACHMENT_LIMIT: "Too many attachments.",
      TICKET_ATTACHMENT_TOTAL_LIMIT: "The attachments exceed the total size limit.",
      TICKET_ATTACHMENT_NOT_READY: "The file isn't ready yet; the security scan is still running.",
      TICKET_ATTACHMENT_IN_USE: "That attachment belongs to another request.",
      TICKET_ATTACHMENT_UNKNOWN: "Attachment not found.",
    },
    network: "Couldn't reach the server — check your connection.",
    unexpected: "Something unexpected went wrong.",
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
