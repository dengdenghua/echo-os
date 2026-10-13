import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IntentDesktopSurface,
  roomForAgent,
  type DesktopAgentOption,
} from "./intent-desktop-surface";
import { selectDesktopTasks, taskStatusView } from "./task-presentation";
import type { EchoTaskProjection } from "./task-space";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// `currentActorId()` 在测试模式下恒为 "anonymous"（canUseBrowserStorage 会因
// import.meta.env.MODE === "test" 短路），因此必须注入 actor 才能验证账号作用域。
// 用 hoisted 状态避免 vi.mock 工厂被提升到 `let` 初始化之前而触发 TDZ。
const authState = vi.hoisted(() => ({ actor: "alice" }));
vi.mock("@/core/auth/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, currentActorId: () => authState.actor };
});

const NOW = Date.parse("2026-10-08T12:00:00Z");

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
    startedAt: "2026-10-08T11:00:00Z",
    updatedAt: "2026-10-08T11:30:00Z",
    completedAt: null,
    terminalReason: null,
    latestCheckpointId: null,
    ...overrides,
  };
}

const AGENTS: DesktopAgentOption[] = [
  { id: "general", name: "Echo", icon: "🐙", description: "通用助理" },
  {
    id: "coder",
    name: "编码助手",
    icon: "💻",
    description: "写代码与修复测试",
  },
];

const RUNNING = makeTask({
  id: "t-running",
  threadId: "thread-running",
  title: "整理下载文件夹",
  summary: "已归档 42 个文件",
  progressPercent: 40,
  agentId: "general",
  resultArtifacts: [
    {
      resourceId: "res-1",
      area: "final",
      relativePath: "reports/archive.md",
      name: "archive.md",
      size: 10,
      modified: 0,
    },
  ],
});
const WAITING = makeTask({
  id: "t-waiting",
  threadId: "thread-waiting",
  title: "清理旧的照片索引",
  status: "waiting_approval",
  displayStatus: "waiting_approval",
  agentId: "coder",
  approval: {
    required: true,
    tool: "shell",
    action: "rm",
    reason: "需要删除 3 个缓存目录",
  },
});

function renderSurface(
  props: Partial<Parameters<typeof IntentDesktopSurface>[0]> = {},
) {
  return render(
    <IntentDesktopSurface
      initialMode="workspace"
      agents={AGENTS}
      tasks={[RUNNING, WAITING]}
      {...props}
    />,
  );
}

describe("desktop task selection", () => {
  it("keeps tasks that need attention first and drops stale finished ones", () => {
    const stale = makeTask({
      id: "old",
      status: "completed",
      displayStatus: "completed",
      updatedAt: "2026-10-05T00:00:00Z",
    });
    const recentDone = makeTask({
      id: "done",
      status: "completed",
      displayStatus: "completed",
      updatedAt: "2026-10-08T11:59:00Z",
    });
    const selected = selectDesktopTasks(
      [recentDone, stale, RUNNING, WAITING],
      NOW,
    );
    expect(selected.map((task) => task.id)).toEqual([
      "t-waiting",
      "t-running",
      "done",
    ]);
  });

  it("maps real agents to rooms by role", () => {
    expect(roomForAgent("general")).toBe("researcher");
    expect(roomForAgent("coder")).toBe("builder");
    expect(roomForAgent("senior_developer")).toBe("builder");
    expect(roomForAgent("desktop_operator")).toBe("operator");
    expect(roomForAgent(null)).toBe("researcher");
  });

  it("labels recovery before the raw status", () => {
    const task = makeTask({
      leaseHealth: {
        state: "stale",
        recoveryNeeded: true,
        canTakeover: true,
        canResume: false,
        recommendedAction: null,
        reason: null,
      },
    });
    expect(taskStatusView(task)).toEqual({
      label: "需要恢复",
      tone: "attention",
    });
  });
});

