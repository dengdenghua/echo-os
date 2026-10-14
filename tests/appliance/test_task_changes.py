"""Real provider receipts, authorized HTTP reads and non-executing undo previews."""

from __future__ import annotations

import hashlib
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from appliance.audit import ApplianceAudit
from appliance.data_access import DataAccessScope, DataPathRule
from appliance.files.manager import FileManager
from appliance.files.organization import FileOrganizationService
from appliance.task_projection import create_task_projection_router
from runtime.platform.process.task_supervisor import TaskSupervisor
from runtime.safety.auth.identity import encode_jwt_hs256

_SECRET = "x" * 48


class Policy:
    def __init__(self, root):
        self.root = root
        self.permission = "readWrite"

    def scope_for_actor(self, actor):
        return DataAccessScope(
            actor=actor,
            operator=False,
            root=self.root,
            rules=(DataPathRule(("Invoices",), self.permission),)
            if self.permission != "none"
            else (),
        )


def client(app, actor="local:alice"):
    connection = TestClient(app)
    connection.cookies.set(
        "echo_session",
        encode_jwt_hs256({"sub": actor, "iat": 0, "exp": 9_999_999_999}, secret=_SECRET),
    )
    return connection


@pytest.fixture
def operation(tmp_path):
    root = tmp_path / "nas"
    folder = root / "Invoices"
    folder.mkdir(parents=True)
    original = b"Invoice\nInvoice Date: 2026-09-05\nTotal: CNY 42.00\n"
    (folder / "one.txt").write_bytes(original)
    (folder / "two.txt").write_bytes(original)
    state = tmp_path / "state"
    state.mkdir()
    policy = Policy(root)
    supervisor = TaskSupervisor.from_path(state / "tasks.json", holder_id="changes-test")
    audit = ApplianceAudit(state / "audit.jsonl", jwt_secret=_SECRET)
    service = FileOrganizationService(
        FileManager(root), state, data_access=policy, supervisor=supervisor, audit=audit
    )
    plan = service.create_plan("local:alice", "Invoices")
    assert plan["ready"]
    result = service.apply("local:alice", plan["planId"])
    assert result["state"] == "completed" and result["counts"]["moved"] == 2
    app = FastAPI()
    app.include_router(
        create_task_projection_router(
            supervisor=supervisor,
            audit=audit,
            jwt_secret=_SECRET,
            organization_service=lambda: service,
        )
    )
    return SimpleNamespace(
        app=app,
        service=service,
        supervisor=supervisor,
        policy=policy,
        folder=folder,
        original=original,
        task_id=result["taskId"],
        plan=plan,
    )


def url(operation):
    return "/api/appliance/tasks/" + operation.task_id + "/changes"


def test_real_changes_and_undo_preview_do_not_execute(operation):
    op = operation
    connection = client(op.app)
    response = connection.get(url(op))
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    view = response.json()
    projected = connection.get("/api/appliance/tasks").json()
    own_task = next(task for task in projected["tasks"] if task["id"] == op.task_id)
    assert own_task["changeProvider"] == "echo-os.files"
    assert view["schema"] == "echo.task_changes.v1" and view["taskId"] == op.task_id
    assert view["phase"] == "completed" and view["canPreviewUndo"]
    assert len(view["changes"]) == 2
    first = view["changes"][0]
    assert first["before"]["path"] == "Invoices/one.txt"
    assert first["after"]["path"] == "Invoices/2026/09/one.txt"
    assert first["evidence"] == "verified" and first["committed"] is True
    assert first["after"]["sha256"] == hashlib.sha256(op.original).hexdigest()
    preview = connection.post(
        url(op) + "/undo-preview", json={"expectedRevision": view["revision"]}
    )
    assert preview.status_code == 200
    undo = preview.json()
    assert undo["direction"] == "undo" and undo["phase"] == "planned"
    assert undo["sourcePlanId"] == op.plan["planId"] and not undo["canPreviewUndo"]
    assert undo["planId"] != view["planId"]
    assert undo["changes"][0]["before"]["path"] == "Invoices/2026/09/one.txt"
    assert undo["changes"][0]["plannedAfter"]["path"] == "Invoices/one.txt"
    assert undo["changes"][0]["after"]["path"] is None
    assert not (op.folder / "one.txt").exists()
    assert (op.folder / "2026/09/one.txt").read_bytes() == op.original
    assert str(op.supervisor.store.get(op.task_id).status) == "completed"
    assert op.supervisor.store.get(op.service.store.load(undo["planId"])["taskId"]) is None


