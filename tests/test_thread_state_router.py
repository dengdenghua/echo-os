from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from runtime.memory.threads import ThreadPermanentlyDeletedError, ThreadStateStore
from runtime.memory.threads.event_log import EventLog, list_threads
from runtime.sensing.gateway.thread_state_router import create_thread_state_router


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(create_thread_state_router(store=ThreadStateStore()))
    return TestClient(app)


def test_thread_state_crud_uses_api_prefix_only() -> None:
    client = _client()

    created = client.post(
        "/api/threads",
        json={"metadata": {"mode": "chat"}, "values": {"title": "Hello"}},
    )
    assert created.status_code == 200
    thread_id = created.json()["thread_id"]

    assert client.get(f"/api/threads/{thread_id}").status_code == 200
    assert client.get(f"/api/threads/{thread_id}/state").status_code == 200

    search = client.post("/api/threads/search", json={"metadata": {"mode": "chat"}})
    assert search.status_code == 200
    assert [item["thread_id"] for item in search.json()] == [thread_id]

    assert client.post("/threads").status_code == 404
    assert client.get(f"/threads/{thread_id}").status_code == 404


def test_thread_state_search_get_returns_sidebar_shape() -> None:
    client = _client()
    created = client.post(
        "/api/threads",
        json={
            "values": {
                "title": "Routing notes",
                "messages": [{"type": "human", "content": "realtime only"}],
            },
        },
    )
    assert created.status_code == 200

    response = client.get("/api/threads/search?q=realtime&limit=5")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["threads"]) == 1
    assert payload["threads"][0]["title"] == "Routing notes"
    assert payload["threads"][0]["snippet"] == "realtime only"


def test_thread_delete_archives_realtime_event_log(tmp_path) -> None:
    logs_root = tmp_path / "threads"
    log = EventLog(logs_root / "th-realtime.jsonl")
    log.thread_started("th-realtime")

    store = ThreadStateStore()
    store.ensure_thread("th-realtime", values={"title": "Old chat"})
    app = FastAPI()
    app.include_router(create_thread_state_router(store=store, logs_root=logs_root))
    client = TestClient(app)

    response = client.delete("/api/threads/th-realtime")

    assert response.status_code == 204
    assert store.is_permanently_deleted("th-realtime") is True
    with pytest.raises(ThreadPermanentlyDeletedError):
        store.get("th-realtime")
    summaries = list_threads(logs_root)
    assert len(summaries) == 1
    assert summaries[0].thread_id == "th-realtime"
    assert summaries[0].archived is True


def test_archived_thread_is_hidden_from_state_reads(tmp_path) -> None:
    logs_root = tmp_path / "threads"
    log = EventLog(logs_root / "th-hidden.jsonl")
    log.thread_started("th-hidden")

    store = ThreadStateStore()
    store.ensure_thread("th-hidden", values={"title": "Should be gone"})
    app = FastAPI()
    app.include_router(create_thread_state_router(store=store, logs_root=logs_root))
    client = TestClient(app)

    assert client.delete("/api/threads/th-hidden").status_code == 204

    search = client.post("/api/threads/search", json={"limit": 20})
    assert search.status_code == 200
    assert [item["thread_id"] for item in search.json()] == []
    assert client.get("/api/threads/th-hidden").status_code == 404
    assert client.get("/api/threads/th-hidden/state").status_code == 404
    assert client.post("/api/threads/th-hidden/history", json={}).json() == []


def test_thread_delete_accepts_log_only_thread(tmp_path) -> None:
    logs_root = tmp_path / "threads"
    log = EventLog(logs_root / "th-log-only.jsonl")
    log.thread_started("th-log-only")

    app = FastAPI()
    app.include_router(create_thread_state_router(store=ThreadStateStore(), logs_root=logs_root))
    client = TestClient(app)

    response = client.delete("/api/threads/th-log-only")

    assert response.status_code == 204
    assert list_threads(logs_root)[0].archived is True


def test_thread_state_rejects_invalid_thread_id() -> None:
    client = _client()

    assert client.get("/api/threads/bad.thread").status_code == 400


