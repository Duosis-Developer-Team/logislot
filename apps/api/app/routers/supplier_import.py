"""Tedarikci Excel sablonu + toplu ice aktarma (bkz. services/supplier_import.py).

Yollar /suppliers/{supplier_id} ile cakismasin diye ayri onekte:
  GET  /facilities/{fid}/supplier-import/template
  POST /facilities/{fid}/supplier-import/preview   (multipart: file)
  POST /facilities/{fid}/supplier-import/commit    (multipart: file)
"""

import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_control_db, get_db
from app.core.enums import SupplierStatus
from app.core.errors import ApiError
from app.core.passwords import generate_temporary_password
from app.core.permissions import TenantPermission
from app.core.responses import ok
from app.core.security import hash_password
from app.models import PrincipalDirectory, ProductCategory, Supplier, SupplierUser, TenantUser
from app.routers.suppliers import _audit, _supplier_snapshot
from app.services.supplier_import import (
    MAX_FILE_BYTES,
    SIMPLE_FIELDS,
    ImportFileError,
    RowResult,
    build_template,
    read_rows,
    summarize,
    validate_rows,
)
from app.tenancy.deps import FacilityContext, require_facility_permissions
from app.tenancy.directory import claim_email_once, release

router = APIRouter(prefix="/facilities/{facility_id}/supplier-import", tags=["suppliers"])

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_manage = require_facility_permissions(TenantPermission.SUPPLIER_MANAGE)


async def _active_categories(db: AsyncSession, facility_id: uuid.UUID) -> list[ProductCategory]:
    return list(
        (
            await db.execute(
                select(ProductCategory).where(
                    ProductCategory.facility_id == facility_id,
                    ProductCategory.is_active.is_(True),
                )
            )
        ).scalars()
    )


async def _read_upload(file: UploadFile) -> bytes:
    data = await file.read(MAX_FILE_BYTES + 1)
    if not data:
        raise ApiError("IMPORT_FILE_INVALID", "Dosya boş", 422)
    return data


async def _evaluate(
    db: AsyncSession, control_db: AsyncSession, ctx: FacilityContext, data: bytes
) -> tuple[list[RowResult], list[str]]:
    try:
        rows, file_warnings = read_rows(data)
    except ImportFileError as exc:
        raise ApiError(exc.code, exc.message, 422) from exc
    if not rows:
        raise ApiError("IMPORT_EMPTY", "Dosyada tedarikçi satırı yok", 422)

    suppliers = (
        await db.execute(
            select(Supplier)
            .options(selectinload(Supplier.allowed_product_categories))
            .where(Supplier.facility_id == ctx.facility_id)
        )
    ).scalars()
    existing = {s.code.lower(): s for s in suppliers}

    # Hesap acilacak adaylarin e-postalari: tenant hesaplari + global dizin.
    candidates = {r.get("contact_email", "").strip().lower() for _, r in rows} - {""}
    taken: set[str] = set()
    if candidates:
        for model, session in (
            (SupplierUser, db),
            (TenantUser, db),
            (PrincipalDirectory, control_db),
        ):
            found = await session.execute(
                select(func.lower(model.email)).where(func.lower(model.email).in_(candidates))
            )
            taken |= set(found.scalars())

    results = validate_rows(
        rows,
        existing=existing,
        categories=await _active_categories(db, ctx.facility_id),
        taken_account_emails=taken,
    )
    return results, file_warnings


@router.get("/template")
async def download_template(
    ctx: FacilityContext = Depends(_manage),
    db: AsyncSession = Depends(get_db),
):
    """Bos sablon: tesisin aktif kategorileri ve sutun aciklamalariyla."""
    content = build_template(await _active_categories(db, ctx.facility_id))
    return Response(
        content=content,
        media_type=XLSX,
        headers={
            "Content-Disposition": 'attachment; filename="logislot-tedarikci-sablonu.xlsx"',
            "Cache-Control": "no-store",
        },
    )


@router.post("/preview")
async def preview_import(
    file: UploadFile = File(...),
    ctx: FacilityContext = Depends(_manage),
    db: AsyncSession = Depends(get_db),
    control_db: AsyncSession = Depends(get_control_db),
):
    """Dosyayi dogrular; HICBIR SEY yazmaz."""
    results, file_warnings = await _evaluate(db, control_db, ctx, await _read_upload(file))
    return ok({
        "summary": summarize(results, file_warnings),
        "rows": [r.as_dict() for r in results],
    })


