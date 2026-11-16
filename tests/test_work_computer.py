import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from runtime.platform.work_computer import ComputerError, WorkComputer
from runtime.sensing.gateway.work_computer_router import create_work_computer_router


@pytest.fixture
def computer(tmp_path, monkeypatch):
    computer = WorkComputer(tmp_path)
    monkeypatch.setattr(computer, "_alive", lambda owner: owner == "alice")
    computer._save("alice", {"controller":"agent","generation":"g1","threads":["t1"],"activity":[]})
    computer.calls = []
    def rpc(actor, command):
        computer.calls.append(command)
        return {"ok":True,"text":"result"}
    monkeypatch.setattr(computer, "_rpc", rpc)
    return computer


def test_reading_status_does_not_take_control(computer):
    assert computer.status("alice")["controller"] == "agent"
    assert not computer.calls


def test_only_owner_task_can_control(computer):
    with pytest.raises(ComputerError, match="未绑定"):
        computer.action("alice", {"action":"text"}, controller="agent", thread="other")
    with pytest.raises(ComputerError):
        computer.action("bob", {"action":"text"}, controller="agent", thread="t1")
    assert not computer.bound("bob", "t1")
    assert not computer.calls


def test_stale_human_input_rejected_after_return(computer):
    taken = computer.control("alice", "human", "g1")
    computer.action("alice", {"action":"text","text":"中文"}, controller="human", generation=taken["generation"])
    computer.control("alice", "agent", taken["generation"])
    with pytest.raises(ComputerError, match="旧控制请求"):
        computer.action("alice", {"action":"text","text":"stale"}, controller="human", generation=taken["generation"])
    assert len(computer.calls) == 1


def test_pending_agent_operation_waits_and_resumes_once(computer):
    taken = computer.control("alice", "human", "g1")
    with ThreadPoolExecutor() as executor:
        future = executor.submit(computer.action, "alice", {"action":"click"}, controller="agent", thread="t1", wait_seconds=2)
        time.sleep(.25)
        assert not future.done() and not computer.calls
        computer.control("alice", "agent", taken["generation"])
        assert future.result(timeout=2)["ok"]
    assert len(computer.calls) == 1


def test_cancelled_task_cannot_run_after_return(computer):
    taken = computer.control("alice", "human", "g1")
    live = True
    computer.thread_active = lambda _: live
    with ThreadPoolExecutor() as executor:
        future = executor.submit(computer.action, "alice", {"action":"text"}, controller="agent", thread="t1", wait_seconds=2)
        time.sleep(.25)
        live = False
        computer.control("alice", "agent", taken["generation"])
        with pytest.raises(ComputerError, match="任务已停止"):
            future.result(timeout=2)
    assert not computer.calls


def test_control_handoff_waits_for_inflight_operation(computer, monkeypatch):
    entered, finish = threading.Event(), threading.Event()
    monkeypatch.setattr(computer, "_rpc", lambda *args: (entered.set(), finish.wait(2), {"ok":True})[-1])
    with ThreadPoolExecutor() as executor:
        action = executor.submit(computer.action, "alice", {"action":"click"}, controller="agent", thread="t1")
        assert entered.wait(1)
        handoff = executor.submit(computer.control, "alice", "human", "g1")
        time.sleep(.1)
        assert not handoff.done()
        finish.set()
        action.result(timeout=2)
        assert handoff.result(timeout=2)["controller"] == "human"


def test_restart_keeps_task_binding_and_control_state(computer):
    state = computer.control("alice", "human", "g1")
    reloaded = WorkComputer(computer.root)
    assert reloaded.bound("alice", "t1")
    assert reloaded.status("alice")["generation"] == state["generation"]
    assert not reloaded.status("alice")["running"]


def test_wait_timeout_does_not_execute(computer):
    computer.control("alice", "human", "g1")
    with pytest.raises(ComputerError, match="未执行"):
        computer.action("alice", {"action":"text"}, controller="agent", thread="t1", wait_seconds=0)
    assert not computer.calls


