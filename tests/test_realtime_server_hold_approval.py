"""Server-held approvals for turns started without a watching client.

These use the real TaskSupervisor and TaskExecutionGuard: the provider must
park the durable task as ``waiting_approval``, read the Task Space decision
back from the record, and hand the turn back running.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from typing import Any

import pytest

from runtime.platform.process.session import Session, session_scope
from runtime.platform.process.task_execution import TaskExecutionGuard
from runtime.platform.process.task_supervisor import TaskRunStatus, TaskSupervisor
from runtime.safety.approval.approval_gate import (
    ApprovalDecision,
    ApprovalProvider,
    ApprovalRequest,
)
from runtime.safety.approval.cancellation import CancellationSource, scoped_cancellation
from runtime.sensing.gateway.realtime_approval import ServerHoldApprovalProvider
from runtime.sensing.gateway.turn_session import build_turn_metadata


class _RecordingInteractive(ApprovalProvider):
    def __init__(self) -> None:
        self.calls: list[ApprovalRequest] = []

    def request(self, req: ApprovalRequest, *, timeout: float = 120.0) -> ApprovalDecision:
        self.calls.append(req)
        return ApprovalDecision(approved=False, reason="timeout")


def _request(call_id: str = "call-1", tool: str = "shell") -> ApprovalRequest:
    return ApprovalRequest(
        thread_id="thread-1",
        tool_name=tool,
        tool_call_id=call_id,
        args_preview="rm -r cache/",
        detail=f"{tool} wants to execute",
    )


def _setup(tmp_path) -> tuple[TaskSupervisor, TaskExecutionGuard, Session]:
    supervisor = TaskSupervisor.from_path(tmp_path / "task_runs.json", holder_id="holder-a")
    guard = TaskExecutionGuard(supervisor)
    guard.admit("task-1", title="desktop task", owner_id="alice")
    return supervisor, guard, Session(metadata={}, execution_lease=guard)


def _provider(
    interactive: ApprovalProvider | None = None, **kwargs: Any
) -> ServerHoldApprovalProvider:
    return ServerHoldApprovalProvider(
        interactive or _RecordingInteractive(),
        thread_id="thread-1",
        turn_id="turn-1",
        poll_interval_s=0.01,
        **kwargs,
    )


def _ask_in_thread(
    session: Session,
    provider: ServerHoldApprovalProvider,
    req: ApprovalRequest,
    *,
    cancellation: CancellationSource | None = None,
) -> tuple[threading.Thread, dict[str, ApprovalDecision]]:
    result: dict[str, ApprovalDecision] = {}

    def _run() -> None:
        with session_scope(session):
            if cancellation is None:
                result["decision"] = provider.request(req)
            else:
                with scoped_cancellation(cancellation.token):
                    result["decision"] = provider.request(req)

    worker = threading.Thread(target=_run, daemon=True)
    worker.start()
    return worker, result


def _wait_for(predicate: Callable[[], bool], *, timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    raise AssertionError("condition not reached")


def _status(supervisor: TaskSupervisor) -> TaskRunStatus:
    record = supervisor.store.get("task-1")
    assert record is not None
    return record.status


def test_parks_the_task_and_runs_the_held_call_once_approved(tmp_path):
    supervisor, _guard, session = _setup(tmp_path)
    interactive = _RecordingInteractive()
    worker, result = _ask_in_thread(session, _provider(interactive), _request())

    _wait_for(lambda: _status(supervisor) == TaskRunStatus.WAITING_APPROVAL)
    parked = supervisor.store.get("task-1")
    assert parked is not None
    assert parked.metadata["approval_required"] is True
    assert parked.metadata["approval_tool_name"] == "shell"
    assert parked.metadata["approval_delivery"] == "server_hold"
    assert parked.metadata["approval_hold"]["tool_call_id"] == "call-1"
    assert worker.is_alive()

    supervisor.record_approval_decision("task-1", approved=True, decided_by="alice")
    worker.join(timeout=5)

    assert result["decision"] == ApprovalDecision(approved=True, reason="accept")
    assert _status(supervisor) == TaskRunStatus.RUNNING
    resumed = supervisor.store.get("task-1")
    assert resumed is not None
    assert resumed.metadata["approval_hold"] is None
    assert resumed.metadata["approval_hold_outcome"] == "approved"
    # Nobody was asked over a socket.
    assert interactive.calls == []


def test_rejection_reaches_the_agent_and_hands_the_turn_back_running(tmp_path):
    supervisor, _guard, session = _setup(tmp_path)
    worker, result = _ask_in_thread(session, _provider(), _request())

    _wait_for(lambda: _status(supervisor) == TaskRunStatus.WAITING_APPROVAL)
    supervisor.record_approval_decision(
        "task-1", approved=False, decided_by="alice", reason="不要删除"
    )
    worker.join(timeout=5)

    assert result["decision"] == ApprovalDecision(approved=False, reason="decline")
    record = supervisor.store.get("task-1")
    assert record is not None
    # record_approval_decision pauses on rejection; the live turn continues.
    assert record.status == TaskRunStatus.RUNNING
    assert record.metadata["approval_hold_outcome"] == "rejected"


def test_deadline_denies_as_timeout_without_leaving_the_task_parked(tmp_path):
    supervisor, _guard, session = _setup(tmp_path)
    ticks = iter([0.0, 0.0, 10.0, 10.0])
    provider = _provider(max_wait_s=5.0, clock=lambda: next(ticks, 10.0), sleep=lambda _s: None)
    worker, result = _ask_in_thread(session, provider, _request())
    worker.join(timeout=5)

    assert result["decision"] == ApprovalDecision(approved=False, reason="timeout")
    record = supervisor.store.get("task-1")
    assert record is not None
    assert record.status == TaskRunStatus.RUNNING
    assert record.metadata["approval_hold_outcome"] == "timeout"


def test_the_hold_stores_its_wall_clock_expiry_for_the_inbox(tmp_path):
    supervisor, _guard, session = _setup(tmp_path)
    provider = _provider(max_wait_s=300.0, wall_clock=lambda: 1_800_000_000.0)
    worker, result = _ask_in_thread(session, provider, _request())
    _wait_for(lambda: _status(supervisor) == TaskRunStatus.WAITING_APPROVAL)

    record = supervisor.store.get("task-1")
    assert record is not None
    # 1_800_000_000 + 300 s, as UTC ISO-8601.
    assert record.metadata["approval_hold"]["expires_at"] == "2027-01-15T08:05:00Z"
    supervisor.record_approval_decision("task-1", approved=True, reason="ok")
    worker.join(timeout=5)
    assert result["decision"].approved is True
    record = supervisor.store.get("task-1")
    assert record is not None
    assert record.metadata["approval_expired_at"] is None


def test_a_timeout_records_when_the_approval_expired(tmp_path):
    supervisor, _guard, session = _setup(tmp_path)
    ticks = iter([0.0, 0.0, 10.0, 10.0])
    provider = _provider(
        max_wait_s=5.0,
        clock=lambda: next(ticks, 10.0),
        sleep=lambda _s: None,
        wall_clock=lambda: 1_800_000_000.0,
    )
    worker, _result = _ask_in_thread(session, provider, _request(tool="write_text_file"))
    worker.join(timeout=5)

    record = supervisor.store.get("task-1")
    assert record is not None
    assert record.metadata["approval_hold_outcome"] == "timeout"
    assert record.metadata["approval_expired_at"] == "2027-01-15T08:00:00Z"
    # What expired stays readable after the hold is released.
    assert record.metadata["approval_tool_name"] == "write_text_file"


def test_every_engine_shares_one_default_approval_window(monkeypatch):
    from runtime.sensing.gateway.realtime_approval import _server_hold_max_seconds

    monkeypatch.delenv("ECHO_SERVER_HOLD_APPROVAL_MAX_S", raising=False)
    # Same as the Codex turn limit (ECHO_CODEX_APP_SERVER_TIMEOUT default).
    from runtime.execution.codex_backend.timeouts import DEFAULT_TIMEOUT_S

    assert _server_hold_max_seconds() == 1800.0 == DEFAULT_TIMEOUT_S


def test_interruption_releases_the_hold(tmp_path):
    supervisor, _guard, session = _setup(tmp_path)
    cancellation = CancellationSource()
    worker, result = _ask_in_thread(session, _provider(), _request(), cancellation=cancellation)
    _wait_for(lambda: _status(supervisor) == TaskRunStatus.WAITING_APPROVAL)

    cancellation.cancel(reason="user stopped the task")
    worker.join(timeout=5)

    assert result["decision"] == ApprovalDecision(approved=False, reason="interrupted")


def test_a_lost_lease_denies_instead_of_waiting_forever(tmp_path):
    supervisor, guard, session = _setup(tmp_path)
    worker, result = _ask_in_thread(session, _provider(), _request())
    _wait_for(lambda: _status(supervisor) == TaskRunStatus.WAITING_APPROVAL)

    guard.close()
    worker.join(timeout=5)

    assert result["decision"] == ApprovalDecision(approved=False, reason="connection_lost")


def test_an_external_pause_without_a_decision_does_not_resume_the_task(tmp_path):
    supervisor, guard, session = _setup(tmp_path)
    worker, result = _ask_in_thread(session, _provider(), _request())
    _wait_for(lambda: _status(supervisor) == TaskRunStatus.WAITING_APPROVAL)

    guard.transition(TaskRunStatus.PAUSED, reason="operator paused the task")
    worker.join(timeout=5)

    assert result["decision"] == ApprovalDecision(approved=False, reason="interrupted")
    assert _status(supervisor) == TaskRunStatus.PAUSED


def test_without_a_bound_task_the_interactive_provider_is_used(tmp_path):
    supervisor = TaskSupervisor.from_path(tmp_path / "task_runs.json", holder_id="holder-a")
    pending_guard = TaskExecutionGuard(supervisor)
    interactive = _RecordingInteractive()
    provider = _provider(interactive)

    with session_scope(Session(metadata={}, execution_lease=pending_guard)):
        decision = provider.request(_request())
    with session_scope(Session(metadata={})):
        provider.request(_request("call-2"))

    assert decision == ApprovalDecision(approved=False, reason="timeout")
    assert [req.tool_call_id for req in interactive.calls] == ["call-1", "call-2"]
    assert not supervisor.store.path.exists()


def test_parallel_calls_are_held_one_at_a_time(tmp_path):
    supervisor, _guard, session = _setup(tmp_path)
    provider = _provider()
    first, first_result = _ask_in_thread(session, provider, _request("call-1"))
    _wait_for(lambda: _status(supervisor) == TaskRunStatus.WAITING_APPROVAL)
    second, second_result = _ask_in_thread(session, provider, _request("call-2", "write_file"))

    # Approving the first parked call must not approve the second one.
    supervisor.record_approval_decision("task-1", approved=True, decided_by="alice")
    first.join(timeout=5)
    assert first_result["decision"].approved is True

    def _second_parked() -> bool:
        record = supervisor.store.get("task-1")
        return (
            record is not None
            and record.status == TaskRunStatus.WAITING_APPROVAL
            and record.metadata.get("approval_hold", {}).get("tool_call_id") == "call-2"
        )

    _wait_for(_second_parked)
    supervisor.record_approval_decision("task-1", approved=False, decided_by="alice")
    second.join(timeout=5)
    assert second_result["decision"].approved is False


@pytest.mark.parametrize(
    ("context", "expected"),
    [
        ({"approval_delivery": "server_hold"}, "server_hold"),
        ({"approval_delivery": "auto_approve"}, None),
        ({"approval_delivery": "SERVER_HOLD"}, None),
        ({}, None),
    ],
)
def test_turn_metadata_accepts_only_the_exact_server_hold_opt_in(context, expected):
    metadata = build_turn_metadata(thread_id="thread-1", body={"context": context}, store=None)
    assert metadata.get("approval_delivery") == expected


def test_server_hold_is_per_turn_and_never_inherited_from_the_thread():
    class _Store:
        def get_metadata(self, _thread_id: str) -> dict[str, Any]:
            return {"approval_delivery": "server_hold"}

        def get(self, _thread_id: str) -> dict[str, Any]:
            return {"metadata": {"approval_delivery": "server_hold"}}

    metadata = build_turn_metadata(thread_id="thread-1", body={"context": {}}, store=_Store())
    assert "approval_delivery" not in metadata


def test_a_hold_never_outlives_the_turn_deadline(monkeypatch):
    # Golden path 2026-10: a desktop task held for longer than its turn's
    # execution deadline was cut off mid-wait; its approval stayed in the inbox
    # and answering it failed with "lease expired".
    from types import SimpleNamespace

    from runtime.execution import request as execution_request

    resources = SimpleNamespace(remaining_seconds=lambda: 300.0)
    monkeypatch.setattr(
        execution_request,
        "current_execution_request",
        lambda: SimpleNamespace(task=SimpleNamespace(resources=resources)),
    )
    provider = _provider(max_wait_s=3600.0)
    assert provider._hold_window_s() == 240.0

    def _expired() -> float:
        raise execution_request.ExecutionDeadlineExceeded("late")

    resources.remaining_seconds = _expired
    assert provider._hold_window_s() == 0.0

    monkeypatch.setattr(execution_request, "current_execution_request", lambda: None)
    assert provider._hold_window_s() == 3600.0
