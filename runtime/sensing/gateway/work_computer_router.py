"""Authenticated local work-window controls. No remote-host or model endpoint."""
from __future__ import annotations

import base64
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from runtime.platform.work_computer import ComputerError, WorkCommand, work_computer


class ComputerCommand(WorkCommand):
    generation: str = Field(max_length=64)


class ComputerControl(BaseModel):
    controller: Literal["human", "agent"]
    generation: str = Field(max_length=64)


def create_work_computer_router(*, identity_store=None, require_auth=False,
                               jwt_secret=None, jwt_issuer=None, jwt_audience=None):
    def actor(request: Request):
        from runtime.safety.auth.principal import require_operator, resolve_principal
        fn = require_operator if require_auth else resolve_principal
        principal = fn(request, identity_store, require_auth, jwt_secret=jwt_secret,
                       jwt_issuer=jwt_issuer, jwt_audience=jwt_audience)
        return principal.actor_id if principal else "local"

    def call(fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except (ComputerError, OSError, ValueError) as error:
            raise HTTPException(409, str(error)) from error

    router = APIRouter(prefix="/api/work-computer", tags=["work-computer"])

    @router.get("/status")
    def status(owner: str = Depends(actor)):
        return call(work_computer().status, owner)

    @router.post("/start")
    def start(owner: str = Depends(actor)):
        return call(work_computer().start, owner)

    @router.post("/stop")
    def stop(owner: str = Depends(actor)):
        return call(work_computer().stop, owner)

    @router.post("/control")
    def control(body: ComputerControl, owner: str = Depends(actor)):
        return call(work_computer().control, owner, body.controller, body.generation)

    @router.post("/input")
    def command(body: ComputerCommand, owner: str = Depends(actor)):
        return call(work_computer().action, owner, body.model_dump(exclude={"generation"}),
                    controller="human", generation=body.generation)

    @router.get("/frame")
    def frame(owner: str = Depends(actor)):
        data = call(work_computer().frame, owner)
        return Response(base64.b64decode(data["image"]), media_type="image/jpeg",
                        headers={"Cache-Control": "no-store"})

    return router
