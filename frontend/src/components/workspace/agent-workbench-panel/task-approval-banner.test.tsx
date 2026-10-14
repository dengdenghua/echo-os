import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import {
  APPROVAL_SESSION_CHANGED_AFTER_SUBMIT,
  APPROVAL_UNVERIFIABLE,
} from "@/appliance/task-approval-consent";
import type { EchoTaskProjection } from "@/appliance/task-space";
import { TaskApprovalBanner } from "./task-approval-banner";

const VERSION = "a".repeat(64);
const auth = vi.hoisted(() => ({
  actor: "alice",
  token: "session-a",
  revision: 0,
}));
vi.mock("@/core/auth/api", () => ({
  currentActorId: () => auth.actor,
  getToken: () => auth.token,
  getAuthSessionRevision: () => auth.revision,
}));
const mock = vi.hoisted(() => ({
  tasks: [] as EchoTaskProjection[],
  decideApproval: vi.fn(),
  takeover: vi.fn(),
  resumeExecution: vi.fn(),
  refresh: vi.fn(),
  rerun: vi.fn(),
}));
vi.mock("@/appliance/task-space", () => ({
  useEchoTaskProjection: () => ({ projection: { tasks: mock.tasks }, ...mock }),
}));

function waitingTask(): EchoTaskProjection {
  return {
    id: "task-1",
    source: "echo-agent",
    threadId: "thread-1",
    parentTaskId: null,
    kind: "task",
    title: "启动服务",
    summary: null,
    status: "waiting_approval",
    displayStatus: "waiting_approval",
    progressPercent: null,
    mode: null,
    agentId: null,
    runtimeCapabilityGroups: [],
    capabilityDecisions: [],
    activity: [],
    approval: {
      required: true,
      version: VERSION,
      tool: "shell",
      action: "confirm",
      reason: "启动本机服务",
    },
    startedAt: null,
    updatedAt: null,
    completedAt: null,
    terminalReason: null,
    latestCheckpointId: null,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  auth.actor = "alice";
  auth.token = "session-a";
  auth.revision = 0;
  mock.tasks = [waitingTask()];
  window.localStorage.clear();
});

it("words a request without a reason by its tool, not its internal id", () => {
  mock.tasks = [
    {
      ...waitingTask(),
      approval: {
        ...waitingTask().approval!,
        tool: "exec_shell",
        reason: null,
      },
    },
  ];
  render(<TaskApprovalBanner threadId="thread-1" />);

  expect(
    screen.getByText("Agent 请求运行命令，需要你授权"),
  ).toBeInTheDocument();
  expect(screen.queryByText("exec_shell")).not.toBeInTheDocument();
});

it("submits the approval version the user reviewed", async () => {
  render(<TaskApprovalBanner threadId="thread-1" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "批准", exact: true }));
  expect(mock.decideApproval).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "确认批准本次操作" }));
  expect(mock.decideApproval).toHaveBeenCalledExactlyOnceWith(
    "task-1",
    true,
    "工作台批准",
    VERSION,
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("refuses to submit when the request changed after review", async () => {
  const { rerender } = render(<TaskApprovalBanner threadId="thread-1" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "批准", exact: true }));
  const changed = waitingTask();
  changed.approval = {
    ...changed.approval!,
    version: "b".repeat(64),
    reason: "删除本机数据",
  };
  mock.tasks = [changed];
  rerender(<TaskApprovalBanner threadId="thread-1" />);
  await user.click(screen.getByRole("button", { name: "确认批准本次操作" }));
  expect(mock.decideApproval).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("审批内容已变化");
  expect(mock.refresh).toHaveBeenCalledOnce();
  // 旧的确认作废，必须重新审阅新请求。
  expect(
    screen.queryByRole("button", { name: "确认批准本次操作" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "批准", exact: true }));
  await user.click(screen.getByRole("button", { name: "确认批准本次操作" }));
  expect(mock.decideApproval).toHaveBeenCalledExactlyOnceWith(
    "task-1",
    true,
    "工作台批准",
    "b".repeat(64),
  );
});

it("does not offer a decision for an unversioned approval", () => {
  mock.tasks[0]!.approval!.version = null;
  render(<TaskApprovalBanner threadId="thread-1" />);
  expect(
    screen.getByRole("button", { name: "批准", exact: true }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "拒绝", exact: true }),
  ).toBeDisabled();
  expect(screen.getByText(APPROVAL_UNVERIFIABLE)).toBeInTheDocument();
});

