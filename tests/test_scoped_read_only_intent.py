import pytest

from runtime.core.cerebrum.react_explicit_reads import _explicit_read_only_goal


@pytest.mark.parametrize(
    "goal",
    [
        "创建验收.txt 并读回，不修改其他文件或系统设置。",
        "写入结果.json，不要修改 其余文件。",
        "Create acceptance.txt; do not modify any other files.",
        "Update result.txt; never delete unrelated files.",
    ],
)
def test_bounded_write_is_not_global_read_only(goal):
    assert not _explicit_read_only_goal(goal)


@pytest.mark.parametrize(
    "goal",
    [
        "读取文件，不修改文件",
        "只读调研，严禁修改任何文件",
        "只读检查，创建报告但不要创建文件",
        "不修改其他文件",
        "Read-only inspection. Create a plan; do not modify any files.",
        "Do not edit files",
        "Review this, never delete unrelated files.",
    ],
)
def test_global_or_unqualified_prohibition_stays_read_only(goal):
    assert _explicit_read_only_goal(goal)
