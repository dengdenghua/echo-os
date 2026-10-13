"""Approval bridge between the blocking react loop and the async gateway.

Split out of ``realtime_cerebrum.py``. The react loop is iterator-based
and runs on a worker thread, but the gateway's ``request_approval`` is a
coroutine; ``GatewayApprovalProvider`` bridges the two with
:func:`asyncio.run_coroutine_threadsafe`. This is the only place where
async↔sync handoff happens for approvals.
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
import time
from collections.abc import Callable
from concurrent.futures import CancelledError
from typing import Any

from runtime.protocol import JsonRpcErrorCode, ServerMethod
from runtime.safety.approval.approval_gate import (
    ApprovalDecision,
    ApprovalProvider,
    ApprovalRequest,
    approval_action_for_tool,
)
from runtime.safety.approval.cancellation import current_cancellation_token
from runtime.sensing.gateway.realtime_gateway import EventEmitter, _ApprovalError

_logger = logging.getLogger(__name__)

#: Per-turn opt-in carried in the turn context. Only this exact value is
#: honoured; it changes *where* an ask/confirm decision is answered, never
#: whether one is required.
SERVER_HOLD_APPROVAL = "server_hold"
_SERVER_HOLD_POLL_S = 0.5
_SERVER_HOLD_DEFAULT_MAX_S = 3600.0
_SERVER_HOLD_MIN_S = 30.0
_SERVER_HOLD_MAX_S = 24 * 3600.0
# Time a held approval leaves the turn to act on the answer (a declined call
# still needs a model step and the turn's own wrap-up) before its deadline.
_SERVER_HOLD_DEADLINE_MARGIN_S = 60.0


def _server_hold_max_seconds() -> float:
    """How long a parked task waits for a decision (env-tunable, clamped)."""
    raw = os.environ.get("ECHO_SERVER_HOLD_APPROVAL_MAX_S", "").strip()
    try:
        value = float(raw) if raw else _SERVER_HOLD_DEFAULT_MAX_S
    except ValueError:
        value = _SERVER_HOLD_DEFAULT_MAX_S
    return min(max(value, _SERVER_HOLD_MIN_S), _SERVER_HOLD_MAX_S)


class GatewayApprovalProvider(ApprovalProvider):
    """Blocking provider that delegates to a running asyncio gateway.

    The react loop is iterator-based and runs on a worker thread, but
    the gateway's ``request_approval`` is a coroutine. We bridge with
    :func:`asyncio.run_coroutine_threadsafe` against the loop the
    ``CerebrumRuntime.start_turn`` coroutine was scheduled on.
    """

    def __init__(
        self,
        emitter: EventEmitter,
        loop: asyncio.AbstractEventLoop,
        *,
        thread_id: str,
        turn_id: str,
        trace_store: Any = None,
    ) -> None:
        self._emitter = emitter
        self._loop = loop
        self._thread_id = thread_id
        self._turn_id = turn_id
        self._trace_store = trace_store

    def request(self, req: ApprovalRequest, *, timeout: float = 120.0) -> ApprovalDecision:
        coro = self._emitter.request_approval(
            ServerMethod.REQ_COMMAND_APPROVAL,
            {
                "threadId": self._thread_id,
                "turnId": self._turn_id,
                "itemId": req.tool_call_id,
                "tool": req.tool_name,
                "argsPreview": req.args_preview,
                "detail": req.detail,
                # Lets the client run its own countdown and expire the
                # dialog in lockstep instead of leaving a zombie prompt
                # after the server has already given up.
                "timeoutMs": int(timeout * 1000),
            },
            timeout=timeout,
        )
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        # Lease loss or another internal cancellation must release both the
        # blocking worker and the real pending RPC, even with its dialog open.
        unsubscribe = current_cancellation_token().on_cancelled(lambda _reason: future.cancel())
        # Every failure denies, but the *reason* is part of the contract:
        # "timeout" / "connection_lost" are machine-readable so the UI
        # and journal can distinguish "user said no" from "nobody was
        # there to answer".
        try:
            decision = future.result(timeout=timeout + 5.0)
        except _ApprovalError as exc:
            code = getattr(exc.error, "code", None)
            timed_out = code == JsonRpcErrorCode.APPROVAL_TIMEOUT
            label = "timeout" if timed_out else "error"
            return self._deny(req, reason=label if timed_out else f"error: {exc}", label=label)
        except CancelledError:
            # ApprovalManager.cancel_all() on connection close cancels the
            # pending future. This is concurrent.futures.CancelledError,
            # distinct from asyncio.CancelledError in the async waiter.
            return self._deny(req, reason="connection_lost", label="connection_lost")
        except TimeoutError:
            return self._deny(req, reason="timeout", label="timeout")
        except (ConnectionError, OSError, RuntimeError) as exc:
            return self._deny(req, reason=f"error: {exc}", label="error")
        finally:
            unsubscribe()
            if not future.done():
                future.cancel()
        action = (decision or {}).get("action", "decline")
        result = ApprovalDecision(
            approved=(action == "accept"),
            reason=action,
        )
        self._record_approval(req, result)
        return result

    def _deny(self, req: ApprovalRequest, *, reason: str, label: str) -> ApprovalDecision:
        _logger.warning("approval bridge: %s denied (%s)", req.tool_name, label)
        result = ApprovalDecision(approved=False, reason=reason)
        self._record_approval(req, result, decision_label=label)
        return result

    def _record_approval(
        self,
        req: ApprovalRequest,
        decision: ApprovalDecision,
        *,
        decision_label: str | None = None,
    ) -> None:
        if self._trace_store is None:
            return
        label = decision_label or ("approved" if decision.approved else "rejected")
        try:
            from runtime.safety.audit.trust_gateway import trace_metadata_for_tool

            self._trace_store.record_approval(
                thread_id=self._thread_id or req.thread_id,
                turn_id=self._turn_id,
                tool_name=req.tool_name,
                tool_call_id=req.tool_call_id,
                args_preview=req.args_preview,
                decision=label,
                reason=decision.reason or "",
                metadata=trace_metadata_for_tool(req, detail=req.detail),
            )
        except Exception:  # noqa: BLE001
            _logger.debug("approval bridge: trace record failed", exc_info=True)


class ServerHoldApprovalProvider(ApprovalProvider):
    """Answer approvals from the durable task record instead of a socket prompt.

    A desktop-dispatched turn runs with nobody watching its WebSocket. Asking
    over the socket there means a silent "timeout" denial after the dialog
    deadline. This provider instead parks the task as ``waiting_approval``
    (so the Task Space and the desktop show it), keeps the turn and its lease
    alive, and waits for ``POST /api/task-runs/{id}/approval-decision``. The
    exact call that was held then proceeds or is declined in the same turn, so
    nothing needs a resume turn or a manual "continue" message.

    Only *where* the question is answered changes: the risk matrix, deny
    rules, auto-approve and bypass are decided before this provider is asked.
    Holds are serialised per turn so one decision never covers parallel calls.
    Without a bound execution lease there is no record to park, so the
    interactive provider is used unchanged.
    """

    def __init__(
        self,
        interactive: ApprovalProvider,
        *,
        thread_id: str,
        turn_id: str,
        trace_store: Any = None,
        max_wait_s: float | None = None,
        poll_interval_s: float = _SERVER_HOLD_POLL_S,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._interactive = interactive
        self._thread_id = thread_id
        self._turn_id = turn_id
        self._trace_store = trace_store
        self._max_wait_s = _server_hold_max_seconds() if max_wait_s is None else max_wait_s
        self._poll_interval_s = poll_interval_s
        self._sleep = sleep
        self._clock = clock
        self._lock = threading.Lock()

    def request(self, req: ApprovalRequest, *, timeout: float = 120.0) -> ApprovalDecision:
        from runtime.platform.process.session import current_session

        guard = getattr(current_session(), "execution_lease", None)
        if guard is None or guard.bound_task_id is None:
            return self._interactive.request(req, timeout=timeout)
        # The caller's dialog timeout is for an interactive prompt; a parked
        # task waits for its own (much longer) deadline.
        with self._lock:
            return self._hold(guard, req)

    def _hold(self, guard: Any, req: ApprovalRequest) -> ApprovalDecision:
        from runtime.platform.observability.redactor import redact_text
        from runtime.platform.process.task_supervisor import LostTaskLease, TaskRunStatus

        try:
            record = guard.assert_held()
            seen = len(record.metadata.get("approval_decisions") or [])
            risk, action, _policy = approval_action_for_tool(req.tool_name, req.args_preview)
            reason = req.detail or f"{req.tool_name} requires your approval"
            guard.transition(
                TaskRunStatus.WAITING_APPROVAL,
                require_open=True,
                reason=reason,
                metadata_patch={
                    "approval_required": True,
                    "approval_denied": False,
                    "approval_tool_name": req.tool_name,
                    "approval_action": getattr(action, "value", str(action)),
                    "approval_reason": reason,
                    "approval_delivery": SERVER_HOLD_APPROVAL,
                    "approval_hold": {
                        "tool_call_id": req.tool_call_id,
                        "turn_id": self._turn_id,
                        "risk": getattr(risk, "level", None),
                        "args_preview": redact_text(req.args_preview or "")[:300],
                    },
                },
            )
        except Exception as exc:  # noqa: BLE001 — no record to park on; deny safely
            _logger.warning("server-hold approval: cannot park %s: %s", req.tool_name, exc)
            return self._finish(
                guard=None,
                req=req,
                approved=False,
                reason="error: approval hold unavailable",
                label="error",
            )

        deadline = self._clock() + self._hold_window_s()
        cancellation = current_cancellation_token()
        while True:
            if cancellation.is_cancelled:
                return self._finish(
                    guard=guard, req=req, approved=False, reason="interrupted", label="interrupted"
                )
            try:
                record = guard.assert_held()
            except LostTaskLease:
                # Taken over, expired or the turn is closing: nobody here can
                # act on a decision any more.
                return self._finish(
                    guard=None,
                    req=req,
                    approved=False,
                    reason="connection_lost",
                    label="connection_lost",
                )
            if record.status != TaskRunStatus.WAITING_APPROVAL:
                new_decisions = list(record.metadata.get("approval_decisions") or [])[seen:]
                if not new_decisions:
                    # An operator may pause the task without answering the
                    # approval. Releasing this waiter must not undo that pause.
                    return self._finish(
                        guard=guard,
                        req=req,
                        approved=False,
                        reason="interrupted",
                        label="interrupted",
                        resume_task=False,
                    )
                approved = new_decisions[0].get("approved") is True
                return self._finish(
                    guard=guard,
                    req=req,
                    approved=approved,
                    reason="accept" if approved else "decline",
                    label="approved" if approved else "rejected",
                )
            if self._clock() >= deadline:
                return self._finish(
                    guard=guard, req=req, approved=False, reason="timeout", label="timeout"
                )
            self._sleep(self._poll_interval_s)

    def _hold_window_s(self) -> float:
        """How long this hold may wait: the hold window, but never past the turn.

        The turn runs under a wall-clock execution deadline (the Codex limit
        is 30 minutes) that also covers the wait. Holding past it left the
        task interrupted with a stale approval in the inbox ("lease expired"
        when the owner answered). Ending the hold just before the deadline
        declines the call as a timeout, so the task finishes and says so.
        """
        from runtime.execution.request import (
            ExecutionDeadlineExceeded,
            current_execution_request,
        )

        request = current_execution_request()
        if request is None:
            return self._max_wait_s
        try:
            remaining = request.task.resources.remaining_seconds()
        except ExecutionDeadlineExceeded:
            return 0.0
        if remaining is None:
            return self._max_wait_s
        return max(0.0, min(self._max_wait_s, remaining - _SERVER_HOLD_DEADLINE_MARGIN_S))

    def _finish(
        self,
        *,
        guard: Any,
        req: ApprovalRequest,
        approved: bool,
        reason: str,
        label: str,
        resume_task: bool = True,
    ) -> ApprovalDecision:
        """Hand the turn back in the state an interactive answer leaves it in.

        A socket prompt never changes the task status, so the loops expect a
        running task afterwards: an approval continues, a rejection reaches the
        agent as a declined observation, and a timeout takes the existing
        "could not reach the user" path.
        """
        if guard is not None:
            from runtime.platform.process.task_supervisor import (
                TERMINAL_TASK_STATUSES,
                TaskRunStatus,
            )

            try:
                record = guard.assert_held()
                if record.status not in TERMINAL_TASK_STATUSES:
                    status = record.status
                    if resume_task and (
                        status == TaskRunStatus.WAITING_APPROVAL
                        or (label == "rejected" and status == TaskRunStatus.PAUSED)
                    ):
                        status = TaskRunStatus.RUNNING
                    guard.transition(
                        status,
                        require_open=True,
                        reason="" if status == TaskRunStatus.RUNNING else record.terminal_reason,
                        metadata_patch={
                            "approval_required": False,
                            "approval_hold": None,
                            "approval_hold_outcome": label,
                        },
                    )
            except Exception:  # noqa: BLE001 — the loop's own lease checks report a lost task
                _logger.debug("server-hold approval: could not resume task", exc_info=True)
        if not approved:
            _logger.info("server-hold approval: %s denied (%s)", req.tool_name, label)
        result = ApprovalDecision(approved=approved, reason=reason)
        self._record_approval(req, result, decision_label=label)
        return result

    def _record_approval(
        self,
        req: ApprovalRequest,
        decision: ApprovalDecision,
        *,
        decision_label: str,
    ) -> None:
        if self._trace_store is None:
            return
        try:
            from runtime.safety.audit.trust_gateway import trace_metadata_for_tool

            self._trace_store.record_approval(
                thread_id=self._thread_id or req.thread_id,
                turn_id=self._turn_id,
                tool_name=req.tool_name,
                tool_call_id=req.tool_call_id,
                args_preview=req.args_preview,
                decision=decision_label,
                reason=decision.reason or "",
                metadata=trace_metadata_for_tool(req, detail=req.detail),
            )
        except Exception:  # noqa: BLE001
            _logger.debug("server-hold approval: trace record failed", exc_info=True)
