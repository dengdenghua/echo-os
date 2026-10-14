#!/usr/bin/env python3
"""Install this repository's git hooks (pre-commit and pre-push).

    uv tool install pre-commit          # once per machine
    uv run python tools/hooks/install_hooks.py

Use this instead of ``pre-commit install``: the stock pre-commit hook stashes
all unstaged changes while it runs, which is unsafe in a checkout shared by
several sessions (see ``tools/hooks/git_hook.py``). The stubs written here call
``git_hook.py``, which runs the same ``.pre-commit-config.yaml`` hooks on an
explicit file list. Re-run after moving the checkout or reinstalling uv or
pre-commit; ``--uninstall`` removes the stubs.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MARKER = "# echo-os shared-checkout hook (tools/hooks/install_hooks.py)"
STAGES = ("pre-commit", "pre-push")


def hooks_dir() -> Path:
    path = subprocess.run(
        ["git", "rev-parse", "--git-path", "hooks"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    return (REPO_ROOT / path).resolve()


def stub(stage: str, uv: str, pre_commit: str) -> str:
    return (
        "#!/bin/sh\n"
        f"{MARKER}\n"
        f"PRE_COMMIT_BIN='{pre_commit}'\n"
        "export PRE_COMMIT_BIN\n"
        f"exec '{uv}' run --frozen --no-sync python tools/hooks/git_hook.py {stage}\n"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--uninstall", action="store_true")
    args = parser.parse_args(argv)
    target = hooks_dir()
    target.mkdir(parents=True, exist_ok=True)
    if args.uninstall:
        for stage in STAGES:
            path = target / stage
            if path.is_file() and MARKER in path.read_text(encoding="utf-8", errors="replace"):
                path.unlink()
                print(f"removed {path}")
        return 0
    uv = shutil.which("uv")
    pre_commit = shutil.which("pre-commit")
    if not uv or not pre_commit:
        print("install uv and `uv tool install pre-commit` first", file=sys.stderr)
        return 1
    for stage in STAGES:
        path = target / stage
        if path.exists() and MARKER not in path.read_text(encoding="utf-8", errors="replace"):
            backup = path.with_name(f"{stage}.before-echo-hooks")
            path.replace(backup)
            print(f"kept the previous hook as {backup}")
        path.write_text(
            stub(stage, Path(uv).as_posix(), Path(pre_commit).as_posix()),
            encoding="utf-8",
            newline="\n",
        )
        path.chmod(0o755)
        print(f"installed {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
