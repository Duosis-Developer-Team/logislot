"""Drake metrik SOZLESMESININ testleri (bkz. LOGISLOT_METRICS.md).

Bu testler stil tercihi degil, SOZLESME dogrulamasidir. Bir metrik veya
etiket adi degistiginde seri toplanmaya devam eder ama Drake'in panolarinda
hicbir sey gorunmez — kimse haftalarca fark etmez. Kirilirlarsa dogru tepki
testi guncellemek DEGIL, uygulamayi sozlesmeye geri getirmektir.
"""

import re

import pytest
from prometheus_client import generate_latest
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app.core.metrics import (
    REQUEST_COUNT,
    REQUEST_DURATION,
    PrometheusMiddleware,
    status_class,
)

COUNTER_NAME = "http_server_requests_total"
HISTOGRAM_NAME = "http_server_request_duration_seconds"

#: Drake'in katalogunun reddettigi etiketler. Sinirsiz kardinalite metrik
#: arka ucunu doldurur; hicbiri bu iki metrikte GORUNMEMELI.
FORBIDDEN_LABELS = (
    "pod",
    "container",
    "instance",
    "route",
    "path",
    "tenant",
    "customer",
    "user",
    "user_id",
    "email",
    "request_id",
    "method",
)


def _exposition() -> str:
    return generate_latest().decode()


def _samples(name: str) -> list[str]:
    """Exposition ciktisindaki `name{...}` orneklerinin satirlari."""
    return [
        line
        for line in _exposition().splitlines()
        if line.startswith(f"{name}{{") or line.startswith(f"{name} ")
    ]


def _labels_of(sample_line: str) -> dict[str, str]:
    inner = re.search(r"\{(.*)\}", sample_line)
    if not inner:
        return {}
    return dict(re.findall(r'(\w+)="([^"]*)"', inner.group(1)))


def _counter_value(project: str, environment: str, service: str, status: str) -> float:
    return REQUEST_COUNT.labels(project, environment, service, status)._value.get()


def _make_app(*, project="logislot", environment="dev", service="logislot-api") -> Starlette:
    async def ok(_request):
        return PlainTextResponse("ok")

    async def created(_request):
        return PlainTextResponse("created", status_code=201)

    async def redirect(_request):
        return PlainTextResponse("moved", status_code=302)

    async def missing(_request):
        return PlainTextResponse("nope", status_code=404)

    async def server_error(_request):
        return PlainTextResponse("bad", status_code=503)

    async def boom(_request):
        raise RuntimeError("patladi")

    app = Starlette(
        routes=[
            Route("/ok", ok),
            Route("/created", created),
            Route("/redirect", redirect),
            Route("/missing", missing),
            Route("/server-error", server_error),
            Route("/boom", boom),
        ]
    )
    app.add_middleware(
        PrometheusMiddleware,
        project=project,
        environment=environment,
        service=service,
    )
    return app


# --------------------------------------------------------------------------
# Metrik ve etiket ADLARI
# --------------------------------------------------------------------------


def test_metric_names_are_exactly_what_drake_queries():
    """prometheus_client `_total`'i kendi ekler; ad yine de birebir olmali."""
    # Etiketli metrikler ilk child olusana kadar ornek uretmez.
    TestClient(_make_app(environment="t-names")).get("/ok")
    text = _exposition()
    assert f"# TYPE {COUNTER_NAME} counter" in text
    assert f"# TYPE {HISTOGRAM_NAME} histogram" in text
    # p95 sorgusu bu seriden okur.
    assert f"{HISTOGRAM_NAME}_bucket" in text


def test_counter_carries_exactly_the_contract_labels():
    client = TestClient(_make_app())
    client.get("/ok")

    lines = _samples(COUNTER_NAME)
    assert lines, "sayac ornegi uretilmedi"
    for line in lines:
        assert set(_labels_of(line)) == {"project", "environment", "service", "status_class"}


def test_histogram_carries_exactly_the_contract_labels():
    client = TestClient(_make_app())
    client.get("/ok")

    lines = _samples(f"{HISTOGRAM_NAME}_bucket")
    assert lines, "histogram ornegi uretilmedi"
    for line in lines:
        # `le` histogram'in kendi boyutudur, sozlesme etiketi degil.
        assert set(_labels_of(line)) == {"project", "environment", "service", "le"}


@pytest.mark.parametrize("forbidden", FORBIDDEN_LABELS)
def test_forbidden_high_cardinality_labels_never_appear(forbidden):
    client = TestClient(_make_app())
    client.get("/ok")
    client.get("/missing")

    for name in (COUNTER_NAME, f"{HISTOGRAM_NAME}_bucket"):
        for line in _samples(name):
            assert forbidden not in _labels_of(line)


def test_label_values_come_from_settings_not_hardcoded():
    client = TestClient(
        _make_app(project="logislot", environment="prod", service="logislot-api")
    )
    client.get("/ok")

    matching = [
        line
        for line in _samples(COUNTER_NAME)
        if _labels_of(line).get("environment") == "prod"
    ]
    assert matching, "environment=prod etiketli seri uretilmedi"
    labels = _labels_of(matching[0])
    assert labels["project"] == "logislot"
    assert labels["service"] == "logislot-api"


