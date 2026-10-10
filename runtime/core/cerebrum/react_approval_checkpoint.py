"""Persist completed work before a server-held approval can outlive its worker."""

from __future__ import annotations

from runtime.core.cerebrum._react_context_attachments import _serialize_messages_for_checkpoint
from runtime.core.cerebrum.react_loop_state import _LoopState


def persist_server_hold_boundary(state: _LoopState) -> None:
    if (getattr(state.intent, "user_context", None) or {}).get(
        "approval_delivery"
    ) != "server_hold":
        return
    journal = getattr(state.stack, "journal", None)
    if journal is None or not state.react_task_id:
        raise RuntimeError("server-held approval requires a durable recovery checkpoint")
    # The current action has not executed. Do not record it as completed or
    # carry an approval grant across a restart; recovery plans and reviews anew.
    journal.write_react_checkpoint(
        task_id=state.react_task_id,
        iteration_completed=max((step.iteration for step in state.steps), default=0),
        max_iterations=state.iteration_limit,
        messages_snapshot=_serialize_messages_for_checkpoint(state.messages),
        steps_snapshot=[
            {
                "iteration": step.iteration,
                "thought": step.thought,
                "public_update": step.public_update,
                "action": step.action,
                "actions": list(step.actions),
                "observation": step.observation,
                "action_results": [dict(result) for result in step.action_results],
            }
            for step in state.steps
        ],
        working_set_snapshot=list(state.working_set.values()),
        progress_summary=state.progress_summary,
        current_phase=state.current_phase,
        has_final_answer=False,
    )
