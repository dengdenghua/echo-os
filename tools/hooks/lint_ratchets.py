#!/usr/bin/env python3
"""Run the whole-tree CI gates that are too slow for every commit, before a push.

- The tools/lint ratchets that the CI full suite enforces (``tests/test_lint.py``,
  ``test_async_blocking_check.py``, ``test_async_lock_check.py``,
  ``test_orphan_module_check.py``, ``test_feature_flag_consumption_check.py``):
  they fail when a baseline no longer matches the tree.
- The static image source contract (``packaging/image/verify-image.sh
  --static``), run by the Image and A/B source-contract workflows on every PR
  that touches deploy/, packaging/, appliance/ or frontend/; it greps those
  trees for fixed product invariants.

The checks run in parallel against ``HEAD`` (what is being pushed). This
checkout is shared by several sessions, so when the checked paths have
uncommitted changes they run on an incrementally synced mirror of ``HEAD``
(see ``snapshot.py``) instead of the working tree.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from snapshot import REPO_ROOT, mirror, tree_blobs


def bash_executable() -> str:
    """The bash that runs the image contract.

    On Windows a bare "bash" passed to CreateProcess resolves through System32
    before PATH, i.e. to the WSL launcher, which silently ran the contract
    inside WSL and failed whenever WSL could not start. Use Git for Windows'
    bash, found next to git, instead.
    """
    if sys.platform != "win32":
        return "bash"
    git = shutil.which("git")
    if git:
        directory = Path(git).resolve().parent
        for _ in range(4):
            candidate = directory / "usr" / "bin" / "bash.exe"
            if candidate.is_file():
                return str(candidate)
            directory = directory.parent
    found = shutil.which("bash")
    if found and "system32" not in found.lower():
        return found
    return "bash"


CHECKED = (
    "runtime",
    "tests",
    "demos",
    "benchmarks",
    "tools",
    "scripts",
    "pyproject.toml",
    ".github",
    "packaging",
    "deploy",
    "frontend",
    "appliance",
)
PYTHON = sys.executable
CHECKS = (
    ("import direction", [PYTHON, "tools/lint/import_direction_check.py", "--strict"]),
    ("async blocking", [PYTHON, "tools/lint/async_blocking_check.py", "--strict"]),
    ("async lock", [PYTHON, "tools/lint/async_lock_check.py", "--strict"]),
    ("orphan modules", [PYTHON, "tools/lint/orphan_module_check.py", "--strict"]),
    ("feature flags", [PYTHON, "tools/lint/feature_flag_consumption_check.py", "--strict"]),
    ("runtime invariants", [PYTHON, "tools/lint/invariant_check.py", "runtime"]),
    ("image source contract", [bash_executable(), "packaging/image/verify-image.sh", "--static"]),
)


def head_matches_working_tree() -> bool:
    changed = subprocess.run(
        ["git", "diff", "--quiet", "HEAD", "--", *CHECKED], cwd=REPO_ROOT, check=False
    )
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard", "--", *CHECKED],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return changed.returncode == 0 and not untracked.strip()


def run_check(root: Path, label: str, command: list[str]) -> tuple[str, int, str]:
    result = subprocess.run(
        command,
        cwd=root,
        check=False,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
    )
    output = (result.stdout + result.stderr).strip()
    if label == "image source contract":
        # Report only the failed assertions, not the ~2,400 passing ones.
        failed = [line for line in output.splitlines() if "✗" in line]
        output = "\n".join(failed) or output
    return label, result.returncode, output


def run_all(root: Path) -> list[tuple[str, int, str]]:
    with ThreadPoolExecutor(max_workers=len(CHECKS)) as pool:
        return list(pool.map(lambda check: run_check(root, *check), CHECKS))


def main() -> int:
    if head_matches_working_tree():
        results = run_all(REPO_ROOT)
    else:
        # Tracked symlinks and gitlinks are not mirrored; none of the checks read them.
        with mirror("pre-push", tree_blobs("HEAD", *CHECKED)) as root:
            results = run_all(root)
    failed = [result for result in results if result[1] != 0]
    for label, _code, output in failed:
        print(f"--- {label} failed:\n{output}\n", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
