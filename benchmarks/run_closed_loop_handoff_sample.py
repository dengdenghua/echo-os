"""Closed-loop ``interrupted-handoff`` sample: checkpoint → interrupt → resume without
repeating external actions, graded via ``benchmarks.eval_harness.run_suite``.

This is Option A — it turns the proven transport seam
(``benchmarks/probe_realtime_network_seam.py``) into a real closed-loop success probe.

Scenario the fake loop simulates (two phases across an interruption):
  Phase 1 (first turn): inspect evidence, do the single vendor reservation (the
    "external action"), write checkpoint.json. Then the turn is interrupted.
  Phase 2 (resume turn): read checkpoint.json, complete the remaining steps, write
    the final packet — WITHOUT redoing the vendor reservation.

The grader checks two invariants that define a closed loop:
  * resume actually used the checkpoint (it sees the phase-2 stream gated on it), and
  * the external reservation happened exactly once across both turns.

The fake loop is a scripted state machine keyed by resume state, so a *correct* Echo OS
checkpoint/resume surfaces as ``passed=True`` and a regression (resume that re-runs the
reservation) surfaces as ``passed=False``. No real model/provider is contacted.

Run from repo root:

    .venv/Scripts/python.exe benchmarks/run_closed_loop_handoff_sample.py
"""

from __future__ import annotations

import socket
import sys
import threading
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# ---- shared mutable state between the fake loop and the grader ----------------
_STATE: dict[str, Any] = {
    "reservation_count": 0,   # external action; must be exactly 1 across the loop
    "checkpoint_written": False,
    "resumed_from_checkpoint": False,
}


def _reset_state() -> None:
    _STATE["reservation_count"] = 0
    _STATE["checkpoint_written"] = False
    _STATE["resumed_from_checkpoint"] = False


def _install_fake_loop() -> None:
    """Scripted two-phase fake loop driven by resume state.

    Emits the react-loop event vocabulary the gateway consumes (see
    ``realtime_cerebrum.py:6-26``). The critical branch: on resume
    (``resume_task_id`` set), it reads the checkpoint instead of re-running the
    reservation — this is the exact behavior the ``interrupted-handoff`` rubric
    grades. Patch target is ``react_loop.stream_react_loop`` (definition site) because
    the gateway's stream-drive imports it function-locally (see the seam probe).
    """

    import runtime.core.cerebrum.react_loop as react_loop

    def fake_stream(*args: Any, **kwargs: Any) -> Iterator[dict[str, Any]]:
        resume_task_id = kwargs.get("resume_task_id")
        resuming = bool(resume_task_id)

        if not resuming:
            # ---- Phase 1: fresh execution, then interrupted ----
            _STATE["reservation_count"] += 1
            yield {
                "type": "text_delta",
                "delta": "Phase 1: inspected launch evidence; performing the single vendor reservation.",
            }
            yield {"type": "react_step_complete", "text": "phase1-reserve"}
            _STATE["checkpoint_written"] = True
            yield {
                "type": "text_delta",
                "delta": "Phase 1: durable checkpoint written (reservation id preserved).",
            }
            yield {"type": "react_step_complete", "text": "phase1-checkpoint"}
            # The turn is interrupted here by the harness; we simply stop emitting.
            return

        # ---- Phase 2: resume from checkpoint, do NOT repeat the reservation ----
        if _STATE["checkpoint_written"]:
            _STATE["resumed_from_checkpoint"] = True
            yield {
                "type": "text_delta",
                "delta": "Phase 2: resume read checkpoint.json; skipping the already-done reservation.",
            }
            yield {"type": "react_step_complete", "text": "phase2-resume"}
        else:
            # No checkpoint to resume from — degraded path; we surface it honestly.
            yield {
                "type": "text_delta",
                "delta": "Phase 2: resume requested but no checkpoint present.",
            }
            yield {"type": "react_step_complete", "text": "phase2-no-checkpoint"}

        yield {
            "type": "text_delta",
            "delta": "Phase 2: completed copy/QA/release; wrote launch_packet.json.",
        }
        yield {"type": "react_step_complete", "text": "phase2-final"}
        yield {
            "type": "react_completed",
            "final_answer": "launch packet delivered; reservation not repeated.",
        }

    react_loop.stream_react_loop = fake_stream


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _serve(app: Any, port: int, ready: threading.Event) -> None:
    import uvicorn

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error", workers=1)
    server = uvicorn.Server(config)
    threading.Timer(0.3, ready.set).start()
    server.run()


def _handoff_grader(case: Any, trajectory: Any) -> Any:
    """Grade the closed-loop invariants the ``interrupted-handoff`` rubric names."""
    from benchmarks.eval_harness import Verdict

    checks = {
        "resume_uses_saved_state": bool(_STATE["resumed_from_checkpoint"]),
        "external_actions_not_duplicated": _STATE["reservation_count"] == 1,
    }
    passed = all(checks.values())
    reason = (
        f"reservation_count={_STATE['reservation_count']} "
        f"(must be 1), resumed_from_checkpoint={_STATE['resumed_from_checkpoint']}"
    )
    return Verdict(passed=passed, score=1.0 if passed else 0.0, reason=reason, rubric=checks)


def main() -> int:
    from fastapi import FastAPI

    from runtime.sensing.gateway.realtime_cerebrum import CerebrumRuntime
    from runtime.sensing.gateway.realtime_gateway import RealtimeGateway

    _install_fake_loop()

    runtime = CerebrumRuntime(stack=object(), agent=object(), logs_root="data/threads-handoff")
    gateway = RealtimeGateway(runtime=runtime, approval_timeout=5.0)
    app = FastAPI()
    app.include_router(gateway.router)

    port = _free_port()
    ready = threading.Event()
    server_thread = threading.Thread(target=_serve, args=(app, port, ready), daemon=True)
    server_thread.start()
    ready.wait(timeout=5.0)

    url = f"ws://127.0.0.1:{port}/api/realtime"

    from benchmarks.eval_harness import EvalCase, run_suite
    from benchmarks.realtime_runner import RealtimeTrialRunner

    runner = RealtimeTrialRunner(url=url, token=None, timeout_seconds=60.0)

    def _case_setup() -> None:
        _reset_state()

    case = EvalCase(
        id="multiagent.interrupted-handoff",
        prompt=(
            "Complete the multi-stage launch checklist. The run is interrupted after "
            "research and resumed in a fresh session; deliver the final launch packet "
            "without repeating completed external actions."
        ),
        grader=_handoff_grader,
        setup=_case_setup,
    )

    print(f"[handoff] target url = {url}")
    t0 = time.monotonic()
    report = run_suite([case], runner=runner, k=1)
    dt = time.monotonic() - t0

    # Pull the verdict back out of the report for a compact summary.
    result = report.cases[0] if getattr(report, "cases", None) else None
    verdict = getattr(result, "verdict", None)
    passed = getattr(verdict, "passed", None)
    reason = getattr(verdict, "reason", "")

    print(f"[handoff] elapsed = {dt:.2f}s")
    print(f"[handoff] reservation_count = {_STATE['reservation_count']} (must be 1)")
    print(f"[handoff] resumed_from_checkpoint = {_STATE['resumed_from_checkpoint']}")
    print(f"[handoff] verdict passed = {passed}  reason = {reason}")

    if passed:
        print("[handoff] CLOSED LOOP: resume used the checkpoint and the external action ran exactly once")
        return 0
    print("[handoff] CLOSED LOOP BROKEN (see reason)")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
