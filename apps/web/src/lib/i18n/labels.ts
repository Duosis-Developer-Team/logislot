"use client";

import {
  APPOINTMENT_STATUS_LABELS_BY_LOCALE,
  CARGO_WINDOW_LABELS_BY_LOCALE,
  DELIVERY_TYPE_LABELS_BY_LOCALE,
  QUANTITY_UNIT_LABELS_BY_LOCALE,
  SLOT_STATUS_LABELS_BY_LOCALE,
  TICKET_CATEGORY_HINTS_BY_LOCALE,
  TICKET_CATEGORY_LABELS_BY_LOCALE,
  TICKET_DELIVERY_STATUS_LABELS_BY_LOCALE,
  TICKET_IMPACT_LABELS_BY_LOCALE,
  TICKET_RESOLUTION_CODE_LABELS_BY_LOCALE,
  TICKET_STATUS_GROUP_LABELS_BY_LOCALE,
  TICKET_STATUS_LABELS_BY_LOCALE,
} from "@logislot/shared";
import { useLocale } from "@/lib/i18n/provider";

/**
 * Alan adi etiketleri (durum, birim, kategori…) secili dilde.
 *
 * Bu degerler `packages/shared`'da yasar cunku mobil de kullanir; mobil bu
 * turda cevrilmedigi icin oradaki Turkce sabitler AYNEN durur ve web yalnizca
 * dile gore secim yapar.
 */
export function useLabels() {
  const { locale } = useLocale();
  return {
    appointmentStatus: APPOINTMENT_STATUS_LABELS_BY_LOCALE[locale],
    deliveryType: DELIVERY_TYPE_LABELS_BY_LOCALE[locale],
    cargoWindow: CARGO_WINDOW_LABELS_BY_LOCALE[locale],
    quantityUnit: QUANTITY_UNIT_LABELS_BY_LOCALE[locale],
    slotStatus: SLOT_STATUS_LABELS_BY_LOCALE[locale],
    ticketStatus: TICKET_STATUS_LABELS_BY_LOCALE[locale],
    ticketCategory: TICKET_CATEGORY_LABELS_BY_LOCALE[locale],
    ticketCategoryHint: TICKET_CATEGORY_HINTS_BY_LOCALE[locale],
    ticketImpact: TICKET_IMPACT_LABELS_BY_LOCALE[locale],
    ticketResolution: TICKET_RESOLUTION_CODE_LABELS_BY_LOCALE[locale],
    ticketDelivery: TICKET_DELIVERY_STATUS_LABELS_BY_LOCALE[locale],
    ticketStatusGroup: TICKET_STATUS_GROUP_LABELS_BY_LOCALE[locale],
    /** Bilinmeyen bir kod (yeni backend degeri) kodun kendisiyle gosterilir —
     *  ekran bos bir hucre yerine ham degeri gostersin. */
    ticketCategoryLabel: (category: string) =>
      (TICKET_CATEGORY_LABELS_BY_LOCALE[locale] as Record<string, string>)[category] ??
      category,
    ticketImpactLabel: (impact: string) =>
      (TICKET_IMPACT_LABELS_BY_LOCALE[locale] as Record<string, string>)[impact] ?? impact,
  };
}
