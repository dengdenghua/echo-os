"""Isolated, real-socket Windows/Linux/Android acceptance lab.

Uses the production device gateway and clients. Credentials and certificates
are confined to a new lab directory; no system trust store or firewall changes.
Run with --help. This is a developer harness, not a deployment entry point.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import datetime as dt
import hashlib
import ipaddress
import json
import os
import secrets
import ssl
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


def write_json(path: Path, value: object) -> None:
    temporary = path.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
    with contextlib.suppress(OSError):
        temporary.chmod(0o600)
    temporary.replace(path)


def certificates(state: Path) -> None:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Echo isolated acceptance lab")])
    now = dt.datetime.now(dt.UTC)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(minutes=1))
        .not_valid_after(now + dt.timedelta(days=1))
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .add_extension(
            x509.SubjectAlternativeName(
                [
                    x509.DNSName("localhost"),
                    x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
                ]
            ),
            critical=False,
        )
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .sign(key, hashes.SHA256())
    )
    (state / "ca.pem").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    private = state / "key.pem"
    private.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    private.chmod(0o600)


async def hub(options: argparse.Namespace) -> None:
    import uvicorn
    from fastapi import FastAPI

    from appliance.approval import HighRiskApprovalService
    from appliance.audit import ApplianceAudit
    from appliance.device_link import DeviceLinkService, create_device_link_router
    from runtime.tentacle.coordinator import TentacleCoordinator

    state = options.state.resolve()
    state.mkdir(parents=True, exist_ok=True)
    if any(state.iterdir()):
        raise ValueError("use a new, empty lab state directory")
    state.chmod(0o700)
    certificates(state)
    secret = secrets.token_urlsafe(48)
    coordinator = TentacleCoordinator(host="127.0.0.1", port=0, dashboard_port=None)
    original_hello = coordinator.ws_server.on_device_hello

    async def record_registration(hello, websocket):
        await original_hello(hello, websocket)
        with (state / "registrations.jsonl").open("a", encoding="utf-8") as stream:
            stream.write(
                json.dumps(
                    {
                        "deviceId": hello.tentacle_id,
                        "platform": hello.platform,
                        "kind": hello.device_kind,
                        "time": dt.datetime.now(dt.UTC).isoformat(),
                    }
                )
                + "\n"
            )

    coordinator.ws_server.on_device_hello = record_registration
    desktop_tools = ["device.info", "workspace.read_text", "workspace.write_text"]
    coordinator.ws_server.peer_grants = {
        "lab-windows": {"lab-linux": desktop_tools, "lab-android": ["android.get_installed_apps"]},
        "lab-linux": {"lab-windows": desktop_tools, "lab-android": ["android.get_installed_apps"]},
        "lab-android": {"lab-windows": desktop_tools, "lab-linux": desktop_tools},
    }
    link = DeviceLinkService(
        data_dir=state / "registry",
        jwt_secret=secret,
        coordinator_factory=lambda: coordinator,
        public_host=options.public_host,
    )
    audit = ApplianceAudit.from_data_dir(state / "audit", jwt_secret=secret)
    approval = HighRiskApprovalService(
        password_hash=hashlib.sha256(secrets.token_bytes(32)).hexdigest(),
        jwt_secret=secret,
        audit=audit,
    )
    app = FastAPI()
    app.include_router(
        create_device_link_router(
            link,
            jwt_secret=secret,
            approval=approval,
            audit=audit,
        )
    )
    from appliance.agent_api.device_workspace import create_device_workspace_router
    from appliance.security import ApplianceAuthenticator

    app.include_router(create_device_workspace_router(link, authenticator=ApplianceAuthenticator(secret)))
    await link.enable()

    from runtime.safety.auth.identity import encode_jwt_hs256

    write_json(
        state / "operator.json",
        {
            "token": encode_jwt_hs256(
                {"sub": "local:admin", "exp": int(dt.datetime.now(dt.UTC).timestamp()) + 3600},
                secret=secret,
            ),
            "url": f"http://127.0.0.1:{options.port}",
        },
    )

    def invitation(device: str, secure: bool) -> None:
        value = link.create_pairing_invitation()
        token = parse_qs(urlsplit(value["connectString"]).query)["token"][0]
        port = options.tls_port if secure else options.port
        scheme = "wss" if secure else "ws"
        write_json(
            state / f"{device}.json",
            {
                "url": f"{scheme}://127.0.0.1:{port}/api/appliance/device-link/ws",
                "token": token,
                "deviceId": f"lab-{device}",
            },
        )

    servers = [
        uvicorn.Server(
            uvicorn.Config(
                app,
                host="0.0.0.0",
                port=options.port,
                lifespan="off",
                access_log=False,
                log_level="warning",
            )
        ),
        uvicorn.Server(
            uvicorn.Config(
                app,
                host="0.0.0.0",
                port=options.tls_port,
                lifespan="off",
                access_log=False,
                log_level="warning",
                ssl_certfile=str(state / "ca.pem"),
                ssl_keyfile=str(state / "key.pem"),
            )
        ),
    ]
    tasks = [asyncio.create_task(server.serve()) for server in servers]
    try:
        async with asyncio.timeout(15):
            while not all(server.started for server in servers):
                if any(task.done() for task in tasks):
                    raise RuntimeError("lab gateway did not start")
                await asyncio.sleep(0.1)
        invitation("windows", True)
        invitation("linux", True)
        print("Production OS gateway ready on isolated WS and WSS lab ports.", flush=True)
        while not (state / "stop").exists():
            request = state / "android.request"
            if request.exists():
                invitation("android", False)
                request.unlink()
            write_json(
                state / "hub-status.json",
                {
                    "devices": [
                        {
                            "id": device.tentacle_id,
                            "platform": device.platform,
                            "kind": device.meta.get("device_kind"),
                            "online": device.is_online,
                        }
                        for device in coordinator.pool.all()
                    ],
                },
            )
            await asyncio.sleep(0.5)
    finally:
        for server in servers:
            server.should_exit = True
        await link.shutdown()
        await asyncio.gather(*tasks, return_exceptions=True)
        for name in ("windows.json", "linux.json", "android.json", "operator.json", "key.pem"):
            (state / name).unlink(missing_ok=True)


async def peer(options: argparse.Namespace) -> None:
    from websockets.asyncio.client import connect

    from runtime.tentacle.device_client import DesktopTools, DeviceClient

    config = json.loads(options.config.read_text(encoding="utf-8"))
    state = options.config.resolve().parent
    role = config["deviceId"].removeprefix("lab-")
    target = "lab-linux" if role == "windows" else "lab-windows"
    options.workspace.mkdir(parents=True, exist_ok=True)
    if any(options.workspace.iterdir()):
        raise ValueError("use a new, empty peer workspace")
    report: dict[str, object] = {"deviceId": config["deviceId"], "checks": {}}
    checks = report["checks"]
    # Explicitly confirm that the lab's certificate is rejected without trust.
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    try:
        async with connect(config["url"], ssl=context, proxy=None):
            raise RuntimeError("untrusted TLS certificate unexpectedly accepted")
    except ssl.SSLCertVerificationError:
        checks["untrusted_tls_rejected"] = True
    os.environ["SSL_CERT_FILE"] = str(state / "ca.pem")
    os.environ["NO_PROXY"] = "127.0.0.1,localhost"
    client = DeviceClient(
        url=config["url"],
        token=config["token"],
        device_id=config["deviceId"],
        device_kind="vm" if role == "linux" else "physical",
        tools=DesktopTools(workspace=options.workspace),
    )
    task = asyncio.create_task(client.run_once())

    async def call_ready(device: str, tool: str, args: dict) -> dict:
        async with asyncio.timeout(120):
            while True:
                result = await client.call_peer(device, tool, args)
                if result["success"]:
                    return result
                if result.get("error", {}).get("code") != -32011:
                    raise RuntimeError(f"remote tool failed: {result.get('error')}")
                await asyncio.sleep(0.25)

    try:
        async with asyncio.timeout(20):
            while not client.ready.is_set():
                if task.done():
                    await task
                    raise RuntimeError("client stopped before registration")
                await asyncio.sleep(0.1)
        checks["trusted_wss_registered"] = True
        info = (await call_ready(target, "device.info", {}))["data"]
        expected = "linux" if role == "windows" else "windows"
        if info["platform"] != expected:
            raise RuntimeError("peer is not running on the expected real operating system")
        checks["peer_platform"] = info["platform"]
        text = f"来自 {role}\nUTF-8 跨系统验收\n"
        path = f"from-{role}.txt"
        await call_ready(target, "workspace.write_text", {"path": path, "text": text})
        received = await client.call_peer(target, "workspace.read_text", {"path": path})
        if received.get("data", {}).get("text") != text:
            raise RuntimeError("cross-system file content mismatch")
        checks["cross_system_write_read"] = True
        write_json(state / f"{role}-proof.json", report)
        print(f"{role}: verified WSS and actual {expected} file round trip.", flush=True)
        while not (state / "stop").exists():
            if (state / "android.ready").exists() and "android_apps" not in checks:
                apps = await call_ready(
                    "lab-android",
                    "android.get_installed_apps",
                    {
                        "keyword": "com.octopus.mobile",
                    },
                )
                if "com.octopus.mobile" not in str(apps.get("data")):
                    raise RuntimeError("real Android package list did not include Echo Mobile")
                checks["android_apps"] = True
                (options.workspace / "phone-result-checked.txt").write_text(
                    "verified", encoding="utf-8"
                )
                write_json(state / f"{role}-proof.json", report)
                print(f"{role}: real Android package-manager tool result verified.", flush=True)
            await asyncio.sleep(0.25)
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime-root", type=Path, default=Path.cwd())
    modes = parser.add_subparsers(dest="mode", required=True)
    server = modes.add_parser("hub")
    server.add_argument("--public-host", default="")
    server.add_argument("--state", type=Path, required=True)
    server.add_argument("--port", type=int, default=18890)
    server.add_argument("--tls-port", type=int, default=18891)
    client = modes.add_parser("peer")
    client.add_argument("--config", type=Path, required=True)
    client.add_argument("--workspace", type=Path, required=True)
    options = parser.parse_args()
    sys.path.insert(0, str(options.runtime_root.resolve()))
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(hub(options) if options.mode == "hub" else peer(options))


if __name__ == "__main__":
    main()
