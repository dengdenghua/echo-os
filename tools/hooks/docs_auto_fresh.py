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

import subprocess
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from snapshot import PLACEHOLDER, git, index_blobs, mirror

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


@contextmanager
def snapshot_root() -> Iterator[Path]:
    """Yield a directory holding the staged inputs (the repo itself if clean)."""
    if working_tree_matches_index():
        yield REPO_ROOT
        return
    wanted = index_blobs(*CONTENT_INPUTS)
    for path in index_blobs(*COUNTED_INPUTS):
        wanted.setdefault(path, PLACEHOLDER)
    with mirror("docs-auto", wanted, always_fresh=(OUTPUT,)) as root:
        yield root


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
