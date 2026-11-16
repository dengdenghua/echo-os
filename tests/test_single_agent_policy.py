"""OS admission must not silently select another engine on any surface."""

import asyncio
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from runtime.execution.agent_policy import select_agent_route
from runtime.execution.codex_backend.readiness import CodexReadiness
from runtime.execution.engines import EngineId, EngineSelectionError, ExecutionPhase
from runtime.platform.config.schema import ExecutionConfig
from runtime.platform.models import ParsedIntent
from runtime.protocol import Turn, TurnParams
from runtime.sensing.gateway import realtime_execution


@pytest.mark.parametrize("hint", ["auto", "octopus", "codex", "opencode"])
@pytest.mark.parametrize("prompt", ["你好", "检索知识库里的预算", "播放我的电影", "修复代码"])
def test_all_client_hints_and_task_types_bind_codex(monkeypatch, hint, prompt):
    monkeypatch.setattr(
        realtime_execution, "codex_readiness_for_turn", lambda *_: CodexReadiness(True)
    )
    turn = Turn(threadId="tv", params=TurnParams(threadId="tv", executionEngine=hint))
    route = asyncio.run(
        realtime_execution.select_turn_execution(
            SimpleNamespace(),
            turn,
            object(),
            ParsedIntent(raw=prompt, normalized_goal=prompt, intent_type="task"),
            project_command=False,
            group_fanout=False,
            topology_id=None,
            codex_partner=False,
            reflection_fast_path=True,
        )
    )
    assert route.engine is EngineId.CODEX
    for phase in ExecutionPhase:
        assert route.driver_for(phase) == "codex_app_server"


@pytest.mark.parametrize(
    "reason", ["disabled", "model_incompatible", "account_required", "executable_unavailable"]
)
def test_missing_prerequisite_blocks_without_fallback(monkeypatch, reason):
    monkeypatch.setattr(
        realtime_execution, "codex_readiness_for_turn", lambda *_: CodexReadiness(False, reason)
    )
    turn = Turn(threadId="tv", params=TurnParams(threadId="tv"))
    with pytest.raises(EngineSelectionError) as error:
        asyncio.run(
            realtime_execution.select_turn_execution(
                SimpleNamespace(),
                turn,
                object(),
                ParsedIntent(raw="开发应用", normalized_goal="开发应用", intent_type="task"),
                project_command=False,
                group_fanout=False,
                topology_id=None,
                codex_partner=False,
                reflection_fast_path=False,
            )
        )
    assert error.value.engine is EngineId.CODEX
    assert error.value.reason == reason


@pytest.mark.parametrize(
    "signals,driver",
    [
        ({"project_command": True}, "project_os"),
        ({"group_fanout": True}, "group_fanout"),
        ({"coordinated": True}, "codex_app_server"),
    ],
)
def test_host_orchestration_keeps_one_model_engine(signals, driver):
    route = select_agent_route(**signals)
    assert route.engine is EngineId.CODEX
    assert route.driver_for(ExecutionPhase.PRIMARY) == driver
    assert route.driver_for(ExecutionPhase.STEERING) == "codex_app_server"


def test_privacy_rejects_before_readiness(monkeypatch):
    from runtime.safety import privacy

    monkeypatch.setattr(privacy, "privacy_enabled", lambda: True)
    with pytest.raises(EngineSelectionError) as error:
        select_agent_route()
    assert error.value.reason == "privacy"


def test_os_workers_never_reach_legacy_planner(monkeypatch):
    from runtime.execution.codex_backend import role_runner
    from runtime.execution.parallel_agents.stack_runner import make_stack_subagent_runner

    planner = SimpleNamespace(plan=Mock(side_effect=AssertionError("legacy planner called")))
    stack = SimpleNamespace(
        planner=planner, runtime=object(), config=SimpleNamespace(execution=ExecutionConfig())
    )
    agent = SimpleNamespace(capabilities={}, display_name="Echo")
    registry = SimpleNamespace(has=lambda name: name == "general", get=lambda _: agent)
    run = Mock(return_value=SimpleNamespace(success=True, output="已检索", status="completed"))
    monkeypatch.setattr(role_runner, "run_agent_role_sync", run)
    worker = make_stack_subagent_runner(stack, agent_registry=registry)
    assert worker("检索", subagent_name="general-purpose") == "已检索"
    assert run.call_args.args[1] is agent
    run.side_effect = RuntimeError("Codex unavailable")
    with pytest.raises(RuntimeError, match="Codex unavailable"):
        worker("检索", subagent_name="general")
    planner.plan.assert_not_called()


