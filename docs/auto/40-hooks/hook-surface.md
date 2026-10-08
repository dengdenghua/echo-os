# Hook surface

> 每个 lifecycle-hook 的 dispatch 调用点 · 社区 handler 通过 `@register_hook(EventType)` 订阅。

## `notification` · 10 处

- `runtime/execution/suckers/plan_mode.py:205`
- `runtime/execution/tool_engine/_executor_helpers.py:967`
- `runtime/execution/tool_engine/executor.py:553`
- `runtime/execution/tool_engine/executor.py:556`
- `runtime/execution/tool_engine/executor.py:591`
- `runtime/execution/tool_engine/executor.py:594`
- `runtime/sensing/model_router/anthropic_router.py:223`
- `runtime/sensing/model_router/anthropic_router.py:234`
- `runtime/sensing/model_router/anthropic_router.py:529`
- `runtime/sensing/model_router/anthropic_router.py:534`

## `post_tool` · 1 处

- `runtime/execution/tool_engine/executor.py:1175`

## `pre_tool` · 1 处

- `runtime/execution/tool_engine/executor.py:663`

## `session_start` · 2 处

- `runtime/sensing/gateway/realtime_turn_lifecycle.py:713`
- `runtime/sensing/gateway/realtime_turn_lifecycle.py:721`

## `stop` · 2 处

- `runtime/sensing/gateway/realtime_turn_lifecycle.py:253`
- `runtime/sensing/gateway/realtime_turn_lifecycle.py:260`

## `user_prompt` · 2 处

- `runtime/sensing/gateway/realtime_turn_lifecycle.py:714`
- `runtime/sensing/gateway/realtime_turn_lifecycle.py:723`

