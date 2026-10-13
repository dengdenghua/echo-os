"""Every turn records the caller's model before smart routing.

Golden path 2026-10: the first task routed to the Codex engine failed in the
chat with "cannot access local variable 'requested_model_before_routing'".
The assignment sat inside the auto-topology ``if`` block, so only messages that
happened to auto-dispatch to a team topology defined it, while the Codex /
OpenCode branch reads it for every turn.
"""

from __future__ import annotations

import ast
from pathlib import Path

_SOURCE = (
    Path(__file__).resolve().parents[1] / "runtime/sensing/gateway/realtime_turn_lifecycle.py"
)
_NAME = "requested_model_before_routing"


def _start_turn() -> ast.AsyncFunctionDef:
    tree = ast.parse(_SOURCE.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "_start_turn":
            return node
    raise AssertionError("_start_turn not found")


def _assigns_name(statement: ast.stmt) -> bool:
    return isinstance(statement, ast.Assign) and any(
        isinstance(target, ast.Name) and target.id == _NAME for target in statement.targets
    )


def test_requested_model_is_bound_unconditionally_before_any_read() -> None:
    function = _start_turn()
    top_level = [index for index, stmt in enumerate(function.body) if _assigns_name(stmt)]
    assert top_level, f"{_NAME} must be assigned at the top level of _start_turn"

    first_read = min(
        (
            node.lineno
            for node in ast.walk(function)
            if isinstance(node, ast.Name) and node.id == _NAME and isinstance(node.ctx, ast.Load)
        ),
        default=None,
    )
    assert first_read is not None
    assert function.body[top_level[0]].lineno < first_read


def test_a_crashed_driver_shows_chinese_copy_not_the_python_exception() -> None:
    from runtime.sensing.gateway.realtime_turn_lifecycle import _public_driver_error_message

    unbound = UnboundLocalError(
        "cannot access local variable 'requested_model_before_routing' where it is not "
        "associated with a value"
    )
    message = _public_driver_error_message(unbound)
    assert "requested_model_before_routing" not in message
    assert message.startswith("任务执行时出错")

    written_for_people = RuntimeError("还没有可用的模型。请在「系统设置 › 模型与用量」接入一个模型。")
    assert _public_driver_error_message(written_for_people) == str(written_for_people)
