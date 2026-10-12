/**
 * 系统应用（文件、照片、Hub……）的统一窗口形态。
 *
 * 这些应用原本各自是全屏遮罩上的居中面板：同一时间只能开一个、会盖住 Dock、
 * 不能拖动或最小化。现在它们和其他应用一样进入桌面窗口管理器：
 * - 在桌面窗口里：AppWindow 提供外框、红绿灯、拖动、叠放与最小化，面板只渲染内容；
 * - 单独渲染（测试、工作台等其他外壳）：保留原来的居中浮层，行为不变。
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import type { DesktopWindow } from "./app-window";

const SystemAppWindowContext = createContext(false);

export function SystemAppWindowProvider({ children }: { children: ReactNode }) {
  return (
    <SystemAppWindowContext.Provider value={true}>
      {children}
    </SystemAppWindowContext.Provider>
  );
}

/** 当前是否渲染在桌面窗口里（由窗口提供外框与系统按钮）。 */
export function useInSystemAppWindow(): boolean {
  return useContext(SystemAppWindowContext);
}

/**
 * 面板外框。浮层形态与原实现逐字一致；窗口形态去掉遮罩、尺寸、圆角和阴影，
 * 只保留面板自己的内部布局。
 */
export function SystemAppFrame({
  label,
  onClose,
  overlayClassName,
  className,
  windowClassName,
  backdropButtonLabel,
  trailing,
  children,
}: {
  label: string;
  onClose: () => void;
  /** 浮层形态的遮罩样式。 */
  overlayClassName: string;
  /** 浮层形态的面板样式。 */
  className: string;
  /** 窗口形态的面板样式（填满窗口内容区）。 */
  windowClassName: string;
  /** 设置后用一个覆盖遮罩的按钮关闭浮层，否则在遮罩上按下即关闭。 */
  backdropButtonLabel?: string;
  /** 渲染在面板之后、同一容器内的附属浮层（如审批对话框）。 */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const inWindow = useInSystemAppWindow();
  if (inWindow) {
    return (
      <>
        <section aria-label={label} className={windowClassName}>
          {children}
        </section>
        {trailing}
      </>
    );
  }
  return (
    <div
      data-desktop-interactive
      className={overlayClassName}
      onMouseDown={
        backdropButtonLabel
          ? undefined
          : (event) => {
              if (event.target === event.currentTarget) onClose();
            }
      }
    >
      {backdropButtonLabel && (
        <button
          type="button"
          aria-label={backdropButtonLabel}
          className="absolute inset-0 cursor-default"
          onClick={onClose}
        />
      )}
      <section
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={className}
      >
        {children}
      </section>
      {trailing}
    </div>
  );
}

/** 窗口形态下系统红绿灯叠在这里，面板只留出同样大小的位置。 */
export function SystemAppLightsSpacer() {
  return <span aria-hidden className="block h-3.5 w-11 shrink-0" />;
}

export type SystemAppId =
  | "files"
  | "photos"
  | "hub"
  | "storage-center"
  | "device-link"
  | "activity-monitor"
  | "settings"
  | "browser"
  | "decision-inbox"
  | "task-space";

/**
 * 每个系统应用的窗口规格。chromeHeight 是应用自身标题栏（或侧栏顶部按钮行）
 * 的高度，系统红绿灯据此垂直居中，顶部这一条的空白处也可拖动窗口。
 */
export const SYSTEM_APP_WINDOWS: Record<
  SystemAppId,
  { title: string; size: { w: number; h: number }; chromeHeight: number }
> = {
  files: { title: "文件", size: { w: 1080, h: 660 }, chromeHeight: 52 },
  photos: { title: "照片", size: { w: 1160, h: 780 }, chromeHeight: 56 },
  hub: { title: "Echo Hub", size: { w: 1060, h: 740 }, chromeHeight: 56 },
  "storage-center": {
    title: "存储中心",
    size: { w: 1120, h: 760 },
    chromeHeight: 46,
  },
  "device-link": {
    title: "设备连接",
    size: { w: 920, h: 620 },
    chromeHeight: 44,
  },
  "task-space": {
    title: "任务空间",
    size: { w: 920, h: 700 },
    chromeHeight: 48,
  },
  "decision-inbox": {
    title: "审批收件箱",
    size: { w: 760, h: 620 },
    chromeHeight: 48,
  },
  "activity-monitor": {
    title: "活动监视器",
    size: { w: 660, h: 440 },
    chromeHeight: 48,
  },
  settings: {
    title: "系统设置",
    size: { w: 1120, h: 740 },
    chromeHeight: 44,
  },
  browser: {
    title: "AI 浏览器",
    size: { w: 1180, h: 760 },
    chromeHeight: 40,
  },
};

const SYSTEM_WINDOW_PREFIX = "system:";

export function systemAppWindowId(app: SystemAppId): string {
  return `${SYSTEM_WINDOW_PREFIX}${app}`;
}

export function systemAppForWindow(windowId: string): SystemAppId | null {
  if (!windowId.startsWith(SYSTEM_WINDOW_PREFIX)) return null;
  const app = windowId.slice(SYSTEM_WINDOW_PREFIX.length);
  return app in SYSTEM_APP_WINDOWS ? (app as SystemAppId) : null;
}

export function systemAppWindow(app: SystemAppId): DesktopWindow {
  const spec = SYSTEM_APP_WINDOWS[app];
  return {
    id: systemAppWindowId(app),
    title: spec.title,
    url: `/system/${app}`,
    // 内容在渲染时按桌面当前状态注入（见 desktop page），这里只占位，
    // 保证窗口不会退化成 iframe。
    content: null,
    integratedChrome: true,
    preferredSize: spec.size,
    chromeHeight: spec.chromeHeight,
  };
}

/**
 * 与 useState<boolean> 同形的开关：true 打开（已打开则恢复并置顶），
 * false 关闭窗口。读到的值由窗口列表推导，窗口管理器是唯一事实来源。
 */
export function useSystemAppWindow(
  app: SystemAppId,
  windows: readonly DesktopWindow[],
  openWindow: (window: DesktopWindow) => void,
  closeWindow: (id: string) => void,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  const id = systemAppWindowId(app);
  const open = windows.some((entry) => entry.id === id);
  const openRef = useRef(open);
  openRef.current = open;
  const setOpen = useCallback<Dispatch<SetStateAction<boolean>>>(
    (next) => {
      const value = typeof next === "function" ? next(openRef.current) : next;
      if (value) {
        openRef.current = true;
        openWindow(systemAppWindow(app));
      } else if (openRef.current) {
        openRef.current = false;
        closeWindow(id);
      }
    },
    [app, closeWindow, id, openWindow],
  );
  return [open, setOpen];
}