def test_thread_state_owner_metadata_blocks_other_actor() -> None:
    from runtime.safety.auth import Identity, IdentityStore

    identity_store = IdentityStore()
    identity_store.add(Identity(actor_id="alice"), api_key_plaintext="sk-alice")
    identity_store.add(Identity(actor_id="bob"), api_key_plaintext="sk-bob")
    store = ThreadStateStore()
    store.ensure_thread(
        "owned-thread",
        metadata={"owner_actor_id": "alice"},
        values={"title": "Alice"},
    )
    app = FastAPI()
    app.include_router(
        create_thread_state_router(
            store=store,
            identity_store=identity_store,
            require_auth=True,
        )
    )
    client = TestClient(app)

    ok = client.get(
        "/api/threads/owned-thread",
        headers={"Authorization": "Bearer sk-alice"},
    )
    denied = client.get(
        "/api/threads/owned-thread",
        headers={"Authorization": "Bearer sk-bob"},
    )

    assert ok.status_code == 200
    assert denied.status_code == 404


def _legacy_ownerless_client(*, require_auth: bool) -> tuple[TestClient, ThreadStateStore]:
    from runtime.safety.auth import Identity, IdentityStore

    identity_store = IdentityStore()
    # Neither identity carries tenant metadata, so both resolve to the
    # ``legacy:<actor>`` namespace that historically matched tenantless rows.
    identity_store.add(Identity(actor_id="alice"), api_key_plaintext="sk-alice")
    identity_store.add(
        Identity(actor_id="ops", roles=("operator",)),
        api_key_plaintext="sk-ops",
    )
    store = ThreadStateStore()
    store.ensure_thread(
        "legacy-ownerless",
        metadata={},
        values={"title": "Legacy secret", "messages": [{"content": "needle"}]},
    )
    store.ensure_thread(
        "legacy-alice",
        metadata={"owner_actor_id": "alice"},
        values={"title": "Alice legacy", "messages": [{"content": "needle"}]},
    )
    app = FastAPI()
    app.include_router(
        create_thread_state_router(
            store=store,
            identity_store=identity_store,
            require_auth=require_auth,
        )
    )
    return TestClient(app), store


def test_auth_denies_ownerless_tenantless_thread_to_ordinary_identity() -> None:
    client, store = _legacy_ownerless_client(require_auth=True)
    alice = {"Authorization": "Bearer sk-alice"}

    assert client.get("/api/threads/legacy-ownerless", headers=alice).status_code == 404
    assert client.get("/api/threads/legacy-ownerless/state", headers=alice).status_code == 404
    assert client.get("/api/threads/legacy-ownerless/export", headers=alice).status_code == 404
    assert (
        client.post(
            "/api/threads/legacy-ownerless/state",
            headers=alice,
            json={"values": {"title": "hijacked"}},
        ).status_code
        == 404
    )
    assert client.delete("/api/threads/legacy-ownerless", headers=alice).status_code == 404
    assert store.get("legacy-ownerless")["values"]["title"] == "Legacy secret"

    found = client.get("/api/threads/search?q=needle", headers=alice).json()["threads"]
    assert [item["thread_id"] for item in found] == ["legacy-alice"]
    # A legacy row the actor provably owns remains accessible.
    assert client.get("/api/threads/legacy-alice", headers=alice).status_code == 200


def test_auth_allows_operator_to_manage_ownerless_tenantless_thread() -> None:
    client, _ = _legacy_ownerless_client(require_auth=True)
    ops = {"Authorization": "Bearer sk-ops"}

    assert client.get("/api/threads/legacy-ownerless", headers=ops).status_code == 200
    assert client.get("/api/threads/legacy-ownerless/export", headers=ops).status_code == 200
    found = client.get("/api/threads/search?q=needle", headers=ops).json()["threads"]
    assert "legacy-ownerless" in {item["thread_id"] for item in found}
    # Operator status does not unlock rows owned by another actor.
    assert client.get("/api/threads/legacy-alice", headers=ops).status_code == 404


def test_auth_disabled_keeps_ownerless_thread_compatibility() -> None:
    client, _ = _legacy_ownerless_client(require_auth=False)

    assert client.get("/api/threads/legacy-ownerless").status_code == 200
    assert client.get("/api/threads/legacy-ownerless/export").status_code == 200
    found = client.get("/api/threads/search?q=needle").json()["threads"]
    assert "legacy-ownerless" in {item["thread_id"] for item in found}
