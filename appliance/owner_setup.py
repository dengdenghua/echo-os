"""First-boot owner setup from a browser on the home network.

A device that booted without ``ECHO_ADMIN_PASSWORD`` holds a generated
administrator password nobody has to know.  Until the owner chooses one, this
module offers exactly one web flow:

- It exists only while the auth store is marked ``owner_setup_pending``; any
  chosen password (this flow or rotation in Settings) closes it for good.
- It answers only loopback/private clients on a LAN host name.  Cross-origin
  browser requests are already refused by ``ApplianceWebSecurityMiddleware``;
  the handler re-checks Origin so the rule does not depend on middleware order.
- It requires a one-time setup code printed on the device console/log, the
  same trust model as the generated first-boot password: whoever can read the
  device console may claim the device.  The code is regenerated on every boot
  while setup is pending and after a few wrong attempts, and it is useless once
  an owner exists.
- The password must pass ``owner_password_problem``; success is audited and
  revokes every session minted with the generated password.
"""

from __future__ import annotations

import hmac
import ipaddress
import logging
import os
import secrets
import threading
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from appliance.account_security import (
    MAX_PASSWORD_BYTES,
    MIN_PASSWORD_CHARACTERS,
    OWNER_PASSWORD_MIN_CHARACTER_KINDS,
    AccountSecurityError,
    ApplianceAccountSecurity,
)
from appliance.audit import ApplianceAudit, AuditIntegrityError
from appliance.auth import ADMIN_USERNAME
from appliance.web_security import (
    TRUSTED_ORIGINS_ENV,
    _csv_values,
    _is_default_lan_host,
    _loopback_alias_origins,
    _normalized_host,
    _normalized_origin,
    _scope_origin,
)

logger = logging.getLogger("appliance.owner_setup")

SETUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
SETUP_CODE_LENGTH = 8
MAX_CODE_FAILURES = 5
_SETUP_ACTOR = "owner-setup"


def _new_setup_code() -> str:
    return "".join(secrets.choice(SETUP_CODE_ALPHABET) for _ in range(SETUP_CODE_LENGTH))


def format_setup_code(code: str) -> str:
    return f"{code[:4]}-{code[4:]}"


def normalize_setup_code(value: str) -> str:
    return "".join(char for char in value.upper() if char.isalnum())


class OwnerSetupBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    setup_code: str = Field(..., alias="setupCode", min_length=1, max_length=32)
    password: str = Field(..., min_length=1, max_length=256)


class OwnerSetupService:
    """Hold the one-time setup code and gate the single owner-password write."""

    def __init__(
        self,
        *,
        account_security: ApplianceAccountSecurity,
        audit: ApplianceAudit,
        announce: Any = None,
        enabled: bool = True,
    ) -> None:
        self._enabled = enabled
        self._security = account_security
        self._audit = audit
        self._announce = announce or _log_setup_code
        self._lock = threading.Lock()
        self._code: str | None = None
        self._failures = 0
        if self.pending:
            self._issue_code()

    @property
    def pending(self) -> bool:
        return self._enabled and self._security.owner_setup_pending

    def _issue_code(self) -> None:
        self._code = _new_setup_code()
        self._failures = 0
        self._announce(format_setup_code(self._code))

    def _record(self, *, outcome: str, client: str, reason: str | None = None) -> None:
        metadata: dict[str, Any] = {"client": client}
        if reason:
            metadata["reason"] = reason
        try:
            self._audit.record(
                actor=_SETUP_ACTOR,
                action="owner.setup",
                target=ADMIN_USERNAME,
                outcome=outcome,
                metadata=metadata,
            )
        except (OSError, AuditIntegrityError) as exc:
            raise AccountSecurityError(503, "appliance audit unavailable") from exc

    def complete(self, *, setup_code: str, password: str, client: str) -> int:
        with self._lock:
            if not self.pending or self._code is None:
                self._code = None
                raise AccountSecurityError(409, "owner_already_set")
            candidate = normalize_setup_code(setup_code)
            if not hmac.compare_digest(candidate.encode(), self._code.encode()):
                self._failures += 1
                self._record(outcome="rejected", client=client, reason="invalid_setup_code")
                if self._failures >= MAX_CODE_FAILURES:
                    self._issue_code()
                    raise AccountSecurityError(429, "setup_code_rotated")
                raise AccountSecurityError(403, "invalid_setup_code")
            floor = self._security.establish_owner_password(
                actor=f"{_SETUP_ACTOR}:{client}", new_password=password
            )
            self._code = None
            return floor


