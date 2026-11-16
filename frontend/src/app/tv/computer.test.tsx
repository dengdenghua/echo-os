import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/harness";
import { TVComputer } from "./computer";

const start = vi.hoisted(() => vi.fn());
vi.mock("@/appliance/task-space", () => ({
  useEchoTaskProjection: () => ({
    projection: { tasks: [] },
    refresh: vi.fn(),
  }),
  startEchoTask: start,
}));
let current: {
  running: boolean;
  controller: string;
  generation: string;
  threads: string[];
  activity: unknown[];
};
let calls: { path: string; body: Record<string, unknown> }[];
let focusedEditable = false;
beforeEach(() => {
  current = {
    running: true,
    controller: "agent",
    generation: "a",
    threads: [],
    activity: [],
  };
  calls = [];
  focusedEditable = false;
  start.mockReset().mockResolvedValue({ thread_id: "t1" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      if (init?.method === "POST") {
        calls.push({ path: url, body });
        if (url.endsWith("/start"))
          current = { ...current, running: true, controller: "paused" };
        if (url.endsWith("/stop")) current = { ...current, running: false };
        if (url.endsWith("/control"))
          current = {
            ...current,
            controller: body.controller,
            generation: "b",
          };
      }
      return {
        ok: true,
        json: async () => ({ ...current, focusedEditable }),
        blob: async () => new Blob(),
      };
    }),
  );
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

it("opening and minimizing only observes; never takes control or stops the task", async () => {
  const close = vi.fn();
  renderWithProviders(<TVComputer onClose={close} onThread={vi.fn()} />);
  await screen.findByText("Echo 可操作");
  expect(calls).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "更多电脑操作" }));
  fireEvent.click(screen.getByRole("button", { name: "收起电脑窗口" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Echo 的电脑/ }));
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "关闭电脑窗口" }));
  expect(close).toHaveBeenCalledOnce();
  expect(calls).toHaveLength(0);
});

it("requires explicit takeover and stamps Chinese input with the current generation", async () => {
  renderWithProviders(<TVComputer onClose={vi.fn()} onThread={vi.fn()} />);
  expect(
    screen.queryByRole("textbox", { name: "输入到电脑" }),
  ).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "我来接管" }));
  fireEvent.click(screen.getByRole("button", { name: "更多电脑操作" }));
  fireEvent.click(await screen.findByRole("button", { name: "电脑键盘" }));
  const text = await screen.findByRole("textbox", { name: "输入到电脑" });
  fireEvent.change(text, { target: { value: "中文交接" } });
  fireEvent.click(screen.getByRole("button", { name: "输入", exact: true }));
  await waitFor(() =>
    expect(
      calls.some(
        (c) => c.body.text === "中文交接" && c.body.generation === "b",
      ),
    ).toBe(true),
  );
});

it("starts work through the existing Agent with the computer binding flag", async () => {
  renderWithProviders(<TVComputer onClose={vi.fn()} onThread={vi.fn()} />);
  await screen.findByText("Echo 可操作");
  fireEvent.click(screen.getByRole("button", { name: "更多电脑操作" }));
  fireEvent.click(screen.getByRole("button", { name: "任务", exact: true }));
  fireEvent.change(screen.getByRole("textbox", { name: "交给 Echo" }), {
    target: { value: "整理笔记" },
  });
  fireEvent.click(screen.getByRole("button", { name: "开始任务" }));
  await waitFor(() =>
    expect(start).toHaveBeenCalledWith("整理笔记", undefined, true),
  );
});

it("opens the computer automatically once but never silently takes control", async () => {
  current.running = false;
  renderWithProviders(<TVComputer onClose={vi.fn()} onThread={vi.fn()} />);
  await screen.findByText("电脑已就绪");
  expect(calls.filter((c) => c.path.endsWith("/start"))).toHaveLength(1);
  expect(calls.some((c) => c.path.endsWith("/control"))).toBe(false);
  expect(screen.getByRole("button", { name: "我来接管" })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "交还 Echo" }),
  ).not.toBeInTheDocument();
});

it("shows only one primary control and reveals typing after clicking an editable field", async () => {
  current.controller = "human";
  focusedEditable = true;
  const view = renderWithProviders(
    <TVComputer onClose={vi.fn()} onThread={vi.fn()} />,
  );
  await screen.findByText("你正在操作");
  expect(
    within(
      view.container.querySelector(".tv-computer-toolbar") as HTMLElement,
    ).getAllByRole("button"),
  ).toHaveLength(1);
  expect(
    screen.queryByRole("button", { name: "停止会话" }),
  ).not.toBeInTheDocument();
  const frame = screen.getByRole("button", {
    name: "电脑画面，确认后操作指针",
  });
  fireEvent.click(frame, { detail: 1, clientX: 50, clientY: 50 });
  expect(
    await screen.findByRole("textbox", { name: "输入到电脑" }),
  ).toHaveFocus();
});

it("does not undo an explicit stop with another automatic start", async () => {
  renderWithProviders(<TVComputer onClose={vi.fn()} onThread={vi.fn()} />);
  await screen.findByText("Echo 可操作");
  fireEvent.click(screen.getByRole("button", { name: "更多电脑操作" }));
  fireEvent.click(screen.getByRole("button", { name: "停止会话" }));
  await screen.findByText("电脑未打开");
  await new Promise((resolve) => setTimeout(resolve, 1100));
  expect(calls.filter((c) => c.path.endsWith("/start"))).toHaveLength(0);
});
