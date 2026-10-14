"""Incrementally mirrored copies of git trees for the commit hooks.

This checkout is shared by several sessions, so hooks must not judge the
working tree (other sessions' uncommitted edits) and must not stash it either.
Hooks that need a whole tree run against a mirror under
``.git/echo-hook-cache/<name>`` that holds exactly the blobs of the index or of
``HEAD``. A manifest of blob ids lets each run rewrite only what changed since
the previous run, so after the first run a mirror refresh costs seconds.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PLACEHOLDER = "-"  # an empty file whose content is irrelevant to the hook
MANIFEST = ".echo-snapshot-manifest.json"


def git(*args: str, data: bytes | None = None) -> bytes:
    return subprocess.run(
        ["git", *args], cwd=REPO_ROOT, check=True, capture_output=True, input=data
    ).stdout


def cache_dir() -> Path:
    path = Path(git("rev-parse", "--git-path", "echo-hook-cache").decode().strip())
    directory = (REPO_ROOT / path).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def index_blobs(*pathspecs: str) -> dict[str, str]:
    """{path: blob id} of the index (honours GIT_INDEX_FILE)."""
    entries: dict[str, str] = {}
    for record in git("ls-files", "-s", "-z", "--", *pathspecs).split(b"\0"):
        if record:
            meta, path = record.decode("utf-8").split("\t", 1)
            mode, blob = meta.split()[:2]
            if mode != "120000":  # symlinks are not mirrored
                entries[path] = _entry(mode, blob)
    return entries


def tree_blobs(treeish: str, *pathspecs: str) -> dict[str, str]:
    """{path: blob id} of a commit's tree."""
    entries: dict[str, str] = {}
    for record in git("ls-tree", "-r", "-z", treeish, "--", *pathspecs).split(b"\0"):
        if record:
            meta, path = record.decode("utf-8").split("\t", 1)
            mode, kind, blob = meta.split()[:3]
            if kind == "blob" and mode != "120000":  # symlinks are not mirrored
                entries[path] = _entry(mode, blob)
    return entries


def _entry(mode: str, blob: str) -> str:
    """Manifest value: the blob id, marked when the file is executable."""
    return f"{blob}+x" if mode == "100755" else blob


def _sync(mirror: Path, wanted: dict[str, str], always_fresh: tuple[str, ...]) -> None:
    manifest_path = mirror / MANIFEST
    try:
        previous = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        # Unknown contents (first run, or an interrupted one): start empty so
        # files that are no longer in the tree cannot linger in the mirror.
        shutil.rmtree(mirror, ignore_errors=True)
        mirror.mkdir(parents=True, exist_ok=True)
        previous = {}
    for prefix in always_fresh:
        shutil.rmtree(mirror / prefix, ignore_errors=True)
    previous = {
        path: blob
        for path, blob in previous.items()
        if not any(path.startswith(f"{prefix}/") for prefix in always_fresh)
    }
    for path in set(previous) - set(wanted):
        (mirror / path).unlink(missing_ok=True)
    changed = [path for path, blob in wanted.items() if previous.get(path) != blob]
    blobs = [path for path in changed if wanted[path] != PLACEHOLDER]
    if blobs:
        request = "".join(f"{wanted[path].removesuffix('+x')}\n" for path in blobs)
        stream = git("cat-file", "--batch", data=request.encode())
        offset = 0
        for path in blobs:
            header_end = stream.index(b"\n", offset)
            size = int(stream[offset:header_end].split()[2])
            target = mirror / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(stream[header_end + 1 : header_end + 1 + size])
            target.chmod(0o755 if wanted[path].endswith("+x") else 0o644)
            offset = header_end + 1 + size + 1
    for path in changed:
        if wanted[path] == PLACEHOLDER:
            target = mirror / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"")
    manifest_path.write_text(json.dumps(wanted, sort_keys=True), encoding="utf-8")


@contextmanager
def mirror(name: str, wanted: dict[str, str], always_fresh: tuple[str, ...] = ()) -> Iterator[Path]:
    """Yield ``.git/echo-hook-cache/<name>`` holding exactly ``wanted``.

    ``always_fresh`` lists directories a hook rewrites inside the mirror; they
    are restored from git on every run. A lock serialises concurrent commits.
    """
    directory = cache_dir() / name
    directory.mkdir(parents=True, exist_ok=True)
    lock = directory.with_name(f"{name}.lock")
    descriptor = None
    for _ in range(3000):  # up to five minutes behind another commit's hook
        try:
            descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            break
        except FileExistsError:
            try:
                if time.time() - lock.stat().st_mtime > 900:
                    lock.unlink(missing_ok=True)  # left behind by a killed hook
            except FileNotFoundError:
                pass
            time.sleep(0.1)
    if descriptor is None:
        raise RuntimeError(f"hook mirror {directory} stayed locked; remove {lock} if stale")
    os.close(descriptor)
    try:
        try:
            _sync(directory, wanted, always_fresh)
        except Exception:
            (directory / MANIFEST).unlink(missing_ok=True)  # rebuild next time
            raise
        yield directory
    finally:
        lock.unlink(missing_ok=True)
