"""Focused coverage for the realtime CodeBuddy host entry."""

from __future__ import annotations

import asyncio
import contextlib
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from runtime.execution import codebuddy_roles as roles
from runtime.execution.engines import (
    EngineId,
    ExecutionRoute,
)
from runtime.execution.request import ExecutionRequest, ExecutionResources, ExecutionTask
from runtime.memory.threads.event_log import EventLog
from runtime.platform.models import ParsedIntent
from runtime.platform.process.scope import ExecutionScope
from runtime.platform.process.session import Session
from runtime.protocol import Turn, TurnParams
from runtime.sensing.gateway import realtime_codebuddy_backend
from runtime.sensing.gateway.realtime_execution import TurnExecutionRequest, bind_turn_execution


def test_codebuddy_adapter_binds_the_authenticated_host_request(tmp_path, monkeypatch) -> None:
    turn = Turn(
        threadId="thread",
        params=TurnParams(
            threadId="thread",
            executionEngine="codebuddy",
            owner_actor_id="alice",
            tenant_id="tenant",
        ),
    )
    turn.execution_workspace_path = str(tmp_path)
    log = EventLog(tmp_path / "events.jsonl")
    log.turn_started(turn.thread_id, turn)
    emitter = SimpleNamespace(notify=AsyncMock(), is_turn_interrupted=lambda _id: False)
    seen = []

    async def fake_drive(
        runtime, current_turn, _log, _emitter, _intent, _agent, _provider, *, text
    ):
        from runtime.execution.request import current_execution_request
        from runtime.platform.process.session import current_session

        request = current_execution_request()
        session = current_session()
        assert request is not None
        assert request.task.execution_engine == "codebuddy"
        assert request.task.actor_id == "alice"
        assert request.task.tenant_id == "tenant"
        assert session is not None
        assert session.actor == "alice"
        assert current_turn is turn
        seen.append(text)

    monkeypatch.setattr(realtime_codebuddy_backend, "drive_codebuddy", fake_drive)
    runtime = SimpleNamespace(
        _stack=SimpleNamespace(config=SimpleNamespace(budget=None)),
        _workspaces=None,
    )
    intent = ParsedIntent(
        raw="use CodeBuddy",
        intent_type="task",
        normalized_goal="use CodeBuddy",
        user_context={"mode": "chat", "workspace_path": str(tmp_path)},
    )
    execution = bind_turn_execution(
        runtime,
        turn,
        log,
        emitter,
        object(),
        object(),
        ExecutionRoute(EngineId.CODEBUDDY, "codebuddy_cli", "explicit_engine"),
    )

    import asyncio

    asyncio.run(execution.execute(TurnExecutionRequest(intent, "use CodeBuddy", None)))

    assert seen == ["use CodeBuddy"]
    assert turn.execution is not None
    assert turn.execution.engine == "codebuddy"
    assert turn.execution.driver == "codebuddy_cli"


@pytest.fixture
def host(tmp_path, monkeypatch):
    agent = SimpleNamespace(
        agent_id="member",
        soul="A helpful member",
        arms=[],
        extra_skills=[],
        capabilities={"execution_backend": "codebuddy_cli"},
    )
    task = ExecutionTask(
        task_id="parent-turn",
        thread_id="parent-thread",
        actor_id="alice",
        tenant_id="acme",
        goal="Original request",
        authorization_intent="Original human authorization",
        permissions=ExecutionScope(
            mode="ask",
            requested_mode="ask",
            readable_roots=(tmp_path,),
            writable_roots=(),
            network_policy="deny",
            shell_policy="deny",
        ),
        resources=ExecutionResources(1000, 1.0, time.monotonic() + 30),
        execution_engine="codebuddy",
        approval_provider=object(),
    )
    request = ExecutionRequest(task, task.goal)
    session = Session(
        actor="alice",
        agent=agent,
        thread_id=task.thread_id,
        turn_id=task.task_id,
        metadata={"tenant_id": "acme", "workspace_path": str(tmp_path)},
    )
    return SimpleNamespace(
        agent=agent,
        request=request,
        session=session,
        stack=SimpleNamespace(executor=SimpleNamespace(registry=None)),
    )


