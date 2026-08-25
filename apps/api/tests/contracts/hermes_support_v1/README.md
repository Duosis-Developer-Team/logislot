# Hermes ↔ LogiSlot destek sözleşmesi v1 — fixture'lar

Bu dizin `hermes-logislot-ticketing-cto-pack-v1.0/00_SHARED_PLATFORM/04_API_AND_EVENT_CONTRACT.md`
dosyasının **çalıştırılabilir** karşılığıdır. Amaç, iki reponun aynı alan adları,
enum değerleri ve zarf yapısı üzerinde anlaşmasını CI'da doğrulanabilir kılmaktır.

## Kural

- **Bu dosyalar iki repoda BİREBİR aynıdır.** Hermes tarafı aynı dizini
  (`hermes_support_v1/`) kendi test ağacına kopyalar.
- Parite `MANIFEST.json` içindeki SHA-256 özetleriyle doğrulanır
  (`tests/test_ticketing_contract.py`). Bir alan sessizce değişirse test kırmızı olur.
- **Tek taraflı değişiklik yapılmaz.** Değişiklik gerekiyorsa önce ortak karar
  günlüğü güncellenir, sonra iki repoda aynı commit içeriğiyle fixture yenilenir.

## Dosyalar

| Dosya | Karşılığı |
|---|---|
| `routing_groups_response.json` | `GET /support/routing-groups` |
| `route_validate_request.json` / `route_validate_response.json` | `POST /support/routes/validate` |
| `attachment_session_request.json` / `attachment_session_response.json` | `POST /support/attachments/sessions` |
| `ticket_create_request.json` / `ticket_create_response.json` | `POST /support/tickets` |
| `ticket_snapshot_response.json` | `GET /support/tickets/by-source/{id}` |
| `event_*.json` | Webhook zarfları (`POST /integrations/hermes-support/v1/events`) |
| `error_response.json` | Ortak hata gövdesi |

## Bilerek yok

`internal_note`, `internal_root_cause` ve `visibility: "internal"` taşıyan
**hiçbir** fixture yoktur ve olmayacaktır. Bu içerik müşteri uygulamasına
hiçbir kanaldan çıkmaz; tüketici tarafı böyle bir payload'ı reddeder
(`tests/test_ticketing_webhook.py::test_internal_content_rejected`).
