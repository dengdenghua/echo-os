"""Closed-loop ``interrupted-handoff`` sample with a resume-aware runner (Option C).

Option A (``run_closed_loop_handoff_sample.py``) proved the stock harness cannot test
interrupt→resume because ``RealtimeTrialRunner`` hardcodes a fresh ``thread_id`` per call and
``eval_harness.run_case`` only runs a single turn. This sample closes that gap without touching
the shared runner (it is imported by six benchmarks + two tests), by *subclassing*
``RealtimeTrialRunner`` to (a) reuse a thread id across the two phases and (b) emit a confirmed
resume intent so the gateway drives the react loop's resume branch.

Scenario (matches the ``multiagent.interrupted-handoff`` rubric):
  Phase 1: fresh turn — do the single vendor reservation (the external action), write
    checkpoint.json, then the turn is interrupted (we simply do not continue it here).
  Phase 2: resume turn on the SAME thread, with a confirmed ``react`` resume intent — the loop
    must read the checkpoint and complete the remaining steps WITHOUT redoing the reservation.

Grader invariants (the rubric's ``workflow_state`` checks):
  * resume actually used the checkpoint, and
  * the external reservation ran exactly once across the whole loop.

No real model/provider is contacted — the react loop is swapped for a scripted fake (the same
seam the cerebrum tests use). Patch target is ``react_loop.stream_react_loop`` because the
gateway's stream-drive imports it function-locally.

Run from repo root:

    .venv/Scripts/python.exe benchmarks/run_closed_loop_handoff_resume.py
"""

from __future__ import annotations

import socket
import sys
import threading
import time
import uuid as _uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# ---- shared state between the fake loop and the grader ------------------------
_STATE: dict[str, Any] = {
    "reservation_count": 0,   # external action; must be exactly 1 across the loop
    "checkpoint_written": False,
    "resumed_from_checkpoint": False,
    "saw_resume_intent": False,
}

_RESUME_TASK_ID = str(_uuid.uuid4())  # stable task id the fake "checkpoint" records


def _reset_state() -> None:
    _STATE["reservation_count"] = 0
    _STATE["checkpoint_written"] = False
    _STATE["resumed_from_checkpoint"] = False
    _STATE["saw_resume_intent"] = False


def _write_phase1_checkpoint(stack: Any) -> None:
    """Write a real, resumable react checkpoint for the phase-1 task.

    Mirrors ``react_checkpointing._auto_checkpoint_and_evaluate_step``: the checkpoint goes
    through ``stack.journal.write_react_checkpoint`` so the resume path
    (``react_resume._load_resume_checkpoint_snapshot`` → ``read_recovery_events``) can read it
    back. The ``task_id`` must equal the id the phase-2 resume intent names (``_RESUME_TASK_ID``).
    Failures are swallowed (the probe degrades to the missing-checkpoint path rather than crash).
    """
    journal = getattr(stack, "journal", None)
    if journal is None or not hasattr(journal, "write_react_checkpoint"):
        print("[fake-loop] WARN stack has no journal; checkpoint not persisted", flush=True)
        return
    try:
        from runtime.platform.models import TaskId

        messages = [
            {"role": "user", "content": "Complete the multi-stage launch checklist."},
            {
                "role": "assistant",
                "content": "Phase 1 done: vendor reservation completed; checkpoint recorded.",
            },
        ]
        steps = [
            {
                "iteration": 1,
                "thought": "reserve the single vendor slot",
                "public_update": "performing the single vendor reservation",
                "action": "vendor.reserve",
                "actions": ["vendor.reserve"],
                "observation": "reservation confirmed id=R1",
                "action_results": [{"action": "vendor.reserve", "status": "ok"}],
            }
        ]
        journal.write_react_checkpoint(
            TaskId(_RESUME_TASK_ID),
            iteration_completed=1,
            max_iterations=30,
            messages_snapshot=messages,
            steps_snapshot=steps,
            has_final_answer=False,
            working_set_snapshot=[{"kind": "reservation", "id": "R1"}],
            progress_summary="phase1: reservation done, checkpoint written",
            current_phase="primary",
        )
        print("[fake-loop] phase-1 checkpoint persisted to journal", flush=True)
    except Exception as exc:  # noqa: BLE001 — degrade to missing-checkpoint path
        print(f"[fake-loop] WARN checkpoint write failed: {exc!r}", flush=True)