def test_codebuddy_tool_bridge_keeps_caller_identity(host, monkeypatch):
    from runtime.execution.suckers.registry import SkillRegistry
    from runtime.execution.tool_engine.host_mcp import HostMCPBridge

    host.stack.executor.registry = SkillRegistry()
    monkeypatch.setattr(roles.backend, "inspect_readiness", lambda scope: {"available": True})

    class Verified(Exception):
        pass

    @contextlib.asynccontextmanager
    async def bridge(bridge):
        active = bridge.broker._execution_session(auto_approve=False)
        assert active.actor == "alice"
        assert active.metadata["tenant_id"] == "acme"
        assert bridge.broker._execution_engine == "codebuddy"
        raise Verified()
        yield

    monkeypatch.setattr(HostMCPBridge, "serve", bridge)

    async def run():
        return [
            e
            async for e in roles.stream_role(
                host.stack,
                host.agent,
                request=host.request,
                session=host.session,
                context={"tenant_id": "forged"},
                model="auto",
                text="hi",
                interrupted=lambda: False,
            )
        ]

    with pytest.raises(Verified):
        asyncio.run(run())


def test_codebuddy_history_replay_preserves_engine():
    from runtime.memory.threads._replay import _apply_turn_update

    turn = Turn(
        threadId="thread", params=TurnParams(threadId="thread", executionEngine="codebuddy")
    )
    _apply_turn_update(
        turn,
        {
            "execution": {
                "engine": "codebuddy",
                "driver": "codebuddy_cli",
                "reason": "explicit_engine",
                "phase": "primary",
                "invocation": 1,
            }
        },
    )
    assert turn.execution is not None
    assert turn.execution_engine == "codebuddy"


def test_turn_outcome_retains_codebuddy_engine():
    from runtime.sensing.gateway.realtime_turn_outcome import _turn_execution_engine

    turn = Turn(
        threadId="thread", params=TurnParams(threadId="thread", executionEngine="codebuddy")
    )
    turn.execution_engine = "codebuddy"
    assert _turn_execution_engine(turn) == "codebuddy"


def test_real_codebuddy_driver_through_bound_host_task(tmp_path, monkeypatch):
    from runtime.execution import codebuddy_backend
    from runtime.execution.suckers.registry import SkillRegistry
    from runtime.protocol import TurnStatus
    from runtime.sensing.gateway import realtime_execution_context

    monkeypatch.setattr(
        realtime_execution_context,
        "resolve_execution_scope",
        lambda _: ExecutionScope(
            mode="code",
            requested_mode="code",
            readable_roots=(tmp_path,),
            writable_roots=(),
            network_policy="deny",
            shell_policy="deny",
        ),
    )
    turn = Turn(
        threadId="thread-live",
        params=TurnParams(
            threadId="thread-live",
            executionEngine="codebuddy",
            model="codebuddy/hy4std",
            owner_actor_id="alice",
            tenant_id="tenant",
        ),
    )
    turn.execution_workspace_path = str(tmp_path)
    log = EventLog(tmp_path / "events-driver.jsonl")
    log.turn_started(turn.thread_id, turn)
    seen = []

    async def stream(**kwargs):
        assert kwargs["model"] == "hy4std"
        yield {"type": "text_delta", "delta": "OS_OK"}
        yield {"type": "react_completed", "success": True}

    monkeypatch.setattr(codebuddy_backend, "inspect_readiness", lambda *_: {"available": True})
    monkeypatch.setattr(codebuddy_backend, "stream_prompt", stream)

    async def apply(current, *_args):
        event = _args[-1]
        seen.append(event)
        if event["type"] == "react_completed":
            current.status = TurnStatus.COMPLETED

    bridge = SimpleNamespace(flush=AsyncMock(), prose_status_for_turn=lambda *_: "completed")
    runtime = SimpleNamespace(
        _stack=SimpleNamespace(
            config=SimpleNamespace(budget=None), executor=SimpleNamespace(registry=SkillRegistry())
        ),
        _workspaces=None,
        _make_bridge_state=lambda *a, **kw: bridge,
        _apply_react_event=apply,
    )
    intent = ParsedIntent(
        raw="hello",
        intent_type="task",
        normalized_goal="hello",
        user_context={
            "mode": "chat",
            "workspace_path": str(tmp_path),
            "direct_conversation_reply": True,
        },
    )
    agent = SimpleNamespace(
        agent_id="general", soul="helpful", arms=[], extra_skills=[], capabilities={}
    )
    emitter = SimpleNamespace(notify=AsyncMock(), is_turn_interrupted=lambda _: False)
    execution = bind_turn_execution(
        runtime,
        turn,
        log,
        emitter,
        object(),
        agent,
        ExecutionRoute(EngineId.CODEBUDDY, "codebuddy_cli", "explicit_engine"),
    )
    asyncio.run(execution.execute(TurnExecutionRequest(intent, "hello", "codebuddy/hy4std")))
    assert turn.execution_agent_id == "general"
    assert "execution_agent_id" not in turn.model_dump()
    assert turn.status == TurnStatus.COMPLETED, seen
    assert any(e.get("delta") == "OS_OK" for e in seen)
