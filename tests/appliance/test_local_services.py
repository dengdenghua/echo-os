"""The AI browser asks the device which loopback development servers are up."""

from __future__ import annotations

import asyncio
import socket

from fastapi import FastAPI
from fastapi.testclient import TestClient

import appliance.local_services as local_services
from appliance.local_services import (
    COMMON_DEV_PORTS,
    LocalServicePort,
    create_local_services_router,
    detect_local_services,
)
from runtime.safety.auth.identity import encode_jwt_hs256

JWT_SECRET = "Local-Services-Secret_12345678901234567890"


def _headers(actor: str) -> dict[str, str]:
    token = encode_jwt_hs256({"sub": actor, "iat": 0, "exp": 9_999_999_999}, secret=JWT_SECRET)
    return {"Authorization": f"Bearer {token}"}


def _closed_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


async def _detect_with_fixture_servers() -> tuple[list[dict], int]:
    async def http(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        await reader.readuntil(b"\r\n\r\n")
        writer.write(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n")
        await writer.drain()
        writer.close()

    async def not_http(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        writer.write(b"SSH-2.0-OpenSSH_9.6\r\n")
        await writer.drain()
        writer.close()

    async def silent(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        await reader.read()  # never answers; returns once the probe gives up
        writer.close()

    servers = [
        await asyncio.start_server(handler, "127.0.0.1", 0) for handler in (http, not_http, silent)
    ]
    http_port, other_port, silent_port = (server.sockets[0].getsockname()[1] for server in servers)
    catalogue = (
        LocalServicePort(_closed_port(), "Closed", "frontend"),
        LocalServicePort(other_port, "Not HTTP", "other"),
        LocalServicePort(silent_port, "Silent", "backend"),
        LocalServicePort(http_port, "Fixture", "backend"),
    )
    try:
        return await detect_local_services(
            catalogue,
            hosts=("127.0.0.1",),
            connect_timeout=0.4,
            probe_timeout=0.4,
        ), http_port
    finally:
        for server in servers:
            server.close()
            await server.wait_closed()


def test_lists_only_ports_that_answer_http_within_the_timeout() -> None:
    services, http_port = asyncio.run(_detect_with_fixture_servers())

    # Any HTTP status counts (the browser accepted an opaque response); a
    # closed port, a non-HTTP banner and a silent listener do not.
    assert services == [{"port": http_port, "name": "Fixture", "type": "backend"}]


def test_catalogue_is_the_fixed_development_port_list() -> None:
    ports = [entry.port for entry in COMMON_DEV_PORTS]
    assert len(ports) == len(set(ports))
    assert {5173, 3000, 8000, 8888} <= set(ports)
    assert {entry.type for entry in COMMON_DEV_PORTS} <= {"frontend", "backend", "other"}


def _client(monkeypatch) -> tuple[TestClient, list[tuple]]:
    calls: list[tuple] = []

    async def fake_detect(*args, **kwargs):
        calls.append((args, kwargs))
        return [{"port": 5173, "name": "Vite", "type": "frontend"}]

    monkeypatch.setattr(local_services, "detect_local_services", fake_detect)
    app = FastAPI()
    app.include_router(create_local_services_router(jwt_secret=JWT_SECRET))
    return TestClient(app), calls


def test_operator_reads_the_loopback_scan(monkeypatch) -> None:
    client, calls = _client(monkeypatch)

    response = client.get(
        "/api/appliance/local-services",
        params={"port": "22", "host": "10.0.0.1"},
        headers=_headers("local:admin"),
    )

    assert response.status_code == 200
    assert response.json() == {"services": [{"port": 5173, "name": "Vite", "type": "frontend"}]}
    # Callers cannot choose hosts or ports: the fixed catalogue is always used.
    assert calls == [((), {})]


def test_scan_requires_the_device_operator(monkeypatch) -> None:
    client, calls = _client(monkeypatch)

    assert client.get("/api/appliance/local-services").status_code == 401
    assert (
        client.get(
            "/api/appliance/local-services", headers=_headers("local:family-member")
        ).status_code
        == 403
    )
    assert calls == []
