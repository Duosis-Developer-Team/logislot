from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.router import router as auth_router
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.core.metrics import PrometheusMiddleware, start_metrics_server
from app.integrations.hermes_support_client import register_hermes_error_handler
from app.routers.appointments import router as appointments_router
from app.routers.audit import router as audit_router
from app.routers.branding import router as branding_router
from app.routers.catalogs import router as catalogs_router
from app.routers.docks import router as docks_router
from app.routers.health import router as health_router
from app.routers.hermes_support_webhook import router as hermes_webhook_router
from app.routers.me import router as me_router
from app.routers.notifications import router as notifications_router
from app.routers.platform import router as platform_router
from app.routers.platform_ticketing import router as platform_ticketing_router
from app.routers.reports import router as reports_router
from app.routers.supplier_portal import router as supplier_router
from app.routers.suppliers import router as suppliers_router
from app.routers.tickets import router as tickets_router
from app.routers.tickets import supplier_router as supplier_tickets_router
from app.routers.users import router as users_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """/metrics dinleyicisini ayri portta baslatir (bkz. app.core.metrics).

    Uvicorn'un event loop'unu mesgul etmez: prometheus_client kendi daemon
    thread'inde kucuk bir WSGI sunucusu kosar. Bind edilemezse uygulama
    yine de acilir.
    """
    settings = get_settings()
    if settings.metrics_enabled:
        start_metrics_server(settings.metrics_port)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="LogiSlot — Akilli Mal Kabul & Rampa Randevu Platformu",
        # Production'da LOGISLOT_ENABLE_DOCS=false ile dokumantasyon kapatilir
        docs_url="/docs" if settings.enable_docs else None,
        redoc_url="/redoc" if settings.enable_docs else None,
        openapi_url="/openapi.json" if settings.enable_docs else None,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        return response

    # EN SONA eklenir cunku Starlette'te en son eklenen middleware EN DISTA
    # kalir: boylece olculen sure CORS + guvenlik basliklari dahil istegin
    # TAMAMINI kapsar ve asagidaki katmanlardan biri patlasa bile istek
    # sayilir. (add_middleware sirasi = user_middleware[0] en distaki.)
    app.add_middleware(
        PrometheusMiddleware,
        project=settings.metrics_project,
        environment=settings.metrics_environment,
        service=settings.metrics_service,
    )

    register_error_handlers(app)
    register_hermes_error_handler(app)

    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(me_router)
    app.include_router(platform_router)
    app.include_router(platform_ticketing_router)
    app.include_router(catalogs_router)
    app.include_router(branding_router)
    app.include_router(docks_router)
    app.include_router(suppliers_router)
    app.include_router(users_router)
    app.include_router(appointments_router)
    app.include_router(reports_router)
    app.include_router(supplier_router)
    app.include_router(notifications_router)
    app.include_router(audit_router)
    # Ticket yuzeyleri: yonetim, tedarikci ve Hermes webhook girisi.
    # Webhook router'i tenant oturumu KULLANMAZ; imza ile dogrulanir.
    app.include_router(tickets_router)
    app.include_router(supplier_tickets_router)
    app.include_router(hermes_webhook_router)
    return app


app = create_app()
