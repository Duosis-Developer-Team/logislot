"""Hermes sozlesmesini taklit eden test tasima katmani.

Sahte bir istemci SINIFI yerine gercek `HermesSupportClient` + `httpx`
MockTransport kullanilir. Boylece testler yalnizca is mantigini degil,
sozlesmenin kendisini de dogrular: basliklar (Idempotency-Key, Correlation-Id),
URL'ler, hata govdesi -> hata kodu esleme ve JSON sekli gercekten calisir.
"""

from __future__ import annotations

import json
import pathlib
from collections.abc import Callable

import httpx

from app.integrations.hermes_support_client import HermesSupportClient

FIXTURES = pathlib.Path(__file__).parent / "contracts" / "hermes_support_v1"

BASE_URL = "https://hermes.test/api/public/v1"
TOKEN = "test-service-token"


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def make_client(handler: Callable[[httpx.Request], httpx.Response]) -> HermesSupportClient:
    return HermesSupportClient(
        base_url=BASE_URL,
        token=TOKEN,
        application_code="logislot",
        timeout=5.0,
        transport=httpx.MockTransport(handler),
    )


def json_response(status: int, payload: dict, headers: dict | None = None) -> httpx.Response:
    return httpx.Response(status, json=payload, headers=headers or {})


def error_response(status: int, code: str, *, retryable: bool | None = None) -> httpx.Response:
    error: dict = {"code": code, "message": f"{code} olustu", "details": {}}
    if retryable is not None:
        error["retryable"] = retryable
    return httpx.Response(status, json={"error": error})


class RecordingHermes:
    """Cagrilari kaydeden, senaryo bazli yanit veren sahte Hermes.

    `responses` sozlugu (method, path-son-parcasi) yerine basit bir yonlendirici
    ile calisir; testler `handler` fonksiyonunu isterse tamamen kendileri yazar.
    """

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.bodies: list[dict] = []
        #: path parcasi -> yanit uretici
        self.routes: dict[str, Callable[[httpx.Request], httpx.Response]] = {}
        self.default_status = 404

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        try:
            self.bodies.append(json.loads(request.content) if request.content else {})
        except ValueError:
            self.bodies.append({})
        # EN SPESIFIK eslesme kazanir. Olcut, parcanin URL'de BASLADIGI
        # konum (sonra baslayan daha spesifiktir) ve esitlikte uzunluktur:
        # "/support/tickets" ile "by-source" ayni URL'de eslesir ve kayit
        # sirasina gore secmek testi sessizce yanlis yanita baglardi.
        url = str(request.url)
        matches = sorted(
            ((url.rfind(f), len(f), f) for f in self.routes if f in url),
            reverse=True,
        )
        if matches:
            return self.routes[matches[0][2]](request)
        return error_response(self.default_status, "not_found")

    def client(self) -> HermesSupportClient:
        return make_client(self.handler)

    def install(self) -> None:
        from app.integrations.hermes_support_client import set_client_factory

        set_client_factory(self.client)

    def on(self, fragment: str, responder) -> RecordingHermes:
        self.routes[fragment] = (
            responder if callable(responder) else (lambda _req, r=responder: r)
        )
        return self

    def last_header(self, name: str) -> str | None:
        return self.requests[-1].headers.get(name) if self.requests else None
