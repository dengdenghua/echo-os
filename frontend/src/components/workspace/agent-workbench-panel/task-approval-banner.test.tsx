import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import type { EchoTaskProjection } from "@/appliance/task-space";
import { TaskApprovalBanner } from "./task-approval-banner";

const mock = vi.hoisted(() => ({
  tasks: [] as EchoTaskProjection[],
  decideApproval: vi.fn(),
  takeover: vi.fn(),
  resumeExecution: vi.fn(),
  refresh: vi.fn(),
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
  mock.tasks = [waitingTask()];
});

it("confirms one operation and submits its durable task id", async () => {
  render(<TaskApprovalBanner threadId="thread-1" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "批准", exact: true }));
  expect(mock.decideApproval).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "确认批准本次操作" }));
  expect(mock.decideApproval).toHaveBeenCalledExactlyOnceWith(
    "task-1",
    true,
    "工作台批准",
  );
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
