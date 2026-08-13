#!/usr/bin/env python3
"""LOGISLOT_METRICS.md'deki UC SORGUYU canli Prometheus'ta kosturur.

SALT OKUNUR: yalnizca /api/v1/query cagirir.

Bu, isin gercek gecme sartidir. "Deploy yesil" ya da "/metrics cevap
veriyor" yeterli DEGILDIR: sozlesme bir etiket adinda kaysa metrikler
toplanmaya devam eder, sorgular bos doner ve panolar sessizce bos kalir.

Kullanim:
    python3 scripts/check_drake_queries.py --base-url http://localhost:19090 \
        --environment dev
"""

from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request

PROJECT = "logislot"


def queries(environment: str) -> list[tuple[str, str, bool]]:
    """(baslik, promql, gecme_sarti_mi) uclulerinin listesi."""
    selector = f'project="{PROJECT}",environment="{environment}"'
    return [
        (
            "up (bilgi amacli)",
            f"up{{{selector}}}",
            # `up` scrape config'in urettigi bir seridir, uygulamanin degil:
            # project/environment etiketlerini ancak Drake'in job'i relabel
            # ile ekliyorsa tasir. Bos donmesi metriklerin eksik oldugunu
            # GOSTERMEZ, bu yuzden gecme sarti degil.
            False,
        ),
        (
            "istek hizi",
            f"sum by (service) (rate(http_server_requests_total{{{selector}}}[5m]))",
            True,
        ),
        (
            "hata orani",
            f'sum(rate(http_server_requests_total{{status_class="5xx",{selector}}}[5m]))'
            f" / sum(rate(http_server_requests_total{{{selector}}}[5m]))",
            True,
        ),
        (
            "p95 gecikme",
            "histogram_quantile(0.95, sum by (le) ("
            f"rate(http_server_request_duration_seconds_bucket{{{selector}}}[5m])))",
            True,
        ),
    ]


def run_query(base_url: str, promql: str, timeout: int = 20) -> list[dict]:
    url = f"{base_url.rstrip('/')}/api/v1/query?" + urllib.parse.urlencode({"query": promql})
    with urllib.request.urlopen(url, timeout=timeout) as response:  # noqa: S310
        payload = json.load(response)
    if payload.get("status") != "success":
        raise RuntimeError(f"Prometheus hatasi: {payload}")
    return payload["data"]["result"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--environment", required=True, choices=["dev", "prod"])
    args = parser.parse_args()

    failures: list[str] = []

    for title, promql, required in queries(args.environment):
        print(f"\n----- {title} -----")
        print(f"query: {promql}")
        try:
            result = run_query(args.base_url, promql)
        except Exception as exc:  # noqa: BLE001
            print(f"  SORGU KOSTURULAMADI: {exc}")
            if required:
                failures.append(title)
            continue

        if not result:
            print("  BOS SONUC — eslesen seri yok")
            if required:
                failures.append(title)
            continue

        for series in result:
            labels = series.get("metric") or "(scalar)"
            value = series["value"][1]
            print(f"  {labels} => {value}")

    print()
    if failures:
        print("BASARISIZ — veri donmeyen zorunlu sorgular: " + ", ".join(failures))
        print("Olasi sebepler icin LOGISLOT_METRICS.md sonundaki listeye bakin.")
        return 1

    print(f"Uc sorgu da veri dondurdu (environment={args.environment}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
