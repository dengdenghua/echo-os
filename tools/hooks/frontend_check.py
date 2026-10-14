#!/usr/bin/env python3
"""Run the frontend's own Prettier/ESLint on staged frontend files.

CI runs ``pnpm format`` (``prettier --check .``) and ``pnpm lint`` (ESLint,
``--max-warnings=0``) from ``frontend/``. Running the same locked binaries from
``frontend/`` keeps ``.prettierignore`` and ``eslint.config.js`` semantics
identical; only the staged files are checked so a commit stays fast.

Usage: frontend_check.py {prettier|eslint} [FILE ...]
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND = REPO_ROOT / "frontend"
TOOLS = {
    "prettier": (
        FRONTEND / "node_modules" / "prettier" / "bin" / "prettier.cjs",
        ["--check", "--ignore-unknown", "--no-error-on-unmatched-pattern"],
        None,
    ),
    "eslint": (
        FRONTEND / "node_modules" / "eslint" / "bin" / "eslint.js",
        ["--max-warnings=0", "--no-warn-ignored"],
        (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"),
    ),
}


def main(argv: list[str]) -> int:
    if not argv or argv[0] not in TOOLS:
        print(__doc__, file=sys.stderr)
        return 2
    entrypoint, options, suffixes = TOOLS[argv[0]]
    files = []
    for name in argv[1:]:
        path = Path(name).as_posix()
        if not path.startswith("frontend/") or not (REPO_ROOT / path).is_file():
            continue
        if suffixes is not None and not path.endswith(suffixes):
            continue
        files.append(path.removeprefix("frontend/"))
    if not files:
        return 0
    node = shutil.which("node")
    if node is None or not entrypoint.is_file():
        print(
            f"frontend_check: {argv[0]} needs node and frontend/node_modules "
            "(run `corepack pnpm install --frozen-lockfile` in frontend/)",
            file=sys.stderr,
        )
        return 1
    return subprocess.run([node, str(entrypoint), *options, *files], cwd=FRONTEND).returncode


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
