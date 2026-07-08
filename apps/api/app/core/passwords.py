"""Parola politikasi ve guclu gecici parola uretimi.

Politika /auth/change-password'da uygulanir: gecici parolalar (create/reset)
must_change_password=True ile verildigi icin KALICI her parola bu politikadan
gecmis olur. Production ortaminda (LOGISLOT_ENV=production) yaygin demo
parolalari ayrica engellenir; development/demo ortami etkilenmez.
"""

import secrets
import string

from app.core.config import get_settings
from app.core.errors import ApiError

#: Production'da reddedilen yaygin/demo parolalar (kucuk harfe indirilerek).
COMMON_PASSWORDS = {
    "demo123!",
    "password",
    "password1",
    "12345678",
    "123456789",
    "qwerty123",
    "logislot123",
}

_SPECIAL = "!@#$%^&*()-_=+[]{};:,.?/"


def validate_password_policy(password: str) -> None:
    """Politikaya uymayan parola icin 422 WEAK_PASSWORD firlatir."""
    settings = get_settings()
    problems: list[str] = []
    if len(password) < settings.password_min_length:
        problems.append(f"en az {settings.password_min_length} karakter")
    if not any(c.isalpha() for c in password):
        problems.append("en az 1 harf")
    if not any(c.isdigit() for c in password):
        problems.append("en az 1 rakam")
    if settings.password_require_special and not any(not c.isalnum() for c in password):
        problems.append("en az 1 özel karakter")
    if settings.environment == "production" and password.lower() in COMMON_PASSWORDS:
        problems.append("yaygın/demo parolalar kullanılamaz")
    if problems:
        raise ApiError(
            "WEAK_PASSWORD",
            "Parola politikaya uymuyor: " + ", ".join(problems) + " gerekli",
            422,
        )


def generate_temporary_password(length: int = 14) -> str:
    """Politikayi garanti saglayan guclu rastgele parola."""
    alphabet = string.ascii_letters + string.digits
    core = "".join(secrets.choice(alphabet) for _ in range(length - 4))
    return (
        secrets.choice(string.ascii_uppercase)
        + secrets.choice(string.ascii_lowercase)
        + core
        + secrets.choice(string.digits)
        + secrets.choice(_SPECIAL)
    )
