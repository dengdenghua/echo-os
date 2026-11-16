"""Local Linux work computer. Separate display/profile; one controller at a time.

This is session isolation, not a VM/security sandbox. No second model runtime.
The private Unix socket is never exposed through the network API.
"""
from __future__ import annotations

import atexit
import hashlib
import json
import os
import secrets
import signal
import shutil
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator


class ComputerError(RuntimeError):
    pass


class WorkCommand(BaseModel):
    """Validate both HTTP and model commands before any display side effect."""
    action: Literal["inspect", "home", "navigate", "click", "text", "key", "launch"]
    url: str = Field(default="", max_length=4096)
    text: str = Field(default="", max_length=8000)
    key: str = Field(default="", max_length=24)
    element: int = Field(default=-1, ge=-1, lt=60)
    x: int = Field(default=0, ge=0, lt=1280)
    y: int = Field(default=0, ge=0, lt=720)

    @field_validator("element", "x", "y", mode="before")
    @classmethod
    def integer_only(cls, value):
        if isinstance(value, bool) or not (
            isinstance(value, int) or isinstance(value, str) and value.lstrip("-").isdigit()
        ):
            raise ValueError("控件编号和坐标必须是整数")
        return value


class WorkComputer:
    def __init__(self, root: Path | None = None):
        self.root = root or Path(os.environ.get("ECHO_DATA_DIR", str(Path.home() / ".echo"))) / "work-computer"
        self.lock = threading.RLock()
        self.processes: dict[str, list[Any]] = {}
        self.thread_active = None

    def directory(self, actor: str) -> Path:
        if not actor:
            raise ComputerError("请先登录")
        directory = self.root / hashlib.sha256(actor.encode()).hexdigest()[:24]
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        return directory

    def _read(self, actor: str) -> dict:
        path = self.directory(actor) / "state.json"
        if path.exists():
            return json.loads(path.read_text("utf8"))
        return {"controller": "human", "generation": secrets.token_hex(16), "threads": [], "activity": []}

    def _save(self, actor: str, state: dict):
        path = self.directory(actor) / "state.json"
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(state, ensure_ascii=False), encoding="utf8")
        temporary.chmod(0o600)
        temporary.replace(path)

    def _event(self, state: dict, kind: str, label: str, thread: str = ""):
        state["activity"] = [*state.get("activity", []), {
            "id": secrets.token_hex(8), "at": time.time(), "kind": kind,
            "label": label, "threadId": thread,
        }][-60:]

    def _socket(self, actor: str) -> Path:
        return self.directory(actor) / "browser.sock"

    def _rpc(self, actor: str, command: dict) -> dict:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(20)
            client.connect(str(self._socket(actor)))
            client.sendall((json.dumps(command) + "\n").encode())
            data = bytearray()
            while not data.endswith(b"\n"):
                chunk = client.recv(65536)
                if not chunk:
                    raise ComputerError("工作会话连接中断，请重新启动")
                data.extend(chunk)
                if len(data) > 4_000_000:
                    raise ComputerError("工作会话响应过大")
            result = json.loads(data)
            if not result.get("ok"):
                raise ComputerError(result.get("error", "电脑操作失败"))
            return result

    def _alive(self, actor: str) -> bool:
        jobs = self.processes.get(actor, [])
        return len(jobs) == 2 and all(p.poll() is None for p in jobs)

    def status(self, actor: str) -> dict:
        with self.lock:
            state = self._read(actor)
            return {"schema": "echo.work_computer.v1", "running": self._alive(actor),
                    "controller": state["controller"], "generation": state["generation"],
                    "threads": state["threads"], "activity": state["activity"],
                    "name": "Echo 的电脑", "width": 1280, "height": 720}

    def start(self, actor: str) -> dict:
        with self.lock:
            if self._alive(actor):
                return self.status(actor)
            if sys.platform != "linux" or any(not shutil.which(name) for name in ("Xvfb", "xauth", "openbox", "dbus-run-session", "xdotool", "xclip")):
                raise ComputerError("需要 Linux 工作桌面组件（Xvfb、Openbox、X11 输入工具）")
            # Resource bound for the local preview; one display, many owned tasks.
            if any(self._alive(owner) for owner in self.processes if owner != actor):
                raise ComputerError("另一账户的工作会话正在运行")
            self._stop_processes(actor)
            directory = self.directory(actor)
            executable = Path(os.environ.get("ECHO_RESOURCES_DIR", "/opt/echo-os")) / "frontend/release/linux-unpacked/echo-os-desktop"
            if not executable.is_file():
                raise ComputerError("缺少 Echo 工作浏览器")
            auth = directory / "Xauthority"
            auth.touch(mode=0o600, exist_ok=True)
            display = next((f":{n}" for n in range(90, 100)
                            if not Path(f"/tmp/.X11-unix/X{n}").exists() and not Path(f"/tmp/.X{n}-lock").exists()), None)
            if not display:
                raise ComputerError("没有空闲工作显示器")
            subprocess.run(["xauth", "-f", str(auth), "add", display, ".", secrets.token_hex(16)], check=True, capture_output=True)
            env = {k: v for k, v in os.environ.items() if k in {
                "PATH", "LANG", "LC_ALL", "TZ", "XDG_RUNTIME_DIR", "USER", "LOGNAME",
            }}
            home = directory / "home"
            home.mkdir(exist_ok=True, mode=0o700)
            env.update(HOME=str(home), SHELL="/bin/bash", XDG_CONFIG_HOME=str(home / ".config"), XDG_DATA_HOME=str(home / ".local/share"))
            env.update(DISPLAY=display, XAUTHORITY=str(auth), ECHO_WORK_COMPUTER="1",
                       ECHO_WORK_COMPUTER_DIR=str(directory))
            log = (directory / "session.log").open("wb")
            try:
                xvfb = subprocess.Popen(["Xvfb", display, "-screen", "0", "1280x720x24", "-nolisten", "tcp", "-auth", str(auth)], env=env, stdout=log, stderr=log, start_new_session=True)
                self.processes[actor] = [xvfb]
                for _ in range(60):
                    if xvfb.poll() is not None:
                        raise ComputerError("工作显示器启动失败")
                    if Path(f"/tmp/.X11-unix/X{display[1:]}").exists():
                        break
                    time.sleep(.05)
                browser = subprocess.Popen(["dbus-run-session", "--", str(executable), "--disable-gpu", "--disable-dev-shm-usage"], env=env, stdout=log, stderr=log, start_new_session=True)
                self.processes[actor].append(browser)
                for _ in range(100):
                    if not self._alive(actor):
                        raise ComputerError("工作浏览器启动失败")
                    try:
                        self._rpc(actor, {"action": "inspect"})
                        break
                    except (OSError, ComputerError):
                        time.sleep(.1)
                else:
                    raise ComputerError("工作浏览器启动超时")
                state = self._read(actor)
                state.update(controller="paused", generation=secrets.token_hex(16))
                self._event(state, "session", "工作会话已启动，等待交还 Echo")
                self._save(actor, state)
            except Exception:
                self._stop_processes(actor)
                raise
            finally:
                log.close()
            return self.status(actor)

    def _stop_processes(self, actor: str):
        for process in reversed(self.processes.pop(actor, [])):
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait(5)

    def stop(self, actor: str) -> dict:
        with self.lock:
            self._stop_processes(actor)
            state = self._read(actor)
            state.update(controller="human", generation=secrets.token_hex(16))
            self._event(state, "session", "工作会话已停止，资料保留")
            self._save(actor, state)
            return self.status(actor)

    def control(self, actor: str, controller: str, generation: str) -> dict:
        if controller not in {"human", "agent"}:
            raise ComputerError("无效控制权")
        with self.lock:
            state = self._read(actor)
            if generation != state["generation"] or not self._alive(actor):
                raise ComputerError("工作会话已更新，请刷新后重试")
            state.update(controller=controller, generation=secrets.token_hex(16))
            self._event(state, "control", "你已接管" if controller == "human" else "已交还 Echo")
            self._save(actor, state)
            return self.status(actor)

    def bind(self, actor: str, thread: str):
        with self.lock:
            if not self._alive(actor):
                raise ComputerError("请先启动 Echo 的电脑")
            state = self._read(actor)
            if state["controller"] != "agent":
                raise ComputerError("请先交还 Echo，再提交任务")
            if thread not in state["threads"]:
                state["threads"].append(thread)
            self._event(state, "task", "已提交电脑任务", thread)
            self._save(actor, state)

    def bound(self, actor: str, thread: str) -> bool:
        with self.lock:
            path = self.root / hashlib.sha256(actor.encode()).hexdigest()[:24] / "state.json"
            return bool(actor and thread and path.is_file() and thread in self._read(actor)["threads"])

    def frame(self, actor: str) -> dict:
        with self.lock:
            if not self._alive(actor):
                raise ComputerError("工作会话未运行")
            return self._rpc(actor, {"action": "frame"})

    def action(self, actor: str, command: dict, *, controller: str, generation: str = "", thread: str = "", wait_seconds: float = 240) -> dict:
        command = WorkCommand.model_validate(command).model_dump()
        deadline = time.monotonic() + wait_seconds
        waiting_recorded = False
        while True:
            with self.lock:
                state = self._read(actor)
                if not self._alive(actor):
                    raise ComputerError("工作会话未运行，请启动后继续原任务")
                if controller == "agent" and self.thread_active and not self.thread_active(thread):
                    raise ComputerError("任务已停止，未执行排队操作")
                if controller == "agent" and thread not in state["threads"]:
                    raise ComputerError("任务未绑定此工作电脑")
                if controller == "human" and (generation != state["generation"] or state["controller"] != "human"):
                    raise ComputerError("请先接管电脑；旧控制请求已拒绝")
                if controller == "human" or state["controller"] == "agent":
                    result = self._rpc(actor, command)
                    self._event(state, "operation", f"{'Echo' if controller == 'agent' else '你'} · {command.get('action', '')}", thread)
                    self._save(actor, state)
                    return result
                if not waiting_recorded:
                    self._event(state, "waiting", "电脑操作已暂停，等待交还 Echo", thread)
                    self._save(actor, state)
                    waiting_recorded = True
            if time.monotonic() >= deadline:
                raise ComputerError("你正在接管；电脑操作未执行。交还后请在原对话继续。")
            time.sleep(.2)

    def close(self):
        with self.lock:
            for actor in list(self.processes):
                self._stop_processes(actor)


_instance: WorkComputer | None = None


def work_computer() -> WorkComputer:
    global _instance
    if _instance is None:
        _instance = WorkComputer()
        atexit.register(_instance.close)
    return _instance
