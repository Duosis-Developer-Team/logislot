from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.responses import ok

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    return ok({"status": "ok", "service": "logislot-api"})


@router.get("/ready")
async def ready(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1"))
    return ok({"status": "ready", "database": "up"})
