"""Product execution policy for Echo OS, including the TV surface.

Legacy adapters remain readable for historical records. New user work binds
Codex once; model availability never selects a different execution engine.
"""

from runtime.execution.engines import EngineId, EngineSelectionError, ExecutionRoute


def select_agent_route(
    *,
    project_command: bool = False,
    group_fanout: bool = False,
    topology_id: str | None = None,
    coordinated: bool = False,
) -> ExecutionRoute:
    from runtime.safety.privacy import PrivacyViolation, deny_private_operation

    try:
        deny_private_operation("codex_model_selection")
    except PrivacyViolation as exc:
        raise EngineSelectionError(str(exc), engine=EngineId.CODEX, reason="privacy") from exc
    if topology_id:
        # The old mesh driver still contains a host model planner. Do not
        # silently revive it while that topology has not migrated to Codex.
        raise EngineSelectionError(
            "当前单助手模式暂不支持群体拓扑，请使用普通任务或成员协作。",
            engine=EngineId.CODEX,
            reason="topology_unavailable",
        )
    # Orchestration is host bookkeeping. Its members and continuations use
    # the same Codex boundary, without creating a second planning engine.
    driver = (
        "project_os" if project_command else "group_fanout" if group_fanout else "codex_app_server"
    )
    return ExecutionRoute(EngineId.CODEX, driver, "single_agent")


def uses_single_agent_policy(stack: object) -> bool:
    """Configured OS stacks use one engine; standalone legacy embeddings do not."""
    execution = getattr(getattr(stack, "config", None), "execution", None)
    return getattr(execution, "agent_engine", None) == "codex"
