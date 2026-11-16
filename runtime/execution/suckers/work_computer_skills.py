"""The existing Codex engine's tool for its local, separate work window."""
from __future__ import annotations

from runtime.memory.journal.journal_context import current_conversation_id, current_owner_actor_id
from runtime.platform.work_computer import ComputerError, work_computer
from .registry import Skill


def echo_computer(action: str = "inspect", text: str = "", url: str = "", element: int = -1,
                  x: int = 0, y: int = 0, key: str = "") -> dict:
    """Operate Echo's own local work window, never the TV UI or personal desktop.

    inspect returns visible text and numbered elements; click an observed element,
    text inserts Chinese/other text; key supports Tab/Enter/SelectAll/Backspace/arrows.
    home opens the persistent desktop notes; navigate accepts HTTP(S) URLs.
    launch with text=terminal/files/browser/notes opens a local desktop app.
    While the user has control this call waits for return; never bypass that wait.
    Observe after actions and report only verified results. Password values are hidden.
    """
    try:
        return work_computer().action(current_owner_actor_id() or "local",
            dict(action=action, text=text, url=url, element=element, x=x, y=y, key=key),
            controller="agent", thread=current_conversation_id() or "")
    except (ComputerError, OSError, ValueError) as error:
        return {"ok": False, "error": str(error)}


def register_work_computer(registry):
    registry.register(Skill(name="echo_computer", description=echo_computer.__doc__,
        summary="Operate Echo 的电脑 independent local desktop window",
        affinity=["computer", "browser", "desktop", "code"],
        trusted_source="builtin://echo_computer", handler=echo_computer,
        path_resolution="service", privacy_local=True, timeout_s=260), replace=True)
    return 1
