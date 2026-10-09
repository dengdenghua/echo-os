"""Shared fixtures for the appliance test suite."""

from __future__ import annotations

import os

import pytest


@pytest.fixture(autouse=True)
def _trust_invoking_identity(monkeypatch: pytest.MonkeyPatch) -> None:
    """Let host-config writers trust the invoking uid/gid instead of root.

    Production keeps ``_TRUSTED_UID = _TRUSTED_GID = 0``.  GitHub-hosted runners
    are unprivileged, so tmp_path fixtures are owned by that user; the native
    storage writers are pointed at it for the duration of each test.  Under
    ``sudo`` the values are 0 again, i.e. the production contract.
    """

    if os.name != "posix":
        return
    from appliance import native_btrfs, native_ext4, native_mdraid

    for module in (native_btrfs, native_ext4, native_mdraid):
        monkeypatch.setattr(module, "_TRUSTED_UID", os.geteuid())
        monkeypatch.setattr(module, "_TRUSTED_GID", os.getegid())

    from appliance import native_firewall

    monkeypatch.setattr(native_firewall, "_TRUSTED_UID", os.geteuid())