# --------------------------------------------------------------------------
# status_class: SINIF, kod degil
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        (200, "2xx"),
        (201, "2xx"),
        (204, "2xx"),
        (301, "3xx"),
        (302, "3xx"),
        (400, "4xx"),
        (401, "4xx"),
        (404, "4xx"),
        (422, "4xx"),
        (500, "5xx"),
        (503, "5xx"),
    ],
)
def test_status_class_maps_code_to_class(code, expected):
    assert status_class(code) == expected


def test_status_class_never_emits_a_bare_status_code():
    """'500' yanlis, '5xx' dogru — sozlesmenin acikca uyardigi hata."""
    for code in (200, 302, 404, 500):
        assert status_class(code) != str(code)


@pytest.mark.parametrize("weird", [0, 100, 101, 600, 999])
def test_unexpected_codes_stay_inside_the_four_allowed_classes(weird):
    assert status_class(weird) in {"2xx", "3xx", "4xx", "5xx"}


@pytest.mark.parametrize(
    ("path", "expected_class"),
    [
        ("/ok", "2xx"),
        ("/created", "2xx"),
        ("/redirect", "3xx"),
        ("/missing", "4xx"),
        ("/server-error", "5xx"),
    ],
)
def test_requests_increment_the_right_status_class(path, expected_class):
    env = f"t-{path.strip('/')}"
    client = TestClient(_make_app(environment=env))
    before = _counter_value("logislot", env, "logislot-api", expected_class)

    client.get(path, follow_redirects=False)

    after = _counter_value("logislot", env, "logislot-api", expected_class)
    assert after == before + 1


# --------------------------------------------------------------------------
# Middleware istegi bozmamali
# --------------------------------------------------------------------------


def test_middleware_does_not_alter_the_response():
    client = TestClient(_make_app())
    response = client.get("/ok")
    assert response.status_code == 200
    assert response.text == "ok"


def test_unhandled_exception_is_recorded_as_5xx_and_still_propagates():
    """Metrik kaydi istisnayi YUTMAMALI; disaridaki katman 500 uretir."""
    env = "t-boom"
    client = TestClient(_make_app(environment=env), raise_server_exceptions=False)
    before = _counter_value("logislot", env, "logislot-api", "5xx")

    response = client.get("/boom")

    assert response.status_code == 500
    assert _counter_value("logislot", env, "logislot-api", "5xx") == before + 1


class _BrokenChild:
    """Metrik ilkelinin calisma aninda patlamasini taklit eder."""

    def inc(self, *_args, **_kwargs):
        raise RuntimeError("sayac bozuk")

    def observe(self, *_args, **_kwargs):
        raise RuntimeError("histogram bozuk")


def _break_metrics(monkeypatch):
    # Child'lar middleware __init__'inde baglanir; app kurulmadan ONCE bozulmali.
    monkeypatch.setattr(REQUEST_COUNT, "labels", lambda *a, **k: _BrokenChild())
    monkeypatch.setattr(REQUEST_DURATION, "labels", lambda *a, **k: _BrokenChild())


def test_recording_failure_cannot_break_a_request(monkeypatch):
    """Metrik ilkeli patlasa bile istek normal tamamlanmali.

    Bu, middleware'in "istegi asla dusurme" guvencesinin testi: _record'un
    ic try/except'i kaldirilirsa burasi kirmizi doner.
    """
    _break_metrics(monkeypatch)

    client = TestClient(_make_app(environment="t-record-fail"))
    response = client.get("/ok")

    assert response.status_code == 200
    assert response.text == "ok"


def test_metric_failure_does_not_mask_the_application_error(monkeypatch):
    """Hata yolunda metrik patlarsa UYGULAMANIN istisnasi kaybolmamali."""
    _break_metrics(monkeypatch)

    client = TestClient(_make_app(environment="t-mask"))
    with pytest.raises(RuntimeError, match="patladi"):
        client.get("/boom")


def test_non_http_scopes_pass_through_untouched():
    """lifespan bu metriklerin konusu degil; TestClient lifespan calistirir."""
    with TestClient(_make_app(environment="t-lifespan")) as client:
        assert client.get("/ok").status_code == 200


# --------------------------------------------------------------------------
# Birim: SANIYE
# --------------------------------------------------------------------------


def test_histogram_buckets_are_seconds_not_milliseconds():
    """Kovalar saniye olcegindedir; ms olsaydi ust sinirlar 100'lerde olurdu."""
    env = "t-buckets"
    client = TestClient(_make_app(environment=env))
    client.get("/ok")

    bounds = sorted(
        float(_labels_of(line)["le"])
        for line in _samples(f"{HISTOGRAM_NAME}_bucket")
        if _labels_of(line).get("environment") == env
    )
    assert bounds[0] <= 0.01, "en kucuk kova saniye olceginde olmali"
    finite = [b for b in bounds if b != float("inf")]
    assert max(finite) <= 60, "ust kova saniye olcegini asiyor (ms mi kullanildi?)"


def test_observed_duration_is_a_small_number_of_seconds():
    env = "t-duration"
    client = TestClient(_make_app(environment=env))
    client.get("/ok")

    total = REQUEST_DURATION.labels("logislot", env, "logislot-api")._sum.get()
    # Bos bir handler saniyeler surmez; ms kaydedilseydi bu deger >1 olurdu.
    assert 0 <= total < 1.0
