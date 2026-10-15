import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { useDesktopWallpaperSources } from "@/appliance/desktop-wallpaper";
import { I18nContext } from "@/core/i18n/context";
import {
  BatteryFullIcon,
  BellIcon,
  BluetoothIcon,
  BotIcon,
  CheckIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  CommandIcon,
  DropletsIcon,
  HardDriveIcon,
  InfoIcon,
  LayoutGridIcon,
  LockIcon,
  Loader2Icon,
  MoonIcon,
  PaletteIcon,
  SearchIcon,
  SettingsIcon,
  ShoppingBagIcon,
  SlidersHorizontalIcon,
  RefreshCwIcon,
  SunIcon,
  Volume2Icon,
  WifiIcon,
  XIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { EchoMark } from "@/components/brand/echo-mark";
import { getEchoAppArtwork } from "./echo-app-artworks";
import type {
  AgentDesktopHealth,
  AgentDesktopHealthState,
} from "@/appliance/agent-health";
import type {
  NativeNotification,
  SystemControlState,
  SystemUpdateCapabilities,
  SystemUpdateStatus,
} from "@/types/electron";
import {
  LIQUID_GLASS_TINTS,
  type LiquidGlassTuning,
} from "@/appliance/liquid-glass-settings";
import {
  OPEN_ROOMS,
  type DesktopMode,
  type OpenRoomType,
} from "@/appliance/intent-desktop-surface";
import "@/styles/macos-desktop.css";

type MacIcon = typeof SearchIcon;

type EchoAppIconPalette = {
  surface: string;
  accent: string;
  glow: string;
};

function echoSolidPalette(
  surface: string,
  accent: string,
  glow: string,
): EchoAppIconPalette {
  return {
    surface,
    accent,
    glow,
  };
}

/**
 * ECHO family icons: every app sits on the same graphite tile with a snow glyph.
 * Apps are told apart by their glyph, never by colour; colour is reserved for
 * the Echo Core state light (see BRAND.md, "Echo Core 灯语").
 */
const ECHO_GRAPHITE = echoSolidPalette(
  "#16191e",
  "#eef1f4",
  "rgba(111, 227, 240, .2)",
);

const ECHO_APP_ICON_PALETTES: Record<string, EchoAppIconPalette> = {
  "echo:/workspace/realtime/new": ECHO_GRAPHITE,
  "echo:/browser": ECHO_GRAPHITE,
  "echo:/workspace/storage": ECHO_GRAPHITE,
  "echo:/photos": ECHO_GRAPHITE,
  "echo:/storage-center": ECHO_GRAPHITE,
  "echo:/device-link": ECHO_GRAPHITE,
  "echo:/workspace/knowledge": ECHO_GRAPHITE,
  "echo:/workspace/store": ECHO_GRAPHITE,
  "echo:/hub": ECHO_GRAPHITE,
  "echo:/workspace/observability": ECHO_GRAPHITE,
  "echo:/workspace": ECHO_GRAPHITE,
  "system:finder": ECHO_GRAPHITE,
  "system:files": ECHO_GRAPHITE,
  "system:launchpad": ECHO_GRAPHITE,
  "system:app-store": ECHO_GRAPHITE,
  "system:tasks": ECHO_GRAPHITE,
  "system:activity-monitor": ECHO_GRAPHITE,
  "system:settings": ECHO_GRAPHITE,
  "system:trash": ECHO_GRAPHITE,
};

/** 浅色底座上的单色图形改用强调色，否则白色图形会和底座融在一起。 */
function isLightSurface(hex: string): boolean {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return false;
  const value = Number.parseInt(match[1]!, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.72;
}

const ECHO_TECH_FIELD_APP_IDS = new Set([
  "echo:/storage-center",
  "echo:/workspace/observability",
  "system:activity-monitor",
]);

export type MacShellApp = {
  id: string;
  name: string;
  subtitle?: string;
  icon: MacIcon;
  gradient: string;
  iconUrl?: string;
  running?: boolean;
  iconState?: MacAppIconState;
  muted?: boolean;
  onOpen: () => void;
};

export type MacAppIconState = "default" | "active" | "thinking" | "complete";

/** Echo 默认壁纸，桌面与锁屏共用。 */
export function MacDesktopWallpaperArtwork() {
  const wallpaper = useDesktopWallpaperSources();
  return (
    <img
      aria-hidden="true"
      className="desktop-wallpaper-art"
      src={wallpaper.url}
      srcSet={wallpaper.srcSet}
      sizes={wallpaper.sizes}
      alt=""
    />
  );
}

export function MacAppIcon({
  icon: Icon,
  gradient,
  iconUrl,
  appId,
  className,
  liquidBackdrop = false,
  state = "default",
  artwork,
}: {
  icon: MacIcon;
  gradient: string;
  iconUrl?: string;
  appId?: string;
  className?: string;
  liquidBackdrop?: boolean;
  state?: MacAppIconState;
  artwork?: ReactNode;
}) {
  // Dock、启动台、桌面和 Spotlight 共用同一套原创图形；没有专属图形的应用
  // 回退到线性图标。
  const appArtwork = iconUrl ? null : (artwork ?? getEchoAppArtwork(appId));
  // Apps that ship their own picture keep it; every glyph app joins the family tile.
  const echoPalette = iconUrl
    ? undefined
    : ((appId ? ECHO_APP_ICON_PALETTES[appId] : undefined) ?? ECHO_GRAPHITE);
  const showTechField = appId ? ECHO_TECH_FIELD_APP_IDS.has(appId) : false;

  return (
    <span
      className={cn("mac-app-icon", className)}
      style={
        {
          "--mac-app-gradient": gradient,
          "--echo-app-surface": echoPalette?.surface,
          "--echo-app-accent": echoPalette?.accent,
          "--echo-app-glow": echoPalette?.glow,
        } as CSSProperties
      }
      data-app-id={appId}
      data-icon-source={iconUrl ? "image" : appArtwork ? "art" : "glyph"}
      data-echo-family={echoPalette ? "true" : undefined}
      data-echo-surface={
        echoPalette && isLightSurface(echoPalette.surface) ? "light" : undefined
      }
      data-liquid-backdrop={liquidBackdrop ? "true" : undefined}
      data-icon-state={state}
      aria-hidden
    >
      {liquidBackdrop && <MacIconLiquidBackdrop />}
      {liquidBackdrop && (
        <span
          className="mac-app-icon-tint"
          style={{ background: gradient }}
          aria-hidden
        />
      )}
      {echoPalette && showTechField && (
        <span className="mac-app-icon-tech-field" />
      )}
      {echoPalette && (
        <span className="mac-app-icon-echo-signal">
          <span />
        </span>
      )}
      <span className="mac-app-icon-gloss" />
      <span className="mac-app-icon-specular" />
      {echoPalette && <span className="mac-app-icon-optical-rim" />}
      {echoPalette && state === "thinking" && (
        <span className="mac-app-icon-thinking-ring" />
      )}
      {iconUrl ? (
        <img src={iconUrl} alt="" className="mac-app-icon-image" />
      ) : appArtwork ? (
        appArtwork
      ) : (
        <Icon className="mac-app-icon-glyph" strokeWidth={1.8} />
      )}
      {echoPalette && state === "complete" && (
        <span className="mac-app-icon-complete-badge">
          <CheckCircle2Icon />
        </span>
      )}
    </span>
  );
}

/** The frontend package version, injected by Vite (vite.config.ts). */
declare const __ECHO_OS_VERSION__: string;

type MenuAction = {
  label?: string;
  shortcut?: string;
  divider?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
};

export type MacSystemAction = "logout" | "suspend" | "restart" | "shutdown";

export type MacSystemCapabilities = {
  lock: boolean;
  logout: boolean;
  suspend: boolean;
  restart: boolean;
  shutdown: boolean;
};

export type MacLiquidGlassStyle = "crystal" | "softlight";
export type MacLiquidGlassIntensity = "weak" | "balanced" | "strong";

/** The enabled items of the menu-bar menu `key`, in order. */
function enabledMenuItems(
  container: HTMLElement | null,
  key: string,
): HTMLButtonElement[] {
  return Array.from(
    container?.querySelectorAll<HTMLButtonElement>(
      `[data-menu-root="${key}"] .mac-menu-item:not(:disabled)`,
    ) ?? [],
  );
}

function MacMenuDropdown({
  items,
  align = "left",
}: {
  items: MenuAction[];
  align?: "left" | "right";
}) {
  return (
    <div
      className={cn("mac-menu-dropdown", align === "right" && "right-0")}
      data-liquid-surface="thick"
    >
      {items.map((item, index) =>
        item.divider ? (
          <div key={`divider-${index}`} className="mac-menu-separator" />
        ) : (
          <button
            key={`${item.label}-${index}`}
            type="button"
            // An item with nothing to run is shown disabled, not as a dead
            // click target (e.g. 隐藏 until the shell can hide an app).
            disabled={item.disabled || !item.onSelect}
            onClick={item.onSelect}
            className="mac-menu-item"
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="mac-menu-shortcut">{item.shortcut}</span>
            )}
          </button>
        ),
      )}
    </div>
  );
}

