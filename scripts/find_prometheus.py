#!/usr/bin/env python3
"""`kubectl get svc -A -o json` ciktisindan Prometheus servisini bulur.

SALT OKUNUR: yalnizca verilen JSON'u okur, kumeye hic dokunmaz.

Cikti: "<namespace> <servis> <port>" (bulunamazsa hicbir sey, cikis 1).
Prometheus baska bir ekibin namespace'inde yasiyor; burada amac onu bulup
SORGULAMAK, degistirmek degil.

Kullanim:
    kubectl get svc -A -o json > /tmp/svcs.json
    python3 scripts/find_prometheus.py /tmp/svcs.json
"""

from __future__ import annotations

import json
import sys

#: Adinda "prometheus" gecse de Prometheus SUNUCUSU olmayan yan bilesenler.
NOT_THE_SERVER = ("alertmanager", "pushgateway", "operator", "node-exporter", "adapter")

#: Prometheus HTTP API'sinin makul portlari.
CANDIDATE_PORTS = (9090, 9091, 80)


def find(services: list[dict]) -> tuple[str, str, int] | None:
    best: tuple[int, tuple[str, str, int]] | None = None

    for svc in services:
        meta = svc.get("metadata", {})
        name = meta.get("name", "")
        namespace = meta.get("namespace", "")
        if "prometheus" not in f"{namespace}/{name}".lower():
            continue
        if any(bad in name.lower() for bad in NOT_THE_SERVER):
            continue

        for port_spec in svc.get("spec", {}).get("ports", []) or []:
            port = port_spec.get("port")
            if port not in CANDIDATE_PORTS:
                continue
            # 9090 ve adi tam "prometheus" ile biten servis tercih edilir.
            score = (2 if port == 9090 else 0) + (1 if name.lower().endswith("prometheus") else 0)
            if best is None or score > best[0]:
                best = (score, (namespace, name, port))

    return best[1] if best else None


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2

    with open(sys.argv[1]) as handle:
        services = json.load(handle).get("items", [])

    hit = find(services)
    if hit is None:
        print("Prometheus servisi bulunamadi", file=sys.stderr)
        return 1

    namespace, name, port = hit
    print(namespace, name, port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
