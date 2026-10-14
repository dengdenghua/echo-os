import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from appliance.agent_api.device_workspace import create_device_workspace_router
from appliance.approval import HighRiskApprovalService
from appliance.audit import ApplianceAudit
from appliance.device_link import DeviceLinkService, create_device_link_router
from appliance.security import ApplianceAuthenticator
from runtime.safety.auth.identity import encode_jwt_hs256
from runtime.tentacle.coordinator import TentacleCoordinator


@pytest.mark.parametrize("prefix", ["/api/appliance/device-link", "/api/tentacle"])
def test_operator_bridge_targets_bound_phone_and_preserves_binary_json(tmp_path, prefix):
    secret = "mirror-test-secret"
    coordinator = TentacleCoordinator(host="127.0.0.1", port=0, dashboard_port=None)
    service = DeviceLinkService(
        data_dir=tmp_path / "link",
        jwt_secret=secret,
        public_host="192.168.1.2",
        coordinator_factory=lambda: coordinator,
    )
    audit = ApplianceAudit.from_data_dir(tmp_path / "audit", jwt_secret=secret)
    approval = HighRiskApprovalService(
        password_hash=hashlib.sha256(b"test").hexdigest(), jwt_secret=secret, audit=audit
    )

    @asynccontextmanager
    async def lifespan(app):
        await service.enable()
        yield
        await service.shutdown()

    app = FastAPI(lifespan=lifespan)
    app.include_router(
        create_device_link_router(service, jwt_secret=secret, approval=approval, audit=audit)
    )
    app.include_router(
        create_device_workspace_router(service, authenticator=ApplianceAuthenticator(secret))
    )
    url = f"{prefix}/devices/phone-two/mirror/files"
    admin = {
        "Authorization": "Bearer "
        + encode_jwt_hs256({"sub": "local:admin", "exp": 9_999_999_999}, secret=secret)
    }
    member = {
        "Authorization": "Bearer "
        + encode_jwt_hs256({"sub": "local:member", "exp": 9_999_999_999}, secret=secret)
    }
    with TestClient(app) as client:
        assert client.get("/api/tentacle/devices").status_code == 401
        assert client.get("/api/tentacle/devices", headers=member).status_code == 403
        assert client.get("/api/tentacle/devices", headers=admin).json() == []
        assert client.post(url, json={}).status_code == 401
        assert client.post(url, headers=member, json={}).status_code == 403
        assert client.post(url, headers=admin, json={}).status_code == 409
        from urllib.parse import parse_qs, urlsplit

        invite = service.create_pairing_invitation()
        token = parse_qs(urlsplit(invite["connectString"]).query)["token"][0]
        with client.websocket_connect("/api/appliance/device-link/ws") as phone:
            phone.send_json(
                {
                    "id": "hello",
                    "method": "device/hello",
                    "params": {
                        "tentacle_id": "phone-two",
                        "auth_token": token,
                        "platform": "android",
                        "capabilities": ["android.exchange_files"],
                    },
                }
            )
            assert phone.receive_json()["result"]["registered"]
            os_devices = client.get("/api/appliance/device-link", headers=admin).json()["devices"]
            ai_devices = client.get("/api/tentacle/devices", headers=admin).json()
            assert ai_devices[0]["tentacle_id"] == os_devices[0]["id"] == "phone-two"
            assert ai_devices[0]["is_online"] == os_devices[0]["online"] is True
            assert set(ai_devices[0]["meta"]) == {"brand", "model"}
            with ThreadPoolExecutor() as executor:
                future = executor.submit(
                    client.post,
                    url,
                    headers=admin,
                    json={"operation": "read", "name": "photo.bin", "offset": 0},
                )
                request = phone.receive_json()
                assert request["params"]["tentacle_id"] == "phone-two"
                assert request["params"]["tool"] == "android.exchange_files"
                phone.send_json(
                    {
                        "jsonrpc": "2.0",
                        "method": "tool/result",
                        "params": {
                            "call_id": request["id"],
                            "success": True,
                            "data": json.dumps({"data": "AP8CAA=="}),
                        },
                    }
                )
                response = future.result(timeout=5)
                assert response.status_code == 200
                assert response.json() == {"data": "AP8CAA=="}
            assert client.post(url, headers=admin, content=b"x" * 24_001).status_code == 413
            assert (
                client.post(url.replace("files", "frame"), headers=admin, json={}).status_code
                == 409
            )
            assert (
                client.post(url.replace("files", "shell"), headers=admin, json={}).status_code
                == 404
            )
        assert client.post(url, headers=admin, json={}).status_code == 409
