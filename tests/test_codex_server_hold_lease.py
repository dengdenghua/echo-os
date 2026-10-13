"""A desktop Codex task can wait in the approval inbox longer than five minutes.

Golden path 2026-10: a task dispatched from the desktop intent bar parked a
write approval in the inbox. Five minutes later App Server's dynamic-tool wait
(300 s) gave up, the Codex drive loop had never renewed the task lease (TTL
300 s), and the owner's approval failed with "lease is no longer current:
lease expired". The drive loop now renews the lease, and desktop turns give
App Server requests the server hold window.
"""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from runtime.execution.codex_backend.backend import CodexExecutionRequest
from runtime.platform.process.task_execution import TaskExecutionGuard
from runtime.platform.process.task_supervisor import (
    LostTaskLease,
    TaskRunStatus,
    TaskSupervisor,
)
from runtime.sensing.gateway import realtime_codex_backend as codex_drive
from runtime.sensing.gateway.realtime_approval import SERVER_HOLD_APPROVAL


def _guard(tmp_path: Path, *, ttl: float) -> tuple[TaskSupervisor, TaskExecutionGuard]:
    supervisor = TaskSupervisor.from_path(
        tmp_path / "task_runs.json", holder_id="holder-a", lease_ttl_seconds=ttl
    )
    guard = TaskExecutionGuard(supervisor)
    guard.admit("task-1", title="desktop task", owner_id="alice")
    return supervisor, guard


def test_lease_renewal_keeps_a_task_waiting_for_approval_alive(tmp_path: Path) -> None:
    _supervisor, guard = _guard(tmp_path, ttl=1.0)
    guard.transition(TaskRunStatus.WAITING_APPROVAL, require_open=True, reason="写文件")

    interval = codex_drive._lease_renewal_interval(guard)
    assert interval is not None and interval <= 1.0 / 3.0 + 1e-9

    deadline = time.monotonic() + 1.6
    while time.monotonic() < deadline:
        codex_drive._renew_lease(guard, object())
        time.sleep(interval)

    # Past the 1 s TTL the lease is still current because it was renewed.
    record = guard.assert_held()
    assert record.status == TaskRunStatus.WAITING_APPROVAL


def test_without_renewal_the_same_wait_loses_the_lease(tmp_path: Path) -> None:
    _supervisor, guard = _guard(tmp_path, ttl=1.0)
    guard.transition(TaskRunStatus.WAITING_APPROVAL, require_open=True, reason="写文件")
    time.sleep(1.3)
    with pytest.raises(LostTaskLease, match="lease expired"):
        guard.assert_held()


def test_no_renewal_without_a_bound_lease() -> None:
    assert codex_drive._lease_renewal_interval(None) is None


def test_desktop_turns_get_the_server_hold_window_for_app_server_requests() -> None:
    held = codex_drive._server_hold_approval_timeout_s(
        {"approval_delivery": SERVER_HOLD_APPROVAL}
    )
    assert held is not None and held > 300.0
    assert codex_drive._server_hold_approval_timeout_s({}) is None


@pytest.mark.parametrize("bad", [0, -1.0, float("inf"), float("nan"), True, "60"])
def test_request_rejects_an_invalid_approval_timeout(tmp_path: Path, bad: object) -> None:
    with pytest.raises(ValueError, match="approval_timeout_s"):
        CodexExecutionRequest(
            outer_thread_id="outer-thread",
            outer_turn_id="outer-turn",
            workspace=tmp_path,
            realm_id="realm-a",
            tenant_id="tenant-a",
            principal_id="user-a",
            prompt="Inspect the project",
            command=("/opt/codex", "app-server"),
            approval_timeout_s=bad,  # type: ignore[arg-type]
        )


@pytest.mark.asyncio
async def test_session_passes_the_hold_window_to_the_app_server_client(tmp_path: Path) -> None:
    from dataclasses import replace

    from tests.test_codex_execution_backend import _make_session

    session, _security, _context, _factory, client = _make_session(tmp_path)
    session.request = replace(session.request, approval_timeout_s=3660.0)

    await session.start()
    try:
        assert client.config.approval_timeout_s == 3660.0
    finally:
        await session.close()


def test_time_waiting_for_the_owner_does_not_count_against_the_turn_limit() -> None:
    # Golden path 2026-10: a desktop task parked in the inbox for 30 minutes
    # hit the Codex turn limit; its held write was denied and the approval
    # was left behind as stale.
    clock = codex_drive._RunClock(started_at=0.0)
    clock.observe(60.0, waiting=True)
    assert clock.active_elapsed(1_860.0) == 60.0
    clock.observe(1_900.0, waiting=False)
    assert clock.active_elapsed(1_960.0) == 120.0


def test_renewal_reports_a_task_parked_for_approval(tmp_path: Path) -> None:
    _supervisor, guard = _guard(tmp_path, ttl=30.0)
    assert codex_drive._renew_lease(guard, object()) is False
    guard.transition(TaskRunStatus.WAITING_APPROVAL, require_open=True, reason="写文件")
    assert codex_drive._renew_lease(guard, object()) is True
