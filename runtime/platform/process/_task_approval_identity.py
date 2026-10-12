"""Bind a decision to the pending request without binding to lease heartbeats."""

import hashlib
import json
from typing import Any

# Stamped by the supervisor each time a task enters WAITING_APPROVAL, so two
# requests that look alike (same tool, reason and decision count) still differ.
APPROVAL_REQUEST_ID_KEY = "approval_request_id"


def _metadata(task: Any) -> dict[str, Any]:
    metadata = getattr(task, "metadata", None)
    return metadata if isinstance(metadata, dict) else {}


def approval_request_version(task: Any) -> str:
    metadata = _metadata(task)
    hold = metadata.get("approval_hold")
    hold = hold if isinstance(hold, dict) else {}
    decisions = metadata.get("approval_decisions")
    payload = [
        "echo.approval_request.v2",
        str(getattr(task, "task_id", "") or ""),
        str(metadata.get(APPROVAL_REQUEST_ID_KEY) or ""),
        str(getattr(task, "latest_checkpoint_id", "") or ""),
        str(metadata.get("approval_tool_name") or ""),
        str(metadata.get("approval_action") or ""),
        str(metadata.get("approval_reason") or getattr(task, "terminal_reason", "") or ""),
        len(decisions) if isinstance(decisions, list) else 0,
        str(hold.get("tool_call_id") or ""),
        str(hold.get("turn_id") or ""),
        str(hold.get("args_preview") or ""),
    ]
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False).encode("utf-8")).hexdigest()


def approval_block_reason(task: Any) -> str | None:
    """Why no operator decision can release this wait, or None when one can."""
    metadata = _metadata(task)
    if bool(metadata.get("capability_denied")):
        return "task is blocked by disabled capability"
    if bool(metadata.get("approval_denied")) and not bool(metadata.get("approval_required")):
        return "task is blocked by approval policy"
    return None
