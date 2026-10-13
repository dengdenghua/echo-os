"""Agent authentication compatibility surface consumed by Echo OS."""

import time
from typing import Any

from runtime.adapters.integrations.local_auth import create_local_auth_router
from runtime.adapters.integrations.local_auth.config import LocalAuthConfig
from runtime.safety.auth.identity import Identity, JWTError, verify_jwt_hs256
from runtime.safety.auth.principal import (
    LEGACY_SESSION_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    clear_session_cookie,
)

from .passwords import hash_password, verify_password

OWNER_AGENT_ROLE = "admin"


def provision_owner_identity(
    identity_store: Any,
    *,
    username: str,
    actor_prefix: str = "local:",
    base_roles: tuple[str, ...] = ("user", "local"),
) -> bool:
    """Give the device owner Agent's ``admin`` role before the first login.

    Agent's local login creates an unknown account with its default roles
    (``user``/``local``) only. The Echo OS owner is the device administrator,
    so Agent's own control plane (model connections, agents, channels) must
    see the same role or the owner cannot configure a model at all. Member
    accounts are never passed here and keep Agent's defaults. Returns whether
    the store changed.
    """

    getter = getattr(identity_store, "get", None)
    adder = getattr(identity_store, "add", None)
    if not callable(getter) or not callable(adder):
        return False
    actor_id = f"{actor_prefix}{username}"
    existing = getter(actor_id)
    if existing is None:
        adder(
            Identity(
                actor_id=actor_id,
                roles=tuple(dict.fromkeys((*base_roles, OWNER_AGENT_ROLE))),
                metadata={"provider": "local", "username": username, "created_at": time.time()},
            )
        )
        return True
    roles = tuple(str(role) for role in getattr(existing, "roles", ()) or ())
    if OWNER_AGENT_ROLE in {role.lower() for role in roles}:
        return False
    remover = getattr(identity_store, "remove", None)
    if not callable(remover):
        return False
    remover(actor_id)
    adder(
        Identity(
            actor_id=actor_id,
            roles=(*roles, OWNER_AGENT_ROLE),
            metadata=dict(getattr(existing, "metadata", None) or {}),
        )
    )
    return True


__all__ = [
    "JWTError",
    "LocalAuthConfig",
    "OWNER_AGENT_ROLE",
    "SESSION_COOKIE_NAME",
    "LEGACY_SESSION_COOKIE_NAME",
    "clear_session_cookie",
    "create_local_auth_router",
    "hash_password",
    "provision_owner_identity",
    "verify_jwt_hs256",
    "verify_password",
]
