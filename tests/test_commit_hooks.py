"""Lock the commit hooks to the CI gates they mirror.

The hooks in ``.pre-commit-config.yaml`` exist to stop CI drift at commit
time. If ci.yml's ruff invocations change shape, ``tools/hooks/ci_ruff.py``
would silently select nothing; these tests make that a CI failure instead.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

yaml = pytest.importorskip("yaml", reason="PyYAML is required to inspect the hook config")

REPO_ROOT = Path(__file__).resolve().parents[1]
HOOKS = REPO_ROOT / "tools" / "hooks"


def _load(name: str):
    spec = importlib.util.spec_from_file_location(f"echo_hook_{name}", HOOKS / f"{name}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_ruff_hook_reads_the_ci_scope() -> None:
    ci_ruff = _load("ci_ruff")
    check, fmt = ci_ruff.ci_scope("check"), ci_ruff.ci_scope("format")
    assert {"appliance/", "runtime/", "tests/"} <= check
    assert {"appliance/", "tests/appliance/"} <= fmt
    # runtime/ and tests/ are linted but deliberately never formatted in CI.
    assert "runtime/" not in fmt and "tests/" not in fmt
    assert ci_ruff.in_scope("runtime/platform/ui/app.py", check)
    assert not ci_ruff.in_scope("runtime/platform/ui/app.py", fmt)
    assert ci_ruff.in_scope("deploy/appliance/operations_systemd.py", fmt)
    assert not ci_ruff.in_scope("deploy/oem/echo_oem_setup.py", check)


def test_docs_hook_triggers_on_every_generator_input() -> None:
    docs = _load("docs_auto_fresh")
    assert docs.relevant("M", "runtime/safety/hooks/runner.py")
    assert docs.relevant("M", "scripts/gen_wiki.py")
    assert docs.relevant("A", "tests/appliance/test_new.py")
    assert docs.relevant("D", "frontend/src/app/x.tsx")
    # Editing a test or component does not change the counts gen_wiki reports.
    assert not docs.relevant("M", "tests/appliance/test_new.py")
    assert not docs.relevant("M", "frontend/src/app/x.tsx")
    assert not docs.relevant("M", "appliance/extension.py")


def test_config_wires_the_ci_mirroring_hooks() -> None:
    config = yaml.safe_load((REPO_ROOT / ".pre-commit-config.yaml").read_text(encoding="utf-8"))
    local = next(repo for repo in config["repos"] if repo["repo"] == "local")
    hooks = {hook["id"]: hook for hook in local["hooks"]}
    assert {
        "ruff-check-ci-scope",
        "ruff-format-ci-scope",
        "docs-auto-fresh",
        "frontend-prettier",
        "frontend-eslint",
        "lint-ratchets",
    } <= set(hooks)
    assert hooks["docs-auto-fresh"]["always_run"] is True
    assert hooks["lint-ratchets"]["stages"] == ["pre-push"]
    for hook in hooks.values():
        assert "tools/hooks/" in hook["entry"] or "bandit" in hook["entry"]
