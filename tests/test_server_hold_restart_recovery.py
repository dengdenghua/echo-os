import time
from types import SimpleNamespace
from uuid import uuid4

import pytest

from runtime.core.cerebrum.react_approval_checkpoint import persist_server_hold_boundary
from runtime.core.cerebrum.react_loop_state import _LoopState
from runtime.core.cerebrum.react_resume import (
    _load_resume_checkpoint_snapshot,
    _validate_resume_checkpoint_snapshot,
)
from runtime.memory.journal.journal import JSONLJournal
from runtime.platform.models.llm import Message
from runtime.platform.process.task_supervisor import TaskRunStatus, TaskSupervisor


def test_first_action_approval_survives_worker_restart_without_an_approval_grant(tmp_path):
    task_id = uuid4()
    path = tmp_path / "task_runs.json"
    supervisor = TaskSupervisor.from_path(path, holder_id="old-worker")
    supervisor.start_task(task_id=str(task_id), thread_id="thread-1")
    journal_path = tmp_path / "journal.jsonl"
    state = _LoopState(
        stack=SimpleNamespace(journal=JSONLJournal(journal_path)),
        intent=SimpleNamespace(user_context={"approval_delivery": "server_hold"}),
        react_task_id=task_id,
        iteration_limit=12,
        messages=[Message(role="user", content="Start the service")],
    )
    persist_server_hold_boundary(state)
    supervisor.transition(
        str(task_id),
        TaskRunStatus.WAITING_APPROVAL,
        metadata_patch={
            "approval_delivery": "server_hold",
            "approval_required": True,
            "approval_hold": {"tool_call_id": "call-1"},
        },
    )
    supervisor.store.mutate(
        str(task_id),
        lambda record: record.model_copy(
            update={
                "lease": record.lease.model_copy(update={"expires_at": time.time() - 1}),
            }
        ),
    )
    restarted = TaskSupervisor.from_path(path, holder_id="new-worker")
    recovered = restarted.takeover_task(str(task_id), by="owner")
    assert recovered.status == TaskRunStatus.PAUSED
    assert recovered.metadata["approval_hold"] is None
    assert recovered.metadata["approval_required"] is False
    assert recovered.approval_resume_lease_token is None
    assert not recovered.metadata.get("approval_decisions")
    with pytest.raises(ValueError, match="not waiting"):
        restarted.record_approval_decision(str(task_id), approved=True)
    snapshot = _load_resume_checkpoint_snapshot(
        SimpleNamespace(journal=JSONLJournal(journal_path)),
        SimpleNamespace(user_context={}),
        task_id,
    )
    assert snapshot is not None
    _validate_resume_checkpoint_snapshot(snapshot, task_id)
    assert snapshot["messages_snapshot"][0]["content"] == "Start the service"
    assert snapshot["steps_snapshot"] == []
