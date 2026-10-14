"""Authenticated task changes from concrete provider plans and read-back facts."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field

SCHEMA = "echo.task_changes.v1"
_MAX_CHANGES = 250


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class FileLocation(_Model):
    path: str | None = Field(default=None, max_length=4096)
    sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")


class FileChange(_Model):
    id: str
    kind: Literal["file_move"] = "file_move"
    before: FileLocation
    planned_after: FileLocation = Field(alias="plannedAfter")
    after: FileLocation
    status: str
    committed: bool | None
    evidence: Literal["planned", "verified", "uncertain", "unchanged", "reverted"]
    can_preview_undo: bool = Field(default=False, alias="canPreviewUndo")


class TaskChanges(_Model):
    schema_name: Literal["echo.task_changes.v1"] = Field(default=SCHEMA, alias="schema")
    task_id: str = Field(alias="taskId")
    available: bool = False
    reason: str | None = None
    provider: Literal["echo-os.files"] | None = None
    plan_id: str | None = Field(default=None, alias="planId", pattern=r"^[0-9a-f]{64}$")
    source_plan_id: str | None = Field(default=None, alias="sourcePlanId")
    root_path: str | None = Field(default=None, alias="rootPath")
    direction: Literal["apply", "undo"] | None = None
    phase: str = "unavailable"
    generated_at: str = Field(alias="generatedAt")
    preview_expires_at: str | None = Field(default=None, alias="previewExpiresAt")
    changes: list[FileChange] = Field(default_factory=list)
    can_preview_undo: bool = Field(default=False, alias="canPreviewUndo")
    revision: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")


class UndoPreviewRequest(_Model):
    expected_revision: str = Field(alias="expectedRevision", pattern=r"^[0-9a-f]{64}$")


def _binding(task: Any) -> tuple[Any, ...]:
    metadata = getattr(task, "metadata", {})
    return (
        str(task.task_id),
        getattr(task, "owner_id", None),
        getattr(task, "kind", None),
        getattr(task, "workspace_path", None),
        metadata.get("provider"),
        metadata.get("plan_id"),
    )


def _empty(task: Any, reason: str) -> TaskChanges:
    return TaskChanges(
        task_id=str(task.task_id), reason=reason, generated_at=datetime.now(UTC).isoformat()
    )


def _changes(task: Any, evidence: dict[str, Any]) -> TaskChanges:
    plan = evidence["plan"]
    result = evidence.get("result")
    entries = plan["entries"]
    if len(entries) > _MAX_CHANGES or len({e["entryId"] for e in entries}) != len(entries):
        raise ValueError("invalid bounded provider entries")
    rows = result["results"] if result else []
    results = {row["entryId"]: row for row in rows}
    if len(results) != len(rows) or set(results) - {entry["entryId"] for entry in entries}:
        raise ValueError("invalid provider receipt identities")
    undone = set(evidence["undone"])
    phase = result["state"] if result else "planned"
    changes = []
    for entry in entries:
        entry_id = entry["entryId"]
        row = results.get(entry_id)
        expected_hash = evidence["hashes"].get(entry_id)
        observed = row.get("actualPath") if row else None
        if observed is not None and observed not in {entry["source"], entry["target"]}:
            raise ValueError("provider observation outside planned locations")
        verified = bool(
            row
            and expected_hash is not None
            and observed is not None
            and row.get("committed") is True
            and row["status"] == "moved"
            and observed == entry["target"]
        )
        reverted = bool(
            row
            and expected_hash is not None
            and observed is not None
            and row.get("committed") is True
            and entry_id in undone
            and observed == entry["source"]
        )
        can_undo = bool(
            verified
            and plan["direction"] == "apply"
            and phase != "running"
            and entry_id not in undone
        )
        changes.append(
            FileChange(
                id=entry_id,
                before=FileLocation(path=entry["source"], sha256=expected_hash),
                planned_after=FileLocation(path=entry["target"], sha256=expected_hash),
                after=FileLocation(path=observed, sha256=expected_hash if observed else None),
                status="undone" if reverted else row["status"] if row else entry["status"],
                committed=row.get("committed") if row else False,
                evidence=(
                    "planned"
                    if row is None
                    else "verified"
                    if verified
                    else "reverted"
                    if reverted
                    else "unchanged"
                    if row.get("committed") is False and observed == entry["source"]
                    else "uncertain"
                ),
                can_preview_undo=can_undo,
            )
        )
    projected = TaskChanges(
        task_id=str(task.task_id),
        available=True,
        provider="echo-os.files",
        plan_id=plan["planId"],
        source_plan_id=plan.get("sourcePlanId"),
        root_path=plan["path"],
        direction=plan["direction"],
        phase=phase,
        generated_at=datetime.now(UTC).isoformat(),
        preview_expires_at=plan["expiresAt"],
        changes=changes,
        can_preview_undo=any(change.can_preview_undo for change in changes),
    )
    payload = projected.model_dump(mode="json", exclude={"generated_at", "revision"})
    payload["binding"] = _binding(task)
    projected.revision = hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, allow_nan=False, sort_keys=True).encode("utf-8")
    ).hexdigest()
    return projected


def register_task_changes_routes(
    router: APIRouter,
    *,
    require_auth: Callable[..., str],
    get_task: Callable[[str, str], Any],
    organization_service: Callable[[], Any] | None,
    verify_audit: Callable[[], Any],
) -> None:
    def read(task_id: str, actor: str) -> tuple[Any, Any, TaskChanges]:
        task = get_task(task_id, actor)
        metadata = getattr(task, "metadata", {})
        if task.kind != "file_organization" or metadata.get("provider") != "echo-os.files":
            return task, None, _empty(task, "provider_unsupported")
        service = organization_service() if organization_service else None
        if service is None:
            return task, None, _empty(task, "provider_unavailable")
        # Minimal/native task views can run without the optional document provider.
        from appliance.files.organization import OrganizationError

        verify_audit()
        try:
            projected = _changes(task, service.task_change_evidence(actor, task))
        except OrganizationError as exc:
            raise HTTPException(exc.status, exc.message) from exc
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise HTTPException(503, "task change evidence unavailable") from exc
        if _binding(get_task(task_id, actor)) != _binding(task):
            raise HTTPException(409, "task operation binding changed")
        return task, service, projected

    @router.get("/{task_id}/changes", response_model=TaskChanges)
    def task_changes(
        task_id: str, response: Response, actor: str = Depends(require_auth)
    ) -> TaskChanges:
        response.headers["Cache-Control"] = "no-store"
        return read(task_id, actor)[2]

    @router.post("/{task_id}/changes/undo-preview", response_model=TaskChanges)
    def task_undo_preview(
        task_id: str,
        body: UndoPreviewRequest,
        response: Response,
        actor: str = Depends(require_auth),
    ) -> TaskChanges:
        response.headers["Cache-Control"] = "no-store"
        task, service, current = read(task_id, actor)
        if not current.available or not current.can_preview_undo or service is None:
            raise HTTPException(409, "no verified changes available for an undo preview")
        if body.expected_revision != current.revision:
            raise HTTPException(409, "task changes have changed; refresh before previewing undo")
        from appliance.files.organization import OrganizationError

        try:
            projected = _changes(task, service.task_undo_preview(actor, task))
        except OrganizationError as exc:
            raise HTTPException(exc.status, exc.message) from exc
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise HTTPException(503, "undo preview unavailable") from exc
        if _binding(get_task(task_id, actor)) != _binding(task):
            raise HTTPException(409, "task operation binding changed")
        return projected
