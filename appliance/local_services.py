"""Loopback development-service discovery for the AI browser start page.

The start page lists development servers running on this device (Vite, a
FastAPI backend, Jupyter, ...). A web page cannot probe a closed port without
the browser logging a refused connection, so the page asks the device instead.

Only a fixed catalogue of well-known development ports on the loopback
interface is checked. Callers cannot choose hosts or ports, so the endpoint is
not a general port scanner. A port counts as up when it answers a ``HEAD``
request with any HTTP status line, which matches what the browser probe used
to accept (an opaque ``no-cors`` response).
"""

from __future__ import annotations

import asyncio
import contextlib
from dataclasses import dataclass
from typing import Any, Literal

from fastapi import APIRouter, Depends

from appliance.security import ApplianceAuthenticator, resolve_authenticator

LocalServiceType = Literal["frontend", "backend", "other"]


@dataclass(frozen=True, slots=True)
class LocalServicePort:
    port: int
    name: str
    type: LocalServiceType


COMMON_DEV_PORTS: tuple[LocalServicePort, ...] = (
    LocalServicePort(5173, "Vite", "frontend"),
    LocalServicePort(5174, "Vite", "frontend"),
    LocalServicePort(3000, "React / Next.js", "frontend"),
    LocalServicePort(3001, "React", "frontend"),
    LocalServicePort(4000, "Remix / Svelte", "frontend"),
    LocalServicePort(4200, "Angular", "frontend"),
    LocalServicePort(4321, "Astro", "frontend"),
    LocalServicePort(8080, "HTTP Server", "other"),
    LocalServicePort(8000, "FastAPI / Django", "backend"),
    LocalServicePort(8001, "FastAPI", "backend"),
    LocalServicePort(8888, "Jupyter", "backend"),
    LocalServicePort(5000, "Flask", "backend"),
)

# Dev servers bound to "localhost" may listen on IPv4 or IPv6 only.
LOOPBACK_HOSTS: tuple[str, ...] = ("127.0.0.1", "::1")
CONNECT_TIMEOUT_SECONDS = 0.4
PROBE_TIMEOUT_SECONDS = 1.5


async def _answers_http(host: str, port: int, *, connect_timeout: float) -> bool:
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=connect_timeout
        )
    except (OSError, TimeoutError):
        return False
    try:
        writer.write(
            f"HEAD / HTTP/1.1\r\nHost: localhost:{port}\r\nConnection: close\r\n\r\n".encode(
                "ascii"
            )
        )
        await writer.drain()
        status_line = await reader.readline()
        return status_line.startswith(b"HTTP/")
    except (OSError, ValueError, asyncio.IncompleteReadError):
        return False
    finally:
        writer.close()
        with contextlib.suppress(OSError):
            await writer.wait_closed()


async def _port_is_up(
    port: int,
    *,
    hosts: tuple[str, ...],
    connect_timeout: float,
    probe_timeout: float,
) -> bool:
    async def probe(host: str) -> bool:
        try:
            return await asyncio.wait_for(
                _answers_http(host, port, connect_timeout=connect_timeout),
                timeout=probe_timeout,
            )
        except TimeoutError:
            return False

    results = await asyncio.gather(*(probe(host) for host in hosts))
    return any(results)


async def detect_local_services(
    catalogue: tuple[LocalServicePort, ...] = COMMON_DEV_PORTS,
    *,
    hosts: tuple[str, ...] = LOOPBACK_HOSTS,
    connect_timeout: float = CONNECT_TIMEOUT_SECONDS,
    probe_timeout: float = PROBE_TIMEOUT_SECONDS,
) -> list[dict[str, Any]]:
    """Return the catalogue entries that answer HTTP on loopback, in catalogue order."""

    up = await asyncio.gather(
        *(
            _port_is_up(
                entry.port,
                hosts=hosts,
                connect_timeout=connect_timeout,
                probe_timeout=probe_timeout,
            )
            for entry in catalogue
        )
    )
    return [
        {"port": entry.port, "name": entry.name, "type": entry.type}
        for entry, is_up in zip(catalogue, up, strict=True)
        if is_up
    ]


def create_local_services_router(
    *,
    jwt_secret: str | None = None,
    authenticator: ApplianceAuthenticator | None = None,
) -> APIRouter:
    require_operator = resolve_authenticator(
        jwt_secret=jwt_secret, authenticator=authenticator
    ).operator_dependency()
    router = APIRouter(prefix="/api/appliance/local-services", tags=["appliance"])

    @router.get("")
    async def read_local_services(
        _actor: str = Depends(require_operator),
    ) -> dict[str, Any]:
        return {"services": await detect_local_services()}

    return router


__all__ = [
    "COMMON_DEV_PORTS",
    "LocalServicePort",
    "create_local_services_router",
    "detect_local_services",
]
