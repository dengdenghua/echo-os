/**
 * Echo OS 桌面窗口(原生路线:桌面即窗口系统)。
 *
 * 第三方应用 Web UI 以 iframe 开成桌面内的可拖拽/缩放窗口。许多自托管应用
 * 默认允许内嵌即可直接显示;设了 X-Frame-Options 的需要反向代理剥头
 * (P2 后续,需真实应用验证),在此一律提供"新标签打开"兜底,不做不可靠的
 * 跨域内嵌探测。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ExternalLinkIcon,
  Maximize2Icon,
  Minimize2Icon,
  MinusIcon,
  MoonIcon,
  PanelLeftIcon,
  PanelRightIcon,
  XIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  calculateLiquidGlassMotion,
  emitLiquidGlassMotion,
  type LiquidGlassMotionSample,
} from "@/appliance/liquid-glass-motion";
import {
  getDesktopWorkArea,
  getDesktopWorkAreaSync,
  type ScreenWorkArea,
} from "./desktop-screen-bounds";
import type { WindowGeometry } from "./use-desktop-windows";
import { playSystemSound } from "./desktop-audio-feedback";

export type DesktopWindow = {
  threadId?: string;
  workspaceRoute?: string;
  artifactRequest?: { path: string; revision: number };
  id: string;
  title: string;
  url: string;
  /** 系统内建应用直接渲染 React 内容，不经过 iframe 或另一套前端。 */
  content?: ReactNode;
  /** Agent 等内建应用把导航并入窗口内容，由 Echo OS 叠加唯一一套系统按钮。 */
  integratedChrome?: boolean;
  /** 首次打开时的期望尺寸，会按当前工作区收缩。 */
  preferredSize?: { w: number; h: number };
  /** 内容自带标题栏的高度：系统按钮在其中垂直居中，空白处可拖动窗口。 */
  chromeHeight?: number;
};

const MIN_W = 360;
const MIN_H = 240;

/** 窗口可占用区域相对工作区的留白：顶部让出菜单栏，底部让出 Dock。 */
const WINDOW_SIDE_INSET = 6;
const WINDOW_TOP_INSET = 31;
const WINDOW_BOTTOM_INSET = 83;
/** 内建应用把导航并入窗口内容，顶部这一条的空白处都可以拖动窗口。 */
const TITLEBAR_DRAG_HEIGHT = 40;
const NON_DRAGGABLE_TARGET =
  "button, a, input, select, textarea, label, summary, [role='button'], [role='tab'], [role='menuitem'], [role='combobox'], [role='slider'], [contenteditable='true'], [data-no-window-drag]";
/** 手机悬浮小窗始终位于普通窗口之上。 */
const PHONE_PIP_Z = 10_000;
const SNAP_PREVIEW_Z = 9_000;

export type WindowSnapZone = "none" | "maximize" | "left" | "right";

type Rect = { x: number; y: number; w: number; h: number };

function maximizedRect(area: ScreenWorkArea): Rect {
  return {
    x: area.x + WINDOW_SIDE_INSET,
    y: area.y + WINDOW_TOP_INSET,
    w: Math.max(MIN_W, area.width - WINDOW_SIDE_INSET * 2),
    h: Math.max(MIN_H, area.height - WINDOW_TOP_INSET - WINDOW_BOTTOM_INSET),
  };
}

function tiledRect(area: ScreenWorkArea, side: "left" | "right"): Rect {
  const full = maximizedRect(area);
  const w = Math.floor((area.width - 16) / 2);
  return {
    x: side === "left" ? full.x : area.x + w + 10,
    y: full.y,
    w,
    h: full.h,
  };
}

/**
 * 把窗口收回当前工作区：放得下就完整显示，放不下就缩到工作区大小。
 * 已在区域内的窗口原样返回（同一引用），调用方据此跳过状态更新。
 */
