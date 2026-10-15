import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentTraceTaskRun } from "@/core/agent-trace/api";
import { renderWithProviders } from "@/test/harness";

const mocks = vi.hoisted(() => ({
  fetchAgentTraceTaskRuns: vi.fn(),
  useModels: vi.fn(),
  useTasks: vi.fn(),
}));

vi.mock("@/core/agent-trace/api", () => ({
  fetchAgentTraceTaskRuns: mocks.fetchAgentTraceTaskRuns,
}));
vi.mock("@/core/models/hooks", () => ({ useModels: mocks.useModels }));
vi.mock("@/core/tasks/hooks", () => ({ useTasks: mocks.useTasks }));

import {
  OwnerHealthSummary,
  connectedModelCount,
  ownerRunStatus,
  ownerTodos,
  ownerVerdict,
  toOwnerRuns,
} from "./owner-summary";

const NOW = Date.now();
const minutesAgo = (minutes: number) =>
  new Date(NOW - minutes * 60_000).toISOString();

function run(overrides: Partial<AgentTraceTaskRun>): AgentTraceTaskRun {
  return {
    task_id: "task-1",
    thread_id: "thread-1",
    title: "整理本周周报",
    status: "completed",
    updated_at: minutesAgo(5),
    tool_calls_started: 2,
    token_totals: { input_tokens: 120, output_tokens: 80 },
    ...overrides,
  };
}

const STUB_MODEL = {
  id: "stub-chat",
  name: "stub-chat",
  display_name: "stub-chat",
  custom: true,
  entry_id: "local-stub",
};
const ECHO_MIX = { id: "echo-mix", name: "echo-mix", display_name: "mix" };

function mockModels(models: object[]) {
  mocks.useModels.mockReturnValue({
    models,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
}

function mockTasks(data: object = { active: [], pending: [], paused: [] }) {
  mocks.useTasks.mockReturnValue({ data, refetch: vi.fn() });
}

function mockHealth(body: object = { status: "ok" }, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, status: ok ? 200 : 503, json: async () => body })),
  );
}

describe("owner health derivation", () => {
  it("counts connected models, not the virtual Echo Mix router", () => {
    expect(connectedModelCount([ECHO_MIX] as never)).toBe(0);
    expect(
      connectedModelCount([
        ECHO_MIX,
        STUB_MODEL,
        { ...STUB_MODEL, id: "stub-chat::1m" },
      ] as never),
    ).toBe(1);
  });

  it("calls a model-less failure 未开始, and a real failure a failure", () => {
    const neverStarted = run({
      status: "failed",
      tool_calls_started: 0,
      token_totals: {},
    });
    expect(ownerRunStatus(neverStarted, false)).toBe("notStarted");
    expect(ownerRunStatus(neverStarted, true)).toBe("failed");
    expect(ownerRunStatus(run({ status: "failed" }), false)).toBe("failed");
    expect(ownerRunStatus(run({ status: "weird" }), true)).toBe("unknown");
    // A run with no trace activity for over half an hour is not running.
    expect(
      ownerRunStatus(
        run({ status: "running", updated_at: minutesAgo(5) }),
        true,
      ),
    ).toBe("running");
    expect(
      ownerRunStatus(
        run({ status: "running", updated_at: minutesAgo(4 * 60) }),
        true,
      ),
    ).toBe("stalled");
  });

  it("leaves out bookkeeping rows that are not tasks", () => {
    const runs = toOwnerRuns(
      [
        run({ task_id: "real" }),
        run({
          task_id: "budget-only",
          thread_id: null,
          title: "",
          status: "running",
        }),
      ],
      true,
      "未命名任务",
    );
    expect(runs.map((item) => item.id)).toEqual(["real"]);
  });

  it("lists only the latest, recent failure of each conversation", () => {
    const runs = toOwnerRuns(
      [
        run({ task_id: "a2", status: "completed", updated_at: minutesAgo(1) }),
        run({ task_id: "a1", status: "failed", updated_at: minutesAgo(9) }),
        run({
          task_id: "b1",
          thread_id: "thread-2",
          status: "failed",
          title: "",
          updated_at: minutesAgo(3),
        }),
        run({
          task_id: "c1",
          thread_id: "thread-3",
          status: "failed",
          updated_at: minutesAgo(3 * 24 * 60),
        }),
      ],
      true,
      "未命名任务",
    );
    const todos = ownerTodos({
      hasModel: true,
      modelsKnown: true,
      restartRequired: false,
      tasks: undefined,
      runs,
      now: NOW,
    });
    expect(todos).toEqual([
      {
        kind: "failed",
        run: expect.objectContaining({ id: "b1", title: "未命名任务" }),
      },
    ]);
    expect(
      ownerVerdict({ healthLoading: false, healthError: false, todos, runs }),
    ).toBe("attention");
  });

  it("puts setup first and reports an unreachable backend as offline", () => {
    const todos = ownerTodos({
      hasModel: false,
      modelsKnown: true,
      restartRequired: true,
      tasks: {
        paused: [
          {
            task_id: "t",
            thread_id: "thread-9",
            reason: "approval_required",
            requested_at: 0,
            requested_by: "",
            note: "",
            agent_id: "general",
          },
        ],
      },
      runs: [],
      now: NOW,
    });
    expect(todos.map((todo) => todo.kind)).toEqual([
      "add-model",
      "restart",
      "waiting",
    ]);
    expect(
      ownerVerdict({
        healthLoading: false,
        healthError: false,
        todos,
        runs: [],
      }),
    ).toBe("needs-model");
    expect(
      ownerVerdict({
        healthLoading: false,
        healthError: true,
        todos,
        runs: [],
      }),
    ).toBe("offline");
    expect(
      ownerVerdict({
        healthLoading: false,
        healthError: false,
        todos: [],
        runs: [],
      }),
    ).toBe("idle");
  });
});