export interface MacWorkspaceDropdownProps {
  desktopMode: DesktopMode;
  onToggleMode: () => void;
  activeRoom: OpenRoomType;
  onSelectRoom: (room: OpenRoomType) => void;
}

export function MacWorkspaceDropdown({
  desktopMode,
  onToggleMode,
  activeRoom,
  onSelectRoom,
}: MacWorkspaceDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const currentRoom =
    OPEN_ROOMS.find((r) => r.id === activeRoom) ?? OPEN_ROOMS[0]!;
  const CurrentRoomIcon = currentRoom.icon;

  return (
    <div ref={containerRef} className="relative select-none">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="空间与模式控制"
        className={cn(
          // Never wraps: at phone width the label used to break into two
          // lines (全局总 / 览) inside the 22px pill; there it shows only the
          // room icon and chevron and keeps the label for screen readers.
          "flex shrink-0 items-center gap-1.5 h-[22px] px-2.5 whitespace-nowrap rounded-full text-xs transition-all border cursor-pointer",
          open
            ? "bg-current/20 text-inherit border-current/25 shadow-xs"
            : "bg-current/10 text-inherit border-current/15 hover:bg-current/15",
        )}
        title="桌面空间与模式：点击切换协作空间或纯净态"
      >
        <span
          className={cn(
            "size-1.5 rounded-full transition-transform",
            desktopMode === "pure" ? "bg-core animate-pulse" : "bg-primary",
          )}
        />
        <span className="flex items-center gap-1 text-[12px] font-medium tracking-tight">
          {desktopMode === "pure" ? (
            <span className="max-sm:sr-only">意图纯净态</span>
          ) : (
            <>
              <CurrentRoomIcon className="size-3" aria-hidden />
              <span className="max-sm:sr-only">
                {currentRoom.title.split(" ")[0]}
              </span>
            </>
          )}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-3 text-inherit opacity-60 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          className="mac-menu-dropdown w-52 left-1/2 -translate-x-1/2 top-[25px]"
          data-liquid-surface="thick"
        >
          <div className="px-2 py-1 text-[12px] font-semibold text-muted-foreground">
            桌面模式
          </div>
          <button
            type="button"
            onClick={() => {
              if (desktopMode !== "pure") onToggleMode();
              setOpen(false);
            }}
            className="mac-menu-item"
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2 rounded-full",
                  desktopMode === "pure" ? "bg-core" : "bg-slate-300 ",
                )}
              />
              <span>意图纯净态</span>
            </span>
            <span className="mac-menu-shortcut">Space</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (desktopMode !== "workspace") onToggleMode();
              setOpen(false);
            }}
            className="mac-menu-item"
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2 rounded-full",
                  desktopMode === "workspace" ? "bg-primary" : "bg-slate-300 ",
                )}
              />
              <span>多窗口工作台</span>
            </span>
            <span className="mac-menu-shortcut">Space</span>
          </button>

          <div className="mac-menu-separator" />

          <div className="px-2 py-1 text-[12px] font-semibold text-muted-foreground">
            协作空间
          </div>
          {OPEN_ROOMS.map((room) => {
            const isSelected =
              activeRoom === room.id && desktopMode === "workspace";
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => {
                  onSelectRoom(room.id);
                  if (desktopMode === "pure") onToggleMode();
                  setOpen(false);
                }}
                className="mac-menu-item"
              >
                <span className="flex items-center gap-2">
                  <room.icon className="size-3.5" aria-hidden />
                  <span
                    className={isSelected ? "font-semibold" : "font-normal"}
                  >
                    {room.title.split(" ")[0]}
                  </span>
                </span>
                {isSelected && <CheckIcon className="size-3.5 text-core" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MacMenuBar({
  activeApp = "文件管理器",
  controlCenterOpen,
  notificationsOpen,
  liquidGlassOpen,
  onOpenSpotlight,
  onToggleControlCenter,
  onToggleNotifications,
  onToggleLiquidGlass,
  onOpenAbout,
  onOpenFiles,
  onOpenSettings,
  appStoreAvailable,
  onOpenAppStore,
  onOpenLaunchpad,
  systemCapabilities,
  systemControls,
  onLockScreen,
  onSystemAction,
  notificationCount = 0,
  modelStatus,
  centerContent,
  desktopTheme = "theme-white",
  onToggleTheme,
  showBattery = false,
  onToggleMissionControl,
}: {
  activeApp?: string;
  controlCenterOpen: boolean;
  notificationsOpen: boolean;
  liquidGlassOpen: boolean;
  onOpenSpotlight: () => void;
  onToggleControlCenter: () => void;
  onToggleNotifications: () => void;
  onToggleLiquidGlass?: () => void;
  onOpenAbout: () => void;
  onOpenFiles: () => void;
  onOpenSettings: () => void;
  appStoreAvailable: boolean;
  onOpenAppStore: () => void;
  onOpenLaunchpad: () => void;
  onToggleMissionControl?: () => void;
  systemCapabilities: MacSystemCapabilities;
  systemControls?: SystemControlState | null;
  onLockScreen: () => void;
  onSystemAction: (action: MacSystemAction) => void;
  notificationCount?: number;
  modelStatus?: ReactNode;
  centerContent?: ReactNode;
  desktopTheme?: "theme-white" | "theme-glass" | "theme-dark";
  onToggleTheme?: () => void;
  showBattery?: boolean;
}) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 页面不可见时暂停时钟，回到前台立即刷新，避免后台每秒空转 setState
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setActiveMenu(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const select = (action: () => void) => {
    setActiveMenu(null);
    action();
  };

  // Keyboard: the menu titles stay in the Tab order. Left/Right move between
  // titles (or between menus while one is open), Down/Up open a menu and walk
  // its items, Home/End jump, and Escape closes it back onto its title.
  const pendingItemFocus = useRef<"first" | "last" | null>(null);
  useEffect(() => {
    const which = pendingItemFocus.current;
    if (!activeMenu || !which) return;
    pendingItemFocus.current = null;
    const items = enabledMenuItems(menuRef.current, activeMenu);
    (which === "last" ? items[items.length - 1] : items[0])?.focus();
  }, [activeMenu]);

  const focusMenuTitle = (key: string) =>
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-menu-trigger="${key}"]`)
      ?.focus();

  const openMenuAt = (key: string, which: "first" | "last") => {
    if (activeMenu === key) {
      const items = enabledMenuItems(menuRef.current, key);
      (which === "last" ? items[items.length - 1] : items[0])?.focus();
      return;
    }
    pendingItemFocus.current = which;
    setActiveMenu(key);
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    const key =
      target.closest<HTMLElement>("[data-menu-root]")?.dataset.menuRoot;
    if (!key) return;
    const inMenu = target.classList.contains("mac-menu-item");
    switch (event.key) {
      case "ArrowRight":
      case "ArrowLeft": {
        event.preventDefault();
        const keys = ["system", ...menus.map((menu) => menu.key)];
        const step = event.key === "ArrowRight" ? 1 : -1;
        const next =
          keys[(keys.indexOf(key) + step + keys.length) % keys.length]!;
        if (activeMenu) openMenuAt(next, "first");
        else focusMenuTitle(next);
        return;
      }
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        const forward = event.key === "ArrowDown";
        if (!inMenu) {
          openMenuAt(key, forward ? "first" : "last");
          return;
        }
        const items = enabledMenuItems(menuRef.current, key);
        const index = items.indexOf(target as HTMLButtonElement);
        items[
          (index + (forward ? 1 : -1) + items.length) % items.length
        ]?.focus();
        return;
      }
      case "Home":
      case "End": {
        if (!inMenu) return;
        event.preventDefault();
        const items = enabledMenuItems(menuRef.current, key);
        (event.key === "Home" ? items[0] : items[items.length - 1])?.focus();
        return;
      }
      case "Escape":
        if (!activeMenu) return;
        event.preventDefault();
        setActiveMenu(null);
        focusMenuTitle(key);
        return;
      case "Tab":
        if (activeMenu) setActiveMenu(null);
        return;
    }
  };

  const menus: Array<{ label: string; key: string; items: MenuAction[] }> = [
    {
      label: activeApp,
      key: "app",
      items: [
        { label: `关于 ${activeApp}`, onSelect: () => select(onOpenAbout) },
        { divider: true },
        {
          label: "设置…",
          shortcut: "Ctrl+,",
          onSelect: () => select(onOpenSettings),
        },
        { divider: true },
        { label: `隐藏 ${activeApp}`, shortcut: "Ctrl+H" },
        { label: "隐藏其他", shortcut: "Ctrl+Alt+H" },
      ],
    },
    {
      label: "文件",
      key: "file",
      items: [
        {
          label: "新建文件窗口",
          shortcut: "Ctrl+N",
          onSelect: () => select(onOpenFiles),
        },
        {
          label: "打开…",
          shortcut: "Ctrl+O",
          onSelect: () => select(onOpenFiles),
        },
        { divider: true },
        {
          label: "桌面",
          shortcut: "Ctrl+Shift+D",
          onSelect: () => select(onOpenFiles),
        },
        {
          label: "个人主目录",
          shortcut: "Ctrl+Shift+H",
          onSelect: () => select(onOpenFiles),
        },
      ],
    },
    {
      label: "显示",
      key: "view",
      items: [
        {
          label: "调度中心",
          shortcut: "F3",
          onSelect: () => select(() => onToggleMissionControl?.()),
        },
        {
          label: "显示应用库",
          shortcut: "F4",
          onSelect: () => select(onOpenLaunchpad),
        },
        { divider: true },
        { label: "进入全屏幕", shortcut: "Ctrl+Shift+F", disabled: true },
      ],
    },
    {
      label: "帮助",
      key: "help",
      items: [
        { label: "ECHO OS 帮助", onSelect: () => select(onOpenAbout) },
        { label: "系统设置…", onSelect: () => select(onOpenSettings) },
      ],
    },
  ];

  const dateText = `${now.getMonth() + 1}月${now.getDate()}日 周${"日一二三四五六"[now.getDay()]}`;
  const timeText = now.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const batteryLabel = systemControls?.nativeShell
    ? systemControls.battery.present &&
      systemControls.battery.percentage !== null
      ? `电池 ${systemControls.battery.percentage}%`
      : "未检测到电池"
    : "电池";
  const wifiLabel = systemControls?.nativeShell
    ? systemControls.wifi.enabled
      ? `Wi-Fi ${systemControls.wifi.connection || "已打开"}`
      : systemControls.wifi.enabled === false
        ? "Wi-Fi 已关闭"
        : "Wi-Fi 不可用"
    : "Wi-Fi";

  return (
    <header
      ref={menuRef}
      data-desktop-interactive
      className={cn("mac-menu-bar", desktopTheme)}
      data-theme={desktopTheme}
    >
      <div className="mac-menu-left" onKeyDown={handleMenuKeyDown}>
        <div className="relative" data-menu-root="system">
          <button
            type="button"
            data-menu-trigger="system"
            aria-haspopup="menu"
            aria-expanded={activeMenu === "system"}
            className={cn(
              "mac-menu-logo",
              activeMenu === "system" && "is-active",
            )}
            onClick={() =>
              setActiveMenu((value) => (value === "system" ? null : "system"))
            }
            aria-label="Echo 菜单"
          >
            <EchoMark className="size-[17px]" />
          </button>
          {activeMenu === "system" && (
            <MacMenuDropdown
              items={[
                { label: "关于本机", onSelect: () => select(onOpenAbout) },
                { divider: true },
                { label: "系统设置…", onSelect: () => select(onOpenSettings) },
                {
                  label: "应用中心…",
                  disabled: !appStoreAvailable,
                  onSelect: () => select(onOpenAppStore),
                },
                { divider: true },
                { label: "最近使用的项目", disabled: true },
                { divider: true },
                { label: "结束无响应应用…", disabled: true },
                { divider: true },
                {
                  label: "睡眠…",
                  disabled: !systemCapabilities.suspend,
                  onSelect: () => select(() => onSystemAction("suspend")),
                },
                {
                  label: "重新启动…",
                  disabled: !systemCapabilities.restart,
                  onSelect: () => select(() => onSystemAction("restart")),
                },
                {
                  label: "关机…",
                  disabled: !systemCapabilities.shutdown,
                  onSelect: () => select(() => onSystemAction("shutdown")),
                },
                { divider: true },
                {
                  label: "锁定屏幕",
                  shortcut: "Ctrl+Alt+Q",
                  disabled: !systemCapabilities.lock,
                  onSelect: () => select(onLockScreen),
                },
                {
                  label: "退出登录…",
                  disabled: !systemCapabilities.logout,
                  onSelect: () => select(() => onSystemAction("logout")),
                },
              ]}
            />
          )}
        </div>
        {menus.map((menu, index) => {
          return (
            <div
              key={menu.key}
              data-menu-root={menu.key}
              className={cn("relative", index === 0 && "mr-1")}
            >
              <button
                type="button"
                data-menu-trigger={menu.key}
                aria-haspopup="menu"
                aria-expanded={activeMenu === menu.key}
                className={cn(
                  "mac-menu-button",
                  index === 0
                    ? "font-bold text-inherit"
                    : "text-inherit opacity-90 font-normal",
                  activeMenu === menu.key && "is-active",
                )}
                onClick={() =>
                  setActiveMenu((value) =>
                    value === menu.key ? null : menu.key,
                  )
                }
                onPointerEnter={() => activeMenu && setActiveMenu(menu.key)}
              >
                {menu.label}
              </button>
              {activeMenu === menu.key && (
                <MacMenuDropdown items={menu.items} />
              )}
            </div>
          );
        })}
      </div>

      {centerContent && (
        <div className="mac-menu-center mx-auto flex items-center justify-center pointer-events-auto">
          {centerContent}
        </div>
      )}

      <div className="mac-menu-right">
        {modelStatus}
        {onToggleLiquidGlass && (
          <button
            type="button"
            className={cn("mac-status-icon", liquidGlassOpen && "is-active")}
            onClick={onToggleLiquidGlass}
            aria-label="流光玻璃设置"
            title="流光玻璃设置"
            aria-pressed={liquidGlassOpen}
          >
            <DropletsIcon className="size-[15px]" />
          </button>
        )}
        {onToggleTheme && (
          <button
            type="button"
            className="mac-status-icon"
            onClick={onToggleTheme}
            aria-label="快速切换桌面主题"
            title={`当前主题：${desktopTheme === "theme-white" ? "雪白" : desktopTheme === "theme-glass" ? "神经玻璃" : "石墨"} · 点击快速切换`}
          >
            {desktopTheme === "theme-white" ? (
              <SunIcon className="size-[15px]" />
            ) : desktopTheme === "theme-glass" ? (
              <PaletteIcon className="size-[15px]" />
            ) : (
              <MoonIcon className="size-[15px]" />
            )}
          </button>
        )}
        {(showBattery ||
          (systemControls?.nativeShell && systemControls.battery.present)) && (
          <button
            type="button"
            className="mac-status-icon"
            aria-label={batteryLabel}
            title={batteryLabel}
            onClick={onToggleControlCenter}
          >
            <BatteryFullIcon className="size-[15px]" />
          </button>
        )}
        <button
          type="button"
          className={cn(
            "mac-status-icon",
            systemControls?.nativeShell &&
              systemControls.wifi.enabled === false &&
              "opacity-45",
          )}
          aria-label={wifiLabel}
          title={wifiLabel}
          onClick={onToggleControlCenter}
        >
          <WifiIcon className="size-[15px]" />
        </button>
        <button
          type="button"
          className={cn("mac-status-icon", controlCenterOpen && "is-active")}
          onClick={onToggleControlCenter}
          aria-label="控制中心"
        >
          <SlidersHorizontalIcon className="size-[15px]" />
        </button>
        <button
          type="button"
          className="mac-status-icon"
          onClick={onOpenSpotlight}
          aria-label="全局搜索"
        >
          <SearchIcon className="size-[14px]" />
        </button>
        <button
          type="button"
          className={cn(
            "mac-clock",
            notificationsOpen && "is-active",
            notificationCount > 0 && "has-notifications",
          )}
          onClick={onToggleNotifications}
          aria-label={
            notificationCount > 0
              ? `通知中心，${notificationCount} 条通知`
              : "通知中心"
          }
          title={`${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 周${"日一二三四五六"[now.getDay()]} ${timeText}`}
        >
          <span className="hidden 2xl:inline">{dateText}</span>
          <span className="hidden sm:inline 2xl:hidden">{`周${"日一二三四五六"[now.getDay()]}`}</span>
          <span>{timeText}</span>
          {notificationCount > 0 && (
            <span className="mac-notification-count" aria-hidden>
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

const GLASS_STYLE_OPTIONS: Array<{
  value: MacLiquidGlassStyle;
  label: string;
  description: string;
}> = [
  {
    value: "crystal",
    label: "晶透",
    description: "清晰折射 · 镜面高光",
  },
  {
    value: "softlight",
    label: "柔光",
    description: "柔和扩散 · 低眩光",
  },
];

const GLASS_INTENSITY_OPTIONS: Array<{
  value: MacLiquidGlassIntensity;
  label: string;
}> = [
  { value: "weak", label: "克制" },
  { value: "balanced", label: "均衡" },
  { value: "strong", label: "沉浸" },
];

function MacGlassParameter({
  label,
  value,
  min,
  max,
  unit,
  formatValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const progress = ((value - min) / Math.max(1, max - min)) * 100;

  return (
    <label className="mac-glass-parameter">
      <span>
        <strong>{label}</strong>
        <output>{formatValue ? formatValue(value) : `${value}${unit}`}</output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        style={{ "--glass-range-progress": `${progress}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

export function MacLiquidGlassPanel({
  open,
  style,
  intensity,
  tuning,
  onStyleChange,
  onIntensityChange,
  onTuningChange,
  onResetTuning,
  onClose,
  desktopTheme = "theme-white",
  onDesktopThemeChange,
}: {
  open: boolean;
  style: MacLiquidGlassStyle;
  intensity: MacLiquidGlassIntensity;
  tuning: LiquidGlassTuning;
  onStyleChange: (style: MacLiquidGlassStyle) => void;
  onIntensityChange: (intensity: MacLiquidGlassIntensity) => void;
  onTuningChange: (patch: Partial<LiquidGlassTuning>) => void;
  onResetTuning: () => void;
  onClose: () => void;
  desktopTheme?: "theme-white" | "theme-glass" | "theme-dark";
  onDesktopThemeChange?: (
    theme: "theme-white" | "theme-glass" | "theme-dark",
  ) => void;
}) {
  if (!open) return null;

  return (
    <>
      <button
        className="mac-panel-scrim"
        type="button"
        onClick={onClose}
        aria-label="关闭流光玻璃设置"
      />
      <section
        className="mac-liquid-glass-panel"
        data-desktop-interactive
        data-liquid-surface="thick"
        aria-label="流光玻璃设置"
      >
        <header className="mac-glass-panel-header">
          <span className="mac-glass-panel-mark">
            <DropletsIcon />
          </span>
          <span>
            <strong>流光玻璃</strong>
            <small>材质、光学与颜色滤镜</small>
          </span>
          <button
            type="button"
            className="mac-glass-panel-reset"
            onClick={onResetTuning}
            aria-label="恢复全部默认玻璃设置"
            title="恢复全部默认"
          >
            <RefreshCwIcon />
          </button>
        </header>

        <div className="mac-glass-preview" aria-hidden>
          <span className="mac-glass-preview-orb is-primary" />
          <span className="mac-glass-preview-orb is-secondary" />
          <span className="mac-glass-preview-lens">
            <DropletsIcon />
          </span>
          <small>{style === "crystal" ? "Crystal Flow" : "Soft Aurora"}</small>
        </div>

        {/* 桌面环境主题预设 (雪白 / 神经玻璃 / 石墨) */}
        <fieldset className="mac-glass-fieldset">
          <legend>桌面环境主题</legend>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-xs font-semibold transition-all",
                desktopTheme === "theme-white"
                  ? "border-warning/30 bg-warning/15 text-warning shadow-sm ring-1 ring-warning/30"
                  : "border-black/5 bg-card/40 text-muted-foreground hover:bg-card",
              )}
              onClick={() => onDesktopThemeChange?.("theme-white")}
              aria-pressed={desktopTheme === "theme-white"}
            >
              <SunIcon className="size-4 text-warning" />
              <span>雪白</span>
              <small className="text-[12px] font-normal text-muted-foreground">
                轻柔晨光
              </small>
            </button>

            <button
              type="button"
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-xs font-semibold transition-all",
                desktopTheme === "theme-glass"
                  ? "border-core/30 bg-core/15 text-core shadow-sm ring-1 ring-core/30"
                  : "border-black/5 bg-card/40 text-muted-foreground hover:bg-card",
              )}
              onClick={() => onDesktopThemeChange?.("theme-glass")}
              aria-pressed={desktopTheme === "theme-glass"}
            >
              <DropletsIcon className="size-4 text-core" />
              <span>神经玻璃</span>
              <small className="text-[12px] font-normal text-muted-foreground">
                澄澈流光
              </small>
            </button>

            <button
              type="button"
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-xs font-semibold transition-all",
                desktopTheme === "theme-dark"
                  ? "border-core/30 bg-core/15 text-core shadow-sm ring-1 ring-core/30"
                  : "border-black/5 bg-card/40 text-muted-foreground hover:bg-card",
              )}
              onClick={() => onDesktopThemeChange?.("theme-dark")}
              aria-pressed={desktopTheme === "theme-dark"}
            >
              <MoonIcon className="size-4 text-core" />
              <span>石墨</span>
              <small className="text-[12px] font-normal text-muted-foreground">
                冷光玻璃
              </small>
            </button>
          </div>
        </fieldset>

        <fieldset className="mac-glass-fieldset">
          <legend>材质模式</legend>
          <div className="mac-glass-style-options">
            {GLASS_STYLE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(style === option.value && "is-selected")}
                onClick={() => onStyleChange(option.value)}
                aria-pressed={style === option.value}
              >
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mac-glass-fieldset">
          <legend>动效强度</legend>
          <div className="mac-glass-intensity-options">
            {GLASS_INTENSITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(intensity === option.value && "is-selected")}
                onClick={() => onIntensityChange(option.value)}
                aria-pressed={intensity === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mac-glass-fieldset mac-glass-parameter-fieldset">
          <legend>光学参数</legend>
          <div className="mac-glass-parameter-list">
            <MacGlassParameter
              label="透明度"
              value={tuning.transparency}
              min={35}
              max={100}
              unit="%"
              onChange={(transparency) => onTuningChange({ transparency })}
            />
            <MacGlassParameter
              label="磨砂度"
              value={tuning.frost}
              min={0}
              max={64}
              unit="px"
              onChange={(frost) => onTuningChange({ frost })}
            />
            <MacGlassParameter
              label="折射率"
              value={tuning.refraction}
              min={0}
              max={100}
              unit=""
              formatValue={(value) => (1 + value * 0.008).toFixed(2)}
              onChange={(refraction) => onTuningChange({ refraction })}
            />
            <MacGlassParameter
              label="光学厚度"
              value={tuning.thickness}
              min={1}
              max={24}
              unit="mm"
              onChange={(thickness) => onTuningChange({ thickness })}
            />
            <MacGlassParameter
              label="色散 Δn"
              value={tuning.dispersion}
              min={0}
              max={40}
              unit=""
              formatValue={(value) => (value / 1000).toFixed(3)}
              onChange={(dispersion) => onTuningChange({ dispersion })}
            />
            <MacGlassParameter
              label="色彩浓度"
              value={tuning.saturation}
              min={70}
              max={180}
              unit="%"
              onChange={(saturation) => onTuningChange({ saturation })}
            />
          </div>
        </fieldset>

        <fieldset className="mac-glass-fieldset">
          <legend>玻璃滤镜</legend>
          <div className="mac-glass-tint-options">
            {LIQUID_GLASS_TINTS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(tuning.tint === option.value && "is-selected")}
                onClick={() => onTuningChange({ tint: option.value })}
                aria-label={`使用${option.label}滤镜`}
                aria-pressed={tuning.tint === option.value}
              >
                <span style={{ backgroundColor: option.value }} />
                {option.label}
              </button>
            ))}
            <label className="mac-glass-custom-tint" title="自定义颜色">
              <input
                type="color"
                aria-label="自定义玻璃颜色"
                value={tuning.tint}
                onChange={(event) =>
                  onTuningChange({ tint: event.currentTarget.value })
                }
              />
              自定
            </label>
          </div>
          <MacGlassParameter
            label="染色浓度"
            value={tuning.tintStrength}
            min={0}
            max={40}
            unit="%"
            onChange={(tintStrength) => onTuningChange({ tintStrength })}
          />
        </fieldset>

        <footer>
          <span className="mac-glass-live-dot" />
          交互时实时计算，静止后折射层自动休眠
        </footer>
      </section>
    </>
  );
}