def test_single_engine_config_rejects_alternative_engine_and_no_background_planner():
    from pydantic import ValidationError

    from runtime.execution.model_services import background_model_calls_enabled

    with pytest.raises(ValidationError):
        ExecutionConfig(agent_engine="opencode")
    stack = SimpleNamespace(config=SimpleNamespace(execution=ExecutionConfig()))
    assert not background_model_calls_enabled(stack)


def test_task_model_override_is_host_object_and_shared_by_all_roles():
    from runtime.execution.codex_backend.role_runner import _server_model_override
    from runtime.platform.process.session import Session
    from runtime.sensing.gateway._realtime_react_stream_helpers import (
        _apply_codex_task_model_override,
    )

    metadata = {
        "execution_engine": "codex",
        "model_scope": "task",
        "model_name": "chatgpt/test-model",
        "reasoning_effort": "high",
    }
    _apply_codex_task_model_override(metadata)
    assert _server_model_override(object(), {"caller_session": Session(metadata=metadata)}) == (
        "test-model",
        "high",
    )
    assert _server_model_override(
        object(), {"_server_codex_execution_override": {"model": "forged"}}
    ) == (None, None)


def test_unmigrated_mesh_cannot_start_a_second_planner():
    with pytest.raises(EngineSelectionError) as error:
        select_agent_route(topology_id="mesh")
    assert error.value.reason == "topology_unavailable"


def test_configured_group_failure_cannot_fall_back_to_react(tmp_path):
    from unittest.mock import AsyncMock

    from runtime.memory.threads.event_log import EventLog
    from runtime.sensing.gateway._team_stream_group_fanout import _drive_group_fanout

    runtime = SimpleNamespace(
        _stack=SimpleNamespace(config=SimpleNamespace(execution=ExecutionConfig())),
        _trace_store=None,
        _wrap_with_policy=lambda value: value,
        _drive_react=AsyncMock(side_effect=AssertionError("legacy engine called")),
    )
    turn = Turn(threadId="group", params=TurnParams(threadId="group"))
    log = EventLog(tmp_path / "events.jsonl")
    emitter = SimpleNamespace(notify=AsyncMock())
    intent = ParsedIntent(
        raw="协作", normalized_goal="协作", intent_type="task", user_context={"agent_roster": []}
    )
    with pytest.raises(RuntimeError, match="停止自动回退"):
        asyncio.run(_drive_group_fanout(runtime, turn, log, emitter, intent, text="协作"))
    runtime._drive_react.assert_not_called()


def test_explicit_codebuddy_route_preserves_default_and_privacy(monkeypatch):
    from runtime.execution import codebuddy_backend
    from runtime.safety import privacy
    monkeypatch.setattr(codebuddy_backend, "inspect_readiness", lambda *_: {"available": True})
    monkeypatch.setattr(privacy, "privacy_enabled", lambda: False)
    turn = Turn(threadId="tv", params=TurnParams(threadId="tv", executionEngine="codebuddy", model="codebuddy/hy4std"))
    def choose():
        return asyncio.run(realtime_execution.select_turn_execution(SimpleNamespace(), turn, object(), ParsedIntent(raw="你好", normalized_goal="你好", intent_type="task"), project_command=False, group_fanout=False, topology_id=None, codex_partner=False, reflection_fast_path=False))
    route = choose()
    assert route.engine is EngineId.CODEBUDDY
    assert route.driver_for(ExecutionPhase.PRIMARY) == "codebuddy_cli"
    monkeypatch.setattr(privacy, "privacy_enabled", lambda: True)
    with pytest.raises(EngineSelectionError) as error:
        choose()
    assert error.value.reason == "privacy"
