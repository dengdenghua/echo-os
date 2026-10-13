"""A fresh device's first connected model is the system model Codex follows.

Golden path 2026-10: the config template names claude-haiku as the planner
model. After the owner connected a model in 系统设置 (it became the router
default) the Codex panel still said the current model was not connected and
"follow system" turns stayed unavailable until a model was picked per task.
"""

from __future__ import annotations

from types import SimpleNamespace

from runtime.execution.codex_backend.model_profile import resolve_system_model


def _stack(*, routable: set[str], default: str | None, config_model: str | None = "claude-haiku"):
    router = SimpleNamespace(has=lambda model: model in routable, default_model=default)
    return SimpleNamespace(
        config=SimpleNamespace(planner=SimpleNamespace(model=config_model)),
        planner=SimpleNamespace(planner_model=None, router=router),
    )


def test_an_unroutable_template_model_yields_to_the_connected_default() -> None:
    stack = _stack(routable={"echo-offline-demo"}, default="echo-offline-demo")
    assert resolve_system_model(stack) == "echo-offline-demo"


def test_a_routable_configured_model_still_wins() -> None:
    stack = _stack(routable={"claude-haiku", "echo-offline-demo"}, default="echo-offline-demo")
    assert resolve_system_model(stack) == "claude-haiku"


def test_with_nothing_connected_the_configured_model_is_reported() -> None:
    stack = _stack(routable=set(), default=None)
    assert resolve_system_model(stack) == "claude-haiku"


def test_a_router_without_route_checks_keeps_the_old_precedence() -> None:
    stack = SimpleNamespace(
        config=SimpleNamespace(planner=SimpleNamespace(model="configured")),
        planner=SimpleNamespace(planner_model=None, router=SimpleNamespace(default_model="d")),
    )
    assert resolve_system_model(stack) == "configured"
    assert resolve_system_model(SimpleNamespace()) is None
