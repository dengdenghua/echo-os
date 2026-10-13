"""SEC-4 regression: mutating the path-denylist requires the admin role.

`config_router` only had a router-level authentication gate (`_auth_dep`), no
role check — so any authenticated non-admin user could `POST`/`DELETE`
`/api/path-denylist`, an override of a security control. The mutating
path-denylist endpoints now carry `_require_admin` (mirroring system_router);
dev mode (`require_auth=False`) stays a no-op.
"""

from __future__ import annotations

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from runtime.safety.auth import Identity, IdentityStore  # noqa: E402
from runtime.sensing.gateway.config_router import create_config_router  # noqa: E402


def _client(*, require_auth: bool) -> TestClient:
    store = IdentityStore()
    store.add(Identity(actor_id="boss", roles=("admin",)), api_key_plaintext="sk-admin")
    store.add(Identity(actor_id="user", roles=()), api_key_plaintext="sk-user")
    cr = create_config_router(require_auth=require_auth, identity_store=store)
    app = FastAPI()
    app.include_router(cr.router)
    return TestClient(app)


def _bearer(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


def test_non_admin_cannot_mutate_path_denylist() -> None:
    client = _client(require_auth=True)
    r = client.post("/api/path-denylist", json={"path": "/tmp/x"}, headers=_bearer("sk-user"))
    assert r.status_code == 403


def test_admin_can_mutate_path_denylist(monkeypatch) -> None:
    monkeypatch.setattr(
        "runtime.safety.auth.path_denylist.add_user_denylist_entry",
        lambda p: [p],
    )
    client = _client(require_auth=True)
    r = client.post("/api/path-denylist", json={"path": "/tmp/x"}, headers=_bearer("sk-admin"))
    assert r.status_code == 200


def test_delete_path_denylist_also_admin_gated() -> None:
    client = _client(require_auth=True)
    r = client.request(
        "DELETE", "/api/path-denylist", json={"path": "/tmp/x"}, headers=_bearer("sk-user")
    )
    assert r.status_code == 403


def test_dev_mode_does_not_require_admin(monkeypatch) -> None:
    monkeypatch.setattr(
        "runtime.safety.auth.path_denylist.add_user_denylist_entry",
        lambda p: [p],
    )
    client = _client(require_auth=False)
    r = client.post("/api/path-denylist", json={"path": "/tmp/x"})
    assert r.status_code == 200



_JWT_SECRET = "Golden-Path-Cookie-Secret-0123456789!"


def _session_cookie(actor_id: str) -> dict[str, str]:
    import time

    from runtime.safety.auth.identity import encode_jwt_hs256
    from runtime.safety.auth.principal import SESSION_COOKIE_NAME

    now = int(time.time())
    token = encode_jwt_hs256(
        {"sub": actor_id, "iat": now, "exp": now + 600, "iss": "echo-agent"},
        secret=_JWT_SECRET,
    )
    return {SESSION_COOKIE_NAME: token}


def _cookie_client() -> TestClient:
    store = IdentityStore()
    store.add(Identity(actor_id="local:admin", roles=("user", "local", "admin")))
    store.add(Identity(actor_id="local:member", roles=("user", "local")))
    cr = create_config_router(
        require_auth=True,
        identity_store=store,
        jwt_secret=_JWT_SECRET,
        jwt_issuer="echo-agent",
    )
    app = FastAPI()
    app.include_router(cr.router)
    return TestClient(app)


def test_admin_signed_in_with_the_session_cookie_passes_the_gate(monkeypatch) -> None:
    # Golden path 2026-10: the browser holds only the HttpOnly session cookie;
    # a bearer-only role lookup answered 403 to the device owner on 测试连接.
    monkeypatch.setattr(
        "runtime.safety.auth.path_denylist.add_user_denylist_entry",
        lambda p: [p],
    )
    client = _cookie_client()
    client.cookies.update(_session_cookie("local:admin"))
    r = client.post("/api/path-denylist", json={"path": "/tmp/x"})
    assert r.status_code == 200


def test_member_signed_in_with_the_session_cookie_is_still_forbidden() -> None:
    client = _cookie_client()
    client.cookies.update(_session_cookie("local:member"))
    r = client.post("/api/path-denylist", json={"path": "/tmp/x"})
    assert r.status_code == 403