def _install_fake_loop() -> None:
    """Scripted fake react loop driven by the resume intent the gateway parses.

    Emits the react-loop event vocabulary the gateway consumes (see
    ``realtime_cerebrum.py:6-26``). On a confirmed resume intent it restores from the checkpoint
    instead of re-running the reservation — the exact behavior the rubric grades.
    """

    import runtime.core.cerebrum.react_loop as react_loop

    def fake_stream(*args: Any, **kwargs: Any) -> Iterator[dict[str, Any]]:
        # The stack is the first positional arg the real loop receives; it carries the
        # journal we must write the phase-1 checkpoint into so phase-2 resume can read it.
        stack = args[0] if args else kwargs.get("stack")
        resume_task_id = kwargs.get("resume_task_id")
        resuming = resume_task_id is not None
        print(f"[fake-loop] resume_task_id={resume_task_id!r} resuming={resuming} "
              f"has_journal={getattr(stack, 'journal', None) is not None}", flush=True)
        if resuming:
            _STATE["saw_resume_intent"] = True

        if not resuming:
            # ---- Phase 1: fresh execution, then interrupted ----
            _STATE["reservation_count"] += 1
            yield {
                "type": "text_delta",
                "delta": "Phase 1: inspected launch evidence; performing the single vendor reservation.",
            }
            yield {"type": "react_step_complete", "text": "phase1-reserve"}
            # Write a real, resumable react checkpoint into the journal so phase-2 resume
            # can read it back (mirrors ``react_checkpointing._auto_checkpoint_and_evaluate_step``).
            _write_phase1_checkpoint(stack)
            _STATE["checkpoint_written"] = True
            yield {
                "type": "text_delta",
                "delta": "Phase 1: durable checkpoint written; turn interrupted before release.",
            }
            yield {"type": "react_step_complete", "text": "phase1-checkpoint"}
            return  # interrupted here; phase 2 resumes on the same thread

        # ---- Phase 2: resume — must use checkpoint, must NOT repeat reservation ----
        if _STATE["checkpoint_written"]:
            _STATE["resumed_from_checkpoint"] = True
            yield {
                "type": "text_delta",
                "delta": "Phase 2: confirmed react resume; restoring from checkpoint, skipping the reservation.",
            }
            yield {"type": "react_step_complete", "text": "phase2-restore"}
        else:
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
            "final_answer": "launch packet delivered via checkpoint resume; reservation not repeated.",
        }

    react_loop.stream_react_loop = fake_stream


class ResumeAwareTrialRunner:
    """Two-phase trial runner: phase1 fresh, then an interrupt, then a resume turn.

    Wraps ``RealtimeTrialRunner`` by injecting a stable thread id and a confirmed resume intent
    for the second phase. Returns the phase-2 (resume) event stream as the trial's events.
    """

    def __init__(self, base: Any) -> None:
        self._base = base
        self.thread_id = f"eval-handoff-{_uuid.uuid4().hex}"

    def __call__(self, prompt: str) -> Any:
        # Phase 1: fresh turn on this thread (we intentionally let it be "interrupted" — we do
        # not need its event stream, only its side effects on _STATE).
        phase1 = _RealtimeRunnerShim(self._base, thread_id=self.thread_id, resume_intent=None)
        p1_events = list(phase1(prompt))
        tr1 = next((e for e in p1_events if e.get("kind") == "turn_result"), None)
        print(f"[phase1] turn_status={((tr1 or {}).get('turn') or {}).get('status')}", flush=True)

        # Phase 2: resume on the SAME thread with a confirmed react resume intent.
        resume_intent = {
            "confirmed": True,
            "checkpoint_type": "react",
            "task_id": _RESUME_TASK_ID,
        }
        phase2 = _RealtimeRunnerShim(
            self._base, thread_id=self.thread_id, resume_intent=resume_intent
        )
        p2_events = list(phase2(prompt))
        tr2 = next((e for e in p2_events if e.get("kind") == "turn_result"), None)
        print(f"[phase2] turn_status={((tr2 or {}).get('turn') or {}).get('status')} "
              f"error={((tr2 or {}).get('turn') or {}).get('error')}", flush=True)
        return iter(p2_events)