it("hides waits that no operator decision can release", () => {
  mock.tasks[0]!.approval!.required = false;
  render(<TaskApprovalBanner threadId="thread-1" />);
  expect(
    screen.queryByRole("region", { name: "任务审批" }),
  ).not.toBeInTheDocument();
});

it("shows decision errors and refreshes stale approval state", async () => {
  mock.decideApproval.mockRejectedValue(new Error("审批状态已经变化"));
  render(<TaskApprovalBanner threadId="thread-1" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "拒绝", exact: true }));
  await user.click(screen.getByRole("button", { name: "确认拒绝本次操作" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "审批状态已经变化",
  );
  expect(mock.refresh).toHaveBeenCalledOnce();
});

it("reports a session change during submission", async () => {
  mock.decideApproval.mockImplementation(async () => {
    auth.token = "session-b";
  });
  render(<TaskApprovalBanner threadId="thread-1" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "拒绝", exact: true }));
  await user.click(screen.getByRole("button", { name: "确认拒绝本次操作" }));
  expect(mock.decideApproval).toHaveBeenCalledExactlyOnceWith(
    "task-1",
    false,
    "工作台拒绝",
    VERSION,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    APPROVAL_SESSION_CHANGED_AFTER_SUBMIT,
  );
});

it("recovers an expired worker through takeover and a new execution", async () => {
  mock.tasks[0]!.leaseHealth = {
    state: "expired",
    recoveryNeeded: true,
    canTakeover: true,
    canResume: false,
    recommendedAction: "takeover",
    reason: null,
  };
  mock.tasks[0]!.executionRecovery = {
    checkpointAvailable: true,
    canStart: false,
    requiresTakeover: true,
    checkpointId: 1,
    iteration: 0,
    phase: null,
    reason: "worker expired",
  };
  render(<TaskApprovalBanner threadId="thread-1" />);
  expect(
    screen.queryByRole("button", { name: "批准", exact: true }),
  ).not.toBeInTheDocument();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "恢复任务" }));
  expect(mock.takeover).toHaveBeenCalledExactlyOnceWith(
    "task-1",
    "工作台恢复中断任务",
  );
  expect(mock.resumeExecution).toHaveBeenCalledExactlyOnceWith(
    "task-1",
    "恢复已保存的任务；操作需要重新审批",
  );
  expect(mock.decideApproval).not.toHaveBeenCalled();
});

it("does not show another thread's approval", () => {
  render(<TaskApprovalBanner threadId="other-thread" />);
  expect(
    screen.queryByRole("region", { name: "任务审批" }),
  ).not.toBeInTheDocument();
});

function expiredTask(canRerun = true): EchoTaskProjection {
  return {
    ...waitingTask(),
    status: canRerun ? "cancelled" : "running",
    displayStatus: canRerun ? "cancelled" : "running",
    approval: null,
    approvalExpired: {
      tool: "shell",
      action: "confirm",
      reason: "启动本机服务",
      expiredAt: "2026-10-14T03:00:00Z",
    },
    canRerun,
  };
}

it("says an approval that outlived the task expired, with a re-run", async () => {
  mock.tasks = [expiredTask()];
  mock.rerun.mockResolvedValue({ threadId: "t-new" });
  render(<TaskApprovalBanner threadId="thread-1" />);
  const user = userEvent.setup();

  expect(screen.getByText(/任务已超时，审批已失效/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "批准", exact: true }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "重新运行" }));

  expect(mock.rerun).toHaveBeenCalledExactlyOnceWith("task-1");
  expect(screen.getByRole("status")).toHaveTextContent("已重新运行");
});

it("offers the re-run only once the expired task has wrapped up", async () => {
  mock.tasks = [expiredTask(false)];
  render(<TaskApprovalBanner threadId="thread-1" />);
  const user = userEvent.setup();

  expect(screen.getByRole("button", { name: "重新运行" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "知道了" }));
  expect(
    screen.queryByRole("region", { name: "任务审批" }),
  ).not.toBeInTheDocument();
});

it("explains a late answer to an approval that already ended", async () => {
  mock.decideApproval.mockRejectedValue(
    new Error("task is not waiting for approval"),
  );
  render(<TaskApprovalBanner threadId="thread-1" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "批准", exact: true }));
  await user.click(screen.getByRole("button", { name: "确认批准本次操作" }));
  expect(screen.getByRole("alert")).toHaveTextContent("这个审批已经结束");
});
