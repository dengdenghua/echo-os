import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TVThread } from "./thread";
const mocks = vi.hoisted(() => ({
  live: vi.fn(),
  start: vi.fn(),
  resolve: vi.fn(),
  interrupt: vi.fn(),
}));
vi.mock("@/core/realtime/use-realtime-thread", () => ({
  useRealtimeThread: mocks.live,
}));
beforeEach(() => {
  mocks.start.mockReset();
  mocks.resolve.mockReset();
  mocks.interrupt.mockReset();
  mocks.live.mockReturnValue({
    connected: true,
    state: {
      resumeState: "resumed",
      hasMoreTurns: false,
      pendingApprovals: [],
      turns: [
        {
          id: "turn",
          status: "completed",
          items: [
            {
              id: "a",
              type: "agentMessage",
              text: "真实回复",
              status: "completed",
            },
            {
              id: "tool",
              type: "commandExecution",
              command: "uname -s",
              aggregatedOutput: "Linux",
              exitCode: 0,
              cwd: "/workspace",
              status: "completed",
            },
          ],
        },
      ],
    },
    startTurn: mocks.start,
    resolveApproval: mocks.resolve,
    interrupt: mocks.interrupt,
  });
});
it("keeps follow-up turns on the existing thread with on-request approval", async () => {
  mocks.start.mockResolvedValue(undefined);
  const back = vi.fn();
  render(
    <TVThread
      threadId="original"
      decideApproval={vi.fn()}
      onBack={back}
      onHistory={() => {}}
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "继续对话" }), {
    target: { value: "继续中文对话" },
  });
  fireEvent.click(screen.getByRole("button", { name: "发送消息" }));
  await vi.waitFor(() =>
    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "继续中文对话",
        approvalPolicy: "on-request",
        clientItemId: expect.stringMatching(/^itm_[A-Za-z0-9][A-Za-z0-9_-]*$/),
      }),
    ),
  );
  expect(mocks.live).toHaveBeenCalledWith({ threadId: "original" });
  fireEvent.click(
    screen.getByRole("button", { name: "任务详情", exact: true }),
  );
  expect(screen.getByLabelText("任务执行记录")).toHaveTextContent("uname -s");
  expect(screen.getByLabelText("任务执行记录")).toHaveTextContent("Linux");
  fireEvent.click(screen.getByRole("button", { name: "返回对话" }));
  expect(back).not.toHaveBeenCalled();
  expect(screen.getByLabelText("对话内容")).toHaveTextContent("真实回复");
});
it("does not approve implicitly and exposes explicit deny, approve and stop", () => {
  const data = mocks.live();
  data.state.turns[0].status = "inProgress";
  data.state.pendingApprovals = [
    { requestId: "permission", params: { command: "uname -s" } },
  ];
  mocks.live.mockReturnValue(data);
  mocks.interrupt.mockResolvedValue(undefined);
  render(
    <TVThread
      threadId="original"
      decideApproval={vi.fn()}
      onBack={() => {}}
      onHistory={() => {}}
    />,
  );
  expect(mocks.resolve).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "拒绝本次" }));
  expect(mocks.resolve).toHaveBeenLastCalledWith("permission", false);
  fireEvent.click(screen.getByRole("button", { name: "允许本次" }));
  expect(mocks.resolve).toHaveBeenLastCalledWith("permission", true);
  fireEvent.click(screen.getByRole("button", { name: "停止任务" }));
  expect(mocks.interrupt).toHaveBeenCalledOnce();
});
it("prevents sending while disconnected and reports recovery", () => {
  const data = mocks.live();
  data.connected = false;
  mocks.live.mockReturnValue(data);
  render(
    <TVThread
      threadId="original"
      decideApproval={vi.fn()}
      onBack={() => {}}
      onHistory={() => {}}
    />,
  );
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "不要丢失" },
  });
  expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("正在恢复连接");
});
