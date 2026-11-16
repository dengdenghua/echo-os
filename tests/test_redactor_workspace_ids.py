import pytest

from runtime.platform.observability.redactor import Redactor


@pytest.mark.parametrize(
    "value",
    [
        "/home/echo/workspaces/6260c5da8ea13800138000/60439958cb4224fe64402e43/thread",
        "task_a13800138000b",
        "sha256=60439958cb4224fe64402e43",
    ],
)
def test_opaque_workspace_ids_remain_exact(value):
    assert Redactor().redact(value) == value


@pytest.mark.parametrize(
    "value",
    [
        "电话：13800138000。",
        "phone: +86 13800138000",
        "call (415) 555-2671",
        "/contacts/13800138000/note.txt",
    ],
)
def test_actual_phone_numbers_are_still_scrubbed(value):
    assert "[REDACTED:phone]" in Redactor().redact(value)
