import uuid
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)
    #: Opsiyonel portal baglami (backward-compatible). Portal-specific
    #: client'lar gonderir; endpoint kendi portaliyla uyusmayan degeri
    #: reddeder. Eski payload'lar (portal'siz) aynen calisir.
    portal: Literal["supplier", "admin", "platform"] | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class HandoffConsumeRequest(BaseModel):
    """Markali alan adina devir kodu. Kodun KENDISI kimlik dogrulayicidir."""

    code: str = Field(min_length=16, max_length=128)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class FacilitySummary(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    timezone: str
    status: str


class MeResponse(BaseModel):
    id: uuid.UUID
    user_type: str  # platform / tenant / supplier
    name: str
    email: str
    tenant_id: uuid.UUID | None = None
    supplier_id: uuid.UUID | None = None
    default_facility_id: uuid.UUID | None = None
    #: Varsayilan tesisin izinleri (geriye uyumluluk).
    permissions: list[str] = []
    #: Tesis bazli izin haritasi — permission-aware nav bunu kullanir.
    facility_permissions: dict[str, list[str]] = {}
    facilities: list[FacilitySummary] = []


class ActiveFacilityRequest(BaseModel):
    facility_id: uuid.UUID


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=1)


class NotificationPreferencesPatch(BaseModel):
    in_app_enabled: bool | None = None
    email_enabled: bool | None = None
    email_events: dict[str, bool] | None = None
