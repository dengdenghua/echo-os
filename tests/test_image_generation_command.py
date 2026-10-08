"""Operator image templates preserve quoted placeholders without shell expansion."""

import subprocess
from pathlib import Path

import pytest

from runtime.execution.misc import image_generation as ig


@pytest.mark.parametrize(
    "prompt",
    [
        "cat $(touch marker) and backticks `touch marker`",
        'text "&calc&" with %PATH% ^ !x!',
        "text; redirect > file | command",
        'it\'s a "quoted" mix with ${output} and $prompt',
    ],
)
def test_legacy_quoted_template_keeps_user_values_as_literal_arguments(
    tmp_path, monkeypatch, prompt
):
    captured = {}

    def run(argv, **kwargs):
        captured.update(argv=argv, **kwargs)
        (tmp_path / "reference.png").write_bytes(b"PNG")
        return subprocess.CompletedProcess(argv, 0, "", "")

    monkeypatch.setattr(ig.subprocess, "run", run)
    monkeypatch.setattr(ig.shutil, "which", lambda _: None)
    monkeypatch.setenv(
        "ECHO_IMAGE_GEN_COMMAND",
        'generator --prompt "$prompt" --name "${display_name}" --out "$output"',
    )
    ig._generate_with_command(
        provider="custom-command",
        prompt=prompt,
        agent_id="agent",
        display_name="Name with spaces",
        output_dir=tmp_path,
    )
    assert captured["shell"] is False
    assert captured["argv"] == [
        "generator",
        "--prompt",
        prompt,
        "--name",
        "Name with spaces",
        "--out",
        str(tmp_path / "reference.png"),
    ]
    assert captured["env"]["ECHO_IMAGE_GEN_PROMPT"] == prompt
    assert captured["env"]["ECHO_IMAGE_GEN_OUTPUT_DIR"] == str(tmp_path)


def test_windows_batch_wrapper_rejects_metacharacters_before_start(monkeypatch):
    monkeypatch.setattr(ig.shutil, "which", lambda _: r"C:\tools\generator.cmd")
    monkeypatch.setattr(ig.os, "name", "nt")
    with pytest.raises(RuntimeError, match="cmd.exe metacharacters"):
        ig._command_template_argv(
            'generator --prompt "$prompt"',
            {"prompt": 'unsafe "&" text', "agent_id": "a", "display_name": "A"},
        )
    assert ig._command_template_argv(
        'generator --prompt "$prompt"',
        {"prompt": "a calm cat", "agent_id": "a", "display_name": "A"},
    ) == [r"C:\tools\generator.cmd", "--prompt", "a calm cat"]


def test_windows_executable_path_with_spaces_and_backslashes_is_preserved(monkeypatch):
    monkeypatch.setattr(ig.os, "name", "nt")
    monkeypatch.setattr(ig.shutil, "which", lambda _: None)
    assert ig._command_template_argv(
        r'"C:\Program Files\Image\generator.exe" --prompt "$prompt"',
        {"prompt": "quoted text"},
    ) == [r"C:\Program Files\Image\generator.exe", "--prompt", "quoted text"]


@pytest.mark.parametrize("template", ["  ", '"unterminated'])
def test_invalid_operator_template_is_rejected(template):
    with pytest.raises(RuntimeError, match="ECHO_IMAGE_GEN_COMMAND"):
        ig._command_template_argv(template, {})


def test_missing_executable_has_a_clear_error(tmp_path: Path, monkeypatch):
    def fail(*args, **kwargs):
        raise FileNotFoundError("synthetic missing executable")

    monkeypatch.setenv("ECHO_IMAGE_GEN_COMMAND", 'missing --prompt "$prompt"')
    monkeypatch.setattr(ig.shutil, "which", lambda _: None)
    monkeypatch.setattr(ig.subprocess, "run", fail)
    with pytest.raises(RuntimeError, match="could not start"):
        ig._generate_with_command(
            provider="custom-command",
            prompt="hello",
            agent_id="a",
            display_name="A",
            output_dir=tmp_path,
        )
