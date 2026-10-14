"""First-boot owner setup: one LAN-only, code-gated, audited password write."""

from __future__ import annotations

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from appliance import owner_setup as owner_setup_module
from appliance.account_security import owner_password_problem
from appliance.extension import register_app
from runtime.platform.extensions import AppExtensionContext

STRONG_PASSWORD = "Harbor-Light-2147"
LOCAL_CLIENT = ("127.0.0.1", 50000)
LAN_CLIENT = ("192.168.1.24", 50000)


def _app(tmp_path, monkeypatch, *, admin_password: str | None = None) -> tuple[FastAPI, list[str]]:
    monkeypatch.setenv("ECHO_APPLIANCE", "1")
    monkeypatch.setenv("ECHO_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("ECHO_NAS_ROOT", str(tmp_path / "nas"))
    monkeypatch.delenv("ECHO_APPLIANCE_DEV_PASSWORDLESS", raising=False)
    monkeypatch.delenv("ECHO_APPLIANCE_TRUSTED_ORIGINS", raising=False)
    monkeypatch.delenv("ECHO_REMOTE_ACCESS_URL", raising=False)
    if admin_password is None:
        monkeypatch.delenv("ECHO_ADMIN_PASSWORD", raising=False)
    else:
        monkeypatch.setenv("ECHO_ADMIN_PASSWORD", admin_password)
    (tmp_path / "nas").mkdir(exist_ok=True)
    codes: list[str] = []
    monkeypatch.setattr(owner_setup_module, "_log_setup_code", codes.append)
    app = FastAPI()
    register_app(app, AppExtensionContext(identity_store=None))
    return app, codes


def _setup(client: TestClient, code: str, password: str = STRONG_PASSWORD, **headers: str):
    return client.post(
        "/api/appliance/setup/owner",
        json={"setupCode": code, "password": password},
        headers={"Origin": "http://testserver", **headers},
    )


def _login(client: TestClient, password: str) -> int:
    return client.post(
        "/api/auth/local/login",
        json={"username": "admin", "password": password},
        headers={"Origin": "http://testserver"},
    ).status_code


def _owner_setup_events(app: FastAPI) -> list[dict]:
    return [
        event
        for event in app.state.echo_appliance_audit.recent(200)
        if event.get("payload", event).get("action") == "owner.setup"
    ]


def _outcomes(app: FastAPI) -> list[str]:
    return [event.get("payload", event)["outcome"] for event in _owner_setup_events(app)]


def test_fresh_device_offers_setup_and_lands_signed_in(tmp_path, monkeypatch):
    app, codes = _app(tmp_path, monkeypatch)
    assert len(codes) == 1 and len(codes[0]) == 9 and codes[0][4] == "-"
    client = TestClient(app, client=LOCAL_CLIENT)

    status = client.get("/api/appliance/setup/status").json()
    assert status["ownerSetupRequired"] is True
    assert status["reachable"] is True
    assert status["username"] == "admin"
    assert status["passwordRules"]["minCharacters"] == 12

    # Lower-case and without the dash still matches the printed code.
    response = _setup(client, codes[0].replace("-", "").lower())
    assert response.status_code == 200, response.text
    assert response.json()["success"] is True
    assert _login(client, STRONG_PASSWORD) == 200

    assert client.get("/api/appliance/setup/status").json()["ownerSetupRequired"] is False
    store = json.loads((tmp_path / "data" / "appliance-auth.json").read_text())
    assert "owner_setup_pending" not in store
    assert _outcomes(app)[-2:] == ["attempted", "succeeded"]


def test_setup_is_refused_once_an_owner_exists(tmp_path, monkeypatch):
    app, codes = _app(tmp_path, monkeypatch, admin_password="owner-chosen-pass")
    assert codes == []
    client = TestClient(app, client=LOCAL_CLIENT)

    assert client.get("/api/appliance/setup/status").json()["ownerSetupRequired"] is False
    response = _setup(client, "ABCD-EFGH")
    assert response.status_code == 409
    assert response.json()["detail"] == "owner_already_set"
    assert _login(client, "owner-chosen-pass") == 200


def test_setup_runs_only_once(tmp_path, monkeypatch):
    app, codes = _app(tmp_path, monkeypatch)
    client = TestClient(app, client=LOCAL_CLIENT)
    assert _setup(client, codes[0]).status_code == 200

    second = _setup(client, codes[0], password="Another-Owner-9931")
    assert second.status_code == 409
    assert _login(client, STRONG_PASSWORD) == 200
    assert _login(client, "Another-Owner-9931") == 401


def test_setup_survives_restart_until_completed(tmp_path, monkeypatch):
    _first_app, first_codes = _app(tmp_path, monkeypatch)
    _first_app.state.echo_appliance_state_lock.release()
    app, codes = _app(tmp_path, monkeypatch)
    assert codes and codes[0] != first_codes[0]
    client = TestClient(app, client=LOCAL_CLIENT)
    assert _setup(client, first_codes[0]).status_code == 403
    assert _setup(client, codes[0]).status_code == 200


def test_setup_refuses_cross_origin_requests(tmp_path, monkeypatch):
    app, codes = _app(tmp_path, monkeypatch)
    client = TestClient(app, client=LOCAL_CLIENT)

    response = _setup(client, codes[0], Origin="http://evil.example")
    assert response.status_code == 403
    response = client.post(
        "/api/appliance/setup/owner",
        json={"setupCode": codes[0], "password": STRONG_PASSWORD},
        headers={"Sec-Fetch-Site": "cross-site"},
    )
    assert response.status_code == 403
    assert client.get("/api/appliance/setup/status").json()["ownerSetupRequired"] is True


def test_setup_handler_rechecks_origin_without_the_middleware(tmp_path, monkeypatch):
    app, codes = _app(tmp_path, monkeypatch)
    service = app.state.echo_appliance_owner_setup
    bare = FastAPI()
    bare.include_router(owner_setup_module.create_owner_setup_router(service))
    client = TestClient(bare, client=LOCAL_CLIENT)

    response = _setup(client, codes[0], Origin="http://evil.example")
    assert response.status_code == 403
    assert service.pending is True


@pytest.mark.parametrize(
    ("client_address", "host", "extra"),
    [
        (("8.8.4.4", 50000), "testserver", {}),
        # A LAN peer cannot claim another address through X-Real-IP.
        (("8.8.4.4", 50000), "testserver", {"X-Real-IP": "127.0.0.1"}),
        # The appliance nginx forwards a public browser address.
        (LOCAL_CLIENT, "testserver", {"X-Real-IP": "1.1.1.1"}),
    ],
)
def test_setup_is_lan_only(tmp_path, monkeypatch, client_address, host, extra):
    app, codes = _app(tmp_path, monkeypatch)
    client = TestClient(app, client=client_address, base_url=f"http://{host}")

    status = client.get("/api/appliance/setup/status", headers=extra).json()
    assert status["ownerSetupRequired"] is True
    assert status["reachable"] is False
    response = _setup(client, codes[0], **extra)
    assert response.status_code == 403
    assert response.json()["detail"] == "setup_requires_local_network"


def test_setup_is_refused_on_the_remote_access_host(tmp_path, monkeypatch):
    monkeypatch.setenv("ECHO_REMOTE_ACCESS_URL", "https://echo.example.com")
    app, codes = _app(tmp_path, monkeypatch)
    monkeypatch.setenv("ECHO_REMOTE_ACCESS_URL", "https://echo.example.com")
    client = TestClient(app, client=LOCAL_CLIENT, base_url="https://echo.example.com")

    response = client.post(
        "/api/appliance/setup/owner",
        json={"setupCode": codes[0], "password": STRONG_PASSWORD},
        headers={"Origin": "https://echo.example.com"},
    )
    assert response.status_code == 403


def test_lan_client_can_complete_setup(tmp_path, monkeypatch):
    app, codes = _app(tmp_path, monkeypatch)
    client = TestClient(app, client=LAN_CLIENT)
    assert _setup(client, codes[0]).status_code == 200


@pytest.mark.parametrize(
    ("password", "problem"),
    [
        ("Short-1a", "password_too_short"),
        ("alllowercaseletters", "password_too_simple"),
        ("ALLUPPER12345678", "password_too_simple"),
        ("Aa1!Aa1!Aa1!Aa1!", "password_too_repetitive"),
        ("Aa1-" + "x" * 80, "password_too_long"),
    ],
)
def test_setup_enforces_the_password_rule(tmp_path, monkeypatch, password, problem):
    assert owner_password_problem(password) == problem
    app, codes = _app(tmp_path, monkeypatch)
    client = TestClient(app, client=LOCAL_CLIENT)

    response = _setup(client, codes[0], password=password)
    assert response.status_code == 422
    assert problem in response.text
    assert client.get("/api/appliance/setup/status").json()["ownerSetupRequired"] is True


@pytest.mark.parametrize(
    "password",
    ["Harbor-Light-2147", "harbor light 2147", "记忆不灭文明回响Echo2147", "WHITE-HARBOR-2147"],
)
def test_strong_passwords_pass(password):
    assert owner_password_problem(password) is None


def test_wrong_codes_are_audited_and_rotate_the_code(tmp_path, monkeypatch):
    app, codes = _app(tmp_path, monkeypatch)
    client = TestClient(app, client=LOCAL_CLIENT)

    for _ in range(owner_setup_module.MAX_CODE_FAILURES - 1):
        assert _setup(client, "WRNG-CODE").status_code == 403
    rotated = _setup(client, "WRNG-CODE")
    assert rotated.status_code == 429
    assert rotated.json()["detail"] == "setup_code_rotated"
    assert len(codes) == 2 and codes[1] != codes[0]

    assert _setup(client, codes[0]).status_code == 403
    assert _setup(client, codes[1]).status_code == 200
    outcomes = _outcomes(app)
    assert outcomes.count("rejected") == owner_setup_module.MAX_CODE_FAILURES + 1
    assert outcomes[-1] == "succeeded"
    rejected = next(
        event.get("payload", event)
        for event in _owner_setup_events(app)
        if event.get("payload", event)["outcome"] == "rejected"
    )
    assert rejected["metadata"]["reason"] == "invalid_setup_code"
    assert "password" not in json.dumps(rejected).lower().replace("password_", "")


def test_setup_revokes_sessions_from_the_generated_password(tmp_path, monkeypatch):
    app, codes = _app(tmp_path, monkeypatch)
    client = TestClient(app, client=LOCAL_CLIENT)
    security = app.state.echo_appliance_account_security
    before = security.session_not_before

    assert _setup(client, codes[0]).status_code == 200
    assert security.session_not_before > before
    assert security.owner_setup_pending is False


def test_rotating_the_password_in_settings_closes_setup(tmp_path, monkeypatch):
    app, codes = _app(tmp_path, monkeypatch)
    security = app.state.echo_appliance_account_security
    assert security.owner_setup_pending is True

    security.rotate_password(actor="local:admin", new_password="rotated-device-pass-2026")
    client = TestClient(app, client=LOCAL_CLIENT)
    assert client.get("/api/appliance/setup/status").json()["ownerSetupRequired"] is False
    assert _setup(client, codes[0]).status_code == 409


def test_development_passwordless_gate_hides_setup(tmp_path, monkeypatch):
    monkeypatch.setenv("ECHO_APPLIANCE_DEV_PASSWORDLESS", "1")
    monkeypatch.setenv("ECHO_APPLIANCE", "1")
    monkeypatch.setenv("ECHO_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("ECHO_NAS_ROOT", str(tmp_path / "nas"))
    monkeypatch.delenv("ECHO_ADMIN_PASSWORD", raising=False)
    (tmp_path / "nas").mkdir()
    codes: list[str] = []
    monkeypatch.setattr(owner_setup_module, "_log_setup_code", codes.append)
    app = FastAPI()
    register_app(app, AppExtensionContext(identity_store=None))
    client = TestClient(app, client=LOCAL_CLIENT)

    assert codes == []
    assert client.get("/api/appliance/setup/status").json()["ownerSetupRequired"] is False
    assert _setup(client, "ABCD-EFGH").status_code == 409
