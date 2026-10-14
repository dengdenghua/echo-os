import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DecisionInbox, recentExpiredApprovals } from "./decision-inbox";
import {
  APPROVAL_NO_LONGER_PENDING,
  approvalDeadlineText,
  approvalDecisionErrorMessage,
} from "./task-approval-consent";
import type {
  EchoTaskProjection,
  EchoTaskProjectionResponse,
} from "./task-space";

vi.mock("@/core/auth/api", () => ({
  currentActorId: () => "local:admin",
  getToken: () => null,
  getAuthSessionRevision: () => 0,
}));

const NOW = Date.parse("2026-10-14T03:10:00Z");

const base: EchoTaskProjection = {
  id: "task-expired",
  source: "echo-agent",
  threadId: "thread-expired",
  parentTaskId: null,
  kind: "realtime_codex",
  title: "写入 hello.txt",
  summary: "在个人空间里创建 hello.txt",
  status: "cancelled",
  displayStatus: "cancelled",
  progressPercent: null,
  mode: null,
  agentId: "general",
  runtimeCapabilityGroups: [],
  capabilityDecisions: [],
  activity: [],
  approval: null,
  approvalExpired: {
    tool: "write_text_file",
    action: "ask",
    reason: "Codex 引擎请求使用 write_text_file：写入文件（高风险）",
    expiredAt: "2026-10-14T03:00:00Z",
  },
  canRerun: true,
  startedAt: null,
  updatedAt: "2026-10-14T03:00:05Z",
  completedAt: null,
  terminalReason: "codex_timeout",
  latestCheckpointId: null,
};

function projectionOf(tasks: EchoTaskProjection[]): EchoTaskProjectionResponse {
  return {
    schema: "echo.task_projection.v1",
    available: true,
    generatedAt: "now",
    tasks,
    counts: {
      total: tasks.length,
      active: 0,
      waitingApproval: 0,
      paused: 0,
      recoveryNeeded: 0,
      failed: tasks.length,
      completed: 0,
    },
    auditIntegrity: { available: true, ok: true, entriesChecked: 0 },
  };
}

function renderInbox(tasks: EchoTaskProjection[], onRerun = vi.fn()) {
  const props = {
    projection: projectionOf(tasks),
    loading: false,
    error: null,
    onClose: vi.fn(),
    onRefresh: vi.fn(),
    onOpenTask: vi.fn(),
    onDecision: vi.fn().mockResolvedValue(undefined),
    onRerun: onRerun.mockResolvedValue(undefined),
  };
  render(<DecisionInbox {...props} />);
  return props;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("approvals that ran out with the task's time limit", () => {
  it("says the approval expired instead of dropping it like a rejection", () => {
    renderInbox([base]);

    expect(screen.getByText("任务已超时，审批已失效")).toBeInTheDocument();
    expect(screen.getByText("写入 hello.txt")).toBeInTheDocument();
    expect(screen.getByText(/这次操作没有执行/)).toBeInTheDocument();
    expect(screen.queryByText("当前没有等待确认的操作")).toBeNull();
    expect(screen.queryByRole("button", { name: "批准操作" })).toBeNull();
  });

  it("re-runs the task from the inbox", async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    const props = renderInbox([base]);

    await user.click(screen.getByRole("button", { name: "重新运行" }));

    expect(props.onRerun).toHaveBeenCalledWith(base);
    expect(screen.getByRole("status")).toHaveTextContent("已重新运行");
    // The handled notice leaves the inbox.
    expect(screen.queryByText("任务已超时，审批已失效")).toBeNull();
  });

  it("waits for the task to finish before offering a re-run", () => {
    renderInbox([
      { ...base, status: "running", displayStatus: "running", canRerun: false },
    ]);

    expect(screen.getByRole("button", { name: "重新运行" })).toBeDisabled();
  });

  it("lets the owner remove the notice for good", async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderInbox([base]);

    await user.click(screen.getByRole("button", { name: "不再显示" }));

    expect(screen.getByText("当前没有等待确认的操作")).toBeInTheDocument();
    expect(recentExpiredApprovals([base], ["task-expired"], NOW)).toEqual([]);
  });

  it("keeps only the last day of expired approvals", () => {
    const old = {
      ...base,
      id: "old",
      approvalExpired: {
        ...base.approvalExpired!,
        expiredAt: "2026-10-12T00:00:00Z",
      },
    };
    expect(
      recentExpiredApprovals([base, old], [], NOW).map((t) => t.id),
    ).toEqual(["task-expired"]);
  });

  it("shows how long a pending approval can still wait", () => {
    renderInbox([
      {
        ...base,
        id: "pending",
        status: "waiting_approval",
        displayStatus: "waiting_approval",
        approvalExpired: null,
        canRerun: false,
        approval: {
          required: true,
          version: "a".repeat(64),
          tool: "write_text_file",
          action: "ask",
          reason: "写入文件",
          expiresAt: "2026-10-14T03:33:00Z",
        },
      },
    ]);

    expect(screen.getByText(/前确认（还剩 23 分钟）/)).toBeInTheDocument();
  });
});

describe("approval deadline copy", () => {
  it("counts down to the task's time limit", () => {
    expect(approvalDeadlineText("2026-10-14T03:33:00Z", NOW)).toMatch(
      /^请在 \d{2}:\d{2} 前确认（还剩 23 分钟）$/,
    );
    expect(approvalDeadlineText("2026-10-14T05:20:00Z", NOW)).toContain(
      "还剩 2 小时 10 分钟",
    );
    expect(approvalDeadlineText("2026-10-14T03:00:00Z", NOW)).toBe(
      "已到任务时限，审批即将失效",
    );
    expect(approvalDeadlineText(null, NOW)).toBeNull();
  });

  it("explains a late answer instead of a generic failure", () => {
    expect(
      approvalDecisionErrorMessage("task is not waiting for approval"),
    ).toBe(APPROVAL_NO_LONGER_PENDING);
  });
});
