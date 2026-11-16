import gc
from pathlib import Path

from runtime.execution.suckers.fs_search_skills import _glob_files, register_fs_search_skills
from runtime.execution.suckers.registry import SkillRegistry


def test_startup_checks_do_not_scan_private_service_cwd(tmp_path, monkeypatch):
    private = tmp_path / "private"
    private.mkdir()
    monkeypatch.chdir(private)
    monkeypatch.setenv("ECHO_PATH_DENYLIST_PATH", str(tmp_path / "deny.json"))
    from runtime.safety.auth.path_denylist import add_user_denylist_entry

    add_user_denylist_entry(str(private))
    registry = SkillRegistry()
    assert register_fs_search_skills(registry) == 4
    assert "error" in _glob_files(pattern="*.py", root=str(private))
    skill = registry.get("glob_files")
    probe = Path(skill.tests[1].args["root"])
    assert probe.exists() and probe != private
    public = tmp_path / "public"
    public.mkdir()
    (public / "probe.py").write_text("print(1)")
    result = _glob_files(pattern="*.py", root=str(public))
    assert result["count"] == 1
    del registry
    gc.collect()
    assert not probe.exists()
