import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDesktopWindows } from "./use-desktop-windows";

const actor = vi.hoisted(() => ({ value: "one" }));
vi.mock("@/core/auth/api", () => ({
  currentActorId: () => actor.value,
}));

beforeEach(() => {
  actor.value = "one";
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

it("reuses a created task window when the task panel opens the same thread", () => {
  const { result } = renderHook(useDesktopWindows);
  act(() =>
    result.current.openWindow({
      id: "assistant",
      title: "助手",
      url: "/workspace/realtime/new",
    }),
  );
  act(() =>
    result.current.reportWindowRoute(
      "assistant",
      "/workspace/realtime/thread-1?agent=coder",
      "/workspace/realtime/thread-1?agent=coder",
    ),
  );
  act(() => result.current.minimizeWindow("assistant"));
  act(() => {
    result.current.openWindow({
      id: "task-record-A",
      threadId: "thread-1",
      title: "任务",
      url: "/workspace/realtime/thread-1",
    });
    result.current.openWindow({
      id: "task-record-B",
      threadId: "thread-1",
      title: "任务",
      url: "/workspace/realtime/thread-1",
    });
  });
  expect(result.current.windows).toHaveLength(1);
  expect(result.current.focusedWin).toBe("assistant");
  expect(result.current.minimized.size).toBe(0);
  expect(result.current.windows[0]?.url).toContain("agent=coder");
});

it("moves focus to a visible window after minimizing or closing the focused task", () => {
  const { result } = renderHook(useDesktopWindows);
  act(() => {
    result.current.openWindow({ id: "first", title: "1", url: "/1" });
    result.current.openWindow({ id: "second", title: "2", url: "/2" });
    result.current.minimizeWindow("second");
  });
  expect(result.current.focusedWin).toBe("first");
  act(() => result.current.closeWindow("first"));
  expect(result.current.focusedWin).toBeNull();
});

it("clears windows immediately when the authenticated actor changes", () => {
  const { result, rerender } = renderHook(useDesktopWindows);
  act(() =>
    result.current.openWindow({
      id: "previous-account-task",
      title: "上一账号任务",
      url: "/workspace/realtime/previous",
    }),
  );
  expect(result.current.windows).toHaveLength(1);

  actor.value = "two";
  rerender();

  expect(result.current.windows).toEqual([]);
  expect(result.current.minimized.size).toBe(0);
  expect(result.current.focusedWin).toBeNull();
});

it("persists window geometry and restores snapshot across sessions", () => {
  const { result, unmount } = renderHook(useDesktopWindows);

  act(() => {
    result.current.openWindow(
      {
        id: "win-1",
        title: "应用窗口",
        url: "/app-1",
      },
      { x: 120, y: 80, w: 800, h: 500, maximized: false },
    );
  });

  expect(result.current.windows).toHaveLength(1);
  expect(result.current.geometries["win-1"]).toEqual({
    x: 120,
    y: 80,
    w: 800,
    h: 500,
    maximized: false,
  });

  // Update geometry during window drag
  act(() => {
    result.current.updateWindowGeometry("win-1", {
      x: 250,
      y: 150,
      w: 900,
      h: 600,
      maximized: true,
    });
  });

  expect(result.current.geometries["win-1"]).toEqual({
    x: 250,
    y: 150,
    w: 900,
    h: 600,
    maximized: true,
  });

  // Unmount hook simulating page refresh or process restart
  unmount();

  // Re-mount hook: should restore geometries from localStorage snapshot
  const { result: restoredResult } = renderHook(useDesktopWindows);
  expect(restoredResult.current.windows).toEqual([]);
  expect(restoredResult.current.geometries["win-1"]).toEqual({
    x: 250,
    y: 150,
    w: 900,
    h: 600,
    maximized: true,
  });
});

it("restores a minimized window into focus", () => {
  const { result } = renderHook(useDesktopWindows);
  act(() => {
    result.current.openWindow({ id: "win-doc", title: "文档", url: "/doc" });
    result.current.minimizeWindow("win-doc");
  });
  expect(result.current.minimized.has("win-doc")).toBe(true);

  act(() => {
    result.current.restoreWindow("win-doc");
  });
  expect(result.current.minimized.has("win-doc")).toBe(false);
  expect(result.current.focusedWin).toBe("win-doc");
});

