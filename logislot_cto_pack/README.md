# LogiSlot CTO Pack

Bu paket, **LogiSlot — Akıllı Mal Kabul & Rampa Randevu Platformu** projesini Claude Code'a sıfırdan ve doğru bağlamla başlatmak için hazırlanmıştır.

## Kaynak önceliği

1. **Mutlak kaynak:** `Mal Kabul Randevu Sistemi v2.0.docx`
2. **Bağlam kaynağı:** `Mal Kabul Randevu Sistemi.docx` / v1.0
3. Bu CTO pack, v2.0 kararlarını uygulama seviyesine indirir. v1.0 sadece mevcut iş akışlarını, ekran mantığını ve saha tespitlerinin kökenini anlamak içindir.
4. v1.0 ile v2.0 çelişirse **v2.0 kazanır**.

## Hedef

LogiSlot, fabrikaların/tesislerin tedarikçi mal kabul süreçlerini dijitalleştiren, rampa kullanımını optimize eden, araç bekleme sürelerini azaltan, tenant/tesis bazlı konfigüre edilebilir SaaS platformudur.

## Önerilen teknoloji yığını

- Monorepo: pnpm workspace veya Turborepo
- Frontend: Next.js App Router + TypeScript + Tailwind CSS + shadcn/ui + TanStack Query/Table + Zustand veya URL state
- Backend: FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL 16 + Redis + Celery/RQ/Arq worker
- Auth: JWT access/refresh + RBAC + tenant/facility scoped session context
- E-posta/bildirim: transactional mail provider abstraction + in-app notifications
- Deployment: Docker Compose dev, production-ready Docker images, env-driven config

> Not: Backend framework v2.0 dokümanda sabitlenmemiştir. Bu pack, proje güvenilirliği ve hızlı geliştirme için FastAPI + PostgreSQL mimarisini CTO kararı olarak önerir.

## Dosya haritası

- `00_kickoff/`: Claude Code'a doğrudan verilecek başlangıç promptları ve çalışma kuralları
- `01_product/`: ürün vizyonu, kapsam, roller, kullanıcı akışları
- `02_architecture/`: sistem mimarisi, SaaS tenancy, güvenlik, modül sınırları
- `03_domain/`: entity model, iş kuralları, durum makinesi, availability motoru
- `04_frontend/`: Next.js app yapısı, ekranlar, UI/UX kuralları, tasarım sistemi
- `05_backend/`: API, veritabanı, servisler, migration, test stratejisi
- `06_delivery/`: sprint planı, acceptance criteria, QA checklist
- `07_reference/`: kaynak dokümanlardan normalize edilmiş notlar ve karar kayıtları

## Claude Code için ana talimat

Önce `00_kickoff/CLAUDE_MASTER_PROMPT.md` dosyasını oku. Ardından `06_delivery/IMPLEMENTATION_ROADMAP.md` sırasına göre ilerle. Her sprint sonunda değişen dosyaları, test sonuçlarını, riskleri ve canlı demo talimatlarını raporla.