export function MacDesktopIcon({ app }: { app: MacShellApp }) {
  return (
    <button
      type="button"
      data-desktop-interactive
      data-liquid-icon
      className="mac-desktop-icon"
      onDoubleClick={app.onOpen}
      onClick={(event) => {
        if (event.detail === 2) app.onOpen();
      }}
      title={`打开${app.name}`}
    >
      <MacAppIcon
        icon={app.icon}
        gradient={app.gradient}
        iconUrl={app.iconUrl}
        appId={app.id}
        state={app.iconState ?? (app.running ? "active" : "default")}
      />
      <span className="mac-desktop-icon-label">{app.name}</span>
    </button>
  );
}

/**
 * A small, viewport-aligned copy of the wallpaper used inside the desktop
 * widgets. Chromium's backdrop-filter can blur the scene reliably, but its
 * custom backdrop displacement is not consistent across compositor paths.
 * Keeping this lens as a clipped, low-opacity copy gives the glass a real
 * colour seam to bend while retaining the regular backdrop-filter fallback.
 */
function MacSurfaceLens() {
  const lensRef = useRef<HTMLSpanElement>(null);
  const wallpaper = useDesktopWallpaperSources();

  useLayoutEffect(() => {
    const lens = lensRef.current;
    const surface = lens?.parentElement;
    if (!lens || !surface) return;

    const sync = () => {
      const rect = surface.getBoundingClientRect();
      lens.style.setProperty("--mac-lens-left", `${rect.left}px`);
      lens.style.setProperty("--mac-lens-top", `${rect.top}px`);
    };

    sync();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    observer?.observe(surface);
    window.addEventListener("resize", sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <span ref={lensRef} className="mac-surface-lens" aria-hidden>
      <span className="mac-surface-lens-raster">
        <img
          src={wallpaper.url}
          srcSet={wallpaper.srcSet}
          sizes={wallpaper.sizes}
          alt=""
        />
      </span>
      <MacDesktopWallpaperArtwork />
    </span>
  );
}

/**
 * A quiet wallpaper transmission layer for desktop app icons. Native macOS
 * icons remain authored artwork, while Echo's desktop treatment lets the
 * surrounding scene tint their glassy finish. Keeping this copy aligned to
 * the viewport makes the colour seam continuous with the widgets and Dock.
 */
function MacIconLiquidBackdrop() {
  const backdropRef = useRef<HTMLSpanElement>(null);
  const wallpaper = useDesktopWallpaperSources();

  useLayoutEffect(() => {
    const icon = backdropRef.current?.parentElement;
    if (!icon) return;

    const sync = () => {
      const rect = icon.getBoundingClientRect();
      icon.style.setProperty("--mac-icon-left", `${rect.left}px`);
      icon.style.setProperty("--mac-icon-top", `${rect.top}px`);
    };

    sync();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    observer?.observe(icon);
    window.addEventListener("resize", sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <span
      ref={backdropRef}
      className="mac-app-icon-liquid-backdrop"
      aria-hidden
    >
      <img
        src={wallpaper.url}
        srcSet={wallpaper.srcSet}
        sizes={wallpaper.sizes}
        alt=""
      />
    </span>
  );
}

export function MacDesktopWidgets({
  onOpenWorkspace,
  onOpenNotifications,
  agentHealth,
}: {
  onOpenWorkspace: () => void;
  onOpenNotifications?: () => void;
  agentHealth: AgentDesktopHealth;
}) {
  const today = new Date();
  const agentCopy: Record<
    AgentDesktopHealthState,
    { title: string; detail: string; label: string }
  > = {
    checking: {
      title: "正在连接 Echo",
      detail: "正在检查本机 Agent Runtime",
      label: "正在连接 Echo Agent，打开 Agent",
    },
    ready: {
      title: "Echo Agent 在线",
      detail: "点击开始新的 Agent 会话",
      label: "Echo Agent 在线，开始新的 Agent 会话",
    },
    "restart-required": {
      title: "Echo Agent 等待重启",
      detail: "Runtime 更新将在重启后生效",
      label: "Echo Agent 等待重启，打开 Agent",
    },
    unavailable: {
      title: "Echo Agent 未连接",
      detail: "点击打开 Agent 检查连接",
      label: "Echo Agent 未连接，打开 Agent 检查连接",
    },
  };
  const statusCopy = agentCopy[agentHealth.state];
  if (agentHealth.state === "ready") {
    if (agentHealth.verifiedBundle && agentHealth.sourceId) {
      statusCopy.title = "Echo Agent 已验证";
      statusCopy.detail = `${agentHealth.version ? `v${agentHealth.version} · ` : ""}${agentHealth.sourceId.slice(0, 8)}`;
      statusCopy.label = `${statusCopy.title}，${statusCopy.detail}，开始新的 Agent 会话`;
    } else {
      statusCopy.detail = agentHealth.version
        ? `v${agentHealth.version} · 来源未验证`
        : "Runtime 版本未知 · 来源未验证";
      statusCopy.label = `${statusCopy.title}，${statusCopy.detail}，开始新的 Agent 会话`;
    }
  }

  return (
    <aside className="mac-widget-stack" data-desktop-interactive>
      <button
        type="button"
        className="mac-calendar-widget"
        data-liquid-surface="thick-dark"
        aria-label="日历"
        onClick={onOpenNotifications}
      >
        <MacSurfaceLens />
        <span className="mac-widget-eyebrow">
          周{"日一二三四五六"[today.getDay()]}
        </span>
        <span className="mac-widget-date">{today.getDate()}</span>
        <span className="mac-widget-caption">
          {today.getFullYear()}年{today.getMonth() + 1}月
        </span>
      </button>
      <button
        type="button"
        className={cn("mac-agent-widget", `is-${agentHealth.state}`)}
        data-liquid-surface="thick-dark"
        data-agent-status={agentHealth.state}
        data-agent-entry="primary"
        onClick={onOpenWorkspace}
        aria-label={statusCopy.label}
      >
        <MacSurfaceLens />
        <span className="mac-agent-orb">
          <EchoMark tone="light" className="size-5" />
        </span>
        <span className="min-w-0 text-left" aria-live="polite">
          <strong>{statusCopy.title}</strong>
          <small>{statusCopy.detail}</small>
        </span>
        <ChevronRightIcon className="size-4 shrink-0 opacity-55" />
      </button>
    </aside>
  );
}

export function MacSpotlight({
  open,
  query,
  apps,
  onQueryChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  query: string;
  apps: MacShellApp[];
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return apps.slice(0, 5);
    return apps
      .filter((app) =>
        `${app.name} ${app.subtitle ?? ""}`.toLowerCase().includes(needle),
      )
      .slice(0, 6);
  }, [apps, query]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="mac-overlay mac-spotlight-overlay"
      data-desktop-interactive
      onPointerDown={onClose}
    >
      <section
        className="mac-spotlight"
        data-liquid-surface="thick"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="mac-spotlight-input-row">
          <SearchIcon className="mac-spotlight-search-icon" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSubmit();
              if (event.key === "Escape") onClose();
            }}
            placeholder="全局搜索"
            className="mac-spotlight-input"
          />
          <kbd className="mac-keycap">esc</kbd>
        </div>
        <div className="mac-spotlight-results">
          <p className="mac-spotlight-heading">最佳匹配</p>
          {filtered.length ? (
            filtered.map((app, index) => (
              <button
                type="button"
                key={app.id}
                className={cn(
                  "mac-spotlight-result",
                  index === 0 && "is-selected",
                )}
                onClick={() => {
                  app.onOpen();
                  onClose();
                }}
              >
                <MacAppIcon
                  icon={app.icon}
                  gradient={app.gradient}
                  iconUrl={app.iconUrl}
                  appId={app.id}
                  state={app.iconState ?? (app.running ? "active" : "default")}
                />
                <span>
                  <strong>{app.name}</strong>
                  <small>{app.subtitle || "应用程序"}</small>
                </span>
                <span className="mac-result-kind">应用程序</span>
              </button>
            ))
          ) : (
            <div className="mac-spotlight-empty">没有找到匹配的项目</div>
          )}
        </div>
        <footer className="mac-spotlight-footer">
          <span>按下 Return 打开</span>
          <span>Ctrl + Space 显示或隐藏全局搜索</span>
        </footer>
      </section>
    </div>
  );
}

export function MacLaunchpad({
  open,
  apps,
  onClose,
}: {
  open: boolean;
  apps: MacShellApp[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const visibleApps = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value
      ? apps.filter((app) =>
          `${app.name} ${app.subtitle ?? ""}`.toLowerCase().includes(value),
        )
      : apps;
  }, [apps, query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  if (!open) return null;
  return (
    <div className="mac-launchpad" data-desktop-interactive>
      <div className="mac-launchpad-backdrop" />
      <button
        type="button"
        onClick={onClose}
        className="mac-launchpad-close"
        aria-label="关闭应用库"
      >
        <XIcon className="size-4" />
      </button>
      <div className="mac-launchpad-search">
        <SearchIcon className="size-3.5" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索"
          aria-label="搜索应用"
          autoFocus
        />
      </div>
      <div className="mac-launchpad-grid">
        {visibleApps.map((app) => (
          <button
            type="button"
            key={app.id}
            className="mac-launchpad-app"
            onClick={() => {
              app.onOpen();
              onClose();
            }}
          >
            <MacAppIcon
              icon={app.icon}
              gradient={app.gradient}
              iconUrl={app.iconUrl}
              appId={app.id}
              state={app.iconState ?? (app.running ? "active" : "default")}
            />
            <span>{app.name}</span>
          </button>
        ))}
      </div>
      <div className="mac-page-dots">
        <span className="is-active" />
        <span />
      </div>
    </div>
  );
}

export function MacControlCenter({
  open,
  onClose,
  onOpenSettings,
  onOpenLiquidGlass,
  systemControls,
  onSetWifiEnabled,
  onSetBluetoothEnabled,
  onSetAudioVolume,
  onSetDisplayBrightness,
}: {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenLiquidGlass?: () => void;
  systemControls?: SystemControlState | null;
  onSetWifiEnabled?: (enabled: boolean) => Promise<unknown> | unknown;
  onSetBluetoothEnabled?: (enabled: boolean) => Promise<unknown> | unknown;
  onSetAudioVolume?: (percentage: number) => Promise<unknown> | unknown;
  onSetDisplayBrightness?: (percentage: number) => Promise<unknown> | unknown;
}) {
  const [previewWifi, setPreviewWifi] = useState(true);
  const [previewBluetooth, setPreviewBluetooth] = useState(true);
  const [focus, setFocus] = useState(false);
  const [brightness, setBrightness] = useState(78);
  const [volume, setVolume] = useState(42);
  const [busyControl, setBusyControl] = useState<"wifi" | "bluetooth" | null>(
    null,
  );

  useEffect(() => {
    const nativeBrightness = systemControls?.display?.brightness;
    const nativeVolume = systemControls?.audio?.volume;
    if (typeof nativeBrightness === "number") {
      setBrightness(nativeBrightness);
    }
    if (typeof nativeVolume === "number") {
      setVolume(nativeVolume);
    }
  }, [systemControls]);

  const nativeControls = systemControls?.nativeShell === true;
  const wifi = nativeControls
    ? systemControls.wifi.enabled === true
    : previewWifi;
  const bluetooth = nativeControls
    ? systemControls.bluetooth.enabled === true
    : previewBluetooth;
  const wifiUnavailable =
    nativeControls &&
    (!systemControls?.wifi.available || systemControls?.wifi.enabled === null);
  const bluetoothUnavailable =
    nativeControls &&
    (!systemControls?.bluetooth.available ||
      !systemControls?.bluetooth.present ||
      systemControls?.bluetooth.enabled === null);

  const toggleWifi = async () => {
    const next = !wifi;
    if (!nativeControls) {
      setPreviewWifi(next);
      return;
    }
    if (wifiUnavailable || !onSetWifiEnabled) return;
    setBusyControl("wifi");
    try {
      await onSetWifiEnabled(next);
    } finally {
      setBusyControl(null);
    }
  };

  const toggleBluetooth = async () => {
    const next = !bluetooth;
    if (!nativeControls) {
      setPreviewBluetooth(next);
      return;
    }
    if (bluetoothUnavailable || !onSetBluetoothEnabled) return;
    setBusyControl("bluetooth");
    try {
      await onSetBluetoothEnabled(next);
    } finally {
      setBusyControl(null);
    }
  };

  const commitSlider = (kind: "audio" | "display", value: number) => {
    if (!nativeControls) return;
    if (kind === "audio") void onSetAudioVolume?.(value);
    else void onSetDisplayBrightness?.(value);
  };

  if (!open) return null;
  return (
    <>
      <button
        className="mac-panel-scrim"
        type="button"
        onClick={onClose}
        aria-label="关闭控制中心"
      />
      <section className="mac-control-center" data-desktop-interactive>
        <div className="mac-control-grid">
          <button
            type="button"
            className="mac-control-network"
            data-liquid-surface="thick"
            disabled={wifiUnavailable || busyControl === "wifi"}
            onClick={() => void toggleWifi()}
          >
            <span className={cn("mac-control-round", wifi && "is-on")}>
              <WifiIcon />
            </span>
            <span>
              <strong>Wi-Fi</strong>
              <small>
                {wifiUnavailable
                  ? "不可用"
                  : wifi
                    ? systemControls?.wifi.connection || "打开"
                    : "关闭"}
              </small>
            </span>
            <ChevronRightIcon className="ml-auto size-3.5 opacity-40" />
          </button>
          <button
            type="button"
            className="mac-control-network"
            data-liquid-surface="thick"
            disabled={bluetoothUnavailable || busyControl === "bluetooth"}
            onClick={() => void toggleBluetooth()}
          >
            <span className={cn("mac-control-round", bluetooth && "is-on")}>
              <BluetoothIcon />
            </span>
            <span>
              <strong>蓝牙</strong>
              <small>
                {bluetoothUnavailable ? "不可用" : bluetooth ? "打开" : "关闭"}
              </small>
            </span>
            <ChevronRightIcon className="ml-auto size-3.5 opacity-40" />
          </button>
          <button
            type="button"
            className={cn("mac-control-tile", focus && "is-on")}
            data-liquid-surface="thick"
            aria-pressed={focus}
            onClick={() => setFocus((value) => !value)}
          >
            <span className="mac-control-round">
              <MoonIcon />
            </span>
            <strong>专注模式</strong>
          </button>
          {onOpenLiquidGlass ? (
            <button
              type="button"
              className="mac-control-tile"
              data-liquid-surface="thick"
              onClick={() => {
                onClose();
                onOpenLiquidGlass();
              }}
              title="调节流光玻璃材质与光泽"
            >
              <span className="mac-control-round">
                <DropletsIcon />
              </span>
              <strong>流光玻璃</strong>
            </button>
          ) : (
            <button
              type="button"
              className="mac-control-tile"
              data-liquid-surface="thick"
              onClick={onOpenSettings}
            >
              <span className="mac-control-round">
                <SettingsIcon />
              </span>
              <strong>系统设置</strong>
            </button>
          )}
        </div>
        <label className="mac-control-slider" data-liquid-surface="thick">
          <span>
            <SunIcon className="size-4" />
            显示器
          </span>
          <input
            type="range"
            min="10"
            max="100"
            value={brightness}
            style={
              { "--mac-control-progress": `${brightness}%` } as CSSProperties
            }
            aria-label="显示器亮度"
            disabled={nativeControls && !systemControls.display.available}
            onChange={(event) => setBrightness(Number(event.target.value))}
            onPointerUp={(event) =>
              commitSlider("display", Number(event.currentTarget.value))
            }
            onKeyUp={(event) =>
              commitSlider("display", Number(event.currentTarget.value))
            }
          />
        </label>
        <label className="mac-control-slider" data-liquid-surface="thick">
          <span>
            <Volume2Icon className="size-4" />
            声音
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            style={{ "--mac-control-progress": `${volume}%` } as CSSProperties}
            aria-label="系统音量"
            disabled={nativeControls && !systemControls.audio.available}
            onChange={(event) => setVolume(Number(event.target.value))}
            onPointerUp={(event) =>
              commitSlider("audio", Number(event.currentTarget.value))
            }
            onKeyUp={(event) =>
              commitSlider("audio", Number(event.currentTarget.value))
            }
          />
        </label>
        <div className="mac-control-footer">
          <span>
            <CommandIcon className="size-3.5" /> ECHO OS
          </span>
          <button type="button" onClick={onOpenSettings}>
            控制中心设置…
          </button>
        </div>
      </section>
    </>
  );
}

export function MacNotificationCenter({
  open,
  onClose,
  notifications = [],
  nativeServiceAvailable = false,
  onDismiss,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  notifications?: NativeNotification[];
  nativeServiceAvailable?: boolean;
  onDismiss?: (notificationId: number) => void;
  onClear?: () => void;
}) {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  if (!open) return null;
  return (
    <>
      <button
        className="mac-panel-scrim"
        type="button"
        onClick={onClose}
        aria-label="关闭通知中心"
      />
      <aside className="mac-notification-center" data-desktop-interactive>
        <div className="mac-notification-date" data-liquid-surface="thin">
          <span className="mac-notification-day-row">
            <span>周{"日一二三四五六"[today.getDay()]}</span>
            {notifications.length > 0 && onClear && (
              <button type="button" onClick={onClear}>
                全部清除
              </button>
            )}
          </span>
          <strong>
            {today.getMonth() + 1}月{today.getDate()}日
          </strong>
        </div>
        <section className="mac-calendar-panel" data-liquid-surface="thick">
          <header>
            <strong>
              {today.getFullYear()}年{today.getMonth() + 1}月
            </strong>
            <span>‹　›</span>
          </header>
          <div className="mac-calendar-week">
            {"日一二三四五六".split("").map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="mac-calendar-days">
            {Array.from({ length: first }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => (
              <span
                key={i + 1}
                className={i + 1 === today.getDate() ? "is-today" : ""}
              >
                {i + 1}
              </span>
            ))}
          </div>
        </section>
        <div className="mac-notification-list" role="list">
          {notifications.map((notification) => (
            <section
              className="mac-notification-card"
              role="listitem"
              key={notification.id}
              data-liquid-surface="thick"
            >
              <div className="mac-notification-app">
                <span>
                  <EchoMark tone="light" />
                </span>
                <strong>{notification.appName}</strong>
                <small>
                  {new Intl.DateTimeFormat("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  }).format(new Date(notification.updatedAt))}
                </small>
                {onDismiss && (
                  <button
                    type="button"
                    className="mac-notification-dismiss"
                    onClick={() => onDismiss(notification.id)}
                    aria-label={`清除 ${notification.appName} 通知`}
                  >
                    <XIcon />
                  </button>
                )}
              </div>
              {notification.summary && <p>{notification.summary}</p>}
              {notification.body && <span>{notification.body}</span>}
            </section>
          ))}
          {notifications.length === 0 && (
            <section
              className="mac-notification-empty"
              role="status"
              data-liquid-surface="thick"
            >
              <BellIcon />
              <strong>暂无通知</strong>
              <span>
                {nativeServiceAvailable
                  ? "来自应用和系统服务的新通知会显示在这里。"
                  : "系统通知在 ECHO OS 原生 Linux 会话中启用。"}
              </span>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}

export function MacAboutDialog({
  open,
  onClose,
  onOpenSettings,
  agentHealth,
  updateStatus,
  updateCapabilities,
  updateBusy = false,
  onRefreshUpdate,
  onApplyUpdate,
  onRestart,
}: {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  agentHealth: AgentDesktopHealth;
  updateStatus?: SystemUpdateStatus | null;
  updateCapabilities?: SystemUpdateCapabilities | null;
  updateBusy?: boolean;
  onRefreshUpdate?: () => void;
  onApplyUpdate?: () => void;
  onRestart?: () => void;
}) {
  useEscapeToClose(open, onClose);
  // The desktop is Chinese-first; the English lines stay English only in an
  // English UI. Read the context directly so About also renders without one.
  const english = (useContext(I18nContext)?.locale ?? "zh-CN").startsWith("en");
  if (!open) return null;
  const state = updateStatus?.state || "unavailable";
  const updateCopy: Record<
    SystemUpdateStatus["state"],
    { title: string; detail: string }
  > = {
    idle: {
      title: "等待自动检查",
      detail: "系统会在联网并接通电源后检查签名更新。",
    },
    checking: {
      title: "正在检查更新",
      detail: "正在通过 HTTPS 下载并验证发布签名。",
    },
    ready: {
      title: updateStatus?.version
        ? `ECHO OS ${updateStatus.version} 已认证`
        : "更新已认证",
      detail: "安装将写入未启用的系统槽，当前系统保持可启动。",
    },
    installing: {
      title: "正在安装到备用系统",
      detail: "请保持供电；完成前不会切换当前启动系统。",
    },
    "reboot-required": {
      title: updateStatus?.version
        ? `ECHO OS ${updateStatus.version} 已就绪`
        : "更新已就绪",
      detail: "新系统已写入备用槽，重新启动后进行首次验证启动。",
    },
    failed: {
      title: "最近一次更新未完成",
      detail: "当前系统没有被替换；系统会保留可启动的旧槽。",
    },
    unavailable: {
      title: "原生系统更新不可用",
      detail:
        updateStatus?.error || "请在 ECHO OS 原生 Linux 桌面中查看系统更新。",
    },
  };
  const copy = updateCopy[state];
  const active = state === "checking" || state === "installing" || updateBusy;
  const agentStateCopy: Record<AgentDesktopHealthState, string> = {
    checking: "正在检查",
    ready: agentHealth.verifiedBundle ? "已验证并在线" : "在线",
    "restart-required": "等待重启",
    unavailable: "未连接",
  };
  return (
    <div
      className="mac-overlay mac-dialog-overlay"
      data-desktop-interactive
      onPointerDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="关于本机"
        className="mac-about-dialog"
        data-liquid-surface="ultra-thick"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="mac-about-close"
          onClick={onClose}
          aria-label="关闭"
        >
          <XIcon aria-hidden />
        </button>
        <div className="mac-about-mark">
          <EchoMark tone="light" />
        </div>
        <h1>ECHO OS</h1>
        <p>
          {english ? "Personal Agent Operating System" : "个人智能体操作系统"}
        </p>
        <dl data-liquid-surface="thick">
          <div>
            <dt>版本</dt>
            <dd>{__ECHO_OS_VERSION__}</dd>
          </div>
          <div>
            <dt>Agent</dt>
            <dd>{agentStateCopy[agentHealth.state]}</dd>
          </div>
          <div>
            <dt>Agent 版本</dt>
            <dd>{agentHealth.version || "未知"}</dd>
          </div>
          <div>
            <dt>Agent 来源</dt>
            {/* The id is mono telemetry; the Chinese fallback keeps the 12px floor. */}
            <dd
              className={
                agentHealth.sourceId ? "mac-about-agent-source" : undefined
              }
            >
              {agentHealth.sourceId || "未提供"}
            </dd>
          </div>
          <div>
            <dt>来源验证</dt>
            <dd>
              {agentHealth.verifiedBundle ? "已验证镜像 bundle" : "来源未验证"}
            </dd>
          </div>
          <div>
            <dt>系统</dt>
            <dd>{english ? "Debian Appliance Layer" : "Debian 设备层"}</dd>
          </div>
        </dl>
        <section
          className="mac-about-update"
          aria-label="系统更新"
          data-liquid-surface="thick"
        >
          <div className="mac-about-update-heading">
            <span className="mac-about-update-icon" aria-hidden>
              {active ? (
                <Loader2Icon className="is-spinning" />
              ) : state === "ready" || state === "reboot-required" ? (
                <CheckCircle2Icon />
              ) : (
                <RefreshCwIcon />
              )}
            </span>
            <span>
              <strong>{copy.title}</strong>
              <small>{copy.detail}</small>
            </span>
          </div>
          <div className="mac-about-update-actions">
            <button
              type="button"
              onClick={onRefreshUpdate}
              disabled={active || !updateCapabilities?.status}
            >
              刷新状态
            </button>
            {state === "ready" && (
              <button
                type="button"
                className="is-primary"
                onClick={onApplyUpdate}
                disabled={active || !updateCapabilities?.apply}
              >
                安装更新…
              </button>
            )}
            {state === "reboot-required" && (
              <button
                type="button"
                className="is-primary"
                onClick={onRestart}
                disabled={!onRestart}
              >
                重新启动…
              </button>
            )}
          </div>
        </section>
        <button
          type="button"
          className="mac-about-settings"
          onClick={onOpenSettings}
        >
          打开系统设置…
        </button>
        <small>© 2026 ECHO</small>
      </section>
    </div>
  );
}

const SYSTEM_ACTION_COPY: Record<
  MacSystemAction,
  { title: string; detail: string; confirm: string }
> = {
  logout: {
    title: "退出当前 ECHO OS 会话？",
    detail: "正在运行的应用会被关闭，并返回本地系统登录界面。",
    confirm: "退出登录",
  },
  suspend: {
    title: "让 ECHO OS 进入睡眠？",
    detail: "当前会话会暂停，按电源键或键盘即可唤醒设备。",
    confirm: "睡眠",
  },
  restart: {
    title: "重新启动 ECHO OS？",
    detail: "正在运行的应用会被关闭，请先保存尚未完成的工作。",
    confirm: "重新启动",
  },
  shutdown: {
    title: "关闭 ECHO OS？",
    detail: "正在运行的应用会被关闭，设备需要再次按下电源键才能启动。",
    confirm: "关机",
  },
};

/**
 * Modal shell dialogs mark themselves aria-modal, which makes the desktop's
 * global Escape handlers stand down; the dialog then owns Escape itself.
 */
function useEscapeToClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, onClose]);
}

// Signing out of ECHO OS in a browser ends only this browser's session; the
// device and its tasks keep running.
const WEB_LOGOUT_COPY = {
  title: "退出这个浏览器里的 ECHO OS？",
  detail: "设备上的任务会继续运行。再次使用时需要输入设备密码。",
  confirm: "退出登录",
};

export function MacSystemActionDialog({
  action,
  busy,
  error,
  onCancel,
  onConfirm,
  webSession = false,
}: {
  action: MacSystemAction | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  /** No native shell: logout ends the browser session only. */
  webSession?: boolean;
}) {
  useEscapeToClose(Boolean(action) && !busy, onCancel);
  if (!action) return null;
  const copy =
    action === "logout" && webSession
      ? WEB_LOGOUT_COPY
      : SYSTEM_ACTION_COPY[action];
  return (
    <div
      className="mac-system-action-overlay"
      data-desktop-interactive
      onPointerDown={() => !busy && onCancel()}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mac-system-action-title"
        className="mac-system-action-dialog"
        data-liquid-surface="ultra-thick"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="mac-system-action-mark">
          <EchoMark tone="light" />
        </div>
        <div className="mac-system-action-copy">
          <h2 id="mac-system-action-title">{copy.title}</h2>
          <p>{copy.detail}</p>
          {error && <p className="mac-system-action-error">{error}</p>}
        </div>
        <div className="mac-system-action-buttons">
          <button type="button" disabled={busy} onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="is-primary"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "正在执行…" : copy.confirm}
          </button>
        </div>
      </section>
    </div>
  );
}

export function MacLockedBadge() {
  return (
    <span className="mac-locked-badge">
      <LockIcon />
      安全会话
    </span>
  );
}

export function MacStatusPill() {
  return (
    <span className="mac-status-pill">
      <InfoIcon />
      本地模式
    </span>
  );
}

export const MAC_SYSTEM_APPS = {
  launchpad: {
    icon: LayoutGridIcon,
    gradient: "linear-gradient(150deg, #1e1b4b 0%, #0f172a 60%, #020617 100%)",
  },
  settings: {
    icon: SettingsIcon,
    gradient: "linear-gradient(150deg, #94a3b8 0%, #475569 60%, #334155 100%)",
  },
  appStore: {
    icon: ShoppingBagIcon,
    gradient: "linear-gradient(150deg, #38bdf8 0%, #2563eb 55%, #1e40af 100%)",
  },
  notifications: {
    icon: BellIcon,
    gradient: "linear-gradient(145deg, #ff6b6b, #d3183e)",
  },
  agent: {
    icon: BotIcon,
    gradient: "linear-gradient(145deg, #7c5cff, #2b54d6)",
  },
  disk: {
    icon: HardDriveIcon,
    gradient: "linear-gradient(145deg, #e6e9ee, #89919d)",
  },
};
