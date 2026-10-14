"""Provision the persistent per-device credential for native Docker control."""

from __future__ import annotations

import argparse
import os
import re
import secrets
import stat
from pathlib import Path

DEFAULT_CREDENTIAL = Path("/var/lib/echo-os/docker-proxy-token")
_TOKEN = re.compile(rb"[0-9a-f]{64}")


def _validate_directory(directory: Path, *, trusted_uid: int, trusted_gid: int) -> None:
    info = directory.lstat()
    if (
        directory.is_symlink()
        or not stat.S_ISDIR(info.st_mode)
        or info.st_uid != trusted_uid
        or info.st_gid != trusted_gid
        or stat.S_IMODE(info.st_mode) != 0o700
    ):
        raise RuntimeError("Docker credential directory must be root-owned mode 0700")


def _validate_existing(path: Path, *, trusted_uid: int, trusted_gid: int) -> None:
    info = path.lstat()
    if (
        path.is_symlink()
        or not stat.S_ISREG(info.st_mode)
        or info.st_uid != trusted_uid
        or info.st_gid != trusted_gid
        or stat.S_IMODE(info.st_mode) != 0o600
        or info.st_size != 64
    ):
        raise RuntimeError("Docker proxy credential must be root-owned mode 0600")
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        value = os.read(descriptor, 65)
    finally:
        os.close(descriptor)
    if _TOKEN.fullmatch(value) is None:
        raise RuntimeError("Docker proxy credential has invalid content")


def ensure_credential(
    path: Path = DEFAULT_CREDENTIAL,
    *,
    trusted_uid: int = 0,
    trusted_gid: int = 0,
) -> bool:
    """Create one random token atomically; return whether a file was created.

    ``trusted_uid``/``trusted_gid`` default to root and are only overridden by
    tests that run unprivileged; production callers never pass them.
    """

    if os.geteuid() != trusted_uid:
        raise RuntimeError("Docker proxy credential provisioning requires root")
    if not path.is_absolute() or path.name != "docker-proxy-token":
        raise RuntimeError("Docker proxy credential path is not canonical")
    directory = path.parent
    _validate_directory(directory, trusted_uid=trusted_uid, trusted_gid=trusted_gid)
    try:
        _validate_existing(path, trusted_uid=trusted_uid, trusted_gid=trusted_gid)
        return False
    except FileNotFoundError:
        pass

    temporary = directory / f".docker-proxy-token.{secrets.token_hex(8)}"
    descriptor = os.open(
        temporary,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
        0o600,
    )
    try:
        try:
            value = secrets.token_hex(32).encode("ascii")
            written = os.write(descriptor, value)
            if written != len(value):
                raise RuntimeError("Docker proxy credential write was incomplete")
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        os.chown(temporary, trusted_uid, trusted_gid)
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
        directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        temporary.unlink(missing_ok=True)
    _validate_existing(path, trusted_uid=trusted_uid, trusted_gid=trusted_gid)
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("ensure",))
    args = parser.parse_args(argv)
    if args.command == "ensure":
        ensure_credential()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
