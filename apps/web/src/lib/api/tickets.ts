"use client";

/**
 * Destek ticket hook'lari — yonetim ve tedarikci portallari icin.
 *
 * Iki portal AYNI bilesenleri kullanir; tek fark yol onekidir. Bu yuzden
 * hook'lar bir fabrikadan uretilir: veri sekli ve invalidation davranisi
 * tek yerde tanimli kalir.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  BASE_URL,
  apiRequest,
  authorizedFetch,
  getStoredToken,
} from "@/lib/api/client";
import type {
  TicketConfigDto,
  TicketDetailDto,
  TicketRowDto,
  TicketUploadSessionDto,
} from "@/lib/api/types";

/** Gonderim bekleyen kayit varken liste daha sik tazelenir. */
const PENDING_POLL_MS = 8_000;

export interface TicketListParams {
  statusGroup?: string;
  category?: string;
  search?: string;
}

function buildQuery(params: TicketListParams): string {
  const query = new URLSearchParams();
  if (params.statusGroup) query.set("status_group", params.statusGroup);
  if (params.category) query.set("category", params.category);
  if (params.search?.trim()) query.set("search", params.search.trim());
  const text = query.toString();
  return text ? `?${text}` : "";
}

function makeTicketApi(prefix: string, keyRoot: string) {
  const key = (...parts: unknown[]) => [keyRoot, ...parts];

  function useConfig() {
    return useQuery({
      queryKey: key("config"),
      queryFn: () => apiRequest<TicketConfigDto>(`${prefix}/config`),
      staleTime: 60_000,
    });
  }

  function useList(params: TicketListParams) {
    return useQuery({
      queryKey: key("list", params),
      queryFn: () => apiRequest<TicketRowDto[]>(`${prefix}${buildQuery(params)}`),
      // Filtre/arama degisince onceki sonuclar ekranda KALIR: aksi halde her
      // sekme ve her arama tusunda liste kaybolup yukleme durumuna dusuyordu.
      placeholderData: keepPreviousData,
      // Gonderim/senkron bekleyen satir varsa kisa araliklarla tazele: kanonik
      // TKT numarasi ve durum degisiklikleri kullanicinin gozu onunde olusur.
      refetchInterval: (query) =>
        (query.state.data ?? []).some(
          (t) => t.delivery_status !== "synced" || t.sync_gap,
        )
          ? PENDING_POLL_MS
          : false,
    });
  }

  function useDetail(ticketId: string | null) {
    return useQuery({
      queryKey: key("detail", ticketId),
      queryFn: () => apiRequest<TicketDetailDto>(`${prefix}/${ticketId}`),
      enabled: !!ticketId,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return false;
        const pending =
          data.delivery_status !== "synced" ||
          data.sync_gap ||
          data.messages.some((m) => m.is_pending);
        return pending ? PENDING_POLL_MS : false;
      },
    });
  }

  function useMutations() {
    const queryClient = useQueryClient();
    const invalidate = () => queryClient.invalidateQueries({ queryKey: [keyRoot] });

    const create = useMutation({
      mutationFn: (body: unknown) =>
        apiRequest<TicketDetailDto>(prefix, { method: "POST", body }),
      onSuccess: invalidate,
    });
    const reply = useMutation({
      mutationFn: ({ id, body }: { id: string; body: unknown }) =>
        apiRequest<TicketDetailDto>(`${prefix}/${id}/messages`, {
          method: "POST",
          body,
        }),
      onSuccess: invalidate,
    });
    const reopen = useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) =>
        apiRequest<TicketDetailDto>(`${prefix}/${id}/reopen`, {
          method: "POST",
          body: { reason },
        }),
      onSuccess: invalidate,
    });
    const confirmClose = useMutation({
      mutationFn: (id: string) =>
        apiRequest<TicketDetailDto>(`${prefix}/${id}/confirm-close`, {
          method: "POST",
        }),
      onSuccess: invalidate,
    });
    const cancel = useMutation({
      mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
        apiRequest<TicketDetailDto>(`${prefix}/${id}/cancel`, {
          method: "POST",
          body: { reason: reason ?? null },
        }),
      onSuccess: invalidate,
    });
    return { create, reply, reopen, confirmClose, cancel };
  }

  /**
   * Dosyayi yukler ve `upload_id` dondurur.
   *
   * Akis: backend'den kisa omurlu bir yukleme adresi alinir, dosya DOGRUDAN
   * o adrese PUT edilir, sonra backend'e "tamamlandi" denir. Hermes servis
   * kimligi hicbir adimda tarayiciya gelmez.
   */
  async function uploadAttachment(
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<{ upload_id: string; scan_status: string }> {
    const session = await apiRequest<TicketUploadSessionDto>(
      `${prefix}/attachments/sessions`,
      {
        method: "POST",
        body: {
          file_name: file.name,
          size_bytes: file.size,
          declared_mime_type: resolveMimeType(file),
        },
      },
    );

    await putWithProgress(session, file, onProgress);

    const completed = await apiRequest<{ upload_id: string; scan_status: string }>(
      `${prefix}/attachments/${session.upload_id}/complete`,
      { method: "POST" },
    );
    return completed;
  }

  /**
   * Ek dosyayi indirir.
   *
   * Basit bir <a href> KULLANILAMAZ: uc nokta Authorization basligi ister ve
   * tarayici gezinme isteklerine bu basligi eklemez. `authorizedFetch` 401'de
   * token yenilemesini de calistirir.
   */
  async function downloadAttachment(
    ticketId: string,
    attachmentId: string,
    fileName: string,
  ): Promise<void> {
    const response = await authorizedFetch(
      `${prefix}/${ticketId}/attachments/${attachmentId}/download`,
    );
    if (!response.ok) throw new ApiError("download_failed", "Dosya indirilemedi");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return {
    useConfig,
    useList,
    useDetail,
    useMutations,
    uploadAttachment,
    downloadAttachment,
  };
}

/**
 * Dosyanin gonderilecek MIME turu.
 *
 * Tarayicilar `.log` (ve bazen `.txt`) icin BOS bir tur bildirir; ham degeri
 * gondermek, sozlesmede acikca desteklenen log dosyalarinin reddedilmesi
 * demekti. Uzantidan turetmek yalnizca ETIKETI duzeltir; asil dogrulama
 * Hermes tarafinda icerik imzasina (magic byte) bakarak yapilir.
 */
export function resolveMimeType(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  if (extension === "log" || extension === "txt") return "text/plain";
  return "application/octet-stream";
}

/** Yukleme ilerlemesi icin XHR — fetch progress olayi sunmaz. */
/**
 * Dosyayi yukleme adresine PUT eder (ilerleme cubugu icin XHR).
 *
 * Adres KENDI API'mizin goreli yoludur (`/tickets/attachments/…/content`):
 * Hermes'in verdigi adres tarayicidan kullanilamiyor (servis token'i ister,
 * CORS izni vermez), o yuzden baytlar backend uzerinden geciyor. Bu yuzden
 * istege oturum token'i EKLENIR — ama yalnizca adres bize aitse; ucuncu taraf
 * bir adrese token gonderilmez.
 */
/** XHR yanitindaki API zarfindan kullaniciya gosterilebilir mesaji cikarir. */
function errorMessageFrom(request: XMLHttpRequest): string | null {
  try {
    const body = JSON.parse(request.responseText) as {
      error?: { message?: string };
    };
    return body.error?.message ?? null;
  } catch {
    return null;
  }
}

function putWithProgress(
  session: TicketUploadSessionDto,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const isOwnApi = session.upload_url.startsWith("/");
  const url = isOwnApi ? `${BASE_URL}${session.upload_url}` : session.upload_url;
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url, true);
    if (isOwnApi) {
      const token = getStoredToken();
      if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);
      request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    }
    Object.entries(session.required_headers ?? {}).forEach(([name, value]) =>
      request.setRequestHeader(name, value),
    );
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return resolve();
      // Sebebi GOSTER: "Dosya yüklenemedi" kullaniciya ne oldugunu da ne
      // yapacagini da anlatmiyordu. Kendi API'miz yapili zarf donuyor.
      reject(
        new ApiError("upload_failed", errorMessageFrom(request) ?? "Dosya yüklenemedi"),
      );
    };
    request.onerror = () =>
      reject(
        new ApiError("upload_network_error", "Dosya yüklenemedi — bağlantı kurulamadı."),
      );
    request.send(file);
  });
}

export const adminTickets = makeTicketApi("/tickets", "admin-tickets");
export const supplierTickets = makeTicketApi("/supplier/tickets", "supplier-tickets");

export type TicketApi = ReturnType<typeof makeTicketApi>;
