"""Bind a shell-owned, per-launch account only to a local native desktop."""

import os

from .passwords import hash_password


def configure_desktop_owner(cfg, token, *, local_loopback):
    local = cfg.local_auth
    if not (
        local_loopback
        and os.environ.get("ECHO_DESKTOP") == "1"
        and os.environ.get("ECHO_NATIVE_OS") == "1"
        and isinstance(token, str)
        and len(token) >= 32
        and local.enabled
        and not local.users
    ):
        return cfg
    # Never persist this password or alter explicitly configured accounts.
    # No other username can receive these roles because users is a fixed map.
    return cfg.model_copy(
        update={
            "local_auth": local.model_copy(
                update={
                    "users": {"owner": hash_password(token)},
                    "allow_any_username": False,
                    "default_roles": ["admin", "user", "local"],
                }
            )
        }
    )
