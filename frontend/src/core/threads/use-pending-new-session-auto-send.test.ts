import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/core/auth/api", () => ({ currentActorId: () => "actor-one" }));

import {
  consumePendingNewSession,
  writePendingNewSession,
} from "./pending-new-session";
import { usePendingNewSessionAutoSend } from "./use-pending-new-session-auto-send";

describe("usePendingNewSessionAutoSend", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("still sends once when sendMessage changes identity while the transport settles", () => {
    writePendingNewSession("整理下载文件夹");
    const markRunning = vi.fn();
    const firstSend = vi.fn();
    const { rerender } = renderHook(
      ({ sendMessage }) =>
        usePendingNewSessionAutoSend({
          isNewThread: true,
          threadId: "thread-1",
          sendMessage,
          markSidebarThreadRunning: markRunning,
        }),
      {
        initialProps: { sendMessage: firstSend as (...args: never[]) => void },
      },
    );
    // 冷启动时连接状态变化会让 sendMessage 换身份，旧定时器被清理。
    vi.advanceTimersByTime(100);
    const secondSend = vi.fn();
    rerender({ sendMessage: secondSend });
    vi.advanceTimersByTime(300);

    expect(firstSend).not.toHaveBeenCalled();
    expect(secondSend).toHaveBeenCalledTimes(1);
    expect(secondSend).toHaveBeenCalledWith("thread-1", {
      text: "整理下载文件夹",
      files: [],
    });
    expect(markRunning).toHaveBeenCalledWith("thread-1");
    // 交接已被读走，刷新不会重复发送。
    expect(consumePendingNewSession()).toBeNull();

    // 之后的重渲染不会再次发送。
    const thirdSend = vi.fn();
    rerender({ sendMessage: thirdSend });
    vi.advanceTimersByTime(300);
    expect(thirdSend).not.toHaveBeenCalled();
  });

  it("does nothing for existing threads and leaves the hand-off in place", () => {
    writePendingNewSession("写本周周报");
    const sendMessage = vi.fn();
    renderHook(() =>
      usePendingNewSessionAutoSend({
        isNewThread: false,
        threadId: "thread-existing",
        sendMessage,
        markSidebarThreadRunning: vi.fn(),
      }),
    );
    vi.advanceTimersByTime(300);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(consumePendingNewSession()).toBe("写本周周报");
  });

  it("does not send after unmount", () => {
    writePendingNewSession("总结照片");
    const sendMessage = vi.fn();
    const { unmount } = renderHook(() =>
      usePendingNewSessionAutoSend({
        isNewThread: true,
        threadId: "thread-2",
        sendMessage,
        markSidebarThreadRunning: vi.fn(),
      }),
    );
    unmount();
    vi.advanceTimersByTime(300);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
