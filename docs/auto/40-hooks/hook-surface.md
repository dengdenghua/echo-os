# Hook surface

> 每个 lifecycle-hook 的 dispatch 调用点 · 社区 handler 通过 `@register_hook(EventType)` 订阅。

## `notification` · 10 处

- `runtime/execution/suckers/plan_mode.py:205`
- `runtime/execution/tool_engine/_executor_helpers.py:967`
- `runtime/execution/tool_engine/executor.py:554`
- `runtime/execution/tool_engine/executor.py:557`
- `runtime/execution/tool_engine/executor.py:592`
- `runtime/execution/tool_engine/executor.py:595`
- `runtime/sensing/model_router/anthropic_router.py:223`
- `runtime/sensing/model_router/anthropic_router.py:234`
- `runtime/sensing/model_router/anthropic_router.py:529`
- `runtime/sensing/model_router/anthropic_router.py:534`

## `post_tool` · 1 处

- `runtime/execution/tool_engine/executor.py:1176`

## `pre_tool` · 1 处

- `runtime/execution/tool_engine/executor.py:664`

## `session_start` · 2 处

- `runtime/sensing/gateway/realtime_turn_lifecycle.py:737`
- `runtime/sensing/gateway/realtime_turn_lifecycle.py:745`

## `stop` · 2 处

- `runtime/sensing/gateway/realtime_turn_lifecycle.py:258`
- `runtime/sensing/gateway/realtime_turn_lifecycle.py:265`

## `user_prompt` · 2 处

- `runtime/sensing/gateway/realtime_turn_lifecycle.py:738`
- `runtime/sensing/gateway/realtime_turn_lifecycle.py:747`

