#!/usr/bin/env python3
"""Run the tools/lint ratchets that the CI full suite enforces, before a push.

``tests/test_lint.py``, ``test_async_blocking_check.py``,
``test_async_lock_check.py``, ``test_orphan_module_check.py`` and
``test_feature_flag_consumption_check.py`` fail CI when a baseline no longer
matches the tree (a new violation, or a fixed one still listed). Each scan
parses the whole tree, which is too slow for every commit, so this runs at
pre-push and runs the scans in parallel.

It checks ``HEAD`` (what is being pushed). This checkout is shared by several
sessions, so when the scanned paths have uncommitted changes the ``HEAD`` copy
is exported to a temporary directory and scanned there.
"""

from __future__ import annotations

import io
import subprocess
import sys
import tarfile
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCANNED = ("runtime", "tests", "demos", "benchmarks", "tools", "scripts", "pyproject.toml")
CHECKS = (
    ("import direction", ["tools/lint/import_direction_check.py", "--strict"]),
    ("async blocking", ["tools/lint/async_blocking_check.py", "--strict"]),
    ("async lock", ["tools/lint/async_lock_check.py", "--strict"]),
    ("orphan modules", ["tools/lint/orphan_module_check.py", "--strict"]),
    ("feature flags", ["tools/lint/feature_flag_consumption_check.py", "--strict"]),
    ("runtime invariants", ["tools/lint/invariant_check.py", "runtime"]),
)


def head_matches_working_tree() -> bool:
    changed = subprocess.run(
        ["git", "diff", "--quiet", "HEAD", "--", *SCANNED], cwd=REPO_ROOT, check=False
    )
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard", "--", *SCANNED],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return changed.returncode == 0 and not untracked.strip()


def export_head(destination: Path) -> None:
    archive = subprocess.run(
        ["git", "archive", "--format=tar", "HEAD", "--", *SCANNED],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
    ).stdout
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(destination, filter="data")


def run_check(root: Path, label: str, args: list[str]) -> tuple[str, int, str]:
    result = subprocess.run(
        [sys.executable, *args], cwd=root, check=False, capture_output=True, text=True
    )
    return label, result.returncode, (result.stdout + result.stderr).strip()


def scratch_parent() -> Path:
    """Scratch space next to the repository (the system temp drive may be full)."""
    path = subprocess.run(
        ["git", "rev-parse", "--git-path", "echo-hook-cache"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    parent = (REPO_ROOT / path).resolve()
    parent.mkdir(parents=True, exist_ok=True)
    return parent


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="lint-ratchets-", dir=scratch_parent()) as temporary:
        root = REPO_ROOT
        if not head_matches_working_tree():
            root = Path(temporary)
            export_head(root)
        with ThreadPoolExecutor(max_workers=len(CHECKS)) as pool:
            results = list(pool.map(lambda check: run_check(root, *check), CHECKS))
    failed = [result for result in results if result[1] != 0]
    for label, _code, output in failed:
        print(f"--- {label} ratchet failed:\n{output}\n", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
