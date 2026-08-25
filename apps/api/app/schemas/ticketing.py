"""Ticket uclarinin istek/yanit semalari.

Alan sinirlari Hermes sozlesmesiyle AYNIDIR (`hermes_contract`); boylece
kullanici hatasi 400 olarak yerelde yakalanir, Hermes'e gidip orada
reddedilmez. Grup secimi kabul eden HICBIR alan yoktur — yonlendirme
backend'in control config'inden gelir.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import TicketCategory, TicketImpact
from app.integrations import hermes_contract as contract


class TicketCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(
        min_length=contract.TITLE_MIN_LENGTH, max_length=contract.TITLE_MAX_LENGTH
    )
    description: str = Field(
        min_length=contract.DESCRIPTION_MIN_LENGTH,
        max_length=contract.DESCRIPTION_MAX_LENGTH,
    )
    category: TicketCategory
    impact: TicketImpact
    reproduction_steps: str | None = Field(default=None, max_length=5000)
    expected_result: str | None = Field(default=None, max_length=2000)
    actual_result: str | None = Field(default=None, max_length=2000)
    error_code: str | None = Field(default=None, max_length=120)
    correlation_id: uuid.UUID | None = None
    occurred_at: datetime | None = None
    #: Tarayici baglami; sunucu tarafinda AYRICA allowlist'ten gecer.
    client_context: dict[str, Any] | None = None
    attachment_upload_ids: list[uuid.UUID] = Field(default_factory=list)

    @field_validator("title", "description")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class TicketReplyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: str = Field(
        min_length=contract.MESSAGE_MIN_LENGTH, max_length=contract.MESSAGE_MAX_LENGTH
    )
    attachment_upload_ids: list[uuid.UUID] = Field(default_factory=list)


class TicketReopenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(
        min_length=contract.REOPEN_REASON_MIN_LENGTH,
        max_length=contract.REOPEN_REASON_MAX_LENGTH,
    )


class TicketCancelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = Field(default=None, max_length=500)


class AttachmentSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file_name: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0)
    declared_mime_type: str = Field(min_length=1, max_length=120)
    sha256: str | None = Field(default=None, max_length=64)


class RouteConfigRequest(BaseModel):
    """Platform yoneticisinin route kaydi. TAM OLARAK BIR grup kabul edilir."""

    model_config = ConfigDict(extra="forbid")

    hermes_group_id: uuid.UUID
    is_active: bool = True
    #: Optimistic kilit: baska bir yonetici araya girmisse 409 doner.
    expected_route_version: int | None = None


class RouteTestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    #: Kaydetmeden once bir adayi test etmek icin; bos ise kayitli grup test edilir.
    hermes_group_id: uuid.UUID | None = None
