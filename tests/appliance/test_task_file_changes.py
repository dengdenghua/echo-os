"""Task Space lists every Agent task's recorded file changes, checked on disk."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from appliance.task_projection import create_task_projection_router
from runtime.memory.journal import InMemoryJournal
from runtime.memory.journal._journal_models import FileOpEvent
from runtime.memory.journal.journal_context import journal_context
from runtime.memory.threads.event_log import EventLog
from runtime.platform.process.task_supervisor import TaskRunStatus, TaskSupervisor
from runtime.protocol.items import FileChange, FileChangeItem, ItemStatus
from runtime.safety.auth.identity import encode_jwt_hs256

JWT_SECRET = "task-file-changes-test-secret-not-production"
THREAD = "tFileChangesThread"
TURN = "trn_codex_1"


def _client(app: FastAPI, actor: str = "local:admin") -> TestClient:
    client = TestClient(app)
    token = encode_jwt_hs256({"sub": actor, "iat": 0, "exp": 9_999_999_999}, secret=JWT_SECRET)
    client.cookies.set("echo_session", token)
    return client


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class _Runtime:
    def __init__(self, journal: InMemoryJournal, logs: Path) -> None:
        self._stack = SimpleNamespace(journal=journal)
        self._logs = logs

    def _log_for(self, thread_id: str) -> EventLog:
        return EventLog(self._logs / f"{thread_id}.jsonl")


@pytest.fixture
def scene(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    supervisor = TaskSupervisor.from_path(tmp_path / "task-runs.json", holder_id="worker-a")
    supervisor.start_task(
        task_id="task-codex",
        kind="realtime_codex",
        owner_id="local:admin",
        thread_id=THREAD,
        title="写入 hello.txt",
        goal="在个人空间里创建 hello.txt",
        workspace_path=str(workspace),
        origin_task_id=TURN,
        metadata={"turn_id": TURN, "execution_engine": "codex"},
    )
    journal = InMemoryJournal()
    runtime = _Runtime(journal, tmp_path / "threads")
    app = FastAPI()
    app.include_router(
        create_task_projection_router(
            supervisor=supervisor,
            realtime_gateway=SimpleNamespace(_runtime=runtime),
            jwt_secret=JWT_SECRET,
        )
    )
    return SimpleNamespace(
        app=app, supervisor=supervisor, journal=journal, runtime=runtime, workspace=workspace
    )


def _write(scene, path: Path, content: str, *, action: str, thread: str = THREAD, before=None):
    path.write_text(content, encoding="utf-8")
    with journal_context(conversation_id=thread, owner_actor_id="local:admin"):
        scene.journal.write_file_op(
            path=str(path),
            action=action,
            old_size=None if before is None else len(before),
            new_size=len(content),
            diff=f"--- a/{path.name}\n+++ b/{path.name}\n@@ -0,0 +1 @@\n+{content}\n",
            rollback={
                "reversible": True,
                "path": str(path),
                "before_sha256": None if before is None else _sha(before),
                "after_sha256": _sha(content),
            },
        )


def test_codex_tool_writes_are_listed_and_checked_against_the_disk(scene):
    hello = scene.workspace / "hello.txt"
    notes = scene.workspace / "notes.md"
    _write(scene, hello, "hello echo", action="create")
    _write(scene, notes, "draft", action="create")
    _write(scene, notes, "final", action="write", before="draft")
    notes.write_text("edited by hand afterwards", encoding="utf-8")
    other = scene.workspace / "other-thread.txt"
    _write(scene, other, "not this task", action="create", thread="tSomeOtherThread")

    body = _client(scene.app).get("/api/appliance/tasks/task-codex/file-changes").json()

    assert body["schema"] == "echo.task_file_changes.v1"
    assert body["available"] is True
    changes = [(c["displayPath"], c["action"], c["evidence"]) for c in body["changes"]]
    assert changes == [
        ("hello.txt", "create", "verified"),
        ("notes.md", "create", "superseded"),
        ("notes.md", "update", "changed_since"),
    ]
    first = body["changes"][0]
    assert first["inWorkspace"] is True
    assert first["source"] == "journal"
    assert first["afterSha256"] == _sha("hello echo")
    assert "+hello echo" in first["diff"]


def test_a_deleted_or_missing_file_is_reported_as_such(scene):
    gone = scene.workspace / "gone.txt"
    _write(scene, gone, "temporary", action="create")
    gone.unlink()
    removed = scene.workspace / "old.log"
    removed.write_text("old", encoding="utf-8")
    removed.unlink()
    with journal_context(conversation_id=THREAD):
        scene.journal.write_file_op(
            path=str(removed),
            action="delete",
            old_size=3,
            rollback={"reversible": True, "path": str(removed), "before_sha256": _sha("old")},
        )

    body = _client(scene.app).get("/api/appliance/tasks/task-codex/file-changes").json()

    assert [(c["displayPath"], c["evidence"]) for c in body["changes"]] == [
        ("gone.txt", "missing"),
        ("old.log", "verified"),
    ]


def test_codex_patch_tool_changes_come_from_the_thread_log(scene, tmp_path):
    log = scene.runtime._log_for(THREAD)
    log.item_completed(
        THREAD,
        TURN,
        FileChangeItem(
            status=ItemStatus.COMPLETED,
            changes=[
                FileChange(path=str(scene.workspace / "app.py"), op="update", diff="@@ -1 +1 @@"),
                FileChange(path="/elsewhere/config.toml", op="create", diff=None),
            ],
        ),
    )
    # Another turn of the same thread is not this task.
    log.item_completed(
        THREAD,
        "trn_other",
        FileChangeItem(status=ItemStatus.COMPLETED, changes=[FileChange(path="x.py", op="create")]),
    )

    body = _client(scene.app).get("/api/appliance/tasks/task-codex/file-changes").json()

    assert [
        (c["displayPath"], c["action"], c["evidence"], c["inWorkspace"]) for c in body["changes"]
    ] == [
        ("app.py", "update", "recorded", True),
        ("/elsewhere/config.toml", "create", "recorded", False),
    ]


def test_a_write_recorded_twice_is_listed_once_with_its_hashes(scene):
    hello = scene.workspace / "hello.txt"
    _write(scene, hello, "hello echo", action="create")
    scene.runtime._log_for(THREAD).item_completed(
        THREAD,
        TURN,
        FileChangeItem(
            status=ItemStatus.COMPLETED,
            changes=[FileChange(path=str(hello), op="create", diff="+hello echo")],
        ),
    )

    body = _client(scene.app).get("/api/appliance/tasks/task-codex/file-changes").json()

    assert [(c["source"], c["evidence"]) for c in body["changes"]] == [("journal", "verified")]


def test_records_outside_the_task_window_are_ignored(scene):
    scene.supervisor.transition("task-codex", TaskRunStatus.COMPLETED)
    record = scene.supervisor.store.get("task-codex")
    assert record is not None
    later = datetime.now(UTC) + timedelta(minutes=5)
    late = scene.workspace / "later.txt"
    late.write_text("later", encoding="utf-8")
    with journal_context(conversation_id=THREAD):
        scene.journal.write(
            FileOpEvent(
                path=str(late),
                action="create",
                conversation_id=THREAD,
                ts=later,
                rollback={"after_sha256": _sha("later"), "path": str(late)},
            )
        )

    body = _client(scene.app).get("/api/appliance/tasks/task-codex/file-changes").json()

    assert body["changes"] == []


def test_every_agent_task_advertises_the_file_changes_provider(scene):
    task = _client(scene.app).get("/api/appliance/tasks").json()["tasks"][0]
    assert task["changeProvider"] == "echo-agent.files"


def test_only_the_owner_or_the_administrator_reads_the_diffs(scene):
    _write(scene, scene.workspace / "hello.txt", "hello echo", action="create")
    response = _client(scene.app, "local:bob").get("/api/appliance/tasks/task-codex/file-changes")
    assert response.status_code == 404


def test_other_task_kinds_are_not_served_here(scene, tmp_path):
    scene.supervisor.start_task(task_id="system-task", kind="system", owner_id="local:admin")
    body = _client(scene.app).get("/api/appliance/tasks/system-task/file-changes").json()
    assert body["available"] is False
    assert body["reason"] == "provider_unsupported"


def test_without_a_runtime_the_route_says_so(tmp_path):
    supervisor = TaskSupervisor.from_path(tmp_path / "task-runs.json", holder_id="worker-a")
    supervisor.start_task(
        task_id="task-native", kind="realtime_objective", owner_id="local:admin", thread_id=THREAD
    )
    app = FastAPI()
    app.include_router(create_task_projection_router(supervisor=supervisor, jwt_secret=JWT_SECRET))
    body = _client(app).get("/api/appliance/tasks/task-native/file-changes").json()
    assert body["available"] is False
    assert body["reason"] == "runtime_unavailable"
