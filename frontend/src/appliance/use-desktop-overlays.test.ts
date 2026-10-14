import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDesktopOverlays } from "./use-desktop-overlays";

describe("useDesktopOverlays", () => {
  it("starts with every overlay closed", () => {
    const { result } = renderHook(() => useDesktopOverlays());

    expect(result.current.spotlightOpen).toBe(false);
    expect(result.current.launchpadOpen).toBe(false);
    expect(result.current.controlCenterOpen).toBe(false);
    expect(result.current.notificationsOpen).toBe(false);
    expect(result.current.liquidGlassOpen).toBe(false);
    expect(result.current.aboutOpen).toBe(false);
    expect(result.current.accountSecurityOpen).toBe(false);
    expect(result.current.taskSpaceOpen).toBe(false);
  });

  it("setOverlay only touches the requested key (no implicit exclusivity)", () => {
    const { result } = renderHook(() => useDesktopOverlays());

    // 原实现里 setXOpen(true/false) 都是单键操作，收敛后必须保持这一语义，
    // 否则"打开 A 顺手关掉 B"会变成行为变化。
    act(() => result.current.setOverlay("about", true));
    act(() => result.current.setOverlay("taskSpace", true));
    expect(result.current.aboutOpen).toBe(true);
    expect(result.current.taskSpaceOpen).toBe(true);

    act(() => result.current.setOverlay("about", false));
    expect(result.current.aboutOpen).toBe(false);
    expect(result.current.taskSpaceOpen).toBe(true);
  });

  it("toggleOverlay flips only the requested key", () => {
    const { result } = renderHook(() => useDesktopOverlays());

    act(() => result.current.setOverlay("notifications", true));
    act(() => result.current.toggleOverlay("controlCenter"));
    act(() => result.current.toggleOverlay("controlCenter"));

    expect(result.current.controlCenterOpen).toBe(false);
    expect(result.current.notificationsOpen).toBe(true);
  });

  it("closeTransient closes the seven transient overlays but keeps liquidGlass", () => {
    const { result } = renderHook(() => useDesktopOverlays());

    act(() => {
      result.current.setOverlay("spotlight", true);
      result.current.setOverlay("launchpad", true);
      result.current.setOverlay("controlCenter", true);
      result.current.setOverlay("notifications", true);
      result.current.setOverlay("about", true);
      result.current.setOverlay("accountSecurity", true);
      result.current.setOverlay("taskSpace", true);
      result.current.setOverlay("liquidGlass", true);
    });

    act(() => result.current.closeTransient());

    // Escape / 系统动作原本不关闭流光玻璃面板，这条契约必须保住。
    expect(result.current.liquidGlassOpen).toBe(true);
    expect(result.current.spotlightOpen).toBe(false);
    expect(result.current.launchpadOpen).toBe(false);
    expect(result.current.controlCenterOpen).toBe(false);
    expect(result.current.notificationsOpen).toBe(false);
    expect(result.current.aboutOpen).toBe(false);
    expect(result.current.accountSecurityOpen).toBe(false);
    expect(result.current.taskSpaceOpen).toBe(false);
  });

  it("setOverlay is a no-op when the value is unchanged", () => {
    const { result } = renderHook(() => useDesktopOverlays());

    act(() => result.current.setOverlay("spotlight", true));
    const before = result.current;

    act(() => result.current.setOverlay("spotlight", true));
    // 引用不变 => 不触发下游重渲染，与原 useState 的 setXOpen 行为一致
    expect(result.current).toBe(before);
  });
});