export function fitRectToWorkArea(rect: Rect, area: ScreenWorkArea): Rect {
  const bounds = maximizedRect(area);
  const w = Math.min(rect.w, bounds.w);
  const h = Math.min(rect.h, bounds.h);
  const x = Math.min(Math.max(rect.x, bounds.x), bounds.x + bounds.w - w);
  const y = Math.min(Math.max(rect.y, bounds.y), bounds.y + bounds.h - h);
  if (x === rect.x && y === rect.y && w === rect.w && h === rect.h) return rect;
  return { x, y, w, h };
}

function ZoomTrafficLight({
  maximized,
  winTitle,
  onToggleMaximize,
  onTileLeft,
  onTileRight,
}: {
  maximized: boolean;
  winTitle: string;
  onToggleMaximize: () => void;
  onTileLeft: () => void;
  onTileRight: () => void;
}) {
  const [showTileMenu, setShowTileMenu] = useState(false);
  const hoverTimer = useRef<number | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      setShowTileMenu(true);
    }, 320);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      setShowTileMenu(false);
    }, 220);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    };
  }, []);

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onToggleMaximize}
        title={maximized ? "恢复" : "缩放 (悬停分屏)"}
        aria-label={maximized ? `恢复${winTitle}` : `缩放${winTitle}`}
        className="mac-traffic-light zoom"
      >
        {maximized ? (
          <Minimize2Icon aria-hidden className="mac-traffic-glyph" />
        ) : (
          <Maximize2Icon aria-hidden className="mac-traffic-glyph" />
        )}
      </button>
      {showTileMenu && (
        <div
          data-testid="window-quick-tile-menu"
          className="mac-quick-tile-menu absolute left-0 top-5 z-50 flex min-w-[130px] flex-col gap-1 rounded-xl border border-border bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-xl"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-0.5 text-[12px] font-semibold text-muted-foreground select-none">
            分屏排列
          </div>
          <button
            type="button"
            onClick={() => {
              playSystemSound("snap");
              onTileLeft();
              setShowTileMenu(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs text-slate-200 hover:bg-core/30 hover:text-primary-foreground transition-colors"
          >
            <PanelLeftIcon className="size-3.5 text-core" />
            <span>靠左半屏</span>
          </button>
          <button
            type="button"
            onClick={() => {
              playSystemSound("snap");
              onTileRight();
              setShowTileMenu(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs text-slate-200 hover:bg-core/30 hover:text-primary-foreground transition-colors"
          >
            <PanelRightIcon className="size-3.5 text-core" />
            <span>靠右半屏</span>
          </button>
          <div className="my-0.5 border-t border-border" />
          <button
            type="button"
            onClick={() => {
              onToggleMaximize();
              setShowTileMenu(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs text-slate-200 hover:bg-card/10 hover:text-white transition-colors"
          >
            {maximized ? (
              <>
                <Minimize2Icon className="size-3.5 text-core" />
                <span>还原窗口</span>
              </>
            ) : (
              <>
                <Maximize2Icon className="size-3.5 text-core" />
                <span>最大化 (全屏)</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function initialRect(
  index: number,
  phone = false,
  preferred?: { w: number; h: number },
): Rect {
  // 层叠摆放,避免完全重叠。
  const offset = (index % 6) * 28;
  if (preferred) {
    // 应用声明了自己的尺寸：居中打开，并收进当前工作区。
    const area = getDesktopWorkAreaSync();
    const bounds = maximizedRect(area);
    const w = Math.min(preferred.w, bounds.w);
    const h = Math.min(preferred.h, bounds.h);
    return fitRectToWorkArea(
      {
        x: Math.round(area.x + (area.width - w) / 2 + offset),
        y: Math.round(bounds.y + (bounds.h - h) / 2 + offset),
        w,
        h,
      },
      area,
    );
  }
  const w = Math.min(
    phone ? 480 : 960,
    Math.max(MIN_W, window.innerWidth - 220),
  );
  const h = Math.min(
    phone ? 780 : 620,
    Math.max(MIN_H, window.innerHeight - (phone ? 100 : 220)),
  );
  return {
    x: Math.max(20, (window.innerWidth - w) / 2 - 60 + offset),
    y: Math.max(16, (window.innerHeight - h) / 2 - 40 + offset),
    w,
    h,
  };
}

export function AppWindow({
  win,
  index,
  focused,
  hidden = false,
  stackOrder,
  initialGeometry,
  onGeometryChange,
  onFocus,
  onClose,
  onMinimize,
}: {
  win: DesktopWindow;
  index: number;
  focused: boolean;
  hidden?: boolean;
  /** 在最近使用栈中的位置，越大越靠上。缺省时只区分聚焦与否。 */
  stackOrder?: number;
  initialGeometry?: WindowGeometry;
  onGeometryChange?: (geometry: WindowGeometry) => void;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
}) {
  const [rect, setRect] = useState<Rect>(() => {
    const area = getDesktopWorkAreaSync();
    if (initialGeometry?.maximized) return maximizedRect(area);
    if (
      initialGeometry &&
      typeof initialGeometry.x === "number" &&
      typeof initialGeometry.y === "number" &&
      initialGeometry.w >= MIN_W &&
      initialGeometry.h >= MIN_H
    ) {
      // 上次会话可能在更大的屏幕上，恢复时先收回当前工作区。
      return fitRectToWorkArea(
        {
          x: initialGeometry.x,
          y: initialGeometry.y,
          w: initialGeometry.w,
          h: initialGeometry.h,
        },
        area,
      );
    }
    return initialRect(index, win.url === "/phone-mirror", win.preferredSize);
  });
  const [maximized, setMaximized] = useState(
    () => !!initialGeometry?.maximized,
  );
  /** 入场动画只播一次；拖拽结束或重绘不应让窗口重新"弹入"。 */
  const [entered, setEntered] = useState(false);
  const [phonePip, setPhonePip] = useState(false);
  const beforePhonePip = useRef<WindowGeometry | null>(null);
  const [isSleeping, setIsSleeping] = useState(false);
  const [snapZone, setSnapZone] = useState<WindowSnapZone>("none");
  const snapZoneRef = useRef<WindowSnapZone>("none");
  snapZoneRef.current = snapZone;
  const restoreRect = useRef<Rect | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const rectFrame = useRef<number | null>(null);
  const pendingRect = useRef<Rect | null>(null);
  const motionPoint = useRef({ x: 0, y: 0, time: 0 });
  const lastMotion = useRef<LiquidGlassMotionSample>({
    x: 0,
    y: 0,
    energy: 0,
    settleMs: 0,
  });
  const drag = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    orig: Rect;
  } | null>(null);

  const rectRef = useRef(rect);
  rectRef.current = rect;
  const maximizedRef = useRef(maximized);
  maximizedRef.current = maximized;
  const onGeometryChangeRef = useRef(onGeometryChange);
  onGeometryChangeRef.current = onGeometryChange;

  const snapPreviewRect = useMemo<Rect | null>(() => {
    if (snapZone === "none") return null;
    const workArea = getDesktopWorkAreaSync();
    if (snapZone === "maximize") return maximizedRect(workArea);
    return tiledRect(workArea, snapZone);
  }, [snapZone]);

  // 最小化后再恢复时重播入场动画，作为恢复反馈。
  useEffect(() => {
    if (hidden) setEntered(false);
  }, [hidden]);

  const handleWakeAndFocus = useCallback(() => {
    if (isSleeping) {
      setIsSleeping(false);
    }
    onFocus();
  }, [isSleeping, onFocus]);

  const tile = useCallback(
    (side: "left" | "right") => {
      handleWakeAndFocus();
      if (!maximized) {
        restoreRect.current = rect;
      }
      const targetRect = tiledRect(getDesktopWorkAreaSync(), side);
      setRect(targetRect);
      setMaximized(false);
      onGeometryChange?.({ ...targetRect, maximized: false });
    },
    [handleWakeAndFocus, maximized, onGeometryChange, rect],
  );
  const tileLeft = useCallback(() => tile("left"), [tile]);
  const tileRight = useCallback(() => tile("right"), [tile]);

  // 10 分钟后台未激活的非内建 iframe 窗口进入节能休眠状态
  useEffect(() => {
    if (focused || win.content || isSleeping) return;
    const timer = window.setTimeout(
      () => {
        setIsSleeping(true);
      },
      10 * 60 * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [focused, isSleeping, win.content]);

  const queueRect = useCallback((next: Rect) => {
    pendingRect.current = next;
    if (rectFrame.current !== null) return;
    rectFrame.current = window.requestAnimationFrame(() => {
      if (pendingRect.current) setRect(pendingRect.current);
      pendingRect.current = null;
      rectFrame.current = null;
    });
  }, []);

  const beginWindowMotion = useCallback(
    (x: number, y: number, mode: "move" | "resize", time: number) => {
      motionPoint.current = { x, y, time };
      const element = windowRef.current;
      if (!element) return;
      element.dataset.windowDragging = mode;
      element.style.setProperty("--window-tilt-x", "0deg");
      element.style.setProperty("--window-tilt-y", "0deg");
    },
    [],
  );

  const updateWindowMotion = useCallback(
    (x: number, y: number, mode: "move" | "resize", time: number) => {
      const previous = motionPoint.current;
      const motion = calculateLiquidGlassMotion(
        x - previous.x,
        y - previous.y,
        time - previous.time,
      );
      motionPoint.current = { x, y, time };
      lastMotion.current = motion;
      const element = windowRef.current;
      if (element) {
        const tiltScale = mode === "move" ? 0.62 : 0;
        element.style.setProperty(
          "--window-tilt-x",
          `${(-motion.y * tiltScale).toFixed(3)}deg`,
        );
        element.style.setProperty(
          "--window-tilt-y",
          `${(motion.x * tiltScale).toFixed(3)}deg`,
        );
        element.style.setProperty(
          "--liquid-motion-x",
          `${(motion.x * 5.5).toFixed(2)}px`,
        );
        element.style.setProperty(
          "--liquid-motion-y",
          `${(motion.y * 4.5).toFixed(2)}px`,
        );
        element.style.setProperty(
          "--liquid-motion-energy",
          motion.energy.toFixed(3),
        );
      }
      if (motion.energy > 0) {
        emitLiquidGlassMotion({
          source: mode === "move" ? "window-move" : "window-resize",
          ...motion,
          layout: true,
        });
      }
    },
    [],
  );

  const settleWindowMotion = useCallback(() => {
    if (rectFrame.current !== null) {
      window.cancelAnimationFrame(rectFrame.current);
      rectFrame.current = null;
    }
    let currentRect = rectRef.current;
    if (pendingRect.current) {
      currentRect = pendingRect.current;
      setRect(pendingRect.current);
      pendingRect.current = null;
    }
    const element = windowRef.current;
    if (element) {
      delete element.dataset.windowDragging;
      element.style.setProperty("--window-tilt-x", "0deg");
      element.style.setProperty("--window-tilt-y", "0deg");
      element.style.setProperty("--liquid-motion-x", "0px");
      element.style.setProperty("--liquid-motion-y", "0px");
      element.style.setProperty("--liquid-motion-energy", "0");
    }
    const motion = lastMotion.current;
    emitLiquidGlassMotion({
      source: drag.current?.mode === "resize" ? "window-resize" : "window-move",
      ...motion,
      settleMs: Math.max(180, motion.settleMs),
      layout: true,
    });
    lastMotion.current = { x: 0, y: 0, energy: 0, settleMs: 0 };
    onGeometryChangeRef.current?.({
      ...currentRect,
      maximized: maximizedRef.current,
    });
  }, []);

  const onPointerMove = useCallback(
    (event: globalThis.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = event.clientX - d.startX;
      const dy = event.clientY - d.startY;
      const workArea = getDesktopWorkAreaSync();
      if (d.mode === "move") {
        const minX = workArea.x;
        const maxX = Math.max(minX, workArea.x + workArea.width - 80);
        const minY = workArea.y + 25;
        const maxY = Math.max(minY, workArea.y + workArea.height - 110);
        queueRect({
          ...d.orig,
          x: Math.max(minX, Math.min(maxX, d.orig.x + dx)),
          y: Math.max(minY, Math.min(maxY, d.orig.y + dy)),
        });

        // Smart edge snap zone detection
        let nextZone: WindowSnapZone = "none";
        if (event.clientY <= workArea.y + 26) {
          nextZone = "maximize";
        } else if (event.clientX <= workArea.x + 22) {
          nextZone = "left";
        } else if (event.clientX >= workArea.x + workArea.width - 24) {
          nextZone = "right";
        }
        if (snapZoneRef.current !== nextZone) {
          snapZoneRef.current = nextZone;
          setSnapZone(nextZone);
        }
      } else {
        const maxW = Math.max(MIN_W, workArea.width - (d.orig.x - workArea.x));
        const maxH = Math.max(MIN_H, workArea.height - (d.orig.y - workArea.y));
        queueRect({
          ...d.orig,
          w: Math.max(MIN_W, Math.min(maxW, d.orig.w + dx)),
          h: Math.max(MIN_H, Math.min(maxH, d.orig.h + dy)),
        });
      }
      updateWindowMotion(
        event.clientX,
        event.clientY,
        d.mode,
        event.timeStamp || performance.now(),
      );
    },
    [queueRect, updateWindowMotion],
  );

  const endDrag = useCallback(() => {
    const activeZone = snapZoneRef.current;
    const workArea = getDesktopWorkAreaSync();
    settleWindowMotion();
    const d = drag.current;
    drag.current = null;
    snapZoneRef.current = "none";
    setSnapZone("none");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);

    if (activeZone !== "none") {
      playSystemSound("snap");
    }

    if (activeZone === "maximize") {
      if (d && !maximizedRef.current) {
        restoreRect.current = d.orig;
      }
      const maxRect = maximizedRect(workArea);
      setRect(maxRect);
      setMaximized(true);
      onGeometryChangeRef.current?.({ ...maxRect, maximized: true });
    } else if (activeZone === "left" || activeZone === "right") {
      if (d && !maximizedRef.current) {
        restoreRect.current = d.orig;
      }
      const targetRect = tiledRect(workArea, activeZone);
      setRect(targetRect);
      setMaximized(false);
      onGeometryChangeRef.current?.({ ...targetRect, maximized: false });
    }
  }, [onPointerMove, settleWindowMotion]);

  useEffect(
    () => () => {
      if (rectFrame.current !== null) {
        window.cancelAnimationFrame(rectFrame.current);
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
    },
    [endDrag, onPointerMove],
  );

  const startDrag = (mode: "move" | "resize") => (event: PointerEvent) => {
    event.preventDefault();
    handleWakeAndFocus();
    void getDesktopWorkArea(true);
    if (mode === "resize" && maximized) return;

    let orig = rect;
    const startX = event.clientX;
    const startY = event.clientY;

    if (maximized && mode === "move") {
      const workArea = getDesktopWorkAreaSync();
      const restore = fitRectToWorkArea(
        restoreRect.current || initialRect(index, false, win.preferredSize),
        workArea,
      );
      const ratio = Math.min(
        Math.max((event.clientX - rect.x) / Math.max(1, rect.w), 0.1),
        0.9,
      );
      const newX = Math.round(event.clientX - restore.w * ratio);
      const newY = Math.max(workArea.y + 25, event.clientY - 16);
      orig = {
        x: Math.max(
          workArea.x,
          Math.min(workArea.x + workArea.width - 80, newX),
        ),
        y: newY,
        w: restore.w,
        h: restore.h,
      };
      setRect(orig);
      setMaximized(false);
      onGeometryChange?.({ ...orig, maximized: false });
    }

    drag.current = {
      mode,
      startX,
      startY,
      orig,
    };
    beginWindowMotion(
      event.clientX,
      event.clientY,
      mode,
      event.timeStamp || performance.now(),
    );
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
  };

  const toggleMaximize = useCallback(() => {
    handleWakeAndFocus();
    if (maximized) {
      // 最大化期间视口可能变小，还原尺寸也要收回当前工作区。
      const target = fitRectToWorkArea(
        restoreRect.current || rect,
        getDesktopWorkAreaSync(),
      );
      setRect(target);
      restoreRect.current = null;
      setMaximized(false);
      onGeometryChange?.({ ...target, maximized: false });
      return;
    }
    restoreRect.current = rect;
    const maxRect = maximizedRect(getDesktopWorkAreaSync());
    setRect(maxRect);
    setMaximized(true);
    onGeometryChange?.({ ...maxRect, maximized: true });
  }, [handleWakeAndFocus, maximized, onGeometryChange, rect]);

  useEffect(() => {
    if (!win.integratedChrome || win.content) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as
        | {
            type?: string;
            action?: "close" | "minimize" | "maximize";
            phase?: "start" | "move" | "end";
            screenX?: number;
            screenY?: number;
          }
        | undefined;
      if (!data || typeof data !== "object") return;

      if (data.type === "echo-os:window-control") {
        if (data.action === "close") onClose();
        else if (data.action === "minimize") onMinimize();
        else if (data.action === "maximize") toggleMaximize();
        return;
      }

      if (
        data.type !== "echo-os:window-drag" ||
        typeof data.screenX !== "number" ||
        typeof data.screenY !== "number"
      ) {
        return;
      }
      if (data.phase === "start") {
        onFocus();
        if (maximized) return;
        drag.current = {
          mode: "move",
          startX: data.screenX,
          startY: data.screenY,
          orig: rect,
        };
        beginWindowMotion(
          data.screenX,
          data.screenY,
          "move",
          performance.now(),
        );
      } else if (data.phase === "move") {
        const current = drag.current;
        if (!current || current.mode !== "move") return;
        const dx = data.screenX - current.startX;
        const dy = data.screenY - current.startY;
        queueRect({
          ...current.orig,
          x: Math.max(0, Math.min(window.innerWidth - 80, current.orig.x + dx)),
          y: Math.max(
            25,
            Math.min(window.innerHeight - 110, current.orig.y + dy),
          ),
        });
        updateWindowMotion(
          data.screenX,
          data.screenY,
          "move",
          performance.now(),
        );
      } else if (data.phase === "end") {
        settleWindowMotion();
        drag.current = null;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [
    beginWindowMotion,
    maximized,
    onClose,
    onFocus,
    onMinimize,
    queueRect,
    rect,
    settleWindowMotion,
    toggleMaximize,
    updateWindowMotion,
    win.content,
    win.integratedChrome,
  ]);

  // 视口变化（分辨率、窗口尺寸、外接屏）后：最大化窗口跟随新工作区，
  // 其余窗口收回可见区域，避免标题栏跑到屏幕外再也拖不回来。
  useEffect(() => {
    const resize = () => {
      const workArea = getDesktopWorkAreaSync();
      if (maximizedRef.current) {
        const maxRect = maximizedRect(workArea);
        setRect(maxRect);
        onGeometryChangeRef.current?.({ ...maxRect, maximized: true });
        return;
      }
      const current = rectRef.current;
      const next = fitRectToWorkArea(current, workArea);
      if (next === current) return;
      setRect(next);
      onGeometryChangeRef.current?.({ ...next, maximized: false });
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const isTitlebarHit = (event: PointerEvent | MouseEvent<HTMLDivElement>) => {
    // 手机镜像的内容区逐像素映射到手机屏幕，不能拿来拖窗口。
    if (!win.integratedChrome || !win.content || win.url === "/phone-mirror")
      return false;
    const element = windowRef.current;
    const target = event.target;
    if (!element || !(target instanceof Element)) return false;
    // 系统按钮条自己处理拖动和双击，避免同一次双击被处理两次。
    if (target.closest(".mac-window-integrated-controls, .mac-window-titlebar"))
      return false;
    if (target.closest(NON_DRAGGABLE_TARGET)) return false;
    return (
      event.clientY - element.getBoundingClientRect().top <=
      (win.chromeHeight ?? TITLEBAR_DRAG_HEIGHT)
    );
  };

  const handleWindowPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current || event.button !== 0 || !isTitlebarHit(event)) {
      handleWakeAndFocus();
      return;
    }
    startDrag("move")(event);
  };

  const togglePhonePip = () => {
    if (!phonePip) {
      beforePhonePip.current = { ...rect, maximized };
      const area = getDesktopWorkAreaSync();
      const next = {
        x: Math.max(area.x, area.x + area.width - 380),
        y: Math.max(area.y + 35, area.y + area.height - 565),
        w: 360,
        h: 480,
      };
      setRect(next);
      setMaximized(false);
      onGeometryChange?.({ ...next, maximized: false });
    } else if (beforePhonePip.current) {
      setRect(beforePhonePip.current);
      setMaximized(!!beforePhonePip.current.maximized);
      onGeometryChange?.(beforePhonePip.current);
    }
    setPhonePip(!phonePip);
    onFocus();
  };

  return (
    <>
      {snapPreviewRect && (
        <div
          data-testid="window-snap-preview"
          className="mac-window-snap-preview fixed pointer-events-none rounded-2xl transition-all duration-200"
          style={{
            zIndex: SNAP_PREVIEW_Z,
            left: `${snapPreviewRect.x}px`,
            top: `${snapPreviewRect.y}px`,
            width: `${snapPreviewRect.w}px`,
            height: `${snapPreviewRect.h}px`,
          }}
        >
          <div className="size-full rounded-2xl border-2 border-core/30 bg-core/15 backdrop-blur-md shadow-[0_8px_32px_rgba(59,130,246,0.25)]" />
        </div>
      )}
      <div
        ref={windowRef}
        role="dialog"
        aria-label={win.title}
        data-window-id={win.id}
        data-desktop-interactive
        data-phone-pip={phonePip || undefined}
        data-window-entered={entered || undefined}
        aria-hidden={hidden || undefined}
        data-liquid-surface="ultra-thick"
        onPointerDown={handleWindowPointerDown}
        onDoubleClick={(event) => {
          if (isTitlebarHit(event)) toggleMaximize();
        }}
        onAnimationEnd={(event) => {
          if (
            event.target === event.currentTarget &&
            event.animationName === "mac-window-spring-enter"
          ) {
            setEntered(true);
          }
        }}
        className={cn(
          // clip, not hidden: focusing a control near an edge must never scroll
          // the window frame itself (hidden still allows programmatic scroll).
          "mac-window absolute flex flex-col overflow-clip",
          !focused && "is-unfocused",
          win.integratedChrome && "is-integrated-chrome",
        )}
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.w,
          height: rect.h,
          zIndex: phonePip
            ? PHONE_PIP_Z
            : stackOrder !== undefined
              ? 10 + stackOrder
              : focused
                ? 50
                : 40,
          display: hidden ? "none" : undefined,
        }}
      >
        {win.integratedChrome && (
          /* 全尺寸内容窗口没有第二条标题栏，但系统按钮必须始终存在。 */
          <div
            className="mac-window-integrated-controls select-none"
            style={
              win.url === "/phone-mirror"
                ? {
                    position: "relative",
                    inset: "auto",
                    width: "100%",
                    height: 32,
                    minHeight: 32,
                    padding: "4px 12px",
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    background: "rgba(248,250,252,.95)",
                  }
                : win.chromeHeight
                  ? { height: win.chromeHeight }
                  : undefined
            }
            onPointerDown={startDrag("move")}
            onDoubleClick={toggleMaximize}
            aria-label={`${win.title}窗口控制`}
          >
            {win.url === "/phone-mirror" && (
              <button
                type="button"
                className="shrink-0 whitespace-nowrap rounded bg-card/90 px-2 py-1 text-[12px] text-foreground"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={togglePhonePip}
                aria-label={phonePip ? "恢复手机窗口" : "切换为悬浮小窗"}
              >
                {phonePip ? "恢复窗口" : "悬浮小窗"}
              </button>
            )}
            <div className="mac-traffic-lights">
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={onClose}
                title="关闭"
                aria-label={`关闭${win.title}`}
                className="mac-traffic-light close"
              >
                <XIcon aria-hidden className="mac-traffic-glyph" />
              </button>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={onMinimize}
                title="最小化"
                aria-label={`最小化${win.title}`}
                className="mac-traffic-light minimize"
              >
                <MinusIcon aria-hidden className="mac-traffic-glyph" />
              </button>
              <ZoomTrafficLight
                maximized={maximized}
                winTitle={win.title}
                onToggleMaximize={toggleMaximize}
                onTileLeft={tileLeft}
                onTileRight={tileRight}
              />
            </div>
          </div>
        )}

        {!win.integratedChrome && (
          /* 第三方应用仍由 Echo OS 提供完整窗口框架。 */
          <div
            onPointerDown={startDrag("move")}
            onDoubleClick={toggleMaximize}
            className="mac-window-titlebar select-none"
          >
            <div className="mac-traffic-lights">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onClose}
                title="关闭"
                aria-label={`关闭${win.title}`}
                className="mac-traffic-light close"
              >
                <XIcon aria-hidden className="mac-traffic-glyph" />
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onMinimize}
                title="最小化"
                aria-label={`最小化${win.title}`}
                className="mac-traffic-light minimize"
              >
                <MinusIcon aria-hidden className="mac-traffic-glyph" />
              </button>
              <ZoomTrafficLight
                maximized={maximized}
                winTitle={win.title}
                onToggleMaximize={toggleMaximize}
                onTileLeft={tileLeft}
                onTileRight={tileRight}
              />
            </div>
            <span className="mac-window-title">{win.title}</span>
            <div className="mac-window-actions flex items-center gap-1.5">
              {!win.content && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setIsSleeping((prev) => !prev)}
                  title={isSleeping ? "唤醒此窗口" : "智能挂起休眠以节省资源"}
                  aria-label={isSleeping ? "唤醒窗口" : "休眠窗口"}
                  className={cn(
                    "mac-window-action flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] transition-colors",
                    isSleeping
                      ? "bg-warning/20 text-warning font-semibold"
                      : "text-muted-foreground hover:text-white",
                  )}
                >
                  <MoonIcon className="size-3" />
                  <span className="hidden sm:inline">
                    {isSleeping ? "已休眠" : "休眠"}
                  </span>
                </button>
              )}
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => window.open(win.url, "_blank", "noopener")}
                title="在新标签打开"
                className="mac-window-action"
              >
                <ExternalLinkIcon className="size-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* 内容 */}
        <div className="mac-window-content relative">
          {win.content ?? (
            <>
              <iframe
                ref={iframeRef}
                src={win.url}
                title={win.title}
                className={cn(
                  "size-full border-0 transition-opacity duration-300",
                  isSleeping && "invisible opacity-0 pointer-events-none",
                )}
                style={isSleeping ? { contentVisibility: "hidden" } : undefined}
                allow="camera; microphone; clipboard-read; clipboard-write; fullscreen"
                sandbox="allow-same-origin allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"
              />
              {isSleeping && (
                <div
                  data-testid="window-sleep-shield"
                  onClick={handleWakeAndFocus}
                  className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-900/85 backdrop-blur-xl text-center p-6 select-none cursor-pointer"
                >
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-core/15 border border-core/30 text-core shadow-inner">
                    <MoonIcon className="size-6 animate-pulse" />
                  </div>
                  <h4 className="mt-3 font-semibold text-xs text-slate-100">
                    {win.title} · 已进入节能休眠
                  </h4>
                  <p className="mt-1 max-w-xs text-[12px] text-muted-foreground">
                    后台渲染与 iframe 运算已暂时挂起，大幅降低系统能耗。
                  </p>
                  <button
                    type="button"
                    onClick={handleWakeAndFocus}
                    className="mt-3.5 rounded-lg bg-primary px-3.5 py-1 text-xs font-semibold text-primary-foreground shadow-md shadow-black/20 hover:bg-primary transition-all"
                  >
                    点击即时唤醒 →
                  </button>
                </div>
              )}
            </>
          )}
          {/* iframe 失焦时盖一层透明层，避免拖动经过第三方页面被吞掉指针事件。 */}
          {!focused && !win.content && !isSleeping && (
            <div
              className="absolute inset-0"
              onPointerDown={handleWakeAndFocus}
            />
          )}
        </div>

        {/* 右下角缩放手柄 */}
        <div
          onPointerDown={startDrag("resize")}
          className="mac-window-resize"
        />
      </div>
    </>
  );
}
