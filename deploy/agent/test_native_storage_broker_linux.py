#!/usr/bin/env python3
"""Exercise the storage broker's real Linux Unix-socket trust boundary."""

from __future__ import annotations

import json
import os
import socket
import sys
import tempfile
import threading
from pathlib import Path

# CI runs this file by path inside a bare Debian container with no Echo package
# installed, so Python puts deploy/agent (not the checkout root) at sys.path[0].
# Import the appliance layer from this checkout, exactly as the image ships it.
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import appliance.native_storage_broker as broker_module  # noqa: E402
from appliance.native_storage_broker import (  # noqa: E402
    HEALTH_SCHEMA,
    MAX_MESSAGE_BYTES,
    OPERATION_TARGETS,
    NativeStorageBrokerClient,
    NativeStorageBrokerError,
    NativeStorageBrokerServer,
)


def _stop_server(
    server: NativeStorageBrokerServer,
    thread: threading.Thread,
    socket_path: Path,
) -> None:
    server.shutdown()
    server.server_close()
    thread.join(timeout=2.0)
    if thread.is_alive():
        raise RuntimeError("native storage broker test server did not stop")
    socket_path.unlink(missing_ok=True)


def _start_server(
    socket_path: Path, *, allowed_uids: frozenset[int]
) -> tuple[NativeStorageBrokerServer, threading.Thread]:
    server = NativeStorageBrokerServer(socket_path, allowed_uids=allowed_uids)
    socket_path.chmod(0o660)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


def main() -> int:
    if not sys.platform.startswith("linux"):
        raise RuntimeError("native storage broker peer test requires Linux")
    if not hasattr(os, "geteuid") or os.geteuid() != 0:
        raise RuntimeError("native storage broker peer test requires root")
    if not hasattr(socket, "AF_UNIX") or not hasattr(socket, "SO_PEERCRED"):
        raise RuntimeError("native storage broker peer test requires AF_UNIX and SO_PEERCRED")

    with tempfile.TemporaryDirectory(prefix="echo-storage-broker-") as temporary:
        root = Path(temporary)
        socket_path = root / "broker.sock"

        server, thread = _start_server(socket_path, allowed_uids=frozenset({os.geteuid()}))
        try:
            client = NativeStorageBrokerClient(socket_path, timeout=2.0)
            result = client.probe()
            expected = {
                "schema": HEALTH_SCHEMA,
                "status": "ok",
                "operationCount": len(OPERATION_TARGETS),
            }
            if result != expected:
                raise RuntimeError("native storage broker health contract did not match")

            original_resolver = broker_module._resolve_operation
            broker_module._resolve_operation = lambda _operation: (
                lambda desired: {
                    "operation": "create",
                    "planId": "root-plan",
                    "desired": desired,
                }
            )
            try:
                plan = client.plan("native_storage.plan_nfs", {"client": "192.0.2.0/24"})
                broker_module._resolve_operation = lambda _operation: (
                    lambda: {
                        "users": [],
                        "sharedFolders": [],
                    }
                )
                overview = client.read("native_storage.sharing_overview", {})
            finally:
                broker_module._resolve_operation = original_resolver
            if plan != {
                "operation": "create",
                "planId": "root-plan",
                "desired": {"client": "192.0.2.0/24"},
            }:
                raise RuntimeError("native storage broker plan channel did not match")
            if overview != {"users": [], "sharedFolders": []}:
                raise RuntimeError("native storage broker read channel did not match")
        finally:
            _stop_server(server, thread, socket_path)

        denied, denied_thread = _start_server(socket_path, allowed_uids=frozenset())
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as peer:
                peer.settimeout(2.0)
                peer.connect(str(socket_path))
                with peer.makefile("rb") as stream:
                    rejection = json.loads(stream.readline(MAX_MESSAGE_BYTES + 1))
            error = rejection.get("error") if isinstance(rejection, dict) else None
            if (
                not isinstance(error, dict)
                or rejection.get("ok") is not False
                or error.get("type") != "permission-denied"
                or "not authorized" not in str(error.get("message"))
            ):
                raise RuntimeError("native storage broker returned the wrong peer denial")
            # Unauthorized peers are rejected before their request is read, so
            # the denial cannot echo the request ID. The client must reject that
            # uncorrelated response instead of accepting its payload
            # (tests/appliance/test_native_storage_broker.py pins the same rule).
            try:
                NativeStorageBrokerClient(socket_path, timeout=2.0).probe()
            except NativeStorageBrokerError as exc:
                if "response identity is invalid" not in str(exc):
                    raise RuntimeError(
                        "native storage broker client accepted an uncorrelated denial"
                    ) from exc
            else:
                raise RuntimeError("native storage broker accepted a denied peer")
        finally:
            _stop_server(denied, denied_thread, socket_path)

    print("native storage broker Linux peer-credential contract passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
