import pytest

from runtime.safety.auth import path_denylist as deny
from runtime.safety.auth.path_guard import check_path


@pytest.fixture
def managed(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    data = tmp_path / ".local/share/echo"
    monkeypatch.setenv("ECHO_DATA_DIR", str(data))
    monkeypatch.setenv("ECHO_PATH_DENYLIST_PATH", str(data / "path_denylist.json"))
    scope = data / "workspaces/tenant/actor/thread"
    scope.mkdir(parents=True)
    return data, scope


def test_scoped_managed_workspace_is_usable(managed):
    data, scope = managed
    assert check_path(scope / "验收.txt", sandbox_dir=scope).allow
    assert not check_path(scope / "验收.txt").allow
    assert not check_path(data / "config.yaml", sandbox_dir=scope).allow
    assert not check_path(scope.parent / "other/x", sandbox_dir=scope).allow
    assert not check_path(scope, sandbox_dir=data / "workspaces").allow


def test_explicit_user_and_turn_denies_still_win(managed):
    _, scope = managed
    deny.add_user_denylist_entry("~/.local/share")
    assert not check_path(scope / "x", sandbox_dir=scope).allow
    deny.remove_user_denylist_entry("~/.local/share")
    token = deny.push_turn_denylist([str(scope / "private")])
    try:
        assert not check_path(scope / "private/x", sandbox_dir=scope).allow
        assert check_path(scope / "public.txt", sandbox_dir=scope).allow
    finally:
        deny.pop_turn_denylist(token)


def test_symlink_escape_is_not_exempt(managed):
    data, scope = managed
    secret = data / "credentials"
    secret.mkdir()
    link = scope / "link"
    try:
        link.symlink_to(secret, target_is_directory=True)
    except OSError:
        pytest.skip("symlink creation unavailable")
    assert not check_path(link / "key", sandbox_dir=scope).allow
