"""Release runtime state and owned handles before deleting local data."""

from __future__ import annotations

from ._app_context import AppContext


def reset_runtime_memory(ctx: AppContext) -> None:
    clear_threads = getattr(ctx.thread_store, "clear", None)
    if callable(clear_threads):
        clear_threads()
    close_threads = getattr(ctx.thread_store, "close", None)
    if callable(close_threads):
        close_threads()
    clear_teams = getattr(ctx.team_rooms_router, "reset_state", None)
    if callable(clear_teams):
        clear_teams()