def _log_setup_code(code: str) -> None:
    logger.warning(
        "ECHO OS first-boot owner setup code: %s  (open ECHO OS in a browser on the same "
        "network, enter this code and choose the owner password; it stops working once "
        "an owner password is set)",
        code,
    )


def _client_address(request: Request) -> str:
    peer = request.client.host if request.client else ""
    try:
        peer_address = ipaddress.ip_address(peer)
    except ValueError:
        return peer or "unknown"
    # The appliance nginx (same host) forwards the browser address. Trust the
    # header only from a loopback peer so a LAN client cannot spoof it.
    if peer_address.is_loopback:
        forwarded = request.headers.get("x-real-ip", "").strip()
        if forwarded:
            return forwarded
    return peer


def _is_local_client(address: str) -> bool:
    try:
        parsed = ipaddress.ip_address(address)
    except ValueError:
        return False
    if isinstance(parsed, ipaddress.IPv6Address) and parsed.ipv4_mapped is not None:
        parsed = parsed.ipv4_mapped
    return parsed.is_loopback or parsed.is_private or parsed.is_link_local


def _same_origin(request: Request) -> bool:
    """Apply the browser-boundary Origin rule again inside the handler."""

    origin = request.headers.get("origin", "").strip()
    if not origin:
        return True
    host_header = request.headers.get("host", "")
    try:
        allowed = {
            _normalized_origin(item) for item in _csv_values(os.environ.get(TRUSTED_ORIGINS_ENV))
        }
        allowed.add(_scope_origin(request.scope, host_header))
        allowed |= _loopback_alias_origins(request.scope, host_header)
        return _normalized_origin(origin) in allowed
    except ValueError:
        return False


def _setup_reachable(request: Request) -> bool:
    try:
        host = _normalized_host(request.headers.get("host", ""))
    except ValueError:
        return False
    return _is_default_lan_host(host) and _is_local_client(_client_address(request))


def create_owner_setup_router(service: OwnerSetupService) -> APIRouter:
    router = APIRouter(prefix="/api/appliance/setup", tags=["appliance", "owner-setup"])

    @router.get("/status")
    def setup_status(request: Request) -> dict[str, Any]:
        required = service.pending
        return {
            "ownerSetupRequired": required,
            "reachable": required and _setup_reachable(request),
            "username": ADMIN_USERNAME,
            "passwordRules": {
                "minCharacters": MIN_PASSWORD_CHARACTERS,
                "maxBytes": MAX_PASSWORD_BYTES,
                "minCharacterKinds": OWNER_PASSWORD_MIN_CHARACTER_KINDS,
            },
        }

    @router.post("/owner")
    async def setup_owner(body: OwnerSetupBody, request: Request) -> dict[str, Any]:
        if not service.pending:
            raise HTTPException(status_code=409, detail="owner_already_set")
        if not _same_origin(request):
            raise HTTPException(status_code=403, detail="cross-origin request rejected")
        if not _setup_reachable(request):
            raise HTTPException(status_code=403, detail="setup_requires_local_network")
        try:
            floor = await run_in_threadpool(
                service.complete,
                setup_code=body.setup_code,
                password=body.password,
                client=_client_address(request),
            )
        except AccountSecurityError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
        return {"success": True, "username": ADMIN_USERNAME, "sessionNotBefore": floor}

    return router


__all__ = [
    "MAX_CODE_FAILURES",
    "OwnerSetupBody",
    "OwnerSetupService",
    "create_owner_setup_router",
    "format_setup_code",
    "normalize_setup_code",
]
