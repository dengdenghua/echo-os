"""The device owner is Agent's admin too.

Golden path 2026-10: on a fresh appliance the owner signed in, opened
系统设置 › 模型与用量 and every model-connection call (测试连接 / 保存) answered
``403 admin role required``. Agent's local login creates unknown accounts with
``user``/``local`` only, so the device administrator could never configure a
model. The appliance now provisions ``local:admin`` with Agent's ``admin`` role
before the first login; member accounts keep Agent's defaults.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from appliance.agent_api.auth import provision_owner_identity
from appliance.extension import register_app
from runtime.platform.extensions import AppExtensionContext
from runtime.safety.auth.identity import Identity, IdentityStore


def test_provision_adds_owner_with_admin_role() -> None:
    store = IdentityStore()

    assert provision_owner_identity(store, username="admin") is True

    owner = store.get("local:admin")
    assert owner is not None
    assert owner.roles == ("user", "local", "admin")
    assert store.actor_ids() == ["local:admin"]


def test_provision_upgrades_existing_owner_once_and_keeps_metadata() -> None:
    store = IdentityStore()
    store.add(Identity("local:admin", ("user", "local"), {"provider": "local", "tenant_id": "t1"}))

    assert provision_owner_identity(store, username="admin") is True
    assert provision_owner_identity(store, username="admin") is False

    owner = store.get("local:admin")
    assert owner is not None
    assert owner.roles == ("user", "local", "admin")
    assert owner.metadata == {"provider": "local", "tenant_id": "t1"}


def test_provision_ignores_a_missing_store() -> None:
    assert provision_owner_identity(None, username="admin") is False


def test_owner_login_keeps_agent_admin_role(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("ECHO_APPLIANCE", "1")
    monkeypatch.setenv("ECHO_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ECHO_ADMIN_PASSWORD", "test-pass-123456")
    nas_root = tmp_path / "nas"
    nas_root.mkdir()
    monkeypatch.setenv("ECHO_NAS_ROOT", str(nas_root))
    store = IdentityStore()
    app = FastAPI()
    register_app(app, AppExtensionContext(identity_store=store))

    with TestClient(app) as client:
        response = client.post(
            "/api/auth/local/login",
            json={"username": "admin", "password": "test-pass-123456"},
            headers={"Origin": "http://testserver"},
        )

    assert response.status_code == 200
    owner = store.get("local:admin")
    assert owner is not None
    assert "admin" in owner.roles
