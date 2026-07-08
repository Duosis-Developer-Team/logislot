import uuid
from datetime import date, datetime, time
from typing import Any

from pydantic import BaseModel, ConfigDict


class OrmModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class VehicleCategoryOut(OrmModel):
    id: uuid.UUID
    name: str
    display_name: str
    description: str | None = None
    physical_note: str | None = None
    is_active: bool


class ProductCategoryOut(OrmModel):
    id: uuid.UUID
    name: str
    display_name: str
    description: str | None = None
    min_block_minutes: int
    default_vehicle_category_id: uuid.UUID | None = None
    is_active: bool


class DockOut(OrmModel):
    id: uuid.UUID
    name: str
    note: str | None = None
    is_active: bool
    working_hours_json: dict[str, Any] | None = None
    accepted_product_category_ids: list[uuid.UUID] = []
    accepted_vehicle_category_ids: list[uuid.UUID] = []


class DockOverrideOut(OrmModel):
    id: uuid.UUID
    dock_id: uuid.UUID
    date: date
    type: str
    start_time: time | None = None
    end_time: time | None = None
    reason: str | None = None
    is_active: bool


class ConflictGroupOut(OrmModel):
    id: uuid.UUID
    name: str
    relation_type: str
    trigger_condition_json: dict[str, Any] | None = None
    is_active: bool
    member_dock_ids: list[uuid.UUID] = []


class SupplierOut(OrmModel):
    id: uuid.UUID
    company_name: str
    code: str
    category_label: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    status: str
    is_active: bool = True
    auto_approval_enabled: bool
    min_block_minutes: int | None = None
    max_block_minutes: int | None = None
    weekly_quota: int | None = None
    monthly_quota: int | None = None
    notes: str | None = None
    allowed_product_category_ids: list[uuid.UUID] = []
    # Portal hesabi ozeti
    account_email: str | None = None
    account_active: bool | None = None


class NotificationOut(OrmModel):
    id: uuid.UUID
    type: str
    severity: str = "info"
    title: str
    body: str | None = None
    entity_type: str | None = None
    entity_id: uuid.UUID | None = None
    metadata_json: dict[str, Any] | None = None
    read_at: datetime | None = None
    created_at: datetime
