#!/usr/bin/env python3
"""Drake metrik sozlesmesinin MANIFEST tarafini dogrular.

Uygulama tarafini apps/api/tests/test_metrics.py dogruluyor; burasi render
edilmis Kustomize ciktisina bakar. Kapsanan hatalar, LOGISLOT_METRICS.md'nin
"sorgu bos donerse" listesindeki ilk uc madde:

  1. Anotasyon Service'te, pod template'inde degil  -> hicbir sey toplanmaz
  2. environment degeri namespace ("logislot-prod") -> panolar sessizce bos
  3. /metrics portunun bir Service'e baglanmasi     -> metrikler kumeden cikar

Kullanim:
    python3 scripts/verify_metrics_manifests.py            # dev + prod
    python3 scripts/verify_metrics_manifests.py dev        # tek overlay
"""

from __future__ import annotations

import subprocess
import sys

import yaml

#: Overlay -> beklenen Drake katalog anahtari. Namespace DEGIL.
EXPECTED_ENVIRONMENT = {"dev": "dev", "prod": "prod"}

METRICS_PORT = 9464
ANNOTATIONS = {
    "prometheus.io/scrape": "true",
    "prometheus.io/port": str(METRICS_PORT),
    "prometheus.io/path": "/metrics",
}

#: Metrik yayan is yukleri: workload adi -> beklenen `service` etiketi.
INSTRUMENTED = {"logislot-api": "logislot-api"}


def render(overlay: str) -> list[dict]:
    out = subprocess.run(
        ["kubectl", "kustomize", f"k8s/overlays/{overlay}"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return [doc for doc in yaml.safe_load_all(out) if doc]


def check(overlay: str) -> list[str]:
    errors: list[str] = []
    docs = render(overlay)
    expected_env = EXPECTED_ENVIRONMENT[overlay]
    namespace = f"logislot-{overlay}"

    configmaps = {
        d["metadata"]["name"]: d.get("data", {})
        for d in docs
        if d.get("kind") == "ConfigMap"
    }
    workloads = {
        d["metadata"]["name"]: d
        for d in docs
        if d.get("kind") in {"Deployment", "StatefulSet"}
    }
    services = [d for d in docs if d.get("kind") == "Service"]

    # --- 1. environment KATALOG ANAHTARI olmali ---
    data = configmaps.get("logislot-config", {})
    actual = data.get("LOGISLOT_METRICS_ENVIRONMENT")
    if actual is None:
        errors.append(
            f"[{overlay}] logislot-config'te LOGISLOT_METRICS_ENVIRONMENT yok; "
            f'"{expected_env}" bekleniyordu'
        )
    elif actual != expected_env:
        errors.append(
            f"[{overlay}] LOGISLOT_METRICS_ENVIRONMENT={actual!r}, "
            f"{expected_env!r} olmali"
        )
    if actual == namespace:
        errors.append(
            f"[{overlay}] environment degeri NAMESPACE ({namespace}); "
            f"Drake katalog anahtarini bekler ({expected_env})"
        )

    # --- 2. Anotasyonlar POD TEMPLATE'inde olmali ---
    for workload in INSTRUMENTED:
        doc = workloads.get(workload)
        if doc is None:
            errors.append(f"[{overlay}] {workload} render edilmedi")
            continue
        pod_annotations = (
            doc["spec"]["template"]["metadata"].get("annotations", {}) or {}
        )
        for key, want in ANNOTATIONS.items():
            got = pod_annotations.get(key)
            if got != want:
                errors.append(
                    f"[{overlay}] {workload} pod template anotasyonu "
                    f"{key}={got!r}, {want!r} olmali"
                )

    # --- 3. Anotasyon Service'e KONMAMALI (en sik ikinci hata) ---
    for svc in services:
        svc_annotations = svc["metadata"].get("annotations", {}) or {}
        if "prometheus.io/scrape" in svc_annotations:
            errors.append(
                f"[{overlay}] Service/{svc['metadata']['name']} uzerinde "
                "prometheus.io/scrape var; anotasyonlar POD template'ine ait"
            )

    # --- 4. /metrics portu HICBIR Service'ten yayinlanmamali ---
    for svc in services:
        for port in svc["spec"].get("ports", []) or []:
            if METRICS_PORT in (port.get("port"), port.get("targetPort")):
                errors.append(
                    f"[{overlay}] Service/{svc['metadata']['name']} metrik portunu "
                    f"({METRICS_PORT}) yayinliyor; /metrics kume disina cikmamali"
                )

    return errors


def main() -> int:
    overlays = sys.argv[1:] or ["dev", "prod"]
    all_errors: list[str] = []
    for overlay in overlays:
        if overlay not in EXPECTED_ENVIRONMENT:
            print(f"Bilinmeyen overlay: {overlay}", file=sys.stderr)
            return 2
        all_errors.extend(check(overlay))

    if all_errors:
        print("Metrik sozlesmesi manifest dogrulamasi BASARISIZ:\n", file=sys.stderr)
        for err in all_errors:
            print(f"  - {err}", file=sys.stderr)
        print(
            "\nAyrinti: LOGISLOT_METRICS.md ve apps/api/app/core/metrics.py",
            file=sys.stderr,
        )
        return 1

    for overlay in overlays:
        print(
            f"[{overlay}] OK — environment={EXPECTED_ENVIRONMENT[overlay]}, "
            f"anotasyonlar pod template'inde, metrik portu ({METRICS_PORT}) "
            "hicbir Service'te yayinlanmiyor"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
