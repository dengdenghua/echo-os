import { fetchDeviceLinkStatus } from "./device-link";
vi.mock("./device-link", () => ({
  fetchDeviceLinkStatus: vi.fn(async () => ({
    devices: [
      { id: "paired-phone", model: "Pixel", platform: "android", online: true },
    ],
  })),
}));
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentPipMonitor } from "./agent-pip-monitor";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("AgentPipMonitor (Codex 画中画)", () => {
  it("keeps the approval available after a failed service call without reporting success", async () => {
    const approve = vi.fn().mockRejectedValue(new Error("offline"));
    render(<AgentPipMonitor demo={false} onApprove={approve} />);
    fireEvent.click(screen.getByRole("button", { name: "批准放行" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("审批未完成，请重试"),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "批准放行" })).toBeEnabled();
  });
  it("never enables approval for a demo even when callbacks exist", () => {
    const approve = vi.fn();
    render(<AgentPipMonitor demo onApprove={approve} />);
    const button = screen.getByRole("button", { name: "批准放行" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(approve).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the floating PiP monitor with live step and progress", () => {
    render(<AgentPipMonitor />);
    expect(screen.getByText(/Codex PiP 画中画/i)).toBeInTheDocument();
    expect(screen.getByText("RK3576 驱动装配与编译")).toBeInTheDocument();
    expect(screen.getByText("68%")).toBeInTheDocument();
    expect(
      screen.getByText(/正在执行交叉编译: aarch64-linux-gnu-gcc/i),
    ).toBeInTheDocument();
  });

  it("collapses into a compact pill and expands back", () => {
    render(<AgentPipMonitor />);
    const minimizeBtn = screen.getByRole("button", { name: /最小化/i });
    fireEvent.click(minimizeBtn);

    expect(screen.getByText(/Builder PiP · 68%/i)).toBeInTheDocument();

    const pill = screen.getByText(/Builder PiP · 68%/i);
    fireEvent.click(pill);
    expect(screen.getByText(/Codex PiP 画中画/i)).toBeInTheDocument();
  });

  it("marks default data as a demo and disables unconnected approvals", () => {
    render(<AgentPipMonitor />);
    const approveBtn = screen.getByRole("button", { name: /批准放行/i });
    fireEvent.click(approveBtn);

    expect(approveBtn).toBeDisabled();
    expect(screen.getByText(/非实时数据/)).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("rejects high risk operation and fires onReject callback", async () => {
    const onReject = vi.fn();
    render(<AgentPipMonitor demo={false} onReject={onReject} />);
    const rejectBtn = screen.getByRole("button", { name: /拦截/i });
    fireEvent.click(rejectBtn);

    expect(onReject).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pip-task-live" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("已拦截并拒绝高危操作"),
    );
  });

  it("calls onExpandToWindow callback when clicking expand button", () => {
    const onExpand = vi.fn();
    render(<AgentPipMonitor onExpandToWindow={onExpand} />);

    const expandBtn = screen.getByRole("button", { name: /放大为全屏窗口/i });
    fireEvent.click(expandBtn);

    expect(onExpand).toHaveBeenCalledOnce();
  });

  it("fires onApprove callback when approving high risk operation", async () => {
    const onApprove = vi.fn();
    render(<AgentPipMonitor demo={false} onApprove={onApprove} />);
    const approveBtn = screen.getByRole("button", { name: /批准放行/i });
    fireEvent.click(approveBtn);

    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pip-task-live" }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "已批准执行高危操作",
        expect.anything(),
      ),
    );
  });

  it("supports keyboard Enter to expand collapsed pill", () => {
    render(<AgentPipMonitor />);
    const minimizeBtn = screen.getByRole("button", { name: /最小化/i });
    fireEvent.click(minimizeBtn);

    const pill = screen.getByRole("button", { name: /展开 Codex 画中画监控/i });
    fireEvent.keyDown(pill, { key: "Enter" });

    expect(screen.getByTestId("agent-pip-monitor")).toBeInTheDocument();
  });

  it("opens a registered phone without claiming casting success", async () => {
    const onCast = vi.fn();
    render(<AgentPipMonitor onOpenPhoneMirror={onCast} />);

    const castBtn = screen.getByRole("button", { name: /选择手机/i });
    fireEvent.click(castBtn);

    const iphoneBtn = await screen.findByRole("button", { name: "打开手机" });
    fireEvent.click(iphoneBtn);

    expect(onCast).toHaveBeenCalledWith(
      expect.objectContaining({ id: "paired-phone" }),
    );
    expect(fetchDeviceLinkStatus).toHaveBeenCalled();
    expect(screen.queryByText(/已投屏监视/)).toBeNull();
  });

  it("supports dragging the PiP monitor window across the screen", () => {
    render(<AgentPipMonitor />);
    const monitor = screen.getByTestId("agent-pip-monitor");
    const dragHandle = screen.getByTestId("pip-drag-handle");

    // Mock getBoundingClientRect
    vi.spyOn(monitor, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 200,
      width: 320,
      height: 240,
      right: 420,
      bottom: 440,
      x: 100,
      y: 200,
      toJSON: () => {},
    });

    fireEvent.pointerDown(dragHandle, {
      clientX: 150,
      clientY: 210,
      button: 0,
    });
    fireEvent(
      window,
      new MouseEvent("pointermove", { clientX: 250, clientY: 310 }),
    );
    fireEvent(window, new MouseEvent("pointerup"));

    // Expect custom left/top styles applied
    expect(monitor.style.left).toBe("200px");
    expect(monitor.style.top).toBe("300px");
  });

  it("resets position to default bottom-right on double-clicking drag handle", () => {
    render(<AgentPipMonitor />);
    const monitor = screen.getByTestId("agent-pip-monitor");
    const dragHandle = screen.getByTestId("pip-drag-handle");

    // First drag it somewhere
    vi.spyOn(monitor, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 200,
      width: 320,
      height: 240,
      right: 420,
      bottom: 440,
      x: 100,
      y: 200,
      toJSON: () => {},
    });

    fireEvent.pointerDown(dragHandle, {
      clientX: 150,
      clientY: 210,
      button: 0,
    });
    fireEvent(
      window,
      new MouseEvent("pointermove", { clientX: 250, clientY: 310 }),
    );
    fireEvent(window, new MouseEvent("pointerup"));
    expect(monitor.style.left).toBe("200px");

    // Double click to reset
    fireEvent.doubleClick(dragHandle);
    expect(monitor.style.left).toBe("");
    expect(toast.info).toHaveBeenCalledWith("画中画已还原至默认位置");
  });
});