@router.post("/commit")
async def commit_import(
    file: UploadFile = File(...),
    ctx: FacilityContext = Depends(_manage),
    db: AsyncSession = Depends(get_db),
    control_db: AsyncSession = Depends(get_control_db),
):
    """Ayni dogrulamayi tekrar kosar; tek hata varsa hicbir satir yazilmaz."""
    results, file_warnings = await _evaluate(db, control_db, ctx, await _read_upload(file))
    summary = summarize(results, file_warnings)
    if summary["error_rows"]:
        raise ApiError(
            "IMPORT_HAS_ERRORS",
            f"{summary['error_rows']} satırda hata var; hiçbir kayıt yazılmadı",
            422,
            details={"summary": summary, "rows": [r.as_dict() for r in results]},
        )

    categories = {c.id: c for c in await _active_categories(db, ctx.facility_id)}
    claimed: list[uuid.UUID] = []
    accounts: list[dict] = []
    try:
        for result in results:
            if result.action == "unchanged":
                continue
            if result.action == "create":
                supplier = _new_supplier(ctx, result, categories)
                db.add(supplier)
                await db.flush()
                if result.create_account:
                    email = result.values["contact_email"]
                    password = generate_temporary_password()
                    account_id = uuid.uuid4()
                    await claim_email_once(
                        control_db,
                        principal_id=account_id,
                        user_type="supplier",
                        email=email,
                        tenant_id=ctx.tenant_id,
                    )
                    claimed.append(account_id)
                    db.add(SupplierUser(
                        id=account_id,
                        supplier_id=supplier.id,
                        name=f"{supplier.company_name} Portal",
                        email=email,
                        password_hash=hash_password(password),
                        must_change_password=True,
                    ))
                    _audit(
                        db, ctx, action="supplier_user.create", entity_type="supplier_user",
                        entity_id=account_id,
                        after={"email": email, "supplier_id": str(supplier.id), "via": "import"},
                    )
                    accounts.append({
                        "code": supplier.code,
                        "company_name": supplier.company_name,
                        "email": email,
                        "password": password,
                    })
                await db.flush()
                await db.refresh(supplier, ["allowed_product_categories"])
                _audit(
                    db, ctx, action="supplier.create", entity_type="supplier",
                    entity_id=supplier.id, after={**_supplier_snapshot(supplier), "via": "import"},
                )
            else:
                supplier = (
                    await db.execute(
                        select(Supplier)
                        .options(selectinload(Supplier.allowed_product_categories))
                        .where(Supplier.id == result.supplier_id)
                    )
                ).scalar_one()
                before = _supplier_snapshot(supplier)
                _apply_update(supplier, result, categories)
                _audit(
                    db, ctx, action="supplier.update", entity_type="supplier",
                    entity_id=supplier.id, before=before,
                    after={**_supplier_snapshot(supplier), "via": "import"},
                )
        _audit(
            db, ctx, action="supplier.import", entity_type="facility", entity_id=ctx.facility_id,
            after={
                "file": file.filename,
                "created": summary["create"],
                "updated": summary["update"],
                "unchanged": summary["unchanged"],
                "accounts": summary["accounts"],
            },
        )
        await db.commit()
    except BaseException:
        await db.rollback()
        for principal_id in claimed:  # yarim kalan dizin kayitlarini geri al
            await release(control_db, principal_id)
        raise

    return ok({
        "summary": summary,
        "rows": [r.as_dict() for r in results],
        # Gecici parolalar YALNIZCA bu yanitta doner (tekil olusturmayla ayni).
        "accounts": accounts,
    })


def _new_supplier(
    ctx: FacilityContext, result: RowResult, categories: dict[uuid.UUID, ProductCategory]
) -> Supplier:
    values = result.values
    supplier = Supplier(
        tenant_id=ctx.tenant_id,
        facility_id=ctx.facility_id,
        code=result.code,
        status=(
            SupplierStatus.inactive if values.get("is_active") is False else SupplierStatus.active
        ),
        auto_approval_enabled=bool(values.get("auto_approval_enabled", False)),
        cargo_enabled=bool(values.get("cargo_enabled", False)),
        additional_emails=values.get("additional_emails") or None,
        minute_limits_json=result.minute_limits,
        allowed_product_categories=[categories[i] for i in result.category_ids or []],
    )
    for key in SIMPLE_FIELDS:
        if key in values and key not in ("auto_approval_enabled", "cargo_enabled"):
            setattr(supplier, key, values[key])
    return supplier


def _apply_update(
    supplier: Supplier, result: RowResult, categories: dict[uuid.UUID, ProductCategory]
) -> None:
    values = dict(result.values)
    if "is_active" in values:
        supplier.status = (
            SupplierStatus.active if values.pop("is_active") else SupplierStatus.inactive
        )
    if "additional_emails" in values:
        supplier.additional_emails = values.pop("additional_emails") or None
    for key, value in values.items():
        setattr(supplier, key, value)
    if result.category_ids is not None:
        supplier.allowed_product_categories = [categories[i] for i in result.category_ids]
    if result.minute_limits_set:
        supplier.minute_limits_json = result.minute_limits