describe("IntentDesktopSurface", () => {
  beforeEach(() => {
    localStorage.clear();
    // 每个用例从确定的身份起步，避免作用域用例之间互相串账号
    authState.actor = "anonymous";
    vi.clearAllMocks();
  });

  it("renders only real tasks and never falls back to demo content", () => {
    renderSurface();
    expect(screen.getByText("多窗口工作台")).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "整理下载文件夹" }),
    ).toBeVisible();
    expect(
      screen.getByRole("article", { name: "清理旧的照片索引" }),
    ).toBeVisible();
    expect(screen.queryByText(/DeepSeek|RK3576|演示/)).not.toBeInTheDocument();
  });

  it("shows an honest empty state when there is nothing to do", () => {
    const onOpenTaskSpace = vi.fn();
    renderSurface({ tasks: [], onOpenTaskSpace });
    expect(screen.getByTestId("desktop-task-empty")).toHaveTextContent(
      "现在没有需要你关注的任务",
    );
    fireEvent.click(screen.getByRole("button", { name: "查看全部任务" }));
    expect(onOpenTaskSpace).toHaveBeenCalledWith();
  });

  it("says when the task service is unavailable", () => {
    renderSurface({ tasks: [], tasksAvailable: false });
    expect(screen.getByTestId("desktop-task-empty")).toHaveTextContent(
      "任务服务暂时不可用",
    );
  });

  it("does not render an empty state while tasks are still loading", () => {
    renderSurface({ tasks: undefined });
    expect(screen.queryByTestId("desktop-task-empty")).not.toBeInTheDocument();
  });

  it("presents agent, status, progress and artifacts from the projection", () => {
    const onOpenTask = vi.fn();
    renderSurface({ onOpenTask });
    const card = screen.getByRole("article", { name: "整理下载文件夹" });
    expect(within(card).getByText("Echo")).toBeInTheDocument();
    expect(within(card).getByText("执行中 40%")).toBeInTheDocument();
    expect(within(card).getByText("已归档 42 个文件")).toBeInTheDocument();
    expect(within(card).getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "40",
    );

    fireEvent.click(within(card).getByRole("button", { name: /archive\.md/ }));
    expect(onOpenTask).toHaveBeenLastCalledWith(RUNNING, "res-1");

    fireEvent.click(within(card).getByRole("button", { name: "打开 →" }));
    expect(onOpenTask).toHaveBeenLastCalledWith(RUNNING, undefined);
  });

  it("routes approvals and details to the task space instead of approving inline", () => {
    const onOpenTaskSpace = vi.fn();
    renderSurface({ onOpenTaskSpace });
    const card = screen.getByRole("article", { name: "清理旧的照片索引" });
    expect(within(card).getByText("待你批准")).toBeInTheDocument();
    expect(within(card).getByText("需要删除 3 个缓存目录")).toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: "去处理" }));
    expect(onOpenTaskSpace).toHaveBeenLastCalledWith("t-waiting");
    fireEvent.click(within(card).getByRole("button", { name: "查看详情" }));
    expect(onOpenTaskSpace).toHaveBeenLastCalledWith("t-waiting");
  });

  it("hides a card from the desktop without touching the task", () => {
    renderSurface();
    const card = screen.getByRole("article", { name: "整理下载文件夹" });
    fireEvent.click(within(card).getByRole("button", { name: "从桌面隐藏" }));
    expect(
      screen.queryByRole("article", { name: "整理下载文件夹" }),
    ).not.toBeInTheDocument();
    expect(toast.info).toHaveBeenCalledWith(
      "已从桌面隐藏，任务本身不受影响",
      expect.anything(),
    );
  });

  it("filters tasks by the agent role of the selected room", () => {
    renderSurface();
    fireEvent.click(screen.getByRole("tab", { name: /工坊/ }));
    expect(
      screen.getByRole("article", { name: "清理旧的照片索引" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("article", { name: "整理下载文件夹" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /中枢/ }));
    expect(screen.getByTestId("desktop-task-empty")).toHaveTextContent(
      "中枢里暂时没有任务",
    );

    fireEvent.click(screen.getByRole("tab", { name: /全局总览/ }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("hands the intent to the workbench with the chosen real agent, without inventing a card", () => {
    const onOpenWorkbench = vi.fn();
    renderSurface({ initialMode: "pure", onOpenWorkbench, tasks: [] });

    const input = screen.getByPlaceholderText(/输入意图/i);
    expect(input).toHaveAttribute(
      "placeholder",
      expect.stringContaining("Echo"),
    );

    fireEvent.click(screen.getByTestId("agent-selector-trigger"));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /编码助手/ }));
    fireEvent.change(input, { target: { value: "修复失败的单元测试" } });
    fireEvent.click(screen.getByRole("button", { name: "提交意图" }));

    expect(onOpenWorkbench).toHaveBeenCalledWith("修复失败的单元测试", "coder");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    // 从纯净态提交会展开工作台，方便看到接手的窗口。
    expect(screen.getByText("多窗口工作台")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith(
      "已在工作台准备好任务",
      expect.objectContaining({ description: "确认后交给 编码助手 执行" }),
    );
  });

  it("dispatches the intent to the agent on Enter and keeps drafting as an explicit choice", async () => {
    const onDispatchIntent = vi.fn().mockResolvedValue(true);
    const onOpenWorkbench = vi.fn();
    renderSurface({ onDispatchIntent, onOpenWorkbench, tasks: [] });
    const input = screen.getByPlaceholderText(/输入意图/i);

    // 输入框为空时不显示"在工作台中编辑"。
    expect(
      screen.queryByRole("button", { name: "在工作台中编辑" }),
    ).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "整理下载文件夹" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onDispatchIntent).toHaveBeenCalledWith("整理下载文件夹", "general");
    expect(onOpenWorkbench).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "已交给 Echo，在后台执行",
        expect.anything(),
      ),
    );
    expect((input as HTMLInputElement).value).toBe("");

    fireEvent.change(input, { target: { value: "写本周周报" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onOpenWorkbench).toHaveBeenLastCalledWith("写本周周报", "general");

    fireEvent.change(input, { target: { value: "总结照片" } });
    fireEvent.click(screen.getByRole("button", { name: "在工作台中编辑" }));
    expect(onOpenWorkbench).toHaveBeenLastCalledWith("总结照片", "general");
    expect(onDispatchIntent).toHaveBeenCalledTimes(1);
  });

  it("does not announce a dispatch the server did not accept", async () => {
    const onDispatchIntent = vi.fn().mockResolvedValue(false);
    renderSurface({ onDispatchIntent, tasks: [] });
    const input = screen.getByPlaceholderText(/输入意图/i);
    fireEvent.change(input, { target: { value: "整理下载文件夹" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(onDispatchIntent).toHaveBeenCalledTimes(1));
    // 让 dispatch 的 then 回调跑完再断言。
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("ignores Enter while an input method is composing", () => {
    const onDispatchIntent = vi.fn();
    renderSurface({ onDispatchIntent, tasks: [] });
    const input = screen.getByPlaceholderText(/输入意图/i);
    fireEvent.change(input, { target: { value: "zheng li" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onDispatchIntent).not.toHaveBeenCalled();
  });

  it("falls back to the workbench default agent when the roster is unavailable", () => {
    const onOpenWorkbench = vi.fn();
    renderSurface({ agents: [], onOpenWorkbench });
    fireEvent.click(screen.getByTestId("agent-selector-trigger"));
    expect(screen.getByRole("menu")).toHaveTextContent("暂时读不到 Agent 名册");

    fireEvent.change(screen.getByPlaceholderText(/输入意图/i), {
      target: { value: "写本周周报" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交意图" }));
    expect(onOpenWorkbench).toHaveBeenCalledWith("写本周周报", undefined);
  });

  it("fills the input from an example and with Tab on an empty input", () => {
    renderSurface();
    const input = screen.getByPlaceholderText(/输入意图/i) as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "检查存储健康" }));
    expect(input.value).toContain("存储池");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.value).toContain("下载文件夹");
  });

  it("watches the most urgent task in picture-in-picture and sends approvals to the task space", () => {
    const onOpenTaskSpace = vi.fn();
    renderSurface({ onOpenTaskSpace });
    // 等待审批的任务优先；画中画默认收起为胶囊。
    fireEvent.click(screen.getByRole("button", { name: "展开任务画中画" }));
    const pip = screen.getByTestId("agent-pip-monitor");
    expect(pip).toHaveTextContent("清理旧的照片索引");
    expect(pip).not.toHaveTextContent("演示");
    fireEvent.click(within(pip).getByRole("button", { name: "去处理" }));
    expect(onOpenTaskSpace).toHaveBeenCalledWith("t-waiting");
  });

  it("pins a chosen task into picture-in-picture", () => {
    renderSurface();
    const card = screen.getByRole("article", { name: "整理下载文件夹" });
    fireEvent.click(within(card).getByRole("button", { name: "钉在画中画" }));
    expect(screen.getByText(/Echo 画中画 · 40%/)).toBeInTheDocument();
  });

  it("toggles between workspace and pure mode on mode button click", () => {
    renderSurface();
    fireEvent.click(screen.getByRole("button", { name: /多窗口工作台/i }));

    expect(screen.getByText("意图纯净态")).toBeInTheDocument();
    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining("已进入意图纯净态"),
      expect.anything(),
    );

    fireEvent.click(screen.getByRole("button", { name: /意图纯净态/i }));
    expect(screen.getByText("多窗口工作台")).toBeInTheDocument();
  });

  it("toggles mode on clicking blank backdrop surface", () => {
    renderSurface();
    fireEvent.click(screen.getByTestId("intent-desktop-surface"));
    expect(screen.getByText("意图纯净态")).toBeInTheDocument();
  });

  it("switches themes when clicking theme buttons", () => {
    renderSurface();
    fireEvent.click(screen.getByRole("button", { name: /神经玻璃/i }));
    expect(toast.success).toHaveBeenCalledWith("桌面主题已切换为：神经玻璃");
    fireEvent.click(screen.getByRole("button", { name: /石墨/i }));
    expect(toast.success).toHaveBeenCalledWith("桌面主题已切换为：石墨");
  });

  it("supports keyboard shortcuts Space and Alt+D to toggle mode", () => {
    renderSurface();
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    expect(screen.getByText("意图纯净态")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "d", altKey: true });
    expect(screen.getByText("多窗口工作台")).toBeInTheDocument();
  });

  it("shows the active task count on the switcher in pure mode", () => {
    renderSurface({ initialMode: "pure" });
    const badge = screen.getByRole("button", { name: "双态形态切换" });
    expect(badge).toHaveTextContent("打开任务视图 · 1 个进行中");
    fireEvent.click(badge);
    expect(badge).toHaveTextContent("收起到纯净态");
  });

  it("keeps cards out of the way in pure mode", () => {
    renderSurface({ initialMode: "pure", tasks: [] });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "今天想完成什么？",
    );
    expect(screen.getByPlaceholderText(/输入意图/i)).toBeInTheDocument();
    // 纯净态里任务层整体隐藏（invisible + aria-hidden），空状态不会挡住输入框。
    const layer = screen
      .getByTestId("desktop-task-empty")
      .closest("[aria-hidden='true']");
    expect(layer).not.toBeNull();
    expect(layer).toHaveClass("invisible");
  });

  it("toggles mode when clicking blank area with desktop children present", () => {
    render(
      <IntentDesktopSurface initialMode="workspace" tasks={[]}>
        <div data-testid="desktop-child-container">
          <div data-testid="blank-widget-gap">空白间隙</div>
          <button type="button">交互桌面图标</button>
        </div>
      </IntentDesktopSurface>,
    );

    fireEvent.click(screen.getByRole("button", { name: /交互桌面图标/i }));
    expect(screen.getByText("多窗口工作台")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("blank-widget-gap"));
    expect(screen.getByText("意图纯净态")).toBeInTheDocument();
  });

  it("supports dragging task cards by their header", () => {
    renderSurface();
    const header = screen.getAllByTitle("按住拖动可移动卡片")[0]!;

    fireEvent.pointerDown(header, { clientX: 100, clientY: 100, button: 0 });
    fireEvent(
      window,
      new MouseEvent("pointermove", {
        clientX: 250,
        clientY: 200,
        bubbles: true,
      }),
    );
    fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));

    const card = header.closest("[data-task-card='true']") as HTMLElement;
    expect(card.style.transform).toContain("translate3d(150px, 100px, 0)");
  });

  // 桌面形态（pure / workspace）按账号作用域保存 —— 边界依据见
  // docs/desktop-workbench-ux-optimization.md：设备级只保留"硬件桌面外观"，
  // "工作形态"类偏好一律 actor 作用域。
  describe("desktop mode storage scope", () => {
    const setActor = (id: string) => {
      authState.actor = id;
    };

    it("persists the mode under the actor-scoped key, not the bare device key", () => {
      setActor("alice");
      render(<IntentDesktopSurface initialMode="workspace" />);

      fireEvent.click(screen.getByRole("button", { name: /多窗口工作台/i }));
      expect(screen.getByText("意图纯净态")).toBeInTheDocument();

      expect(localStorage.getItem("echo-desktop-mode:alice")).toBe("pure");
      expect(localStorage.getItem("echo-desktop-mode")).toBeNull();
    });

    it("isolates the mode between two accounts on the same device", () => {
      setActor("alice");
      const { rerender } = render(
        <IntentDesktopSurface initialMode="workspace" />,
      );
      fireEvent.click(screen.getByRole("button", { name: /多窗口工作台/i }));
      expect(localStorage.getItem("echo-desktop-mode:alice")).toBe("pure");

      // bob 在同一台设备上不该继承 alice 的形态
      setActor("bob");
      rerender(<IntentDesktopSurface initialMode="workspace" />);
      fireEvent.click(screen.getByRole("button", { name: /多窗口工作台/i }));
      fireEvent.click(screen.getByRole("button", { name: /意图纯净态/i }));

      expect(localStorage.getItem("echo-desktop-mode:bob")).toBe("workspace");
      // alice 的记录未被 bob 的操作覆盖
      expect(localStorage.getItem("echo-desktop-mode:alice")).toBe("pure");
    });

    it("migrates the legacy device-wide key to the current actor once", () => {
      setActor("alice");
      localStorage.setItem("echo-desktop-mode", "pure");

      render(<IntentDesktopSurface initialMode="workspace" />);

      // 读到旧设备值即归属当前账号，并删除旧键（迁移助手语义）
      expect(screen.getByText("意图纯净态")).toBeInTheDocument();
      expect(localStorage.getItem("echo-desktop-mode:alice")).toBe("pure");
      expect(localStorage.getItem("echo-desktop-mode")).toBeNull();
    });

    it("reloads the mode on actor change instead of leaking the previous account's posture", () => {
      setActor("alice");
      localStorage.setItem("echo-desktop-mode:alice", "pure");

      const { rerender } = render(
        <IntentDesktopSurface initialMode="workspace" />,
      );
      expect(screen.getByText("意图纯净态")).toBeInTheDocument();

      // 切到 bob：他没有自己的形态记录，应回落到 initialMode，
      // 而不是继续沿用 alice 的"意图纯净态"。
      setActor("bob");
      rerender(<IntentDesktopSurface initialMode="workspace" />);

      expect(screen.getByText("多窗口工作台")).toBeInTheDocument();
      expect(screen.queryByText("意图纯净态")).not.toBeInTheDocument();
    });
  });
});
