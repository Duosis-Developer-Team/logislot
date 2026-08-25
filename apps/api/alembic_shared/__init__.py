"""Iki alembic zincirinin PAYLASTIGI DDL yardimcilari.

Control-plane (`alembic/`) ve tenant-plane (`alembic_tenant/`) zincirleri ayni
tenant tablolarini FARKLI yerlerde olusturmak zorundadir:

  * kendi semasina tasinmis tenant  -> tenant zinciri, `t_<uuid>` semasinda,
  * henuz tasinmamis tenant         -> control zinciri, ortak `public` semada
    (bkz. `app/core/db.py::location_for_tenant`, `tenant_datastore_required`).

DDL'i iki yere KOPYALAMAK, iki yerin zamanla ayrismasi demektir; bu paket tek
tanimi tutar ve iki zincir de onu cagirir.
"""
