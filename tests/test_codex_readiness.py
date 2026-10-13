"""Regression tests for the side-effect-free Codex readiness probe."""

from __future__ import annotations

from pathlib import Path

from runtime.execution.codex_backend.model_profile import (
    CodexModelPreference,
    resolve_codex_execution_profile,
)
from runtime.execution.codex_backend.readiness import inspect_codex_readiness

_COMMAND = ("codex", "app-server", "--strict-config", "--listen", "stdio://")


def _account_profile():
    return resolve_codex_execution_profile(
        preference=CodexModelPreference(mode="chatgpt"),
        system_model="gpt-5.6-codex",
    )


def _incompatible_profile():
    return resolve_codex_execution_profile(
        preference=CodexModelPreference(),
        system_model="deepseek",
        custom_models={
            "deepseek": {
                "id": "deepseek",
                "provider": "openai",
                "base_url": "https://example.test/v1",
                "models": ["deepseek-chat"],
            }
        },
        proxy_available=False,
    )


def _enable_probe(monkeypatch) -> None:
    import runtime.execution.codex_backend.readiness as readiness

    monkeypatch.setattr(readiness, "resolution", lambda _name: (True, "default"))
    monkeypatch.setattr(readiness, "resolve_codex_app_server_command", lambda: _COMMAND)


def test_account_mode_requires_existing_auth_home(monkeypatch) -> None:
    _enable_probe(monkeypatch)

    result = inspect_codex_readiness(
        _account_profile(),
        auth_source=lambda: None,
    )

    assert result.available is False
    assert result.reason == "account_required"


def test_account_mode_is_ready_when_auth_and_tools_exist(monkeypatch, tmp_path: Path) -> None:
    _enable_probe(monkeypatch)
    auth_home = tmp_path / "codex-home"

    result = inspect_codex_readiness(
        _account_profile(),
        auth_source=lambda: auth_home,
    )

    assert result.available is True
    assert result.reason is None


def test_probe_reports_independent_prerequisite_failures(monkeypatch) -> None:
    _enable_probe(monkeypatch)

    import runtime.execution.codex_backend.readiness as readiness

    # The real resolver raises ConfigurationError; use the public class so the
    # test also proves the probe does not leak implementation details.
    from runtime.execution.codex_backend.types import ConfigurationError

    monkeypatch.setattr(
        readiness,
        "resolve_codex_app_server_command",
        lambda: (_ for _ in ()).throw(ConfigurationError("missing")),
    )
    assert inspect_codex_readiness(_account_profile(), auth_source=lambda: None).reason == (
        "executable_unavailable"
    )

    _enable_probe(monkeypatch)
    assert inspect_codex_readiness(
        _account_profile(), auth_source=lambda: None, tools_available=False
    ).reason == "tools_unavailable"

    assert inspect_codex_readiness(
        _incompatible_profile(), auth_source=lambda: None
    ).reason == "model_incompatible"


def test_proxy_profile_does_not_require_codex_account(monkeypatch) -> None:
    _enable_probe(monkeypatch)

    profile = resolve_codex_execution_profile(
        preference=CodexModelPreference(),
        system_model="proxy",
        custom_models={
            "proxy": {
                "id": "proxy",
                "provider": "openai",
                "base_url": "https://echo.example/v1",
                "models": ["gpt-safe"],
            }
        },
        proxy_available=True,
    )

    result = inspect_codex_readiness(profile, auth_source=lambda: None)

    assert result.available is True
    assert result.reason is None


def test_explicit_feature_disable_wins_before_other_checks(monkeypatch) -> None:
    import runtime.execution.codex_backend.readiness as readiness

    monkeypatch.setattr(readiness, "resolution", lambda _name: (False, "env"))
    monkeypatch.setattr(
        readiness,
        "resolve_codex_app_server_command",
        lambda: (_ for _ in ()).throw(AssertionError("must not resolve command")),
    )

    result = inspect_codex_readiness(_account_profile(), auth_source=lambda: None)

    assert result.available is False
    assert result.reason == "disabled"


def test_unavailable_codex_selection_explains_itself_in_chinese(monkeypatch) -> None:
    import asyncio
    from types import SimpleNamespace

    import pytest

    from runtime.execution.codex_backend.readiness import CodexReadiness
    from runtime.execution.engines import EngineSelectionError
    from runtime.platform.models import ParsedIntent
    from runtime.protocol import Turn, TurnParams
    from runtime.sensing.gateway import realtime_execution

    monkeypatch.setattr(
        realtime_execution,
        "codex_readiness_for_turn",
        lambda *_args: CodexReadiness(False, "model_incompatible"),
    )
    turn = Turn(
        threadId="thread",
        params=TurnParams(threadId="thread", executionEngine="codex"),
    )
    intent = ParsedIntent(raw="你好", intent_type="task", normalized_goal="你好")

    with pytest.raises(EngineSelectionError) as caught:
        asyncio.run(
            realtime_execution.select_turn_execution(
                SimpleNamespace(_stack=SimpleNamespace(config=None)),
                turn,
                object(),
                intent,
                project_command=False,
                group_fanout=False,
                topology_id=None,
                codex_partner=False,
                reflection_fast_path=False,
            )
        )

    message = str(caught.value)
    # The durable reason code stays machine-readable; the message is chat copy.
    assert caught.value.reason == "model_incompatible"
    assert message.startswith("Codex 引擎暂不可用：当前模型不能安全交给 Codex")
    assert "Echo 原生引擎" in message
    # ``octopus`` is the persisted engine id, never a user-facing name.
    assert "octopus" not in message.lower()


def test_unknown_codex_reason_keeps_the_code_visible() -> None:
    from runtime.sensing.gateway.realtime_execution import codex_unavailable_message

    assert "执行条件未满足（new_reason）" in codex_unavailable_message("new_reason")
    assert "执行条件未满足（unavailable）" in codex_unavailable_message(None)
