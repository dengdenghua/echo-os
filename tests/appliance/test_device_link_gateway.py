"""Device pairing and revocation through the production ASGI transport."""

from __future__ import annotations

from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocket, WebSocketDisconnect

from appliance.device_link import DeviceLinkService
from appliance.remote_access import RemoteAccessService
from runtime.tentacle.coordinator import TentacleCoordinator
from runtime.tentacle.transport.asgi import serve_device_socket

SECRET = "gateway-test-secret-not-for-production"


def test_remote_invitation_and_ws_pairing_revocation(tmp_path):
    coordinator = TentacleCoordinator(host="127.0.0.1", port=0, dashboard_port=None)
    remote = RemoteAccessService(
        provider="tailscale-sidecar", endpoint="https://echo.example.ts.net", probe=lambda: True
    )
    service = DeviceLinkService(
        data_dir=tmp_path,
        jwt_secret=SECRET,
        coordinator_factory=lambda: coordinator,
        remote_access=remote,
        allow_host_resolver_fallback=False,
    )

    @asynccontextmanager
    async def lifespan(app):
        await remote.refresh()
        await service.enable()
        yield
        await service.shutdown()

    app = FastAPI(lifespan=lifespan)
    app.add_api_websocket_route("/device/ws", service.serve_socket)
    with TestClient(app) as client:
        invitation = service.create_pairing_invitation()
        assert invitation["wsUrl"] == "wss://echo.example.ts.net/api/appliance/device-link/ws"
        assert invitation["scope"] == "private-network"
        assert service.status()["remoteAccess"]["features"]["deviceLink"] is True
        from urllib.parse import parse_qs, urlsplit

        token = parse_qs(urlsplit(invitation["connectString"]).query)["token"][0]
        with client.websocket_connect("/device/ws") as ws:
            ws.send_json(
                {
                    "jsonrpc": "2.0",
                    "id": "hello",
                    "method": "device/hello",
                    "params": {
                        "tentacle_id": "virtual-pc-1",
                        "platform": "windows",
                        "device_kind": "vm",
                        "auth_token": token,
                        "device_meta": {"model": "Test VM"},
                        "capabilities": ["device.info"],
                    },
                }
            )
            assert ws.receive_json()["result"]["registered"] is True
            device = service.status()["devices"][0]
            assert device["platform"] == "windows"
            assert device["model"] == "Test VM"
            client.portal.call(service.revoke_device, "virtual-pc-1")
            with pytest.raises(WebSocketDisconnect):
                ws.receive_json()
        assert not service.authenticate_device("virtual-pc-1", token)
        client.portal.call(service.disable)
        assert service.status()["remoteAccess"]["features"]["deviceLink"] is False
        with pytest.raises(WebSocketDisconnect), client.websocket_connect("/device/ws"):
            pass


def test_gateway_does_not_promote_unauthenticated_loopback_listener():
    coordinator = TentacleCoordinator(
        host="127.0.0.1", port=0, dashboard_port=None, auth_token=None
    )
    coordinator.ws_server.auth_token = None
    app = FastAPI()

    @app.websocket("/device/ws")
    async def endpoint(websocket: WebSocket):
        await serve_device_socket(websocket, coordinator.ws_server)

    with (
        TestClient(app) as client,
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect("/device/ws"),
    ):
        pass
