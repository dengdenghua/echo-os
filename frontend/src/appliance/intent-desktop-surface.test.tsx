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
    expect(
      screen.getByText("意图优先 · 让 Agent 驱动执行"),
    ).toBeInTheDocument();
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

    const darkBtn = screen.getByRole("button", { name: /暗夜黑/i });
    fireEvent.click(darkBtn);
    expect(toast.success).toHaveBeenCalledWith("桌面主题已切换为：纯粹暗夜黑");
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
});
