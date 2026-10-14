#!/usr/bin/env python3
"""Run the locked ruff on staged files, scoped exactly like CI.

pre-commit passes the staged Python files. CI lints and formats only the paths
listed in ``.github/workflows/ci.yml`` (``runtime/`` and ``tests/`` are linted
but deliberately not formatted, see ``tests/test_ci_gate_contract.py``). This
hook reads those path lists from the workflow, so it can never drift from CI,
and runs the ruff version pinned in ``uv.lock`` (via the project ``.venv``)
instead of a separately pinned hook version.

Usage: ci_ruff.py {check|format} [FILE ...]
"""

from __future__ import annotations

import shlex
import subprocess
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
CI_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "ci.yml"
COMMANDS = {
    "check": ("ruff", "check"),
    "format": ("ruff", "format", "--check"),
}


def ci_scope(mode: str) -> set[str]:
    """Return every path CI passes to ``uv run ruff <mode>``."""
    workflow = yaml.safe_load(CI_WORKFLOW.read_text(encoding="utf-8"))
    wanted = COMMANDS[mode]
    scope: set[str] = set()
    for job in workflow.get("jobs", {}).values():
        for step in job.get("steps", []):
            script = str(step.get("run", "")).replace("\\\n", " ")
            for line in script.splitlines():
                words = shlex.split(line)
                for start in range(len(words)):
                    if tuple(words[start : start + len(wanted)]) != wanted:
                        continue
                    scope.update(
                        word for word in words[start + len(wanted) :] if not word.startswith("-")
                    )
    return scope


def in_scope(path: str, scope: set[str]) -> bool:
    return any(path == entry or (entry.endswith("/") and path.startswith(entry)) for entry in scope)


def main(argv: list[str]) -> int:
    if not argv or argv[0] not in COMMANDS:
        print(__doc__, file=sys.stderr)
        return 2
    mode, files = argv[0], [Path(name).as_posix() for name in argv[1:]]
    scope = ci_scope(mode)
    if not scope:
        print(f"ci_ruff: no 'ruff {mode}' scope found in {CI_WORKFLOW}", file=sys.stderr)
        return 1
    selected = [name for name in files if in_scope(name, scope)]
    if not selected:
        return 0
    if mode == "check":
        command = [sys.executable, "-m", "ruff", "check", "--fix", "--force-exclude", *selected]
    else:
        # Write the formatting; pre-commit then fails the commit and shows the
        # change, exactly the files CI would reject with `ruff format --check`.
        command = [sys.executable, "-m", "ruff", "format", "--force-exclude", *selected]
    return subprocess.run(command, cwd=REPO_ROOT, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
