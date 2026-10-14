#!/usr/bin/env python3
"""Keep ``docs/auto`` in step with the tree that is being committed.

``tests/test_auto_docs_fresh.py`` (CI full suite) fails whenever
``scripts/gen_wiki.py`` would produce different pages: a new test file or TSX
component changes a count, a new import changes the dependency graph, and any
edit above a hook dispatch shifts the line numbers in the hook surface page.

This hook checks the *staged* tree, not the working tree: this checkout is
shared by several sessions, so other sessions' uncommitted edits must not leak
into (or mask drift in) the committed pages. When the generator inputs have no
unstaged or untracked changes it runs in place. Otherwise it runs on a mirror
of the index kept under ``.git/echo-hook-cache/docs-auto``, which is updated
blob by blob, so only files that changed since the last commit are rewritten.

On drift it rewrites ``docs/auto`` in the working tree from the staged inputs
and fails, so the regenerated pages can be added to the commit.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
GENERATOR = "scripts/gen_wiki.py"
OUTPUT = "docs/auto"
# Files whose content scripts/gen_wiki.py reads.
CONTENT_INPUTS = (
    "runtime",
    "agents",
    "docs/adr",
    OUTPUT,
    GENERATOR,
    "README.md",
    "pyproject.toml",
    "frontend/package.json",
)
# Files gen_wiki only counts: their presence matters, their content does not.
COUNTED_INPUTS = (":(glob)tests/**/test_*.py", ":(glob)frontend/src/**/*.tsx")
PLACEHOLDER = "-"
MANIFEST = "manifest.json"


def git(*args: str, data: bytes | None = None) -> bytes:
    return subprocess.run(
        ["git", *args], cwd=REPO_ROOT, check=True, capture_output=True, input=data
    ).stdout


def staged_changes() -> list[tuple[str, str]]:
    """(status, path) of every staged change, honouring GIT_INDEX_FILE."""
    raw = git("diff", "--cached", "--name-status", "--no-renames", "-z")
    fields = [field.decode("utf-8") for field in raw.split(b"\0") if field]
    return list(zip(fields[0::2], fields[1::2], strict=True))


def relevant(status: str, path: str) -> bool:
    if path.startswith(("runtime/", "agents/", "docs/adr/", f"{OUTPUT}/")):
        return True
    if path in (GENERATOR, "README.md", "pyproject.toml", "frontend/package.json"):
        return True
    name = path.rsplit("/", 1)[-1]
    counted = (path.startswith("tests/") and name.startswith("test_") and name.endswith(".py")) or (
        path.startswith("frontend/src/") and name.endswith(".tsx")
    )
    return counted and status in {"A", "D"}


def working_tree_matches_index() -> bool:
    pathspecs = [*CONTENT_INPUTS, *COUNTED_INPUTS]
    unstaged = subprocess.run(
        ["git", "diff", "--quiet", "--", *pathspecs], cwd=REPO_ROOT, check=False
    )
    untracked = git("ls-files", "--others", "--exclude-standard", "--", *pathspecs)
    return unstaged.returncode == 0 and not untracked.strip()


def index_entries() -> dict[str, str]:
    """{path: blob id} for content inputs, {path: PLACEHOLDER} for counted ones."""
    entries: dict[str, str] = {}
    for record in git("ls-files", "-s", "-z", "--", *CONTENT_INPUTS).split(b"\0"):
        if record:
            meta, path = record.decode("utf-8").split("\t", 1)
            entries[path] = meta.split()[1]
    for raw in git("ls-files", "-z", "--", *COUNTED_INPUTS).split(b"\0"):
        if raw:
            entries.setdefault(raw.decode("utf-8"), PLACEHOLDER)
    return entries


def sync_mirror(mirror: Path) -> None:
    """Make ``mirror`` hold exactly the staged inputs, rewriting only changes."""
    manifest_path = mirror / MANIFEST
    try:
        previous = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        previous = {}
    # docs/auto is small and the generator rewrites it in place: always restore
    # it from the index so pages added by an earlier regeneration cannot linger.
    shutil.rmtree(mirror / OUTPUT, ignore_errors=True)
    previous = {path: blob for path, blob in previous.items() if not path.startswith(f"{OUTPUT}/")}
    wanted = index_entries()
    for path in set(previous) - set(wanted):
        (mirror / path).unlink(missing_ok=True)
    changed = [path for path, blob in wanted.items() if previous.get(path) != blob]
    blobs = [path for path in changed if wanted[path] != PLACEHOLDER]
    if blobs:
        request = "".join(f"{wanted[path]}\n" for path in blobs).encode()
        stream = git("cat-file", "--batch", data=request)
        offset = 0
        for path in blobs:
            header_end = stream.index(b"\n", offset)
            size = int(stream[offset:header_end].split()[2])
            content = stream[header_end + 1 : header_end + 1 + size]
            offset = header_end + 1 + size + 1
            target = mirror / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
    for path in changed:
        if wanted[path] == PLACEHOLDER:
            target = mirror / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"")
    manifest_path.write_text(json.dumps(wanted, sort_keys=True), encoding="utf-8")


@contextmanager
def snapshot_root():
    """Yield a directory holding the staged inputs (the repo itself if clean)."""
    if working_tree_matches_index():
        yield REPO_ROOT
        return
    cache = Path(git("rev-parse", "--git-path", "echo-hook-cache").decode().strip())
    mirror = (REPO_ROOT / cache / "docs-auto").resolve()
    lock = mirror.with_name("docs-auto.lock")
    mirror.mkdir(parents=True, exist_ok=True)
    descriptor = None
    for _ in range(600):
        try:
            descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            break
        except FileExistsError:
            try:
                if time.time() - lock.stat().st_mtime > 600:
                    lock.unlink(missing_ok=True)  # stale lock from a killed commit
            except FileNotFoundError:
                pass
            time.sleep(0.1)
    if descriptor is None:
        # Another commit holds the mirror; fall back to a private copy.
        with tempfile.TemporaryDirectory(prefix="echo-docs-auto-") as temporary:
            sync_mirror(Path(temporary))
            yield Path(temporary)
        return
    os.close(descriptor)
    try:
        try:
            sync_mirror(mirror)
        except Exception:
            (mirror / MANIFEST).unlink(missing_ok=True)  # rebuild from scratch next time
            raise
        yield mirror
    finally:
        lock.unlink(missing_ok=True)


def _normalized(path: Path) -> bytes:
    return path.read_bytes().replace(b"\r\n", b"\n")


def sync_output(source: Path, target: Path) -> None:
    """Copy regenerated pages into the working tree, touching only real changes.

    Pages are written with LF endings (what git stores); pages whose content is
    unchanged are left alone so line-ending-only rewrites never show up as
    hook modifications.
    """
    generated = {path.relative_to(source) for path in source.rglob("*") if path.is_file()}
    for relative in sorted(generated):
        content = _normalized(source / relative)
        destination = target / relative
        if destination.is_file() and _normalized(destination) == content:
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
    for path in sorted(target.rglob("*"), reverse=True):
        if path.is_file() and path.relative_to(target) not in generated:
            path.unlink()
        elif path.is_dir() and not any(path.iterdir()):
            path.rmdir()


def run_generator(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(root / GENERATOR), *args],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
    )


def main() -> int:
    if not any(relevant(status, path) for status, path in staged_changes()):
        return 0
    with snapshot_root() as root:
        check = run_generator(root, "--check")
        if check.returncode == 0:
            return 0
        print(check.stderr.strip(), file=sys.stderr)
        regenerate = run_generator(root)
        if regenerate.returncode != 0:
            print(regenerate.stdout + regenerate.stderr, file=sys.stderr)
            return 1
        if root != REPO_ROOT:
            sync_output(root / OUTPUT, REPO_ROOT / OUTPUT)
    print(
        "\ndocs/auto was regenerated from the staged tree. Add docs/auto to this "
        "commit (e.g. `git commit -- <your paths> docs/auto`) and commit again.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
