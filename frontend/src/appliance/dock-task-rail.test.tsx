import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DockTaskRail } from "./dock-task-rail";
import type { EchoTaskProjection } from "./task-space";

function makeTask(overrides: Partial<EchoTaskProjection>): EchoTaskProjection {
  return {
    id: "task",
    source: "echo-agent",
    threadId: "thread",
    parentTaskId: null,
    kind: "agent",
    title: "任务",
    summary: null,
    status: "running",
    displayStatus: "running",
    progressPercent: null,
    mode: "agent",
    agentId: "general",
    runtimeCapabilityGroups: [],
    capabilityDecisions: [],
    approval: null,
    activity: [],
    startedAt: "2026-10-09T01:00:00Z",
    updatedAt: "2026-10-09T01:30:00Z",
    completedAt: null,
    terminalReason: null,
    latestCheckpointId: null,
    ...overrides,
  };
}

const AGENTS = [{ id: "general", name: "Echo", icon: "🐙" }];

function renderRail(tasks: EchoTaskProjection[] | undefined) {
  const onOpenTask = vi.fn();
  const onOpenTaskSpace = vi.fn();
  render(
    <nav>
      <DockTaskRail
        tasks={tasks}
        agents={AGENTS}
        onOpenTask={onOpenTask}
        onOpenTaskSpace={onOpenTaskSpace}
      />
    </nav>,
  );
  return { onOpenTask, onOpenTaskSpace };
}

describe("DockTaskRail", () => {
  it("renders nothing while loading or when no task is live", () => {
    renderRail(undefined);
    renderRail([
      makeTask({ id: "done", status: "completed", displayStatus: "completed" }),
    ]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows live tasks with progress and opens their thread", () => {
    const running = makeTask({
      id: "run",
      title: "整理下载文件夹",
      progressPercent: 40,
    });
    const { onOpenTask } = renderRail([running]);
    const item = screen.getByRole("button", {
      name: "Echo：整理下载文件夹 · 执行中 40%",
    });
    expect(item.querySelector(".mac-dock-task")).toHaveClass("is-active");
    expect(item.querySelector(".mac-dock-running-dot")).not.toBeNull();
    fireEvent.click(item);
    expect(onOpenTask).toHaveBeenCalledWith(running);
  });

  it("marks tasks without progress as indeterminate instead of inventing a number", () => {
    renderRail([makeTask({ id: "run", title: "写周报" })]);
    const item = screen.getByRole("button", { name: "Echo：写周报 · 执行中" });
    expect(item.querySelector(".mac-dock-task")).toHaveClass(
      "is-indeterminate",
    );
  });

  it("puts tasks that need the user first and routes them to the task space", () => {
    const { onOpenTask, onOpenTaskSpace } = renderRail([
      makeTask({ id: "run", title: "整理下载文件夹" }),
      makeTask({
        id: "wait",
        title: "清理照片索引",
        status: "waiting_approval",
        displayStatus: "waiting_approval",
      }),
    ]);
    const items = screen.getAllByRole("button");
    expect(items[0]).toHaveAccessibleName("Echo：清理照片索引 · 待你批准");
    expect(items[0]!.querySelector(".mac-dock-task-badge")).toHaveTextContent(
      "!",
    );
    // 没有进度的待批准任务画满一圈，而不是一段像百分比的弧。
    expect(
      items[0]!
        .querySelector(".mac-dock-task-ring-value")!
        .getAttribute("stroke-dashoffset"),
    ).toBe("0");
    fireEvent.click(items[0]!);
    expect(onOpenTaskSpace).toHaveBeenCalledWith("wait");
    expect(onOpenTask).not.toHaveBeenCalled();
  });

  it("collapses overflow into a single entry that opens the task space", () => {
    const { onOpenTaskSpace } = renderRail(
      Array.from({ length: 5 }, (_, index) =>
        makeTask({ id: `t${index}`, title: `任务 ${index}` }),
      ),
    );
    expect(screen.getAllByRole("button")).toHaveLength(4);
    fireEvent.click(
      screen.getByRole("button", {
        name: "还有 2 个进行中的任务 · 打开任务空间",
      }),
    );
    expect(onOpenTaskSpace).toHaveBeenCalledWith();
  });
});
