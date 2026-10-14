"""Read an Agent task's recorded file operations for Echo OS (Task Space).

Two runtime records describe what a task changed on disk:

- Journal ``file_op`` events, written by the tool executor for every
  successful file write/edit/delete, with a bounded diff and rollback hashes
  (``before_sha256`` / ``after_sha256``). Native ReAct turns tag them with the
  task id; both engines tag them with the conversation (thread) id.
- ``fileChange`` items in the thread event log, which also cover Codex's own
  patch tool (no hashes, paths may be absolute).

This adapter only duck-types the realtime runtime the gateway already holds.
It never imports the runtime, writes nothing and returns plain dictionaries,
so a runtime without either record simply yields no evidence.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

_logger = logging.getLogger(__name__)

_MAX_JOURNAL_SCAN = 5000
_MAX_RECORDS = 250
_WINDOW_SLACK = timedelta(seconds=2)


def _parse_time(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _iso(value: Any) -> str | None:
    parsed = _parse_time(value)
    return parsed.isoformat().replace("+00:00", "Z") if parsed else None


def _task_window(task: Any) -> tuple[datetime | None, datetime]:
    started = _parse_time(getattr(task, "started_at", None)) or _parse_time(
        getattr(task, "created_at", None)
    )
    ended = _parse_time(getattr(task, "completed_at", None)) or datetime.now(UTC)
    return (started - _WINDOW_SLACK if started else None), ended + _WINDOW_SLACK


def _task_turn_ids(task: Any) -> set[str]:
    metadata = getattr(task, "metadata", {})
    metadata = metadata if isinstance(metadata, dict) else {}
    candidates = (
        getattr(task, "origin_task_id", None),
        metadata.get("turn_id"),
        metadata.get("resume_execution_turn_id"),
    )
    return {str(value).strip() for value in candidates if str(value or "").strip()}


def _journal_records(runtime: Any, task: Any) -> list[dict[str, Any]]:
    journal = getattr(getattr(runtime, "_stack", None), "journal", None)
    read_by_type = getattr(journal, "read_by_type", None)
    if not callable(read_by_type):
        return []
    try:
        events = list(read_by_type("file_op"))[-_MAX_JOURNAL_SCAN:]
    except Exception:  # noqa: BLE001 - evidence is best-effort and read-only
        _logger.debug("task evidence: journal read failed", exc_info=True)
        return []
    task_id = str(getattr(task, "task_id", "") or "")
    thread_id = str(getattr(task, "thread_id", "") or "")
    started, ended = _task_window(task)
    records: list[dict[str, Any]] = []
    for event in events:
        event_task = str(getattr(event, "task_id", "") or "")
        event_ts = _parse_time(getattr(event, "ts", None))
        same_task = bool(task_id) and event_task == task_id
        same_conversation = (
            bool(thread_id)
            and str(getattr(event, "conversation_id", "") or "") == thread_id
            and event_ts is not None
            and (started is None or event_ts >= started)
            and event_ts <= ended
        )
        if not (same_task or same_conversation):
            continue
        rollback = getattr(event, "rollback", None)
        rollback = rollback if isinstance(rollback, dict) else {}
        records.append(
            {
                "source": "journal",
                "id": str(getattr(event, "event_id", "") or ""),
                "path": str(getattr(event, "path", "") or ""),
                "action": str(getattr(event, "action", "") or "write"),
                "at": _iso(event_ts),
                "oldSize": getattr(event, "old_size", None),
                "newSize": getattr(event, "new_size", None),
                "bytesDelta": getattr(event, "bytes_delta", None),
                "diff": getattr(event, "diff", None),
                "beforeSha256": rollback.get("before_sha256"),
                "afterSha256": rollback.get("after_sha256"),
                "capturedPath": rollback.get("path"),
                "reversible": rollback.get("reversible") is True,
            }
        )
    return records[-_MAX_RECORDS:]


def _event_name(event: Any) -> str:
    raw = getattr(event, "event", None)
    return str(getattr(raw, "value", raw) or "")


def _thread_records(runtime: Any, task: Any) -> list[dict[str, Any]]:
    thread_id = str(getattr(task, "thread_id", "") or "")
    log_for = getattr(runtime, "_log_for", None)
    if not thread_id or not callable(log_for):
        return []
    try:
        snapshot = log_for(thread_id).snapshot()
        events = list(getattr(snapshot, "events", ()) or ())
    except Exception:  # noqa: BLE001 - evidence is best-effort and read-only
        _logger.debug("task evidence: thread log read failed", exc_info=True)
        return []
    task_id = str(getattr(task, "task_id", "") or "")
    turn_ids = _task_turn_ids(task)
    for entry in events:
        event = entry[1] if isinstance(entry, tuple) else entry
        if _event_name(event) not in {"turn_started", "turn_updated"}:
            continue
        payload = getattr(event, "payload", {}) or {}
        params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
        claimed = payload.get("taskId") or params.get("taskId")
        if task_id and str(claimed or "") == task_id and getattr(event, "turn_id", None):
            turn_ids.add(str(event.turn_id))
    records: list[dict[str, Any]] = []
    for entry in events:
        event = entry[1] if isinstance(entry, tuple) else entry
        if _event_name(event) != "item_completed":
            continue
        if str(getattr(event, "turn_id", "") or "") not in turn_ids:
            continue
        payload = getattr(event, "payload", {}) or {}
        item = payload.get("item") if isinstance(payload, dict) else None
        if not isinstance(item, dict) or item.get("type") != "fileChange":
            continue
        if str(item.get("status") or "completed") not in {"completed", "success"}:
            continue
        for index, change in enumerate(item.get("changes") or []):
            if not isinstance(change, dict) or not change.get("path"):
                continue
            records.append(
                {
                    "source": "thread",
                    "id": f"{item.get('id') or 'item'}:{index}",
                    "path": str(change.get("path")),
                    "action": str(change.get("op") or "update"),
                    "at": _iso(getattr(event, "ts", None)),
                    "diff": change.get("diff"),
                    "diffTruncated": bool(change.get("diffTruncated")),
                }
            )
    return records[-_MAX_RECORDS:]


def agent_task_file_evidence(realtime_gateway: Any, task: Any) -> dict[str, Any]:
    """Return ``{"available", "journal", "thread"}`` for one Agent task."""

    runtime = getattr(realtime_gateway, "_runtime", None)
    if runtime is None:
        return {"available": False, "journal": [], "thread": []}
    return {
        "available": True,
        "journal": _journal_records(runtime, task),
        "thread": _thread_records(runtime, task),
    }


__all__ = ["agent_task_file_evidence"]
