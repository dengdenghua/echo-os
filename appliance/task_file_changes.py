"""Recorded file changes of an Agent task, checked against the disk.

``task_changes.py`` serves the file-organisation provider (planned moves with
an undo preview). Every other Agent task (Echo or Codex engine) changes files
through tools whose executor records a journal ``file_op`` with rollback
hashes, or through Codex's own patch tool, recorded in the thread log. This
route lists those records for the task's owner and checks each file's latest
recorded state against what is on disk now:

- ``verified``: the file still has exactly the content the task wrote (or is
  still gone after a delete);
- ``changed_since``: the file was changed after the task;
- ``missing``: the file the task wrote no longer exists;
- ``superseded``: a later change in the same task touched the file again;
- ``recorded``: the record carries no hash to compare (Codex patch tool).
"""

from __future__ import annotations

import hashlib
import os
import stat
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import PurePath
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from appliance.agent_api.task_evidence import agent_task_file_evidence

SCHEMA = "echo.task_file_changes.v1"
AGENT_FILE_TASK_KINDS = frozenset({"realtime_objective", "realtime_codex"})
_MAX_HASH_BYTES = 64 * 1024 * 1024
_MAX_DIFF_CHARS = 4000

Action = Literal["create", "update", "delete", "rename"]
Evidence = Literal["verified", "changed_since", "missing", "superseded", "recorded"]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class AgentFileChange(_Model):
    id: str
    path: str = Field(max_length=4096)
    display_path: str = Field(alias="displayPath", max_length=4096)
    in_workspace: bool = Field(alias="inWorkspace")
    action: Action
    at: str | None = None
    source: Literal["journal", "thread"]
    evidence: Evidence
    bytes_delta: int | None = Field(default=None, alias="bytesDelta")
    after_sha256: str | None = Field(default=None, alias="afterSha256")
    diff: str | None = None
    diff_truncated: bool = Field(default=False, alias="diffTruncated")


class AgentTaskFileChanges(_Model):
    schema_name: Literal["echo.task_file_changes.v1"] = Field(default=SCHEMA, alias="schema")
    task_id: str = Field(alias="taskId")
    available: bool
    reason: str | None = None
    workspace_path: str | None = Field(default=None, alias="workspacePath")
    generated_at: str = Field(alias="generatedAt")
    changes: list[AgentFileChange] = Field(default_factory=list)


def _norm(path: str) -> str:
    return os.path.normcase(os.path.normpath(path))


def _display(path: str, workspace: str | None) -> tuple[str, bool]:
    if workspace:
        try:
            # Compare case-insensitively where the OS does, but show the
            # path's own spelling.
            inside = not os.path.relpath(_norm(path), _norm(workspace)).startswith("..")
            relative = os.path.relpath(os.path.normpath(path), os.path.normpath(workspace))
        except ValueError:  # different drive on Windows
            inside, relative = False, ""
        if inside and relative and relative != ".":
            return PurePath(relative).as_posix(), True
    return path, False


def _action(record: dict[str, Any]) -> Action:
    raw = str(record.get("action") or "").lower()
    if raw in {"delete", "rename", "create"}:
        return raw  # type: ignore[return-value]
    if record.get("source") == "journal" and raw == "write" and not record.get("beforeSha256"):
        old_size = record.get("oldSize")
        if old_size in (None, 0):
            return "create"
    return "update"


def _sha256(path: str) -> str | None:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _verify(record: dict[str, Any], action: Action) -> Evidence:
    if record.get("source") != "journal":
        return "recorded"
    target = str(record.get("capturedPath") or record.get("path") or "")
    if not target:
        return "recorded"
    try:
        info = os.lstat(target)
    except FileNotFoundError:
        return "verified" if action == "delete" else "missing"
    except OSError:
        return "recorded"
    if action == "delete":
        return "changed_since"
    expected = record.get("afterSha256")
    if not isinstance(expected, str) or not expected:
        return "recorded"
    if not stat.S_ISREG(info.st_mode) or info.st_size > _MAX_HASH_BYTES:
        return "recorded"
    try:
        actual = _sha256(target)
    except OSError:
        return "recorded"
    return "verified" if actual == expected.lower() else "changed_since"