@pytest.mark.parametrize("path,method", [("status","get"),("frame","get"),("start","post"),("stop","post"),("control","post"),("input","post")])
def test_http_requires_auth(path, method):
    app = FastAPI()
    app.include_router(create_work_computer_router(require_auth=True))
    with TestClient(app) as client:
        response = getattr(client, method)("/api/work-computer/"+path)
    assert response.status_code in (401,403)


def test_request_input_validation():
    app = FastAPI()
    app.include_router(create_work_computer_router())
    with TestClient(app) as client:
        for body in [{"action":"exec","generation":"g1"}, {"action":"click","generation":"g1","x":1280}, {"action":"text","generation":"g1","text":"x"*8001}]:
            assert client.post("/api/work-computer/input", json=body).status_code == 422


def test_minimal_bootstrap_registers_work_computer():
    from runtime.execution.suckers.builtins import register_builtins
    from runtime.execution.suckers.registry import SkillRegistry
    registry = register_builtins(SkillRegistry())
    assert registry.get("echo_computer").path_resolution == "service"


def test_model_schema_uses_integer_control_ids():
    from runtime.execution.suckers.work_computer_skills import echo_computer
    from runtime.execution.tool_spec_builder import _input_schema_from_handler
    schema = _input_schema_from_handler(echo_computer)[0]
    for field in ("element", "x", "y"):
        assert schema["properties"][field]["type"] == "integer"


def test_numeric_string_is_normalized_before_dispatch(computer):
    computer.action("alice", {"action": "click", "element": "0"}, controller="agent", thread="t1")
    assert computer.calls[-1]["element"] == 0


@pytest.mark.parametrize("value", [True, 1.5, "", "no", "1.0", "-2", 60])
def test_bad_element_never_dispatches(computer, value):
    with pytest.raises(ValueError):
        computer.action("alice", {"action": "click", "element": value}, controller="agent", thread="t1")
    assert not computer.calls


def test_bound_task_advertises_only_its_work_window(tmp_path, monkeypatch):
    from runtime.execution.suckers.registry import SkillRegistry
    from runtime.execution.suckers.work_computer_skills import register_work_computer
    from runtime.platform.work_computer import work_computer
    from tests.test_host_tool_broker import make_broker
    original = SkillRegistry.__init__
    def initialize(self, *args, **kwargs):
        original(self, *args, **kwargs)
        register_work_computer(self)
    monkeypatch.setattr(SkillRegistry, "__init__", initialize)
    monkeypatch.setattr(work_computer(), "bound", lambda actor, thread: actor == "actor" and thread == "thread")
    broker = make_broker(tmp_path, monkeypatch)
    assert broker.catalog.names == ("echo_computer",)


@pytest.mark.asyncio
async def test_repeat_click_is_distinct_but_transport_retry_is_once(tmp_path, monkeypatch, computer):
    from runtime.execution.suckers.registry import SkillRegistry
    from runtime.execution.suckers import work_computer_skills as skills
    from runtime.safety.auth import TrustEngine
    from tests.test_host_tool_broker import make_broker
    original = SkillRegistry.__init__
    def initialize(self, *args, **kwargs):
        original(self, *args, **kwargs)
        skills.register_work_computer(self)
    monkeypatch.setattr(SkillRegistry, "__init__", initialize)
    monkeypatch.setattr(skills, "work_computer", lambda: computer)
    monkeypatch.setattr(computer, "_alive", lambda actor: actor == "actor")
    computer._save("actor", {"controller":"agent","generation":"g1","threads":["thread"],"activity":[]})
    broker = make_broker(tmp_path, monkeypatch, context={"extra_tool_allowlist": ["echo_computer"]})
    broker._stack.executor.immunity = TrustEngine(trusted_sources=["builtin://*"])
    first = await broker.invoke("echo_computer", {"action":"click","element":0}, call_id="click-1")
    assert first["success"], first
    duplicate = await broker.invoke("echo_computer", {"action":"click","element":0}, call_id="click-1")
    assert duplicate == first and len(computer.calls) == 1
    repeated = await broker.invoke("echo_computer", {"action":"click","element":0}, call_id="click-2")
    assert repeated["success"] and len(computer.calls) == 2, repeated
    await broker.aclose()
