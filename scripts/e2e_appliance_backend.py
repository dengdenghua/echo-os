#!/usr/bin/env python3
"""Start the full-stack Playwright backend through the shipped appliance entrypoint.

The browser lane must exercise the product a person actually signs in to: the
appliance desktop behind its lock screen.  ``appliance.entrypoint`` is what the
NAS image runs.  It provisions the owner account from ``ECHO_ADMIN_PASSWORD``,
writes a runtime config with ``local_auth`` enabled, loads the appliance
extension fail-closed, and then replaces itself with ``python -m runtime serve``.

The entrypoint targets Linux images.  On a Windows development host it has no
``os.geteuid`` and ``os.execv`` would detach the runtime from Playwright's
process handle, so there the runtime runs as a child process instead.  CI and
every POSIX host use the entrypoint unchanged.

Usage (from the repository root):
    python scripts/e2e_appliance_backend.py --config config.e2e.yaml \
        --host 127.0.0.1 --port 18000
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def main(argv: list[str]) -> int:
    for name in ("ECHO_DATA_DIR", "ECHO_ADMIN_PASSWORD"):
        if not os.environ.get(name, "").strip():
            raise SystemExit(f"{name} must be set for the full-stack appliance backend")
    sys.path.insert(0, str(REPO_ROOT))

    from appliance import entrypoint

    if os.name == "nt":
        if not hasattr(os, "geteuid"):
            os.geteuid = lambda: 1000  # type: ignore[attr-defined]  # never root

        def _run_child(_path: str, args: list[str]) -> None:
            raise SystemExit(subprocess.call(args))

        os.execv = _run_child  # type: ignore[assignment]

    return entrypoint.main(["serve", *argv])


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