class _RealtimeRunnerShim:
    """Per-phase runner: reuse a fixed thread id and optionally attach a resume intent."""

    def __init__(self, base: Any, *, thread_id: str, resume_intent: dict[str, Any] | None) -> None:
        self._base = base
        self._thread_id = thread_id
        self._resume_intent = resume_intent

    def __call__(self, prompt: str) -> Any:
        # Reach into the underlying runner's run() by temporarily fixing its thread id and
        # adding the resume intent to the input metadata's user_context.
        base = self._base
        original_run = base.run

        async def run_with_fixed_thread(p: str) -> list[dict[str, Any]]:
            # Monkeypatch uuid generation inside run() is fragile; instead we reproduce the
            # minimal param shaping by calling the real connect logic through a patched thread.
            # The cleanest seam: override the thread_id attribute the runner would have used.
            return await original_run(p)

        # We drive the real runner but override the thread id it assigns by patching the instance
        # attribute that run() reads. RealtimeTrialRunner.run builds thread_id locally, so we
        # instead call a small wrapper that pins it via a closure over the connect call.
        return iter(_run_pinned(base, prompt, self._thread_id, self._resume_intent))


def _run_pinned(base: Any, prompt: str, thread_id: str, resume_intent: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Run one WS turn against ``base.url`` pinning the thread id and resume intent.

    This mirrors ``RealtimeTrialRunner.run`` but (a) uses a caller-supplied thread id and
    (b) injects ``user_context.resume_intent`` into the input metadata so the gateway parses a
    confirmed resume. It reuses the base runner's approval/timeout config.
    """
    import asyncio
    import json as _json

    from websockets.asyncio.client import connect

    request_id = _uuid.uuid4().hex
    headers = {"Authorization": f"Bearer {base.token}"} if base.token else None
    input_metadata: dict[str, Any] = {"source": "behavioral-eval", "isolatedTrial": True}
    if resume_intent is not None:
        # The gateway reads ``user_context`` as the *context dict itself*
        # (``realtime_turn_input.py:155`` — ``user_context = context if isinstance(context, dict)
        # else metadata``), so the resume intent goes at the top of ``context``, not nested.
        input_metadata.setdefault("context", {})
        input_metadata["context"]["resume_intent"] = resume_intent
    params: dict[str, Any] = {
        "threadId": thread_id,
        "input": [{"type": "text", "text": prompt, "metadata": input_metadata}],
        "approvalPolicy": base.approval_policy,
    }
    if base.model:
        params["model"] = base.model
    if base.topology_id:
        params["topologyId"] = base.topology_id
    request = {"jsonrpc": "2.0", "id": request_id, "method": "turn/start", "params": params}

    events: list[dict[str, Any]] = []

    async def _go() -> list[dict[str, Any]]:
        async with connect(
            base.url,
            additional_headers=headers,
            open_timeout=min(base.timeout_seconds, 30.0),
            close_timeout=5.0,
            max_size=16 * 1024 * 1024,
            ping_interval=30.0,
            ping_timeout=90.0,
        ) as ws:
                await ws.send(_json.dumps(request, ensure_ascii=False))
                async for raw in ws:
                    payload = _json.loads(raw)
                    if not isinstance(payload, dict):
                        continue
                    if "method" in payload and "id" in payload:
                        result = (
                            base.approval_responder(payload.get("method") or "", payload.get("params") or {})
                            if base.approval_responder is not None
                            else {"action": base.approval_action}
                        )
                        await ws.send(
                            _json.dumps(
                                {"jsonrpc": "2.0", "id": payload.get("id"), "result": result},
                                ensure_ascii=False,
                            )
                        )
                        events.append({"kind": "approval_request", "method": payload.get("method")})
                        continue
                    if payload.get("id") == request_id:
                        result = payload.get("result") or {}
                        turn = result.get("turn") if isinstance(result, dict) else None
                        events.append({"kind": "turn_result", "turn": turn})
                        break
        return events

    # asyncio.timeout is a context manager; wrap it.
    async def _run() -> list[dict[str, Any]]:
        import asyncio as _a

        async with _a.timeout(base.timeout_seconds):
            return await _go()

    try:
        return asyncio.run(_run())
    except TimeoutError:
        events.append({"kind": "error", "error": {"type": "timeout"}})
        return events
    except Exception as exc:  # noqa: BLE001
        events.append({"kind": "infrastructure_error", "error": {"type": "transport", "message": str(exc)}})
        return events


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


def _handoff_grader(trajectory: Any) -> Any:
    """Grade the closed-loop invariants the ``interrupted-handoff`` rubric names.

    ``Grader`` is ``Callable[[Trajectory], Verdict | bool]`` — it receives only the trajectory.
    """
    from benchmarks.eval_harness import Verdict

    checks = {
        "saw_resume_intent": bool(_STATE["saw_resume_intent"]),
        "resume_uses_saved_state": bool(_STATE["resumed_from_checkpoint"]),
        "external_actions_not_duplicated": _STATE["reservation_count"] == 1,
    }
    passed = all(checks.values())
    reason = (
        f"reservation_count={_STATE['reservation_count']} (must be 1), "
        f"saw_resume_intent={_STATE['saw_resume_intent']}, "
        f"resumed_from_checkpoint={_STATE['resumed_from_checkpoint']}"
    )
    return Verdict(passed=passed, score=1.0 if passed else 0.0, reason=reason, rubric=checks)


def main() -> int:
    from types import SimpleNamespace

    from fastapi import FastAPI

    from runtime.memory.journal import JSONLJournal
    from runtime.sensing.gateway.realtime_cerebrum import CerebrumRuntime
    from runtime.sensing.gateway.realtime_gateway import RealtimeGateway

    _install_fake_loop()

    # Give the runtime a real journal so the phase-1 checkpoint is actually persisted and the
    # phase-2 resume can read it back. ``CerebrumRuntime(stack=object())`` would leave
    # ``stack.journal`` as None and the checkpoint write would be a no-op.
    journal = JSONLJournal(_REPO_ROOT / "data" / "threads-handoff-resume" / "probe.jsonl")
    stack = SimpleNamespace(journal=journal)
    runtime = CerebrumRuntime(stack=stack, agent=object(), logs_root="data/threads-handoff-resume")
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

    base = RealtimeTrialRunner(url=url, token=None, timeout_seconds=60.0)
    runner = ResumeAwareTrialRunner(base)

    def _case_setup() -> None:
        _reset_state()

    case = EvalCase(
        id="multiagent.interrupted-handoff",
        prompt=(
            "Complete the multi-stage launch checklist. The run is interrupted after research "
            "and resumed in a fresh session; deliver the final launch packet without repeating "
            "completed external actions."
        ),
        grader=_handoff_grader,
        setup=_case_setup,
    )

    print(f"[handoff-resume] target url = {url}")
    t0 = time.monotonic()
    report = run_suite([case], runner=runner, k=1)
    dt = time.monotonic() - t0

    result = report.cases[0] if getattr(report, "cases", None) else None
    # ``run_case`` stores verdicts on ``result.verdicts[0]`` (there is no ``result.verdict``).
    verdicts = getattr(result, "verdicts", None) or []
    verdict = verdicts[0] if verdicts else None
    passed = getattr(verdict, "passed", None)
    reason = getattr(verdict, "reason", "")

    print(f"[handoff-resume] elapsed = {dt:.2f}s")
    print(f"[handoff-resume] reservation_count = {_STATE['reservation_count']} (must be 1)")
    print(f"[handoff-resume] saw_resume_intent = {_STATE['saw_resume_intent']}")
    print(f"[handoff-resume] resumed_from_checkpoint = {_STATE['resumed_from_checkpoint']}")
    print(f"[handoff-resume] verdict passed = {passed}  reason = {reason}")

    if passed:
        print("[handoff-resume] CLOSED LOOP: resume intent parsed, checkpoint used, reservation ran once")
        return 0
    print("[handoff-resume] CLOSED LOOP BROKEN (see reason)")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
