import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DecisionInbox } from "./decision-inbox";
import { SystemAppWindowProvider } from "./system-app-window";
import type {
  EchoTaskProjection,
  EchoTaskProjectionResponse,
} from "./task-space";

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
const task: EchoTaskProjection = {
  id: "task",
  source: "echo-agent",
  threadId: "thread",
  parentTaskId: null,
  kind: "loop",
  title: "启动服务",
  summary: null,
  status: "waiting_approval",
  displayStatus: "waiting_approval",
  progressPercent: null,
  mode: null,
  agentId: "eve",
  runtimeCapabilityGroups: [],
  capabilityDecisions: [],
  activity: [],
  approval: {
    required: true,
    version: "a".repeat(64),
    tool: "apps.start",
    action: "start",
    reason: "请确认目标服务",
  },
  startedAt: null,
  updatedAt: null,
  completedAt: null,
  terminalReason: null,
  latestCheckpointId: null,
};
const projection: EchoTaskProjectionResponse = {
  schema: "echo.task_projection.v1",
  available: true,
  generatedAt: "now",
  tasks: [task],
  counts: {
    total: 1,
    active: 0,
    waitingApproval: 1,
    paused: 0,
    recoveryNeeded: 0,
    failed: 0,
    completed: 0,
  },
  auditIntegrity: { available: true, ok: true, entriesChecked: 0 },
};
const props = () => ({
  projection,
  loading: false,
  error: null,
  onClose: vi.fn(),
  onRefresh: vi.fn(),
  onOpenTask: vi.fn(),
  onDecision: vi.fn().mockResolvedValue(undefined),
});
beforeEach(() => {
  auth.actor = "alice";
  auth.token = "session-a";
  auth.revision = 0;
});

describe("Decision inbox", () => {
  it("contains keyboard focus in review and lets Escape cancel without executing", async () => {
    const user = userEvent.setup();
    const callbacks = props();
    render(<DecisionInbox {...callbacks} />);
    const approve = screen.getByRole("button", { name: "批准操作" });
    await user.click(approve);
    expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "确认" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(approve).toHaveFocus();
    expect(callbacks.onDecision).not.toHaveBeenCalled();
  });
  it("reviews a request and submits its version to the original task", async () => {
    const user = userEvent.setup();
    const callbacks = props();
    render(
      <SystemAppWindowProvider>
        <DecisionInbox {...callbacks} />
      </SystemAppWindowProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "打开原任务" }));
    expect(callbacks.onOpenTask).toHaveBeenCalledWith(task);
    await user.click(screen.getByRole("button", { name: "批准操作" }));
    expect(callbacks.onDecision).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("请确认目标服务");
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(callbacks.onDecision).toHaveBeenCalledWith(
      "task",
      true,
      "设备管理员从审批收件箱批准任务操作",
      "a".repeat(64),
    );
    // onDecision 自己刷新投影；收件箱不再重复触发一次轮询。
    expect(callbacks.onRefresh).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("操作已批准");
  });
  it("closes review and reports a session change during submission", async () => {
    const user = userEvent.setup();
    const callbacks = props();
    callbacks.onDecision.mockImplementation(async () => {
      auth.token = "session-b";
    });
    render(<DecisionInbox {...callbacks} />);
    await user.click(screen.getByRole("button", { name: "批准操作" }));
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(callbacks.onDecision).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("提交期间");
    expect(screen.queryByText("操作已批准")).toBeNull();
  });
  it("leaves blocked waits out and describes requests without tool details", () => {
    const callbacks = props();
    render(
      <DecisionInbox
        {...callbacks}
        projection={{
          ...projection,
          tasks: [
            {
              ...task,
              id: "blocked",
              title: "能力已停用的任务",
              approval: { ...task.approval!, required: false },
            },
            {
              ...task,
              approval: { ...task.approval!, tool: null, action: null },
            },
          ],
        }}
      />,
    );
    expect(screen.queryByText("能力已停用的任务")).toBeNull();
    expect(screen.getByText("任务正在等待管理员确认")).toBeInTheDocument();
    expect(screen.queryByText("·", { exact: false })).toBeNull();
  });
  it.each(["operation", "actor", "credential", "cookie-session", "removed"])(
    "does not approve after %s changes while reviewing",
    async (change) => {
      const user = userEvent.setup();
      const callbacks = props();
      const { rerender } = render(<DecisionInbox {...callbacks} />);
      await user.click(screen.getByRole("button", { name: "批准操作" }));
      if (change === "actor") auth.actor = "bob";
      if (change === "credential") auth.token = "session-b";
      if (change === "cookie-session") auth.revision += 1;
      const tasks =
        change === "removed"
          ? []
          : change === "operation"
            ? [
                {
                  ...task,
                  approval: {
                    ...task.approval!,
                    version: "b".repeat(64),
                    tool: "files.delete",
                  },
                },
              ]
            : [task];
      rerender(
        <DecisionInbox {...callbacks} projection={{ ...projection, tasks }} />,
      );
      await user.click(screen.getByRole("button", { name: "确认" }));
      expect(callbacks.onDecision).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(/重新/);
    },
  );
  it("shows a readable empty state and disables unversioned approvals", () => {
    const callbacks = props();
    const { rerender } = render(
      <DecisionInbox
        {...callbacks}
        projection={{ ...projection, tasks: [] }}
      />,
    );
    expect(screen.getByText("当前没有等待确认的操作")).toBeInTheDocument();
    rerender(
      <DecisionInbox
        {...callbacks}
        projection={{
          ...projection,
          tasks: [{ ...task, approval: { ...task.approval!, version: null } }],
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "批准操作" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "拒绝操作" })).toBeDisabled();
  });
  it("keeps a rejected server decision recoverable", async () => {
    const user = userEvent.setup();
    const callbacks = props();
    callbacks.onDecision.mockRejectedValue(
      new Error("approval request changed"),
    );
    render(<DecisionInbox {...callbacks} />);
    await user.click(screen.getByRole("button", { name: "拒绝操作" }));
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "approval request changed",
    );
    expect(callbacks.onRefresh).not.toHaveBeenCalled();
  });
});
