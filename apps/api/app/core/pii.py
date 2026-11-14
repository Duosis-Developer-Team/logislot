"""Kisisel veri sifreleme (surucu TCKN/pasaport numarasi).

- Sifreleme: AES-256-GCM; her deger icin rastgele 96-bit nonce. Saklanan bicim
  "v1:" + base64url(nonce || sifreli metin+etiket). Onek, ileride anahtar
  donusumu icin surum tasir.
- Arama ozeti: HMAC-SHA256 (ayri turetilmis anahtar). Ayni numara her zaman
  ayni ozeti verir; guvenlik kapisinda numarayla randevu bulmak icin. Ozet
  numarayi geri vermez; anahtar olmadan sozluk saldirisi da yapilamaz.
- Anahtarlar `pii_encryption_key` (yoksa `secret_key`) uzerinden HKDF ile
  amaca gore ayri turetilir; ham anahtar hicbir yerde dogrudan kullanilmaz.
"""

import base64
import hashlib
import hmac
import os
from functools import lru_cache

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.core.config import get_settings

_PREFIX = "v1:"


def _derive(purpose: bytes) -> bytes:
    settings = get_settings()
    material = (settings.pii_encryption_key or settings.secret_key).encode()
    return HKDF(
        algorithm=hashes.SHA256(), length=32, salt=b"logislot-pii", info=purpose
    ).derive(material)


@lru_cache
def _keys() -> tuple[bytes, bytes]:
    return _derive(b"encrypt-v1"), _derive(b"lookup-v1")


def encrypt(plaintext: str) -> str:
    nonce = os.urandom(12)
    sealed = AESGCM(_keys()[0]).encrypt(nonce, plaintext.encode(), None)
    return _PREFIX + base64.urlsafe_b64encode(nonce + sealed).decode()


def decrypt(token: str) -> str:
    if not token.startswith(_PREFIX):
        raise ValueError("Bilinmeyen sifreleme surumu")
    raw = base64.urlsafe_b64decode(token[len(_PREFIX):])
    return AESGCM(_keys()[0]).decrypt(raw[:12], raw[12:], None).decode()


def lookup_hash(value: str) -> str:
    return hmac.new(_keys()[1], value.encode(), hashlib.sha256).hexdigest()


def reset_key_cache() -> None:
    """Testler icin: ayarlar degistiginde turetilmis anahtarlari yeniden hesapla."""
    _keys.cache_clear()