def _diff(value: Any) -> tuple[str | None, bool]:
    if not isinstance(value, str) or not value:
        return None, False
    if len(value) > _MAX_DIFF_CHARS:
        return value[:_MAX_DIFF_CHARS], True
    return value, False


def build_task_file_changes(task: Any, evidence: dict[str, Any]) -> AgentTaskFileChanges:
    workspace = str(getattr(task, "workspace_path", "") or "") or None
    generated = datetime.now(UTC).isoformat()
    base = {"task_id": str(task.task_id), "workspace_path": workspace, "generated_at": generated}
    if not evidence.get("available"):
        return AgentTaskFileChanges(available=False, reason="runtime_unavailable", **base)

    journal = [record for record in evidence.get("journal") or [] if record.get("path")]
    journaled_paths = {_norm(str(record["path"])) for record in journal}
    thread = [
        record
        for record in evidence.get("thread") or []
        if record.get("path") and _norm(str(record["path"])) not in journaled_paths
    ]
    records = sorted(journal + thread, key=lambda record: str(record.get("at") or ""))
    last_index: dict[str, int] = {}
    for index, record in enumerate(records):
        last_index[_norm(str(record["path"]))] = index

    changes: list[AgentFileChange] = []
    for index, record in enumerate(records):
        path = str(record["path"])
        action = _action(record)
        latest = last_index[_norm(path)] == index
        evidence_state: Evidence = _verify(record, action) if latest else "superseded"
        if record.get("source") != "journal":
            evidence_state = "recorded"
        display, in_workspace = _display(path, workspace)
        diff, cut = _diff(record.get("diff"))
        after_sha = record.get("afterSha256")
        changes.append(
            AgentFileChange(
                id=str(record.get("id") or index),
                path=path,
                display_path=display,
                in_workspace=in_workspace,
                action=action,
                at=record.get("at"),
                source=record.get("source", "journal"),
                evidence=evidence_state,
                bytes_delta=record.get("bytesDelta")
                if isinstance(record.get("bytesDelta"), int)
                else None,
                after_sha256=after_sha if isinstance(after_sha, str) else None,
                diff=diff,
                diff_truncated=cut or bool(record.get("diffTruncated")),
            )
        )
    return AgentTaskFileChanges(available=True, changes=changes, **base)


def register_task_file_changes_routes(
    router: APIRouter,
    *,
    require_auth: Any,
    get_task: Callable[[str, str], Any],
    realtime_gateway: Any,
) -> None:
    @router.get(
        "/{task_id}/file-changes",
        response_model=AgentTaskFileChanges,
        response_model_by_alias=True,
    )
    def read_file_changes(task_id: str, actor: str = Depends(require_auth)) -> AgentTaskFileChanges:
        task = get_task(task_id, actor)
        # Diffs carry file contents: only the task's owner and the device
        # administrator read them.
        if actor != "local:admin" and getattr(task, "owner_id", None) != actor:
            raise HTTPException(status_code=404, detail="task not found")
        if getattr(task, "kind", None) not in AGENT_FILE_TASK_KINDS:
            return AgentTaskFileChanges(
                task_id=str(task.task_id),
                available=False,
                reason="provider_unsupported",
                generated_at=datetime.now(UTC).isoformat(),
            )
        return build_task_file_changes(task, agent_task_file_evidence(realtime_gateway, task))


__all__ = [
    "AGENT_FILE_TASK_KINDS",
    "AgentFileChange",
    "AgentTaskFileChanges",
    "build_task_file_changes",
    "register_task_file_changes_routes",
]
