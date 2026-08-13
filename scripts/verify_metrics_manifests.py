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
#: Deger Drake'in .drake/project.yaml'daki servis anahtariyla ayni olmali.
INSTRUMENTED = {"logislot-api": "logislot-api"}

#: Sabit sozlesme degeri.
EXPECTED_PROJECT = "logislot"


def _container_port_names(workload: dict) -> dict[str, int]:
    """Pod'daki isimli portlar: ad -> numara.

    Service `targetPort: metrics` gibi ISIMLE de refere edebilir; sayisal
    karsilastirma bunu kacirir.
    """
    names: dict[str, int] = {}
    containers = workload["spec"]["template"]["spec"].get("containers", []) or []
    for container in containers:
        for port in container.get("ports", []) or []:
            if port.get("name") and port.get("containerPort") is not None:
                names[port["name"]] = port["containerPort"]
    return names


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
    elif actual == namespace:
        # Ayni kusurun iki kez raporlanmamasi icin zincirin parcasi.
        errors.append(
            f"[{overlay}] environment degeri NAMESPACE ({namespace}); "
            f"Drake katalog anahtarini bekler ({expected_env})"
        )
    elif actual != expected_env:
        errors.append(
            f"[{overlay}] LOGISLOT_METRICS_ENVIRONMENT={actual!r}, "
            f"{expected_env!r} olmali"
        )

    # --- 1b. project / service etiketleri (ayarlanmissa) dogru olmali ---
    # Ikisi de uygulama varsayilanini kullanabilir; ama configmap'te YANLIS
    # bir deger varsa Drake'in `sum by (service)` ve project filtresi bosa
    # duser — guard'in engellemek icin var oldugu sessiz hatanin aynisi.
    configured_project = data.get("LOGISLOT_METRICS_PROJECT")
    if configured_project is not None and configured_project != EXPECTED_PROJECT:
        errors.append(
            f"[{overlay}] LOGISLOT_METRICS_PROJECT={configured_project!r}, "
            f"{EXPECTED_PROJECT!r} olmali"
        )
    configured_service = data.get("LOGISLOT_METRICS_SERVICE")
    if configured_service is not None and configured_service not in INSTRUMENTED.values():
        errors.append(
            f"[{overlay}] LOGISLOT_METRICS_SERVICE={configured_service!r} "
            f"Drake servis anahtarlarindan biri degil: {sorted(INSTRUMENTED.values())}"
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
    # targetPort SAYI ("9464") ya da AD ("metrics") olabilir. Yalnizca
    # sayisal karsilastirma yapmak, `targetPort: metrics` yazan birini
    # kacirir ve CI yesil kalirken /metrics NodePort'tan disari acilir —
    # mevcut Service'ler zaten isimli formu kullaniyor (`targetPort: http`),
    # yani bu yazim hic de uzak bir ihtimal degil.
    metrics_port_names = {
        name
        for workload in INSTRUMENTED
        if workload in workloads
        for name, number in _container_port_names(workloads[workload]).items()
        if number == METRICS_PORT
    }

    def exposes_metrics(port: dict) -> bool:
        target = port.get("targetPort")
        return (
            port.get("port") == METRICS_PORT
            or target == METRICS_PORT
            or (isinstance(target, str) and target in metrics_port_names)
        )

    for svc in services:
        for port in svc["spec"].get("ports", []) or []:
            if exposes_metrics(port):
                errors.append(
                    f"[{overlay}] Service/{svc['metadata']['name']} metrik portunu "
                    f"({METRICS_PORT}) yayinliyor; /metrics kume disina cikmamali"
                )

    # --- 5. /metrics public ingress'ten GECMEMELI ---
    # Sozlesme bunu acikca yasakliyor. Ingress bir Service'e isaret eder;
    # o Service metrik portunu yayinliyorsa yol disariya acilmis olur.
    exposing_services = {
        svc["metadata"]["name"]
        for svc in services
        if any(exposes_metrics(p) for p in svc["spec"].get("ports", []) or [])
    }
    for ingress in (d for d in docs if d.get("kind") == "Ingress"):
        for rule in ingress["spec"].get("rules", []) or []:
            for path in (rule.get("http") or {}).get("paths", []) or []:
                backend = (path.get("backend") or {}).get("service") or {}
                port = backend.get("port") or {}
                if backend.get("name") in exposing_services or port.get("number") == METRICS_PORT:
                    errors.append(
                        f"[{overlay}] Ingress/{ingress['metadata']['name']} "
                        f"metrik portunu disariya aciyor "
                        f"(backend={backend.get('name')}, path={path.get('path')})"
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
