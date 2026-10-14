#!/usr/bin/env python3
"""Git hook entry point for this repository's pre-commit configuration.

Called by the stubs that ``tools/hooks/install_hooks.py`` writes to
``.git/hooks``. It runs ``pre-commit run --files <files being committed>``
instead of pre-commit's stock hook, because the stock hook stashes every
unstaged change in the working tree (``git checkout -- .``) while the hooks
run and re-applies it afterwards. Several sessions share this checkout, so that
stash would hide their uncommitted edits for the duration of every commit and,
if a file changed meanwhile, discard those edits. With an explicit file list
pre-commit never stashes; the hooks that need the exact staged tree
(``docs_auto_fresh.py``) read it from the index themselves.

The file list honours ``GIT_INDEX_FILE``, so ``git commit -- <paths>`` checks
exactly ``<paths>``.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BATCH = 400  # stay well below the Windows command-line limit


def pre_commit_command() -> list[str]:
    configured = os.environ.get("PRE_COMMIT_BIN", "")
    if configured and Path(configured).is_file():
        return [configured]
    found = shutil.which("pre-commit")
    if found:
        return [found]
    return [sys.executable, "-m", "pre_commit"]


def staged_files() -> list[str]:
    raw = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMRT", "-z"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
    ).stdout
    return [name.decode("utf-8") for name in raw.split(b"\0") if name]


def run(command: list[str]) -> int:
    return subprocess.run(command, cwd=REPO_ROOT, check=False).returncode


def main(argv: list[str]) -> int:
    stage = argv[0] if argv else ""
    pre_commit = pre_commit_command()
    if stage == "pre-commit":
        files = staged_files()
        if not files:
            # Deletion-only commit: nothing for the file hooks, but removing a
            # test file or TSX component still changes docs/auto.
            return run([sys.executable, str(REPO_ROOT / "tools/hooks/docs_auto_fresh.py")])
        status = 0
        for start in range(0, len(files), BATCH):
            batch = files[start : start + BATCH]
            status |= run([*pre_commit, "run", "--hook-stage", "pre-commit", "--files", *batch])
        return 1 if status else 0
    if stage == "pre-push":
        return run([*pre_commit, "run", "--hook-stage", "pre-push", "--all-files"])
    print(f"git_hook.py: unsupported hook stage {stage!r}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
