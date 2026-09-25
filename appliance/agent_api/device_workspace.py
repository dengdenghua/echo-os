"""AI workspace projection of the OS-owned device pool; no second listener."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from appliance.security import ApplianceAuthenticator
from runtime.tentacle.mirror_api import create_mirror_router


def create_device_workspace_router(
    service: Any, *, authenticator: ApplianceAuthenticator
) -> APIRouter:
    # OS operator rights also apply when entering through the AI workbench.
    router = APIRouter(
        prefix="/api/tentacle",
        tags=["device-workspace"],
        dependencies=[Depends(authenticator.operator_dependency())],
    )
    router.include_router(create_mirror_router(lambda: service._coordinator))

    @router.get("/devices")
    def devices() -> list[dict[str, Any]]:
        # Use the public OS projection, not raw registration metadata/credentials.
        return [
            {
                "tentacle_id": device["id"],
                "type": device["type"],
                "platform": device["platform"],
                "status": device["status"],
                "is_online": device["online"],
                "is_busy": device["busy"],
                "capabilities": device["capabilities"],
                "total_capabilities": device["totalCapabilities"],
                "last_used_ago": None,
                "meta": {"brand": device["brand"], "model": device["model"]},
            }
            for device in service.status()["devices"]
        ]

    @router.get("/discovery")
    def discovery() -> dict[str, Any]:
        active = getattr(service._coordinator, "discovery", None)
        return active.snapshot() if active else {"available": False, "error": "", "devices": []}

    return router
