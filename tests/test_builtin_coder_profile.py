"""Regression coverage for built-in Codex execution boundaries."""

from __future__ import annotations

from pathlib import Path

from runtime.execution.agents.loader import parse_template
from runtime.execution.codex_backend import role_runner

# Echo answers on the native engine so a fresh install can chat before Codex
# is set up (same as ECHO AI). Every other built-in role selects Codex.
NATIVE_ENGINE_AGENTS = {"general"}


def test_builtin_agents_select_their_execution_backend(monkeypatch) -> None:
    root = Path(__file__).resolve().parents[1]
    profile_paths = sorted((root / "agents").glob("*/profile.jsonc"))
    assert profile_paths

    monkeypatch.setattr(role_runner, "deployment_mode", lambda: "local")
    monkeypatch.setattr(role_runner, "_explicit_feature_flag", lambda: None)

    seen: set[str] = set()
    for profile_path in profile_paths:
        template = parse_template(profile_path.parent, root / "agents" / "_shared")
        seen.add(template.agent_id)
        assert "code_mode_unlock" not in template.capabilities, template.agent_id
        if template.agent_id in NATIVE_ENGINE_AGENTS:
            assert "execution_backend" not in template.capabilities, template.agent_id
            assert role_runner.agent_uses_codex_execution_backend(template) is False
            continue
        assert template.capabilities.get("execution_backend") == "codex_app_server", template.agent_id
        assert role_runner.agent_uses_codex_execution_backend(template) is True, template.agent_id
    assert seen >= NATIVE_ENGINE_AGENTS
