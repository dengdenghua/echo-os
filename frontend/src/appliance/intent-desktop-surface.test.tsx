import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntentDesktopSurface } from "./intent-desktop-surface";
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

describe("IntentDesktopSurface", () => {
  beforeEach(() => {
    localStorage.clear();
    // 每个用例从确定的身份起步，避免作用域用例之间互相串账号
    authState.actor = "anonymous";
    vi.clearAllMocks();
  });

  it("renders with initial workspace mode and ivory white theme by default", () => {
    render(<IntentDesktopSurface />);
    expect(screen.getByText("多窗口工作台")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/输入意图/i)).toBeInTheDocument();
    expect(screen.getByText(/全网分析 DeepSeek V3 架构/i)).toBeInTheDocument();
  });

  it("toggles between workspace and pure mode on mode button click", () => {
    render(<IntentDesktopSurface initialMode="workspace" />);
    const toggleBtn = screen.getByRole("button", {
      name: /多窗口工作台/i,
    });
    fireEvent.click(toggleBtn);

    expect(screen.getByText("意图纯净态")).toBeInTheDocument();
    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining("已进入纯净意图态"),
      expect.anything(),
    );

    fireEvent.click(screen.getByRole("button", { name: /意图纯净态/i }));
    expect(screen.getByText("多窗口工作台")).toBeInTheDocument();
    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining("已恢复多窗口工作台"),
      expect.anything(),
    );
  });

  it("toggles mode on clicking blank backdrop surface", () => {
    render(<IntentDesktopSurface initialMode="workspace" />);
    const surface = screen.getByTestId("intent-desktop-surface");
    fireEvent.click(surface);

    expect(screen.getByText("意图纯净态")).toBeInTheDocument();
  });

  it("switches themes when clicking theme buttons", () => {
    render(<IntentDesktopSurface />);
    const glassBtn = screen.getByRole("button", { name: /液态玻璃/i });
    fireEvent.click(glassBtn);
    expect(toast.success).toHaveBeenCalledWith(
      "桌面主题已切换为：静谧液态玻璃",
    );

    const darkBtn = screen.getByRole("button", { name: /深空/i });
    fireEvent.click(darkBtn);
    expect(toast.success).toHaveBeenCalledWith("桌面主题已切换为：深空");
  });

  it("submits a new intent, creates a task card, and notifies callback", () => {
    const onOpenWorkbench = vi.fn();
    render(
      <IntentDesktopSurface
        initialMode="pure"
        onOpenWorkbench={onOpenWorkbench}
      />,
    );

    const input = screen.getByPlaceholderText(/输入意图/i);
    fireEvent.change(input, {
      target: { value: "分析 NAS 存储碎片化并生成优化方案" },
    });

    const submitBtn = screen.getByRole("button", { name: /提交意图/i });
    fireEvent.click(submitBtn);

    expect(
      screen.getByText("分析 NAS 存储碎片化并生成优化方案"),
    ).toBeInTheDocument();
    expect(onOpenWorkbench).toHaveBeenCalledWith(
      "分析 NAS 存储碎片化并生成优化方案",
      "researcher",
    );
    // Should switch to workspace mode
    expect(screen.getByText("多窗口工作台")).toBeInTheDocument();
  });

  it("handles task card traffic lights: dismiss, pause, and expand", () => {
    render(<IntentDesktopSurface initialMode="workspace" />);

    // Expand details
    const expandButtons = screen.getAllByRole("button", {
      name: /展开任务详情/i,
    });
    fireEvent.click(expandButtons[0]);

    expect(screen.getByText("实时执行流与控制台日志")).toBeInTheDocument();

    // Close details
    const closeBtn = screen.getByRole("button", { name: /关闭详情/i });
    fireEvent.click(closeBtn);
    expect(
      screen.queryByText("实时执行流与控制台日志"),
    ).not.toBeInTheDocument();

    // Pause task
    const pauseButtons = screen.getAllByRole("button", {
      name: /暂停或继续任务/i,
    });
    fireEvent.click(pauseButtons[0]);
    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining("已暂停任务"),
    );

    // Dismiss task
    const dismissButtons = screen.getAllByRole("button", { name: /关闭任务/i });
    fireEvent.click(dismissButtons[0]);
    expect(toast.info).toHaveBeenCalledWith("任务已收纳移除");
  });

  it("supports keyboard shortcut Space to toggle mode", () => {
    render(<IntentDesktopSurface initialMode="workspace" />);
    fireEvent.keyDown(window, { code: "Space" });
    expect(screen.getByText("意图纯净态")).toBeInTheDocument();

    fireEvent.keyDown(window, { code: "Space" });
    expect(screen.getByText("多窗口工作台")).toBeInTheDocument();
  });

  it("filters tasks when switching OpenRoom spaces", () => {
    render(<IntentDesktopSurface initialMode="workspace" />);

    // Click Operator room tab
    const operatorTab = screen.getByRole("tab", { name: /中枢/i });
    fireEvent.click(operatorTab);

    expect(screen.getByText(/NAS ZFS 双盘镜像完整性巡检/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/全网分析 DeepSeek V3 架构/i),
    ).not.toBeInTheDocument();

    // Click Research room tab
    const researchTab = screen.getByRole("tab", { name: /调研室/i });
    fireEvent.click(researchTab);

    expect(screen.getByText(/全网分析 DeepSeek V3 架构/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/NAS ZFS 双盘镜像完整性巡检/i),
    ).not.toBeInTheDocument();

    // Click All rooms tab
    const allTab = screen.getByRole("tab", { name: /全局总览/i });
    fireEvent.click(allTab);

    expect(screen.getByText(/全网分析 DeepSeek V3 架构/i)).toBeInTheDocument();
  });

  it("opens context asset inspector when clicking an asset link and closes on dismiss", () => {
    render(<IntentDesktopSurface initialMode="workspace" />);

    // Click arxiv asset link
    const assetBtn = screen.getByRole("button", {
      name: /arxiv_2412.19437.pdf/i,
    });
    fireEvent.click(assetBtn);

    expect(screen.getByTestId("context-asset-inspector")).toBeInTheDocument();
    expect(screen.getByText("系统镜像 / 文档")).toBeInTheDocument();
    expect(
      screen.getByText("活体资产快照 (Live Snapshot)"),
    ).toBeInTheDocument();

    // Close the inspector
    const closeBtn = screen.getByRole("button", { name: /关闭资产检查/i });
    fireEvent.click(closeBtn);

    expect(
      screen.queryByTestId("context-asset-inspector"),
    ).not.toBeInTheDocument();
  });

  it("fills input and switches room when clicking an intent preset template", () => {
    render(<IntentDesktopSurface initialMode="pure" />);

    const templateBtn = screen.getByRole("button", { name: /固件装配编译/i });
    fireEvent.click(templateBtn);

    const input = screen.getByPlaceholderText(/输入意图/i) as HTMLInputElement;
    expect(input.value).toContain("交叉编译 RK3576 ARM64 内核");
  });

  it("handles Agent mesh handover click to transfer space focus", () => {
    render(<IntentDesktopSurface initialMode="workspace" />);

    // In All rooms, task-01 has handover to Builder
    const handoverPill = screen.getByTestId("handover-pill-task-01");
    expect(handoverPill).toBeInTheDocument();
    fireEvent.click(handoverPill);

    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("已穿梭至 Builder"),
      expect.anything(),
    );
  });

  it("renders Physical Hardware & AI Hotspot Telemetry HUD in Operator room", () => {
    render(<IntentDesktopSurface initialMode="workspace" />);

    const operatorTab = screen.getByRole("tab", { name: /中枢/i });
    fireEvent.click(operatorTab);

    expect(screen.getByTestId("operator-hardware-hud")).toBeInTheDocument();
    expect(screen.getByText(/RK3576 NPU 加速芯片/i)).toBeInTheDocument();
    expect(screen.getByText(/6.0 TOPS · 32% 负载/i)).toBeInTheDocument();
    expect(screen.getByText(/OpenZFS 存储池 \('tank'\)/i)).toBeInTheDocument();
    expect(screen.getByText(/AI Hotspot 局域网算力广播/i)).toBeInTheDocument();
  });

  it("pins a desktop task card into the Codex PiP monitor upon clicking pin-to-pip", () => {
    render(<IntentDesktopSurface initialMode="workspace" />);

    const pinButtons = screen.getAllByRole("button", { name: "钉在画中画" });
    expect(pinButtons.length).toBeGreaterThan(0);

    fireEvent.click(pinButtons[0]);
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("任务钉入右下角画中画监视"),
    );
  });

  it("auto-completes the first preset template when pressing Tab in intent input", () => {
    render(<IntentDesktopSurface initialMode="pure" />);

    const input = screen.getByPlaceholderText(/输入意图/i) as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Tab" });

    expect(input.value).toContain("全网深度调研 DeepSeek V3 架构");
  });

  it("toggles mode when clicking blank area with desktop children present", () => {
    render(
      <IntentDesktopSurface initialMode="workspace">
        <div data-testid="desktop-child-container">
          <div data-testid="blank-widget-gap">空白间隙</div>
          <button type="button">交互桌面图标</button>
        </div>
      </IntentDesktopSurface>,
    );

    // Clicking interactive button inside children should NOT toggle mode
    fireEvent.click(screen.getByRole("button", { name: /交互桌面图标/i }));
    expect(screen.getByText("多窗口工作台")).toBeInTheDocument();

    // Clicking blank widget gap should bubble up and toggle mode
    fireEvent.click(screen.getByTestId("blank-widget-gap"));
    expect(screen.getByText("意图纯净态")).toBeInTheDocument();
  });

  it("supports dragging task card windows by their header", () => {
    render(<IntentDesktopSurface initialMode="workspace" />);

    const header =
      screen.getAllByTitle("按住并拖动标题栏可自由移动此任务窗口")[0]!;
    expect(header).toBeInTheDocument();

    // Start drag
    fireEvent.pointerDown(header, { clientX: 100, clientY: 100, button: 0 });

    // Move pointer
    fireEvent(
      window,
      new MouseEvent("pointermove", {
        clientX: 250,
        clientY: 200,
        bubbles: true,
      }),
    );

    // End drag
    fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));

    // Verify task card received transform translate3d
    const card = header.closest("[data-task-card='true']") as HTMLElement;
    expect(card).toBeInTheDocument();
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

  it("does not render empty state card in pure mode so it never blocks the intent bar", () => {
    render(<IntentDesktopSurface initialMode="pure" activeRoom="researcher" />);

    // Dismiss the task in researcher room
    const dismissButtons = screen.queryAllByRole("button", {
      name: /关闭任务/i,
    });
    dismissButtons.forEach((btn) => fireEvent.click(btn));

    // In pure mode with no tasks, empty state card must NOT be displayed
    expect(
      screen.queryByText("该协同空间暂无进行中的任务"),
    ).not.toBeInTheDocument();

    // Intent input must be in the document and accessible
    const input = screen.getByPlaceholderText(/输入意图/i);
    expect(input).toBeInTheDocument();
  });

  it("renders empty state card below intent bar with self-end in workspace mode when tasks are empty", () => {
    render(
      <IntentDesktopSurface initialMode="workspace" activeRoom="researcher" />,
    );

    // Dismiss task in researcher room
    const dismissBtn = screen.getByRole("button", { name: /关闭任务/i });
    fireEvent.click(dismissBtn);

    // Empty state should be visible in workspace mode
    const emptyCard = screen.getByText("该协同空间暂无进行中的任务");
    expect(emptyCard).toBeInTheDocument();
    expect(emptyCard.closest("[data-task-card='true']")).toHaveClass(
      "self-end",
    );

    // Intent input remains accessible and not occluded
    const input = screen.getByPlaceholderText(/输入意图/i);
    expect(input).toBeInTheDocument();
  });

  it("toggles between pure and workspace mode when pressing Alt+D", () => {
    render(<IntentDesktopSurface initialMode="pure" />);

    expect(screen.getByText("意图纯净态")).toBeInTheDocument();

    // Press Alt+D
    fireEvent.keyDown(window, { key: "d", altKey: true });
    expect(screen.getByText("多窗口工作台")).toBeInTheDocument();

    // Press Alt+D again
    fireEvent.keyDown(window, { key: "d", altKey: true });
    expect(screen.getByText("意图纯净态")).toBeInTheDocument();
  });

  it("renders breathing dual-mode switcher badge and toggles mode on click", () => {
    render(<IntentDesktopSurface initialMode="pure" />);

    const badge = screen.getByRole("button", { name: "双态形态切换" });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("打开任务视图");

    fireEvent.click(badge);
    expect(badge).toHaveTextContent("多窗口工作台");
  });

  it("automatically morphs into workspace mode upon submitting intent from pure mode", () => {
    render(<IntentDesktopSurface initialMode="pure" />);

    const input = screen.getByPlaceholderText(/输入意图/i);
    fireEvent.change(input, {
      target: { value: "分析 NAS 存储碎片化并生成优化方案" },
    });

    const submitBtn = screen.getByRole("button", { name: "提交意图" });
    fireEvent.click(submitBtn);

    // Mode automatically expanded to workspace
    expect(screen.getByText("多窗口工作台")).toBeInTheDocument();
    expect(toast.info).toHaveBeenCalledWith(
      "已自适应展开多窗口工作台",
      expect.objectContaining({
        description: expect.stringContaining("按 Alt+D 可随时切回极简意图"),
      }),
    );
  });

  it("dynamically updates placeholder and highlights templates when switching agents", () => {
    render(<IntentDesktopSurface initialMode="pure" />);

    // Default is Researcher
    expect(
      screen.getByPlaceholderText(/全网深度调研 DeepSeek/i),
    ).toBeInTheDocument();

    const trigger = screen.getByTestId("agent-selector-trigger");

    // Open agent popover menu and select Builder
    fireEvent.click(trigger);
    const builderBtn = screen.getByRole("menuitem", { name: /Builder/i });
    fireEvent.click(builderBtn);

    // Placeholder dynamically switches to Builder domain
    expect(screen.getByPlaceholderText(/交叉编译 RK3576/i)).toBeInTheDocument();

    // Open agent popover menu and select Operator
    fireEvent.click(trigger);
    const operatorBtn = screen.getByRole("menuitem", { name: /Operator/i });
    fireEvent.click(operatorBtn);

    // Placeholder dynamically switches to Operator domain
    expect(screen.getByPlaceholderText(/执行 NAS ZFS/i)).toBeInTheDocument();
  });

  it("fills an example from the collapsed menu and closes the menu", () => {
    render(<IntentDesktopSurface initialMode="workspace" />);

    const summary = screen.getByText("示例任务");
    const menu = summary.closest("details")!;
    expect(menu.open).toBe(false);
    fireEvent.click(summary);
    fireEvent.click(screen.getByRole("button", { name: "全网调研 DeepSeek" }));
    expect(menu.open).toBe(false);

    const input = screen.getByPlaceholderText(/输入意图/i) as HTMLInputElement;
    expect(input.value).toContain("全网深度调研 DeepSeek V3");
  });

  it("supports Omarchy-style built-in agent matrix: Codex, Claude, Hermes, Pi, OpenCode", () => {
    render(<IntentDesktopSurface initialMode="pure" />);

    const trigger = screen.getByTestId("agent-selector-trigger");

    // Open popover to verify Omarchy badge indicator and engine specs
    fireEvent.click(trigger);
    expect(screen.getByText(/Omarchy Matrix/i)).toBeInTheDocument();
    expect(screen.getByText(/AST Parser/i)).toBeInTheDocument();
    expect(screen.getByText(/Extended Thinking/i)).toBeInTheDocument();

    // 1. Switch to Codex
    const codexBtn = screen.getByRole("menuitem", { name: /Codex/i });
    expect(codexBtn).toBeInTheDocument();
    fireEvent.click(codexBtn);
    expect(
      screen.getByPlaceholderText(/让 Codex 规划软件工程/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /分派 Agent: Codex/i }),
    ).toBeInTheDocument();

    // 2. Switch to Claude
    fireEvent.click(trigger);
    const claudeBtn = screen.getByRole("menuitem", { name: /Claude/i });
    expect(claudeBtn).toBeInTheDocument();
    fireEvent.click(claudeBtn);
    expect(screen.getByPlaceholderText(/向 Claude 请教/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /分派 Agent: Claude/i }),
    ).toBeInTheDocument();

    // 3. Switch to Hermes
    fireEvent.click(trigger);
    const hermesBtn = screen.getByRole("menuitem", { name: /Hermes/i });
    expect(hermesBtn).toBeInTheDocument();
    fireEvent.click(hermesBtn);
    expect(screen.getByPlaceholderText(/唤醒 Hermes/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /分派 Agent: Hermes/i }),
    ).toBeInTheDocument();

    // 4. Switch to Pi
    fireEvent.click(trigger);
    const piBtn = screen.getByRole("menuitem", { name: /Inflection/i });
    expect(piBtn).toBeInTheDocument();
    fireEvent.click(piBtn);
    expect(screen.getByPlaceholderText(/与 Pi 随心交流/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /分派 Agent: Pi/i }),
    ).toBeInTheDocument();

    // 5. Switch to OpenCode
    fireEvent.click(trigger);
    const openCodeBtn = screen.getByRole("menuitem", { name: /OpenCode/i });
    expect(openCodeBtn).toBeInTheDocument();
    fireEvent.click(openCodeBtn);
    expect(
      screen.getByPlaceholderText(/让 OpenCode 在沙箱中执行/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /分派 Agent: OpenCode/i }),
    ).toBeInTheDocument();
  });

  it("submits intent with selected Omarchy agent and dispatches agentId to workbench callback", () => {
    const onOpenWorkbench = vi.fn();
    render(
      <IntentDesktopSurface
        initialMode="pure"
        onOpenWorkbench={onOpenWorkbench}
      />,
    );

    // Select Claude via popover
    const trigger = screen.getByTestId("agent-selector-trigger");
    fireEvent.click(trigger);
    const claudeBtn = screen.getByRole("menuitem", { name: /Claude/i });
    fireEvent.click(claudeBtn);

    const input = screen.getByPlaceholderText(/向 Claude 请教/i);
    fireEvent.change(input, {
      target: { value: "撰写下一代端侧操作系统安全白皮书" },
    });

    const submitBtn = screen.getByRole("button", { name: "提交意图" });
    fireEvent.click(submitBtn);

    expect(onOpenWorkbench).toHaveBeenCalledWith(
      "撰写下一代端侧操作系统安全白皮书",
      "claude",
    );
    expect(screen.getAllByText("Claude").length).toBeGreaterThan(0);
    expect(screen.getByText("多窗口工作台")).toBeInTheDocument();
  });
});