describe("<OwnerHealthSummary />", () => {
  beforeEach(() => {
    mockTasks();
    mockHealth();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("tells a fresh owner to connect a model, in Chinese and without alarm colours", async () => {
    mockModels([ECHO_MIX]);
    mocks.fetchAgentTraceTaskRuns.mockResolvedValue([
      run({ status: "failed", tool_calls_started: 0, token_totals: {} }),
    ]);

    renderWithProviders(<OwnerHealthSummary />, { locale: "zh-CN" });

    expect(
      await screen.findByRole("heading", { name: "还没有连接模型" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "添加模型" })).toBeVisible();
    const recent = screen.getByRole("heading", { name: "最近运行" })
      .parentElement as HTMLElement;
    expect(await within(recent).findByText("未开始")).toBeVisible();
    const summary = screen.getByTestId("observability-owner-summary");
    expect(summary.innerHTML).not.toMatch(/bg-destructive|text-destructive/);
    // Owner copy only: no engine names, no English diagnostics.
    expect(summary).not.toHaveTextContent(/Codex|Claude|OpenClaw|Hermes/);
    expect(summary.textContent?.replaceAll("Echo", "")).not.toMatch(
      /[A-Za-z]{3,}/,
    );
  });

  it("names a real failure and links back to its conversation", async () => {
    mockModels([ECHO_MIX, STUB_MODEL]);
    mocks.fetchAgentTraceTaskRuns.mockResolvedValue([
      run({
        task_id: "t-fail",
        thread_id: "thread-fail",
        title: "整理照片库",
        status: "failed",
      }),
      run({ task_id: "t-ok", thread_id: "thread-ok", title: "写周报" }),
    ]);

    renderWithProviders(<OwnerHealthSummary />, { locale: "zh-CN" });

    expect(
      await screen.findByRole("heading", { name: "有 1 件事需要你处理" }),
    ).toBeVisible();
    expect(screen.getByText("「整理照片库」没有完成")).toBeVisible();
    expect(
      screen.getAllByRole("link", { name: /打开对话/ })[0],
    ).toHaveAttribute("href", "/workspace/realtime/thread-fail");
    const failedTile = screen.getByText("未完成", { selector: "dt" })
      .nextElementSibling as HTMLElement;
    expect(failedTile).toHaveTextContent("1");
    expect(failedTile.className).toContain("text-destructive");
    const completedTile = screen.getByText("已完成", { selector: "dt" })
      .nextElementSibling as HTMLElement;
    expect(completedTile.className).not.toMatch(/success|destructive|warning/);
  });

  it("says Echo is healthy when everything finished", async () => {
    mockModels([ECHO_MIX, STUB_MODEL]);
    mocks.fetchAgentTraceTaskRuns.mockResolvedValue([run({})]);

    renderWithProviders(<OwnerHealthSummary />, { locale: "zh-CN" });

    expect(
      await screen.findByRole("heading", { name: "Echo 运行正常" }),
    ).toBeVisible();
    expect(screen.getByText("没有需要你处理的事。")).toBeVisible();
  });

  it("reports a backend it cannot reach", async () => {
    mockModels([ECHO_MIX, STUB_MODEL]);
    mockHealth({}, false);
    mocks.fetchAgentTraceTaskRuns.mockResolvedValue([]);

    renderWithProviders(<OwnerHealthSummary />, { locale: "zh-CN" });

    expect(
      await screen.findByRole(
        "heading",
        { name: "暂时连不上 Echo 后台" },
        { timeout: 4000 },
      ),
    ).toBeVisible();
  });
});