def test_stale_revision_and_changed_file_do_not_claim_undo_success(operation):
    op = operation
    connection = client(op.app)
    old = connection.get(url(op)).json()
    changed = op.folder / "2026/09/one.txt"
    changed.write_bytes(b"new independent content")
    current = connection.get(url(op)).json()
    assert current["revision"] != old["revision"] and current["canPreviewUndo"]
    row = next(r for r in current["changes"] if r["before"]["path"].endswith("one.txt"))
    assert row["evidence"] == "uncertain" and not row["canPreviewUndo"]
    assert row["after"] == {"path": None, "sha256": None}
    assert (
        connection.post(
            url(op) + "/undo-preview", json={"expectedRevision": old["revision"]}
        ).status_code
        == 409
    )
    preview = connection.post(
        url(op) + "/undo-preview", json={"expectedRevision": current["revision"]}
    ).json()
    assert sorted(row["status"] for row in preview["changes"]) == ["conflict", "ready"]
    assert changed.read_bytes() == b"new independent content"
    assert not (op.folder / "two.txt").exists()


def test_finished_undo_is_read_back_at_original_locations(operation):
    op = operation
    connection = client(op.app)
    view = connection.get(url(op)).json()
    undo = connection.post(
        url(op) + "/undo-preview", json={"expectedRevision": view["revision"]}
    ).json()
    assert op.service.apply("local:alice", undo["planId"])["state"] == "completed"
    restored = connection.get(url(op)).json()
    assert not restored["canPreviewUndo"]
    assert {row["evidence"] for row in restored["changes"]} == {"reverted"}
    assert all(row["before"]["path"] == row["after"]["path"] for row in restored["changes"])
    assert (op.folder / "one.txt").read_bytes() == op.original


def test_receipt_refresh_uses_the_same_undo_state_as_the_file_observation(operation, monkeypatch):
    op = operation
    old_record = op.service.store.load(op.plan["planId"])
    undo = op.service.create_undo_plan("local:alice", op.plan["planId"])
    assert op.service.apply("local:alice", undo["planId"])["state"] == "completed"
    load = op.service._load
    stale_once = True

    def load_with_interleaved_completion(actor, plan_id):
        nonlocal stale_once
        if plan_id == op.plan["planId"] and stale_once:
            stale_once = False
            return old_record
        return load(actor, plan_id)

    # A concurrent undo can finish between the first record read and the
    # provider lease. The refreshed receipt and undo markers must stay together.
    monkeypatch.setattr(op.service, "_load", load_with_interleaved_completion)
    response = client(op.app).get(url(op))
    assert response.status_code == 200
    restored = response.json()
    assert {row["evidence"] for row in restored["changes"]} == {"reverted"}
    assert not restored["canPreviewUndo"]


@pytest.mark.parametrize("actor,expected", [("local:bob", 404), ("local:admin", 403)])
def test_task_and_provider_each_keep_their_own_access_boundary(operation, actor, expected):
    response = client(operation.app, actor).get(
        url(operation) + "?actor=local:alice", headers={"X-Echo-Actor": "local:alice"}
    )
    assert response.status_code == expected


def test_revoked_tree_access_and_forged_task_binding_return_no_evidence(operation):
    op = operation
    connection = client(op.app)
    assert connection.get(url(op)).status_code == 200
    op.policy.permission = "none"
    assert connection.get(url(op)).status_code == 403
    op.policy.permission = "readWrite"
    op.supervisor.store.mutate(
        op.task_id,
        lambda task: task.model_copy(
            update={"workspace_path": str(op.folder / "unrelated")},
            deep=True,
        ),
    )
    assert connection.get(url(op)).status_code == 409


def test_deleted_or_rebound_task_cannot_return_a_finished_provider_read(operation):
    op = operation
    original = op.service.task_change_evidence

    def raced(actor, task):
        evidence = original(actor, task)
        op.supervisor.store.mutate(
            op.task_id,
            lambda current: current.model_copy(
                update={"metadata": {**current.metadata, "plan_id": "b" * 64}},
                deep=True,
            ),
        )
        return evidence

    op.service.task_change_evidence = raced
    assert client(op.app).get(url(op)).status_code == 409


def test_missing_provider_is_explicit_and_undo_requires_a_revision(operation):
    op = operation
    app = FastAPI()
    app.include_router(create_task_projection_router(supervisor=op.supervisor, jwt_secret=_SECRET))
    assert client(app).get(url(op)).json()["reason"] == "provider_unavailable"
    assert client(op.app).post(url(op) + "/undo-preview", json={}).status_code == 422


def test_appliance_openapi_exposes_typed_changes_and_non_executing_preview(operation):
    schema = operation.app.openapi()
    path = "/api/appliance/tasks/{task_id}/changes"
    response_schema = schema["paths"][path]["get"]["responses"]["200"]["content"][
        "application/json"
    ]["schema"]
    assert response_schema == {"$ref": "#/components/schemas/TaskChanges"}
    undo = schema["paths"][path + "/undo-preview"]["post"]
    assert undo["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/UndoPreviewRequest"
    }
    assert schema["components"]["schemas"]["UndoPreviewRequest"]["required"] == ["expectedRevision"]
    change = schema["components"]["schemas"]["FileChange"]["properties"]
    assert {"before", "plannedAfter", "after", "evidence", "canPreviewUndo"} <= change.keys()
    assert "reverted" in change["evidence"]["enum"]
