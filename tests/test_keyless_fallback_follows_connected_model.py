"""A keyless device's system default follows the model the owner connects.

Product walkthrough 2026-10-14: on a fresh appliance (no provider key) the
owner connected a first model in 系统设置 › 模型与用量 and set it as default,
yet the next workbench or desktop task answered 还没有可用的模型 and the Codex
panel kept "当前通过 Codex 引擎运行 claude-haiku… 当前暂不可执行" until the
backend restarted: the boot-time "unconfigured" fallback stayed in place.
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from runtime.execution.codex_backend.model_profile import resolve_system_model
from runtime.sensing.gateway.config_router import create_config_router
from runtime.sensing.model_router import ModelDispatchRouter, ModelRouter
from runtime.sensing.model_router.models import UnconfiguredModelRouter

ENTRY = {
    "name": "echo-offline-demo",
    "provider": "openai",
    "base_url": "http://127.0.0.1:18750/v1",
    "api_key": "offline-test-key",
    "models": ["echo-offline-demo"],
    "display_name": "离线演示模型",
}


@pytest.fixture
def keyless(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.chdir(tmp_path)
    dispatcher = ModelDispatchRouter(fallback=UnconfiguredModelRouter())
    stack = SimpleNamespace(
        config=SimpleNamespace(planner=SimpleNamespace(model="claude-haiku-4-5-20251001")),
        planner=SimpleNamespace(planner_model=None, router=dispatcher),
    )
    app = FastAPI()
    app.include_router(
        create_config_router(stack=stack, custom_models_path=tmp_path / "custom.json").router
    )
    return SimpleNamespace(client=TestClient(app), dispatcher=dispatcher, stack=stack)


def test_the_first_connected_model_becomes_the_system_default(keyless):
    assert resolve_system_model(keyless.stack) == "claude-haiku-4-5-20251001"

    response = keyless.client.put("/api/config/custom-models/echo-offline-demo", json=ENTRY)

    assert response.status_code == 200, response.text
    assert keyless.dispatcher.default_model == "echo-offline-demo"
    assert resolve_system_model(keyless.stack) == "echo-offline-demo"


def test_removing_the_last_model_restores_the_clear_unconfigured_error(keyless):
    keyless.client.put("/api/config/custom-models/echo-offline-demo", json=ENTRY)

    response = keyless.client.delete("/api/config/custom-models/echo-offline-demo")

    assert response.status_code == 200
    assert isinstance(keyless.dispatcher._fallback, UnconfiguredModelRouter)
    assert resolve_system_model(keyless.stack) == "claude-haiku-4-5-20251001"


def test_a_provider_keyed_fallback_is_never_replaced(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)

    class _Keyed(ModelRouter):
        default_model = "claude-haiku-4-5-20251001"

        def call(self, request):  # pragma: no cover - never dispatched here
            raise AssertionError("not called")

    keyed = _Keyed()
    dispatcher = ModelDispatchRouter(fallback=keyed)
    stack = SimpleNamespace(planner=SimpleNamespace(router=dispatcher))
    app = FastAPI()
    app.include_router(
        create_config_router(stack=stack, custom_models_path=tmp_path / "custom.json").router
    )

    TestClient(app).put("/api/config/custom-models/echo-offline-demo", json=ENTRY)

    assert dispatcher._fallback is keyed
