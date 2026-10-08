import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppWindow } from "./app-window";

const ORIGINAL_VIEWPORT = {
  width: window.innerWidth,
  height: window.innerHeight,
};

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
  // 同时让工作区缓存失效，与真实浏览器 resize 一致。
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  setViewport(ORIGINAL_VIEWPORT.width, ORIGINAL_VIEWPORT.height);
});

describe("Echo OS desktop application window", () => {
  it("renders a system application directly without creating an iframe", () => {
    const { container } = render(
      <AppWindow
        win={{
          id: "embedded-agent",
          title: "工作台",
          url: "/workspace/realtime/new",
          content: <div data-testid="native-agent">内建 Agent</div>,
          integratedChrome: true,
        }}
        index={0}
        focused
        onFocus={vi.fn()}
        onClose={vi.fn()}
        onMinimize={vi.fn()}
      />,
    );

    expect(screen.getByTestId("native-agent")).toHaveTextContent("内建 Agent");
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("keeps one OS-owned control row without adding a second title bar", () => {
    const { container } = render(
      <AppWindow
        win={{
          id: "agent",
          title: "工作台",
          url: "https://embedded-app.example.test/",
          integratedChrome: true,
        }}
        index={0}
        focused
        onFocus={vi.fn()}
        onClose={vi.fn()}
        onMinimize={vi.fn()}
      />,
    );

    expect(container.querySelector(".mac-window-titlebar")).toBeNull();
    expect(container.querySelector(".mac-window-compact-titlebar")).toBeNull();
    expect(
      container.querySelector(".mac-window-integrated-controls"),
    ).not.toBeNull();
    expect(container.querySelectorAll(".mac-traffic-light")).toHaveLength(3);
    expect(container.querySelector(".is-integrated-chrome")).not.toBeNull();
    expect(screen.getByTitle("工作台")).toBeInTheDocument();
  });

  it("closes an integrated window from the always-present OS control", () => {
    const onClose = vi.fn();
    render(
      <AppWindow
        win={{
          id: "agent",
          title: "工作台",
          url: "https://embedded-app.example.test/",
          integratedChrome: true,
        }}
        index={0}
        focused
        onFocus={vi.fn()}
        onClose={onClose}
        onMinimize={vi.fn()}
      />,
    );

    screen.getByRole("button", { name: "关闭工作台" }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("accepts window controls only from its own integrated iframe", () => {
    const onClose = vi.fn();
    const onMinimize = vi.fn();
    render(
      <AppWindow
        win={{
          id: "agent",
          title: "工作台",
          url: "https://embedded-app.example.test/",
          integratedChrome: true,
        }}
        index={0}
        focused
        onFocus={vi.fn()}
        onClose={onClose}
        onMinimize={onMinimize}
      />,
    );

    const iframe = screen.getByTitle<HTMLIFrameElement>("工作台");
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source: iframe.contentWindow,
          data: { type: "echo-os:window-control", action: "minimize" },
        }),
      );
      window.dispatchEvent(
        new MessageEvent("message", {
          source: window,
          data: { type: "echo-os:window-control", action: "close" },
        }),
      );
    });

    expect(onMinimize).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("throttles dragging to display frames and settles its optical tilt", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(16);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { container } = render(
      <AppWindow
        win={{
          id: "agent",
          title: "工作台",
          url: "https://embedded-app.example.test/",
          integratedChrome: true,
        }}
        index={0}
        focused
        onFocus={vi.fn()}
        onClose={vi.fn()}
        onMinimize={vi.fn()}
      />,
    );
    const win = container.querySelector<HTMLElement>(".mac-window")!;
    const controls = container.querySelector<HTMLElement>(
      ".mac-window-integrated-controls",
    )!;

    fireEvent.pointerDown(controls, { clientX: 100, clientY: 60 });
    expect(win).toHaveAttribute("data-window-dragging", "move");

    fireEvent.pointerMove(window, { clientX: 150, clientY: 74 });
    expect(win.style.getPropertyValue("--window-tilt-y")).not.toBe("0deg");

    fireEvent.pointerUp(window);
    expect(win).not.toHaveAttribute("data-window-dragging");
    expect(win.style.getPropertyValue("--window-tilt-x")).toBe("0deg");
    expect(win.style.getPropertyValue("--window-tilt-y")).toBe("0deg");
    vi.unstubAllGlobals();
  });

  it("restores exact position and dimensions when initialGeometry is provided", () => {
    setViewport(1440, 900);
    const { container } = render(
      <AppWindow
        win={{
          id: "custom-geometry-app",
          title: "自定义窗口",
          url: "https://example.com",
        }}
        index={2}
        focused
        initialGeometry={{
          x: 350,
          y: 180,
          w: 720,
          h: 480,
          maximized: false,
        }}
        onFocus={vi.fn()}
        onClose={vi.fn()}
        onMinimize={vi.fn()}
      />,
    );

    const win = container.querySelector<HTMLElement>(".mac-window")!;
    expect(win.style.left).toBe("350px");
    expect(win.style.top).toBe("180px");
    expect(win.style.width).toBe("720px");
    expect(win.style.height).toBe("480px");
  });

  it("pulls restored and existing windows back into a smaller viewport", () => {
    setViewport(1440, 900);
    const onGeometryChange = vi.fn();
    const { container } = render(
      <AppWindow
        win={{ id: "wide", title: "宽窗口", url: "https://example.com" }}
        index={0}
        focused
        initialGeometry={{ x: 600, y: 300, w: 800, h: 500, maximized: false }}
        onGeometryChange={onGeometryChange}
        onFocus={vi.fn()}
        onClose={vi.fn()}
        onMinimize={vi.fn()}
      />,
    );
    const win = container.querySelector<HTMLElement>(".mac-window")!;
    expect(win.style.left).toBe("600px");

    // 视口缩小后窗口必须完整回到可见区域（不压在 Dock 下，也不超出右边缘）。
    act(() => setViewport(1024, 700));
    const left = Number.parseFloat(win.style.left);
    const top = Number.parseFloat(win.style.top);
    const width = Number.parseFloat(win.style.width);
    const height = Number.parseFloat(win.style.height);
    expect(left + width).toBeLessThanOrEqual(1024 - 6);
    expect(top + height).toBeLessThanOrEqual(700 - 83);
    expect(top).toBeGreaterThanOrEqual(31);
    expect(onGeometryChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ maximized: false, w: width, h: height }),
    );
  });

  it("drags integrated windows from empty space in the top strip", () => {
    setViewport(1440, 900);
    const onFocus = vi.fn();
    const { container } = render(
      <AppWindow
        win={{
          id: "workbench",
          title: "工作台",
          url: "/workspace/realtime/new",
          integratedChrome: true,
          content: (
            <header>
              <span>新对话</span>
              <button type="button">新建任务</button>
            </header>
          ),
        }}
        index={0}
        focused
        initialGeometry={{ x: 200, y: 120, w: 800, h: 500, maximized: false }}
        onFocus={onFocus}
        onClose={vi.fn()}
        onMinimize={vi.fn()}
      />,
    );
    const win = container.querySelector<HTMLElement>(".mac-window")!;
    vi.spyOn(win, "getBoundingClientRect").mockReturnValue({
      top: 120,
      left: 200,
      width: 800,
      height: 500,
    } as DOMRect);

    // 按钮仍然是按钮，不会被当作拖拽把手。
    fireEvent.pointerDown(screen.getByRole("button", { name: "新建任务" }), {
      button: 0,
      clientX: 400,
      clientY: 130,
    });
    expect(win.dataset.windowDragging).toBeUndefined();

    fireEvent.pointerDown(screen.getByText("新对话"), {
      button: 0,
      clientX: 300,
      clientY: 130,
    });
    expect(win.dataset.windowDragging).toBe("move");
    fireEvent.pointerUp(window);
    expect(win.dataset.windowDragging).toBeUndefined();
  });

  it("supports sleeping mode, displaying sleep shield and waking up upon click", () => {
    const onFocus = vi.fn();
    const { container } = render(
      <AppWindow
        win={{
          id: "sleepy-app",
          title: "休眠应用",
          url: "https://example.com/heavy",
        }}
        index={0}
        focused={false}
        onFocus={onFocus}
        onClose={vi.fn()}
        onMinimize={vi.fn()}
      />,
    );

    const sleepBtn = screen.getByRole("button", { name: /休眠窗口/i });
    expect(sleepBtn).toBeInTheDocument();

    // Toggle sleep manually
    fireEvent.click(sleepBtn);

    // Sleep shield should appear
    expect(screen.getByTestId("window-sleep-shield")).toBeInTheDocument();
    expect(screen.getByText(/已进入节能休眠/i)).toBeInTheDocument();

    // Iframe should be hidden/invisible
    const iframe = container.querySelector<HTMLIFrameElement>("iframe")!;
    expect(iframe).toHaveClass("invisible");

    // Click wake button inside sleep shield
    const wakeBtn = screen.getByRole("button", { name: /点击即时唤醒/i });
    fireEvent.click(wakeBtn);

    // Sleep shield should be removed and onFocus called
    expect(screen.queryByTestId("window-sleep-shield")).toBeNull();
    expect(iframe).not.toHaveClass("invisible");
    expect(onFocus).toHaveBeenCalled();
  });

  it("reveals Quick Tile menu on hovering the zoom button and supports left and right split tiling", () => {
    vi.useFakeTimers();
    const { container } = render(
      <AppWindow
        win={{
          id: "tile-app",
          title: "分屏应用",
          url: "https://example.com",
        }}
        index={0}
        focused
        onFocus={vi.fn()}
        onClose={vi.fn()}
        onMinimize={vi.fn()}
      />,
    );

    const zoomBtn = container.querySelector(".mac-traffic-light.zoom")!;
    const zoomContainer = zoomBtn.parentElement!;
    expect(zoomContainer).toBeDefined();

    // Hover over zoom container
    fireEvent.mouseEnter(zoomContainer);
    act(() => {
      vi.advanceTimersByTime(350);
    });

    // Quick tile menu should be visible
    expect(screen.getByTestId("window-quick-tile-menu")).toBeInTheDocument();
    expect(screen.getByText("靠左半屏")).toBeInTheDocument();
    expect(screen.getByText("靠右半屏")).toBeInTheDocument();

    // Click tile left
    fireEvent.click(screen.getByText("靠左半屏"));
    expect(screen.queryByTestId("window-quick-tile-menu")).toBeNull();

    const win = container.querySelector<HTMLElement>(".mac-window")!;
    expect(parseInt(win.style.width, 10)).toBeGreaterThan(100);

    vi.useRealTimers();
  });

  it("displays magnetic snap preview when dragged near edge and snaps window on pointerUp", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(16);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const onGeometryChange = vi.fn();
    const { container } = render(
      <AppWindow
        win={{
          id: "snap-app",
          title: "吸附窗口",
          url: "https://example.com",
        }}
        index={0}
        focused
        onFocus={vi.fn()}
        onClose={vi.fn()}
        onMinimize={vi.fn()}
        onGeometryChange={onGeometryChange}
      />,
    );

    const titlebar = container.querySelector(".mac-window-titlebar")!;
    fireEvent.pointerDown(titlebar, { clientX: 200, clientY: 100 });

    // Drag to top edge (clientY <= workArea.y + 26)
    fireEvent.pointerMove(window, { clientX: 200, clientY: 10 });
    expect(screen.getByTestId("window-snap-preview")).toBeInTheDocument();

    // Drop window
    fireEvent.pointerUp(window);
    expect(screen.queryByTestId("window-snap-preview")).toBeNull();
    expect(onGeometryChange).toHaveBeenCalledWith(
      expect.objectContaining({ maximized: true }),
    );

    vi.unstubAllGlobals();
  });

  it("fluidly un-maximizes when dragging the title bar of a maximized window", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(16);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const onGeometryChange = vi.fn();
    const { container } = render(
      <AppWindow
        win={{
          id: "unmax-app",
          title: "全屏拖出应用",
          url: "https://example.com",
        }}
        index={0}
        focused
        initialGeometry={{
          x: 0,
          y: 0,
          w: 1200,
          h: 800,
          maximized: true,
        }}
        onFocus={vi.fn()}
        onClose={vi.fn()}
        onMinimize={vi.fn()}
        onGeometryChange={onGeometryChange}
      />,
    );

    const titlebar = container.querySelector(".mac-window-titlebar")!;
    // Drag while maximized
    fireEvent.pointerDown(titlebar, { clientX: 600, clientY: 20 });
    const win = container.querySelector<HTMLElement>(".mac-window")!;
    expect(win).toHaveAttribute("data-window-dragging", "move");
    expect(onGeometryChange).toHaveBeenCalledWith(
      expect.objectContaining({ maximized: false }),
    );

    fireEvent.pointerUp(window);
    vi.unstubAllGlobals();
  });
});
