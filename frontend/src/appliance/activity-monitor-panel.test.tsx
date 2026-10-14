import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ActivityMonitorPanel,
  SYSTEM_INFO_POLL_MS,
} from "./activity-monitor-panel";
import { SystemAppWindowProvider } from "./system-app-window";

const snapshot = {
  ok: true,
  cpu: { model: "Real CPU model", cores: 8, usage: 23 },
  memory: { total: 32, used: 8, percent: 25 },
  uptime: 125,
};

describe("activity monitor window", () => {
  beforeEach(() => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders native readings inside a regular system window without a modal", async () => {
    const getSystemInfo = vi.fn().mockResolvedValue(snapshot);
    vi.stubGlobal("echo", { desktop: { getSystemInfo } });
    render(
      <SystemAppWindowProvider>
        <ActivityMonitorPanel onClose={vi.fn()} />
      </SystemAppWindowProvider>,
    );
    await screen.findByText("Real CPU model · 8 核心");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("progressbar", { name: "CPU 使用率" }),
    ).toHaveAttribute("aria-valuenow", "23");
    expect(
      screen.getByRole("progressbar", { name: "内存使用率" }),
    ).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("运行时间：2 小时 5 分钟")).toBeInTheDocument();
  });

  it("shows the browser limitation instead of invented readings", async () => {
    vi.stubGlobal("echo", undefined);
    render(<ActivityMonitorPanel onClose={vi.fn()} />);
    expect(
      await screen.findByText("浏览器模式未连接系统监控"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("stops hidden/minimized polling, refreshes on restore and ignores late closed results", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let resolveOld: (result: typeof snapshot) => void = () => {};
    const getSystemInfo = vi.fn().mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    );
    vi.stubGlobal("echo", { desktop: { getSystemInfo } });
    const view = render(<ActivityMonitorPanel onClose={vi.fn()} />);
    await waitFor(() => expect(getSystemInfo).toHaveBeenCalledOnce());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYSTEM_INFO_POLL_MS * 2);
    });
    expect(getSystemInfo).toHaveBeenCalledOnce();
    view.rerender(<ActivityMonitorPanel onClose={vi.fn()} visible={false} />);
    await act(async () => {
      resolveOld(snapshot);
    });
    expect(screen.queryByText("Real CPU model · 8 核心")).toBeNull();
    getSystemInfo.mockResolvedValue(snapshot);
    view.rerender(<ActivityMonitorPanel onClose={vi.fn()} visible />);
    await screen.findByText("Real CPU model · 8 核心");
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYSTEM_INFO_POLL_MS);
    });
    expect(getSystemInfo).toHaveBeenCalledTimes(2);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(getSystemInfo).toHaveBeenCalledTimes(3);
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYSTEM_INFO_POLL_MS * 2);
    });
    expect(getSystemInfo).toHaveBeenCalledTimes(3);
  });

  it("marks retained readings as stale after a failed refresh", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const getSystemInfo = vi
      .fn()
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValue(new Error("native failure"));
    vi.stubGlobal("echo", { desktop: { getSystemInfo } });
    render(<ActivityMonitorPanel onClose={vi.fn()} />);
    await screen.findByText("Real CPU model · 8 核心");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYSTEM_INFO_POLL_MS);
    });
    expect(
      screen.getByText("暂时无法更新，显示上次读取的状态。"),
    ).toBeInTheDocument();
    expect(screen.getByText("Real CPU model · 8 核心")).toBeInTheDocument();
  });
});
