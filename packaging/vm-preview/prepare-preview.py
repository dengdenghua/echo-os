#!/usr/bin/env python3
"""Prepare a first-boot VM kit; this command never starts or removes a VM."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import secrets
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    for name in (
        "output",
        "renderer-dist",
        "runtime-node-modules",
        "asar-cli",
        "electron-zip",
        "base-image",
        "wheel",
        "requirements",
        "codex-bundle",
    ):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--guest-proxy", default="")
    parser.add_argument(
        "--qemu-root", type=Path, help="Private QEMU folder containing executables and share/"
    )
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    output = args.output.resolve()
    payload = output / "payload"
    private = output / "private"
    for path in (payload, private, output / "logs", output / "firmware", output / "build"):
        path.mkdir(parents=True, exist_ok=True)
    if (private / "credentials.json").exists():
        raise SystemExit(
            "Existing private seed: use a new output folder; never overwrite VM credentials"
        )
    if os.name == "nt":
        user = os.environ["USERDOMAIN"] + "\\" + os.environ["USERNAME"]
        subprocess.run(
            [
                "icacls",
                str(private),
                "/inheritance:r",
                "/grant:r",
                user + ":(OI)(CI)F",
                "*S-1-5-18:(OI)(CI)F",
                "*S-1-5-32-544:(OI)(CI)F",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )
    password = secrets.token_urlsafe(24)
    (private / "credentials.json").write_text(
        json.dumps({"linux_user": "echo", "app_user": "admin", "password": password}, indent=2),
        encoding="utf-8",
    )
    key = private / "provision_ed25519"
    subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(key)], check=True)
    openssl = shutil.which("openssl") or r"C:\Program Files\Git\usr\bin\openssl.exe"
    hashed = (
        subprocess.run(
            [openssl, "passwd", "-6", "-stdin"],
            input=password.encode(),
            stdout=subprocess.PIPE,
            check=True,
        )
        .stdout.decode()
        .strip()
    )

    app = output / "build" / "app"
    app.mkdir()
    shutil.copytree(
        root / "frontend" / "electron",
        app / "electron",
        ignore=shutil.ignore_patterns("*.test.cjs", "*.node-test.cjs"),
    )
    shutil.copytree(args.renderer_dist, app / "dist")
    shutil.copytree(args.runtime_node_modules, app / "node_modules", symlinks=False)
    frontend_metadata = json.loads((root / "frontend/package.json").read_text(encoding="utf-8"))
    # Preserve the canonical package identity; window discovery is PID scoped.
    (app / "package.json").write_text(
        json.dumps(
            {
                "name": frontend_metadata["name"],
                "version": frontend_metadata["version"],
                "main": "electron/main.cjs",
                "type": "module",
                "productName": "Echo OS Development Preview",
                "dependencies": {"electron-updater": "6.8.9"},
            }
        ),
        encoding="utf-8",
    )
    subprocess.run(
        ["node", str(args.asar_cli), "pack", str(app), str(payload / "app.asar")], check=True
    )
    codex_root = args.codex_bundle.resolve()
    codex_manifest = json.loads((codex_root / "echo-codex-bundle.json").read_text(encoding="utf-8"))
    if (
        codex_manifest.get("schema") != "echo.codex_bundle.v1"
        or codex_manifest.get("package") != "@openai/codex"
        or codex_manifest.get("target") != "x86_64-unknown-linux-musl"
        or codex_manifest.get("version") != frontend_metadata["devDependencies"]["@openai/codex"]
    ):
        raise SystemExit("Codex bundle does not match the pinned Linux source")
    with tarfile.open(payload / "codex-linux.tar.gz", "w:gz") as archive:
        for name in sorted([*codex_manifest["files"], "echo-codex-bundle.json"]):
            path = codex_root / name
            if (
                not path.resolve().is_relative_to(codex_root)
                or path.is_symlink()
                or not path.is_file()
            ):
                raise SystemExit("Invalid Codex bundle path")
            if name in codex_manifest["files"] and digest(path) != codex_manifest["files"][name]:
                raise SystemExit("Codex bundle checksum mismatch: " + name)
            info = archive.gettarinfo(str(path), arcname=name)
            info.uid = info.gid = 0
            info.mode = (
                0o755
                if name.startswith(("bin/", "codex-path/"))
                or name in ("codex-resources/bwrap", "codex-resources/zsh/bin/zsh")
                else 0o644
            )
            with path.open("rb") as stream:
                archive.addfile(info, stream)
    files = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode().split("\0")
    with tarfile.open(payload / "source.tar.gz", "w:gz") as archive:
        for name in sorted(files):
            path = root / name
            if name and path.is_file() and not path.is_symlink():
                archive.add(path, arcname=name, recursive=False)
        archive.add(args.renderer_dist, arcname="frontend/dist")
    for source, name in (
        (args.wheel, args.wheel.name),
        (args.requirements, "requirements.lock"),
        (args.electron_zip, "electron-linux.zip"),
    ):
        shutil.copyfile(source, payload / name)
    shutil.copyfile(root / "packaging/vm-preview/guest-install.sh", payload / "guest-install.sh")
    manifest = {
        "profile": "development-preview",
        "acceptance": "not-yet-booted",
        "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root)
        .decode()
        .strip(),
        "source_dirty": bool(
            subprocess.check_output(["git", "status", "--porcelain"], cwd=root).strip()
        ),
        "payloads": {
            p.name: digest(p)
            for p in sorted(payload.iterdir())
            if p.is_file() and p.name != "manifest.json"
        },
    }
    (payload / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    import pycdlib
    import yaml

    credentials = (private / "credentials.json").read_text(encoding="utf-8")
    config = {
        "hostname": "echo-os-preview",
        "manage_etc_hosts": True,
        "ssh_pwauth": False,
        "disable_root": True,
        "users": [
            {
                "name": "echo",
                "groups": ["sudo"],
                "shell": "/bin/bash",
                "sudo": "ALL=(ALL) NOPASSWD:ALL",
                "lock_passwd": False,
                "hashed_passwd": hashed,
                "ssh_authorized_keys": [key.with_suffix(".pub").read_text().strip()],
            }
        ],
        "write_files": [
            {
                "path": "/etc/echo-preview-allowed",
                "permissions": "0600",
                "content": digest(payload / "manifest.json"),
            },
            {
                "path": "/root/echo-preview-credentials.json",
                "permissions": "0600",
                "content": credentials,
            },
        ],
        "runcmd": [
            [
                "bash",
                "-c",
                'curl -fsS --retry 8 http://10.0.2.2:18083/guest-install.sh -o /root/echo-preview-install.sh && echo "'
                + digest(payload / "guest-install.sh")
                + '  /root/echo-preview-install.sh" | sha256sum -c - && bash /root/echo-preview-install.sh',
            ]
        ],
    }
    if args.guest_proxy:
        from urllib.parse import urlsplit

        proxy = urlsplit(args.guest_proxy)
        if (
            proxy.scheme != "http"
            or proxy.hostname != "10.0.2.2"
            or not proxy.port
            or proxy.username
            or proxy.password
            or proxy.path not in ("", "/")
        ):
            raise SystemExit("Only an unauthenticated HTTP proxy on the VM host is supported")
        config["write_files"].append(
            {
                "path": "/root/echo-preview-proxy.env",
                "permissions": "0600",
                "content": f"http_proxy={args.guest_proxy}\nhttps_proxy={args.guest_proxy}\nno_proxy=localhost,127.0.0.1,10.0.2.2\n",
            }
        )
    user_data = ("#cloud-config\n" + yaml.safe_dump(config, allow_unicode=True)).encode()
    meta_data = yaml.safe_dump(
        {"instance-id": "echo-preview-" + secrets.token_hex(8), "local-hostname": "echo-os-preview"}
    ).encode()
    iso = pycdlib.PyCdlib()
    iso.new(interchange_level=3, joliet=3, rock_ridge="1.09", vol_ident="cidata")
    for name, data in (("user-data", user_data), ("meta-data", meta_data)):
        iso.add_fp(
            io.BytesIO(data),
            len(data),
            iso_path="/" + name.replace("-", "_").upper() + ";1",
            rr_name=name,
            joliet_path="/" + name,
        )
    iso.write(str(private / "seed.iso"))
    iso.close()
    # Keep the backing path relative so the entire kit can be moved together.
    downloads = output / "downloads"
    downloads.mkdir(exist_ok=True)
    base = downloads / args.base_image.name
    if args.base_image.resolve() != base.resolve():
        shutil.copyfile(args.base_image, base)
    qemu_root = (
        args.qemu_root or Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "qemu"
    ).resolve()
    subprocess.run(
        [
            str(qemu_root / "qemu-img.exe"),
            "create",
            "-f",
            "qcow2",
            "-F",
            "qcow2",
            "-b",
            "downloads/" + base.name,
            "echo-os-preview.qcow2",
            "32G",
        ],
        cwd=output,
        check=True,
    )
    shutil.copyfile(qemu_root / "share/edk2-i386-vars.fd", output / "firmware/uefi-vars.fd")
    for name in ("Start-EchoOS.ps1", "Stop-EchoOS.ps1", "payload-server.py"):
        source = root / "packaging/vm-preview" / name
        if name.endswith(".ps1"):
            (output / name).write_text(source.read_text(encoding="utf-8"), encoding="utf-8-sig")
        else:
            shutil.copyfile(source, output / name)
    (output / "host.json").write_text(
        json.dumps(
            {
                "python": sys.executable,
                "qemu": str(qemu_root / "qemu-system-x86_64.exe"),
                "qemu_sha256": digest(qemu_root / "qemu-system-x86_64.exe"),
                "firmware_code": str(qemu_root / "share/edk2-x86_64-code.fd"),
                "base_image": "downloads/" + base.name,
                "base_sha256": digest(base),
                "payload_manifest_sha256": digest(payload / "manifest.json"),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    (output / "启动 Echo OS.cmd").write_text(
        '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-EchoOS.ps1"\r\nif errorlevel 1 pause\r\n',
        encoding="ascii",
    )
    print(
        json.dumps(
            {
                "output": str(output),
                "status": "prepared-not-booted",
                "source_commit": manifest["source_commit"],
            }
        )
    )


if __name__ == "__main__":
    main()
