"""Minimal probe: bridge the black-box ``RealtimeTrialRunner`` to a real network WS endpoint.

Goal (Option 2 seam-check): prove that ``benchmarks.realtime_runner`` — a pure
``websockets.connect(url)`` client — can drive an Echo OS realtime gateway that is
served over a *real network port* (uvicorn), not the in-memory ``TestClient`` the
existing cerebrum tests use. The two share the JSON-RPC protocol but differ in
transport; this probe closes that gap.

The model/LLM/tooling is kept out of the picture by swapping ``stream_react_loop``
for a deterministic fake (the same seam ``tests/realtime_cerebrum/conftest.py``
uses). The fake yields one fixed ``agentMessage`` then finishes, so no provider is
contacted. A successful run means the runner received a terminal ``turn_result``
over a real socket — the transport seam is open.

Run from repo root (uses project venv deps):

    .venv/Scripts/python.exe benchmarks/probe_realtime_network_seam.py

Exit code 0 = seam open; non-zero = transport seam still blocked.
"""

from __future__ import annotations

import socket
import sys
import threading
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

# Ensure the repo root (which holds the ``runtime`` package) is importable no
# matter where the script is invoked from.
_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _install_fake_loop(final_text: str) -> None:
    """Swap the react loop for a deterministic fake (no LLM/tool/provider).

    The gateway consumes react-loop events (see ``realtime_cerebrum.py`` docstring):
    ``text_delta`` streams into an agentMessage item, ``react_step_complete`` flushes
    it, and ``react_completed`` closes the turn. We emit exactly that minimal
    sequence.

    Patch target: ``react_loop.stream_react_loop`` (the definition site). The
    gateway's stream-drive imports it *inside the function* (``from
    runtime.core.cerebrum.react_loop import stream_react_loop`` at
    ``_realtime_react_stream_drive.py:334``), so every call re-resolves the name from
    the ``react_loop`` module — patching the definition module is what intercepts the
    gateway. (An earlier attempt that patched the drive module's attribute was a
    no-op precisely because of the function-local import.)
    """

    import runtime.core.cerebrum.react_loop as react_loop

    def fake_stream(*args: Any, **kwargs: Any) -> Iterator[dict[str, Any]]:
        yield {"type": "text_delta", "delta": final_text}
        yield {"type": "react_step_complete", "text": final_text}
        yield {"type": "react_completed", "final_answer": final_text}

    react_loop.stream_react_loop = fake_stream


def _serve(app: Any, port: int, ready: threading.Event, shutdown: threading.Event) -> None:
    import uvicorn

    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=port,
        log_level="error",
        # One worker; this is a throwaway probe server.
        workers=1,
    )
    server = uvicorn.Server(config)

    def _mark_ready() -> None:
        # uvicorn installs its signal handlers on the main thread only when it owns
        # it; here it runs on a background thread, so start serving then signal.
        ready.set()

    threading.Timer(0.3, _mark_ready).start()
    server.run()
    shutdown.set()


def main() -> int:
    from fastapi import FastAPI

    from runtime.sensing.gateway.realtime_cerebrum import CerebrumRuntime
    from runtime.sensing.gateway.realtime_gateway import RealtimeGateway

    final_text = "seam-probe: fake loop reached turn end over a real network socket."
    _install_fake_loop(final_text)

    # Same minimal construction tests/realtime_cerebrum/conftest.py uses; the fake
    # loop never touches the real stack/agent.
    runtime = CerebrumRuntime(
        stack=object(),  # unused by the fake loop
        agent=object(),
        logs_root="data/threads-seam-probe",
    )
    gateway = RealtimeGateway(runtime=runtime, approval_timeout=5.0)

    app = FastAPI()
    app.include_router(gateway.router)

    port = _free_port()
    ready = threading.Event()
    shutdown = threading.Event()
    server_thread = threading.Thread(
        target=_serve, args=(app, port, ready, shutdown), daemon=True
    )
    server_thread.start()
    ready.wait(timeout=5.0)

    # The black-box runner: pure websockets.connect(url) — the transport under test.
    from benchmarks.realtime_runner import RealtimeTrialRunner

    url = f"ws://127.0.0.1:{port}/api/realtime"
    print(f"[probe] target url = {url}")
    runner = RealtimeTrialRunner(url=url, token=None, timeout_seconds=60.0)

    t0 = time.monotonic()
    events = list(runner("ping: say the seam probe line and stop."))
    dt = time.monotonic() - t0

    kinds = [e.get("kind") for e in events]
    turn_result = next((e for e in events if e.get("kind") == "turn_result"), None)
    infra_err = next((e for e in events if e.get("kind") == "infrastructure_error"), None)

    print(f"[probe] elapsed = {dt:.2f}s, {len(events)} events")
    print(f"[probe] event kinds = {kinds}")

    if infra_err is not None:
        print(f"[probe] FAIL infrastructure_error = {infra_err.get('error')}")
        return 2
    if turn_result is None:
        print("[probe] FAIL no turn_result returned (transport seam not closed)")
        return 3

    print(f"[probe] OK turn_result = {turn_result.get('turn', {})}")
    print("[probe] seam OPEN: black-box runner drove a real-network Echo OS WS endpoint")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
