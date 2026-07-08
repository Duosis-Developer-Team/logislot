"""Standart API hata modeli.

Tum hatalar `{"success": false, "error": {"code", "message", "details"}}`
zarfina donusur. Rule engine sert kural kodlari da bu yapiyla tasinir.
"""

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Any = None,
    ) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


class NotFoundError(ApiError):
    def __init__(self, message: str = "Kayit bulunamadi") -> None:
        super().__init__("NOT_FOUND", message, status.HTTP_404_NOT_FOUND)


class UnauthorizedError(ApiError):
    def __init__(self, message: str = "Kimlik dogrulamasi gerekli") -> None:
        super().__init__("UNAUTHORIZED", message, status.HTTP_401_UNAUTHORIZED)


class ForbiddenError(ApiError):
    def __init__(self, message: str = "Bu islem icin yetkiniz yok") -> None:
        super().__init__("FORBIDDEN", message, status.HTTP_403_FORBIDDEN)


class RuleViolationError(ApiError):
    """Sert kural ihlali. `code` rule engine hata kodudur."""

    def __init__(self, code: str, message: str, details: Any = None) -> None:
        super().__init__(code, message, 422, details)


def error_body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    return {
        "success": False,
        "data": None,
        "error": {"code": code, "message": message, "details": jsonable_encoder(details)},
    }


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message, exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=error_body("VALIDATION_ERROR", "Istek dogrulanamadi", exc.errors()),
        )
