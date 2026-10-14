import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MissionControl } from "./mission-control";

describe("MissionControl Component", () => {
  const mockWindows = [
    { id: "win-1", title: "文件管理器", url: "/system/files" },
    { id: "win-2", title: "手机镜像", url: "/phone-mirror" },
    { id: "win-3", title: "Agent 工作台", url: "/workspace/agent" },
  ];

  it("does not render when closed", () => {
    const { container } = render(
      <MissionControl
        open={false}
        windows={mockWindows}
        onSelectWindow={vi.fn()}
        onCloseWindow={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders open windows cards and active window tag", () => {
    render(
      <MissionControl
        open={true}
        windows={mockWindows}
        activeWindowId="win-2"
        onSelectWindow={vi.fn()}
        onCloseWindow={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("mission-control-overlay")).toBeInTheDocument();
    expect(screen.getByText("调度中心 · 窗口平铺全览")).toBeInTheDocument();
    expect(
      screen.getByText("共 3 个活动窗口 · 点击卡片切换窗口"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("文件管理器").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("手机镜像").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Agent 工作台").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.getByText("当前活跃")).toBeInTheDocument();
  });

  it("shows each window's app icon and title, not its internal path", () => {
    render(
      <MissionControl
        open={true}
        windows={mockWindows}
        onSelectWindow={vi.fn()}
        onCloseWindow={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText("/system/files")).not.toBeInTheDocument();
    expect(screen.queryByText("/phone-mirror")).not.toBeInTheDocument();
    const files = screen.getByTestId("mission-card-win-1");
    expect(
      files.querySelector('[data-app-id="system:files"] svg.echo-app-glyph'),
    ).not.toBeNull();
    const phone = screen.getByTestId("mission-card-win-2");
    expect(
      phone.querySelector('[data-app-id="echo:/phone-mirror"]'),
    ).not.toBeNull();
  });

  it("calls onSelectWindow and closes when clicking a window card", () => {
    const selectMock = vi.fn();
    const closeMock = vi.fn();

    render(
      <MissionControl
        open={true}
        windows={mockWindows}
        onSelectWindow={selectMock}
        onCloseWindow={vi.fn()}
        onClose={closeMock}
      />,
    );

    fireEvent.click(screen.getByTestId("mission-card-win-1"));
    expect(selectMock).toHaveBeenCalledWith("win-1");
  });

  it("calls onCloseWindow when clicking card close button", () => {
    const closeWinMock = vi.fn();

    render(
      <MissionControl
        open={true}
        windows={mockWindows}
        onSelectWindow={vi.fn()}
        onCloseWindow={closeWinMock}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("btn-close-card-win-2"));
    expect(closeWinMock).toHaveBeenCalledWith("win-2");
  });

  it("exits mission control on Escape key or close button", () => {
    const closeMock = vi.fn();

    render(
      <MissionControl
        open={true}
        windows={mockWindows}
        onSelectWindow={vi.fn()}
        onCloseWindow={vi.fn()}
        onClose={closeMock}
      />,
    );

    fireEvent.click(screen.getByTestId("btn-close-mission-control"));
    expect(closeMock).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(closeMock).toHaveBeenCalledTimes(2);
  });

  it("renders empty state when there are no open windows", () => {
    render(
      <MissionControl
        open={true}
        windows={[]}
        onSelectWindow={vi.fn()}
        onCloseWindow={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("mission-control-empty")).toBeInTheDocument();
    expect(screen.getByText("当前没有打开的窗口")).toBeInTheDocument();
  });
});
