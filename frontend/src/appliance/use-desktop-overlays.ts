import { useCallback, useMemo, useState } from "react";

/**
 * 桌面浮层开关组。
 *
 * page.tsx 原本用 8 个独立 useState 管这些浮层开关（Spotlight / Launchpad / 控制中心 /
 * 通知中心 / 流光玻璃 / 关于 / 账号安全 / 任务空间）。它们共用同一套"打开前先收起相关浮层，
 * 避免多层浮层叠加"的约定，是一个内聚状态簇。
 *
 * 本 hook 把 8 个 useState 收敛为**单一状态对象**，对外暴露逐键读写与一个成组关闭：
 * 语义与原 `setXOpen(v)` / `setXOpen(v => !v)` 严格等价（纯重构，不改行为）。
 * 收敛价值：状态数量下降、浮层清单集中一处（新增浮层只改这里），
 * 且 Escape / 系统动作那两处重复的"关掉一长串浮层"收敛为 closeTransient()。
 */

export type DesktopOverlayKey =
  | "spotlight"
  | "launchpad"
  | "controlCenter"
  | "notifications"
  | "liquidGlass"
  | "about"
  | "accountSecurity"
  | "taskSpace";

type OverlayState = Record<DesktopOverlayKey, boolean>;

/**
 * "瞬态浮层"：Escape 或系统动作时应当收起的一组。
 * 注意 liquidGlass 不在此列——与原实现一致，Escape 不关闭流光玻璃面板。
 */
const TRANSIENT_OVERLAY_KEYS: readonly DesktopOverlayKey[] = [
  "spotlight",
  "launchpad",
  "controlCenter",
  "notifications",
  "about",
  "accountSecurity",
  "taskSpace",
];

const INITIAL_OVERLAYS: OverlayState = {
  spotlight: false,
  launchpad: false,
  controlCenter: false,
  notifications: false,
  liquidGlass: false,
  about: false,
  accountSecurity: false,
  taskSpace: false,
};

export interface DesktopOverlays {
  spotlightOpen: boolean;
  launchpadOpen: boolean;
  controlCenterOpen: boolean;
  notificationsOpen: boolean;
  liquidGlassOpen: boolean;
  aboutOpen: boolean;
  accountSecurityOpen: boolean;
  taskSpaceOpen: boolean;
  /** 等价于原 `setXOpen(value)`。 */
  setOverlay: (key: DesktopOverlayKey, open: boolean) => void;
  /** 等价于原 `setXOpen(value => !value)`。 */
  toggleOverlay: (key: DesktopOverlayKey) => void;
  /** 收起全部瞬态浮层（等价于原那两处逐条 setXOpen(false) 的长列表）。 */
  closeTransient: () => void;
}

export function useDesktopOverlays(): DesktopOverlays {
  const [overlays, setOverlays] = useState<OverlayState>(INITIAL_OVERLAYS);

  const setOverlay = useCallback((key: DesktopOverlayKey, open: boolean) => {
    // 值未变化时返回同一引用，避免无谓重渲染（与原 useState 的 setXOpen 特性一致）。
    setOverlays((prev) =>
      prev[key] === open ? prev : { ...prev, [key]: open },
    );
  }, []);

  const toggleOverlay = useCallback((key: DesktopOverlayKey) => {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const closeTransient = useCallback(() => {
    setOverlays((prev) =>
      TRANSIENT_OVERLAY_KEYS.every((key) => !prev[key])
        ? prev
        : TRANSIENT_OVERLAY_KEYS.reduce<OverlayState>(
            (next, key) => ({ ...next, [key]: false }),
            prev,
          ),
    );
  }, []);

  return useMemo(
    () => ({
      spotlightOpen: overlays.spotlight,
      launchpadOpen: overlays.launchpad,
      controlCenterOpen: overlays.controlCenter,
      notificationsOpen: overlays.notifications,
      liquidGlassOpen: overlays.liquidGlass,
      aboutOpen: overlays.about,
      accountSecurityOpen: overlays.accountSecurity,
      taskSpaceOpen: overlays.taskSpace,
      setOverlay,
      toggleOverlay,
      closeTransient,
    }),
    [overlays, setOverlay, toggleOverlay, closeTransient],
  );
}
