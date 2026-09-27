"""Agent device transport compatibility surface consumed by Echo OS."""

from __future__ import annotations

import secrets
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter


def normalize_device_hello(payload: dict[str, Any]) -> dict[str, Any]:
    from runtime.tentacle.transport.device_protocol import normalize_hello

    return normalize_hello(payload)


async def serve_device_socket(socket: Any, coordinator: Any) -> None:
    from runtime.tentacle.transport.asgi import serve_device_socket as serve

    await serve(socket, coordinator.ws_server)


def set_active_device_coordinator(coordinator: Any) -> None:
    from runtime.tentacle.team_bridge import set_active_coordinator

    set_active_coordinator(coordinator)


def create_device_task_workspace_router(get_coordinator: Callable[[], Any]) -> APIRouter:
    from runtime.tentacle.task_workspace_api import create_task_workspace_router

    return create_task_workspace_router(get_coordinator)


def create_device_mirror_router(get_coordinator: Callable[[], Any]) -> APIRouter:
    from runtime.tentacle.mirror_api import create_mirror_router

    return create_mirror_router(get_coordinator)


def create_device_coordinator(context: Any, *, port: int) -> Any:
    from runtime.core.cerebrum.planner import StaticPlanner
    from runtime.tentacle.coordinator import TentacleCoordinator
    from runtime.tentacle.mobile.cerebrum_adapter import CerebrumDecisionAdapter

    planner = getattr(getattr(context, "stack", None), "planner", None)
    if not callable(getattr(planner, "plan", None)):
        planner = StaticPlanner()
    return TentacleCoordinator(
        host="0.0.0.0",  # nosec B104 - explicit, approval-bound LAN feature
        port=port,
        dashboard_port=None,
        decision_engine=CerebrumDecisionAdapter(planner).decide,
        auth_token=secrets.token_urlsafe(32),
    )


__all__ = [
    "create_device_coordinator",
    "create_device_mirror_router",
    "create_device_task_workspace_router",
    "set_active_device_coordinator",
]
