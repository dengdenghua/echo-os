import {
  DesktopStartGuide,
  OPEN_DESKTOP_START_GUIDE_EVENT,
} from "@/appliance/desktop-start-guide";
import { AppOpenChoice } from "@/appliance/app-open-choice";
import { useDesktopWorkspaces } from "@/appliance/use-desktop-workspaces";
import { useDesktopWorkspaceRequest } from "@/appliance/use-desktop-workspace-request";
import { useDesktopBrowserRequest } from "@/appliance/use-desktop-browser-request";
import { BROWSER_OPEN_URL_REQUEST_EVENT } from "@/components/browser/browser-store";
import type { BrowserSearchRequest } from "@/app/browser/page";
import { useDesktopAction } from "@/appliance/use-desktop-action";
import { revealFileRequest } from "@/appliance/desktop-actions";
import { desktopAgentDraft } from "@/appliance/desktop-agent-context";
import { taskWorkspaceRoute } from "@/core/router/task-workspace-route";
import {
  findWorkbenchApp,
  isLocalDatabaseRoute,
  workbenchRoutePath,
} from "@/core/workbench/apps";
import { workbenchRoute } from "@/core/router/desktop-workspace-route";
import { availableDesktopWorkbenchApps } from "@/core/workbench/desktop-apps";
import { useModuleAvailabilitySnapshot } from "@/core/modules/enabled-modules";
import { useWorkbenchAvailabilitySync } from "@/core/workbench/availability";
import { AiNetworkPulse } from "@/appliance/ai-network-pulse";
import {
  IntentDesktopSurface,
  OPEN_ROOMS,
  type DesktopMode,
  type OpenRoomType,
} from "@/appliance/intent-desktop-surface";
import { LocalDatabaseApp } from "@/appliance/local-database-app";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
const BrowserPage = lazy(() => import("@/app/browser/page"));
import {
  AppWindowIcon,
  ArchiveIcon,
  CpuIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FolderIcon,
  FolderInputIcon,
  GlobeIcon,
  HardDriveIcon,
  ImageIcon,
  Loader2Icon,
  ListChecksIcon,
  ShieldCheckIcon,
  MonitorIcon,
  RotateCcwIcon,
  SearchIcon,
  SettingsIcon,
  ShoppingBagIcon,
  SmartphoneIcon,
  TerminalSquareIcon,
  XIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { OrganizerResult, useDesktopOrganizer } from "./organizer-result";
import { DecisionInbox } from "@/appliance/decision-inbox";
import { pendingApprovalCount } from "@/appliance/task-approval-consent";

import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useDebounce } from "@/hooks";
import type {
  NativeDesktopItem,
  NativeNotification,
  NativeWindow,
} from "@/types/electron";
import {
  applianceAppsForDock,
  applianceAppsForLibrary,
  appOpenUrl,
  fetchApplianceApps,
  startApplianceApp,
  stopApplianceApp,
  useApplianceApps,
  type ApplianceApp,
} from "@/appliance/apps";
import { Dock, DockItem } from "@/appliance/dock";
import { MacLiquidGlassOptics } from "@/appliance/liquid-glass-optics";
import { MacLiquidGlassWebGL } from "@/appliance/liquid-glass-webgl";
import { useDesktopAppearance } from "@/appliance/use-desktop-appearance";
import { useLiquidGlassPointer } from "@/appliance/use-liquid-glass-pointer";
import { useSystemControls } from "@/appliance/use-system-controls";
import { useSystemUpdates } from "@/appliance/use-system-updates";
import { useDesktopOverlays } from "@/appliance/use-desktop-overlays";
import { MacNativeLiquidGlass } from "@/appliance/native-liquid-glass";
import {
  findNativeFileManagerApp,
  findNativeSystemSettingsApp,
  isNativeSystemSettingsApp,
  nativeWindowMatchesApp,
  useNativeApps,
} from "@/appliance/apps-native";
import {
  ApplianceAuthStatusError,
  fetchApplianceAuthStatus,
  hasDeviceOperatorAccess,
  type ApplianceAuthStatus,
} from "@/appliance/auth";
import { requestHighRiskApproval } from "@/appliance/approval";
import { agentAssetManagementRoute } from "@/appliance/agent-assets";
import { useAgentDesktopHealth } from "@/appliance/agent-health";
import {
  AccountSecurityPanel,
  type AccountSecuritySection,
} from "@/appliance/account-security-panel";
import type { OsAgentSettingsSection } from "@/components/workspace/settings/system-agent-settings-content";
import { ApplianceLogin, ApplianceSessionGate } from "@/appliance/login";
import { FileManager } from "@/appliance/file-manager";
import { listTrash, type TrashEntry } from "@/appliance/files";
import { MacDockTrash } from "@/appliance/mac-dock-trash";
import { MacDockDownloadsStack } from "@/appliance/mac-dock-stack";
import { EchoMark } from "@/components/brand/echo-mark";
import { HighRiskApprovalDialog } from "@/appliance/high-risk-approval-dialog";
import { HubPanel } from "@/appliance/hub-panel";
import type { HubApp } from "@/appliance/hub";
import { OPEN_ECHO_HUB_EVENT } from "@/core/apps/app-presentation";
import { PhotosPanel } from "@/appliance/photos-panel";
import { StorageCenterPanel } from "@/appliance/storage-center-panel";
import { DeviceLinkPanel } from "@/appliance/device-link-panel";
import { resolveSystemSettingsSurface } from "@/appliance/system-settings-surface";
import { TaskSpacePanel } from "@/appliance/task-space-panel";
import { ActivityMonitorPanel } from "@/appliance/activity-monitor-panel";
import { useAgents } from "@/core/agents/hooks";
import { startEchoTask, type EchoTaskProjection } from "@/appliance/task-space";
import { DockTaskRail } from "@/appliance/dock-task-rail";
import {
  SystemAppWindowProvider,
  systemAppForWindow,
  useSystemAppWindow,
  type SystemAppId,
} from "@/appliance/system-app-window";
import { useEchoTaskProjection } from "@/appliance/task-space";
import { AppWindow } from "@/appliance/app-window";
import {
  loadAgentWorkspaceConfig,
  resolveAgentAppUrl,
} from "@/appliance/agent-workspace";
import {
  MAC_SYSTEM_APPS,
  MacAboutDialog,
  MacAppIcon,
  MacControlCenter,
  MacDesktopIcon,
  MacDesktopWallpaperArtwork,
  MacLaunchpad,
  MacLiquidGlassPanel,
  MacMenuBar,
  MacNotificationCenter,
  MacSpotlight,
  MacSystemActionDialog,
  MacWorkspaceDropdown,
  type MacShellApp,
} from "@/appliance/macos-shell";
import type { LinkedDevice } from "@/appliance/device-link";
import { PhoneMirrorApp } from "@/appliance/phone-mirror-app";
import { MissionControl } from "@/appliance/mission-control";
import { playSystemSound } from "@/appliance/desktop-audio-feedback";

type DesktopApp = {
  name: string;
  subtitle: string;
  route: string;
  icon: LucideIcon;
  color: string;
  // Agent 工作台类应用直接渲染在系统窗口中，不再加载另一套前端。
  windowed?: boolean;
  /** The shared app registry owns Dock placement; core desktop apps opt in here. */
  dock?: boolean;
};

type DesktopCategory = {
  key: "all" | "folder" | "app" | "image" | "document" | "package" | "other";
  label: string;
};

const DESKTOP_APPS: DesktopApp[] = [
  {
    name: "工作台",
    subtitle: "对话、编程、项目",
    route: "/workspace/realtime/new",
    icon: MonitorIcon,
    color: "linear-gradient(145deg, #141820, #020409)",
    windowed: true,
  },
  {
    name: "AI 浏览器",
    subtitle: "浏览、调研、自动化",
    route: "/browser",
    icon: GlobeIcon,
    color: "linear-gradient(150deg, #ffffff 0%, #f1f5f9 60%, #e2e8f0 100%)",
    dock: true,
  },
  {
    name: "照片",
    subtitle: "本地智能相册",
    route: "/photos",
    icon: ImageIcon,
    color: "linear-gradient(150deg, #ffffff 0%, #f8fafc 60%, #f1f5f9 100%)",
    dock: true,
  },
  {
    name: "存储中心",
    subtitle: "容量、磁盘与共享",
    route: "/storage-center",
    icon: HardDriveIcon,
    color: "linear-gradient(150deg, #38bdf8 0%, #0284c7 50%, #0369a1 100%)",
  },
  {
    name: "设备连接",
    subtitle: "手机、终端与远程访问",
    route: "/device-link",
    icon: SmartphoneIcon,
    color: "linear-gradient(145deg, #7f9cff, #4455d8)",
  },
  {
    name: "手机镜像",
    subtitle: "多屏协同与手机投屏",
    route: "/phone-mirror",
    icon: SmartphoneIcon,
    color: "linear-gradient(150deg, #34d399 0%, #059669 60%, #064e3b 100%)",
    dock: true,
  },
  {
    name: "知识库",
    subtitle: "工作区与资料",
    route: "/workspace/knowledge",
    icon: FolderIcon,
    color: "linear-gradient(145deg, #ffd65d, #e58a18)",
  },
  {
    name: "Echo Hub",
    subtitle: "应用、服务与扩展",
    route: "/hub",
    icon: ShoppingBagIcon,
    color: "linear-gradient(145deg, #72b9ff, #3158d8)",
  },
  {
    name: "终端日志",
    subtitle: "运行状态",
    route: "/workspace/observability",
    icon: TerminalSquareIcon,
    color: "linear-gradient(145deg, #555d68, #1e232b)",
    windowed: true,
  },
  {
    name: "设置",
    subtitle: "账号、模型、权限",
    route: "/workspace",
    icon: SettingsIcon,
    color: "linear-gradient(145deg, #90959d, #444950)",
  },
];

const DESKTOP_WORKBENCH_APP = DESKTOP_APPS.find(
  (app) => app.route === "/workspace/realtime/new",
)!;

const ECHO_APP_STORE_ID = "echo-app-store";

// Agent 工作台在桌面上由左侧 Echo Agent 状态卡作为唯一主入口。
// Dock placement is declared on each app entry so route aliases cannot drift.
const OPERATOR_ONLY_APP_ROUTES = new Set([
  "/storage-center",
  "/device-link",
  "/workspace/observability",
  "/workspace",
]);
const DESKTOP_CATEGORIES: DesktopCategory[] = [
  { key: "all", label: "全部" },
  { key: "folder", label: "文件夹" },
  { key: "app", label: "应用" },
  { key: "image", label: "图片" },
  { key: "document", label: "文档" },
  { key: "package", label: "安装包" },
  { key: "other", label: "其他" },
];

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
]);
const DOCUMENT_EXTENSIONS = new Set([
  "txt",
  "md",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
]);
const PACKAGE_EXTENSIONS = new Set([
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "exe",
  "msi",
  "dmg",
  "pkg",
]);
const ARCHIVE_FOLDER_MAP: Record<string, string> = {
  image: "图片",
  document: "文档",
  package: "安装包",
  other: "其他",
};

// Echo OS 原生路线:桌面即系统主页 —— 默认进入、不透明、自带壁纸+启动器。
// 母体 echo-agent 走寄生路线(透明叠加真实桌面的整理工具,类比腾讯/360
// 桌面助手),那里此常量为 false:保留 opt-in 门、desktop-overlay 透明类与
// 鼠标穿透。把差异收敛到这一个常量,从母体合并更新时冲突面最小。
const IS_NATIVE_DESKTOP = true;

function getDesktopItemCategory(
  item: NativeDesktopItem,
): DesktopCategory["key"] {
  if (item.kind === "folder") return "folder";
  if (item.kind === "app") return "app";
  if (IMAGE_EXTENSIONS.has(item.extension)) return "image";
  if (DOCUMENT_EXTENSIONS.has(item.extension)) return "document";
  if (PACKAGE_EXTENSIONS.has(item.extension)) return "package";
  return "other";
}

function groupDesktopItems(items: NativeDesktopItem[]) {
  return DESKTOP_CATEGORIES.filter((category) => category.key !== "all")
    .map((category) => ({
      key: category.key,
      title: category.label,
      items: items.filter(
        (item) => getDesktopItemCategory(item) === category.key,
      ),
    }))
    .filter((group) => group.items.length > 0);
}

/** Dock 图标右上角的待审批数。 */
function ApprovalCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full border border-white/80 bg-amber-500 px-1 text-[9px] font-semibold leading-4 text-white shadow-sm">
      {Math.min(count, 99)}
    </span>
  );
}

export default function DesktopShellPage() {
  const navigate = useNavigate();
  const {
    authStatus,
    authError,
    user,
    isAuthenticated,
    isLoading: authLoading,
    isBackendStarting,
    retryAuth,
  } = useAuth();
  const {
    spotlightOpen,
    launchpadOpen,
    controlCenterOpen,
    notificationsOpen,
    liquidGlassOpen,
    aboutOpen,
    setOverlay,
    toggleOverlay,
    closeTransient,
  } = useDesktopOverlays();
  const [query, setQuery] = useState("");
  const [appOpenChoice, setAppOpenChoice] = useState<DesktopApp | null>(null);
  const [nativeNotifications, setNativeNotifications] = useState<
    NativeNotification[]
  >([]);
  const [notificationServiceAvailable, setNotificationServiceAvailable] =
    useState(false);
  const [accountSecuritySection, setAccountSecuritySection] =
    useState<AccountSecuritySection>("account");
  const [agentSettingsSection, setAgentSettingsSection] =
    useState<OsAgentSettingsSection>("models");
  const [desktopMenu, setDesktopMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [nativeWindowMenu, setNativeWindowMenu] = useState<{
    x: number;
    y: number;
    appName: string;
    window: NativeWindow;
  } | null>(null);
  const [nativeDesktopItems, setNativeDesktopItems] = useState<
    NativeDesktopItem[]
  >([]);
  const [desktopDrawerOpen, setDesktopDrawerOpen] = useState(false);
  const [desktopCategory, setDesktopCategory] =
    useState<DesktopCategory["key"]>("all");
  const [desktopSearch, setDesktopSearch] = useState("");
  const organizerEnabled = true;
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: NativeDesktopItem;
  } | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mousePassthroughRef = useRef(false);

  const debouncedSearch = useDebounce(desktopSearch, 200);

  // Electron 外壳:桌面透明穿透模式(显示真实系统桌面);
  // 非 Electron(浏览器 / NAS)则铺自有极光壁纸。
  const isElectronShell =
    typeof window !== "undefined" && !!window.echo?.isElectron;

  // Appliance 单用户认证门:null=检测中,true=放行(无需认证或已登录),
  // false=需登录。仅 NAS appliance 形态会要求认证(后端 ECHO_APPLIANCE=1)。
  const [applianceAuthed, setApplianceAuthed] = useState<boolean | null>(null);
  const [applianceAuthRequired, setApplianceAuthRequired] = useState<
    boolean | null
  >(null);
  const [applianceRole, setApplianceRole] =
    useState<ApplianceAuthStatus["role"]>(null);
  const [applianceAuthError, setApplianceAuthError] = useState<Error | null>(
    null,
  );
  const [applianceAuthProbe, setApplianceAuthProbe] = useState(0);
  const isDeviceOperator = hasDeviceOperatorAccess(
    applianceAuthRequired,
    applianceAuthed,
    applianceRole,
  );
  useWorkbenchAvailabilitySync();
  const workbenchAvailability = useModuleAvailabilitySnapshot();
  const visibleDesktopApps = useMemo(
    () =>
      [
        ...DESKTOP_APPS,
        ...availableDesktopWorkbenchApps(workbenchAvailability).map(
          (app): DesktopApp => ({
            name: app.name,
            subtitle: app.description,
            route: app.workspaceRoute,
            icon: app.icon === "database" ? DatabaseIcon : AppWindowIcon,
            color: "linear-gradient(145deg, #54d59d, #0c8e66)",
            windowed: true,
            dock: app.dock,
          }),
        ),
      ].filter(
        (app) =>
          isDeviceOperator ||
          !OPERATOR_ONLY_APP_ROUTES.has(workbenchRoutePath(app.route)),
      ),
    [isDeviceOperator, workbenchAvailability],
  );
  const agentDesktopHealth = useAgentDesktopHealth(applianceAuthed === true);
  const {
    projection: taskProjection,
    loading: taskProjectionLoading,
    error: taskProjectionError,
    refresh: refreshTaskProjection,
    takeover: takeoverTaskProjection,
    resumeExecution: resumeTaskProjection,
    decideApproval: decideTaskApproval,
  } = useEchoTaskProjection(applianceAuthed === true);
  // 桌面意图面只用后端的 Agent 名册，不在前端预置 Agent。
  const { agents: agentRoster } = useAgents();
  const desktopAgents = useMemo(
    () =>
      agentRoster.map((agent) => ({
        id: agent.name,
        name: agent.display_name || agent.name,
        icon: agent.icon,
        description: agent.description,
      })),
    [agentRoster],
  );
  // 从桌面任务卡片打开任务空间时，要展开的那个任务。
  const [taskSpaceFocus, setTaskSpaceFocus] = useState<{
    taskId: string;
  } | null>(null);
  const [desktopMode, setDesktopMode] = useState<DesktopMode>("workspace");
  // 桌面窗口:系统应用直接渲染 React 内容，第三方应用才使用 iframe。
  const {
    windows,
    minimized,
    focusedWin,
    geometries,
    stack: windowStack,
    openWindow,
    closeWindow,
    minimizeWindow,
    restoreWindow,
    focusWindow,
    openWorkspace,
    updateWindowGeometry,
  } = useDesktopWorkspaces(useCallback(() => setDesktopMode("workspace"), []));

  // 系统应用（文件、照片、Hub……）都是桌面窗口：开关读写的是窗口管理器，
  // 打开即创建或唤起窗口，关闭即关窗，不再是互斥的全屏面板。
  // NAS 文件管理器(原生路线;Electron 寄生模式仍用透明桌面整理抽屉)。
  const [fileManagerOpen, setFileManagerOpen] = useSystemAppWindow(
    "files",
    windows,
    openWindow,
    closeWindow,
  );
  const [photosOpen, setPhotosOpen] = useSystemAppWindow(
    "photos",
    windows,
    openWindow,
    closeWindow,
  );
  const [taskSpaceOpen, setTaskSpaceOpen] = useSystemAppWindow(
    "task-space",
    windows,
    openWindow,
    closeWindow,
  );
  const [decisionInboxOpen, setDecisionInboxOpen] = useSystemAppWindow(
    "decision-inbox",
    windows,
    openWindow,
    closeWindow,
  );
  const [showWidget, setShowWidget] = useSystemAppWindow(
    "activity-monitor",
    windows,
    openWindow,
    closeWindow,
  );
  const [accountSecurityOpen, setAccountSecurityOpen] = useSystemAppWindow(
    "settings",
    windows,
    openWindow,
    closeWindow,
  );
  const [settingsBusy, setSettingsBusy] = useState(false);
  useEffect(() => {
    if (!isDeviceOperator) setAccountSecurityOpen(false);
  }, [isDeviceOperator, setAccountSecurityOpen]);
  const [browserOpen, setBrowserOpen] = useSystemAppWindow(
    "browser",
    windows,
    openWindow,
    closeWindow,
  );
  const [browserSearchRequest, setBrowserSearchRequest] =
    useState<BrowserSearchRequest | null>(null);
  const browserSearchRevision = useRef(0);
  const openBrowser = useCallback(
    (query?: string) => {
      if (query?.trim()) {
        setBrowserSearchRequest({
          query: query.trim(),
          revision: ++browserSearchRevision.current,
        });
      }
      setBrowserOpen(true);
    },
    [setBrowserOpen],
  );
  const [photoSearchRequest, setPhotoSearchRequest] = useState<{
    query: string;
    selectedPath?: string;
  } | null>(null);
  const [fileOpenRequest, setFileOpenRequest] = useState<{
    path: string;
    selectedPath?: string;
  } | null>(null);
  const [fileOpenTrash, setFileOpenTrash] = useState(false);
  const [trashEntries, setTrashEntries] = useState<TrashEntry[]>([]);
  const [trashMenu, setTrashMenu] = useState<{ x: number; y: number } | null>(
    null,
  );

  const refreshTrashEntries = useCallback(() => {
    listTrash()
      .then((res) => setTrashEntries(res?.entries || []))
      .catch(() => setTrashEntries([]));
  }, []);

  useEffect(() => {
    // The lock screen has no session yet; polling would only collect 401s.
    if (applianceAuthed !== true) return;
    refreshTrashEntries();
    const timer = window.setInterval(refreshTrashEntries, 20_000);
    return () => window.clearInterval(timer);
  }, [applianceAuthed, refreshTrashEntries]);

  // 文件窗口常驻，"打开废纸篓"是一次性请求：交给已挂载的文件窗口后立即复位，
  // 下一次点击废纸篓才能再次触发。
  useEffect(() => {
    if (!fileOpenTrash || !fileManagerOpen) return;
    const timer = window.setTimeout(() => setFileOpenTrash(false), 0);
    return () => window.clearTimeout(timer);
  }, [fileManagerOpen, fileOpenTrash]);

  const handleOpenTrash = useCallback(() => {
    setFileOpenTrash(true);
    setFileManagerOpen(true);
    playSystemSound("pop");
  }, [setFileManagerOpen]);

  const handleEmptyTrash = useCallback(() => {
    if (trashEntries.length === 0) {
      toast.info("废纸篓已是空的");
      return;
    }
    setFileOpenTrash(true);
    setFileManagerOpen(true);
  }, [setFileManagerOpen, trashEntries.length]);

  const [desktopActiveRoom, setDesktopActiveRoom] =
    useState<OpenRoomType>("all");
  const {
    theme: desktopTheme,
    setTheme: handleSelectDesktopTheme,
    toggleTheme: handleToggleDesktopTheme,
    liquidGlassStyle,
    liquidGlassIntensity,
    liquidGlassTuning,
    setLiquidGlassStyle,
    setLiquidGlassIntensity,
    patchLiquidGlassTuning,
    wallpaper,
    setWallpaper,
    cycleWallpaper: cycleWallpaperAppearance,
    resetLiquidGlass,
    liquidGlassVariables,
    liquidGlassUsesNativeDefaults,
  } = useDesktopAppearance();
  const liquidGlassPointer = useLiquidGlassPointer();
  useDesktopAction(applianceAuthed === true, (action) => {
    if (action.type === "photos.search" || action.type === "photos.reveal") {
      setPhotoSearchRequest({
        query: action.query,
        ...(action.type === "photos.reveal"
          ? { selectedPath: action.path }
          : {}),
      });
      setPhotosOpen(true);
    } else {
      setFileOpenRequest(
        action.type === "files.reveal"
          ? revealFileRequest(action.path)
          : { path: action.path },
      );
      setFileManagerOpen(true);
    }
  });
  const [storageCenterOpen, setStorageCenterOpen] = useSystemAppWindow(
    "storage-center",
    windows,
    openWindow,
    closeWindow,
  );
  const [deviceLinkOpen, setDeviceLinkOpen] = useSystemAppWindow(
    "device-link",
    windows,
    openWindow,
    closeWindow,
  );
  const [hubOpen, setHubOpen] = useSystemAppWindow(
    "hub",
    windows,
    openWindow,
    closeWindow,
  );
  const [pendingAppControl, setPendingAppControl] = useState<{
    operation: "start" | "stop";
    app: ApplianceApp;
  } | null>(null);
  const openFiles = () => {
    if (IS_NATIVE_DESKTOP) setFileManagerOpen(true);
    else if (isElectronShell) setDesktopDrawerOpen(true);
    else setFileManagerOpen(true);
  };
  // useCallback：本函数被窗口快捷键 effect 依赖，且作为 onOpenSpotlight 下传。
  // 记忆化后引用稳定，effect 不会每次渲染都重挂监听，子组件也不会被无谓刷新。
  const openSpotlight = useCallback(() => {
    setOverlay("controlCenter", false);
    setOverlay("notifications", false);
    setOverlay("liquidGlass", false);
    setOverlay("launchpad", false);
    setOverlay("spotlight", true);
  }, [setOverlay]);
  const toggleControlCenter = () => {
    setOverlay("notifications", false);
    setOverlay("spotlight", false);
    setOverlay("liquidGlass", false);
    toggleOverlay("controlCenter");
  };
  const toggleNotifications = () => {
    setOverlay("controlCenter", false);
    setOverlay("spotlight", false);
    setOverlay("liquidGlass", false);
    toggleOverlay("notifications");
  };
  // 打开流光玻璃面板前先收起其他浮层，避免出现多层浮层叠加。
  const openLiquidGlass = () => {
    setOverlay("controlCenter", false);
    setOverlay("notifications", false);
    setOverlay("spotlight", false);
    setOverlay("liquidGlass", true);
  };
  const openSystemSettingsSection = (section: AccountSecuritySection) => {
    if (!isDeviceOperator) {
      toast.info("家庭成员不能修改设备级设置");
      return;
    }
    setOverlay("controlCenter", false);
    setOverlay("notifications", false);
    setOverlay("about", false);
    const openEchoSettings = () => {
      setAccountSecuritySection(section);
      setAccountSecurityOpen(true);
    };
    const nativeAppsApi = window.echo?.apps;
    if (
      nativeAppsApi &&
      resolveSystemSettingsSurface(!!nativeAppsApi) === "native"
    ) {
      void nativeAppsApi
        .list()
        .then(async (apps) => {
          const settingsApp = findNativeSystemSettingsApp(apps);
          if (!settingsApp) {
            throw new Error("原生 KDE 系统设置未安装");
          }
          const result = await nativeAppsApi.launch(settingsApp.id);
          if (!result.ok) {
            throw new Error(result.error || "原生系统设置启动失败");
          }
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : "原生系统设置启动失败";
          toast.error(`${message}，已打开内置设置`);
          openEchoSettings();
        });
      return;
    }
    openEchoSettings();
  };
  const openSystemSettings = () => openSystemSettingsSection("account");
  const openStorageSettings = () => openSystemSettingsSection("storage");
  const openSystemAgentSettings = useCallback(
    (section: OsAgentSettingsSection = "models") => {
      if (!isDeviceOperator) {
        toast.info("家庭成员不能修改设备级设置");
        return;
      }
      setAgentSettingsSection(section);
      setAccountSecuritySection(section === "models" ? "models" : "agent");
      setAccountSecurityOpen(true);
    },
    [isDeviceOperator, setAccountSecurityOpen],
  );

  useEffect(() => {
    const open = (event: Event) => {
      const requested =
        event instanceof CustomEvent &&
        typeof event.detail?.section === "string"
          ? event.detail.section
          : "models";
      const allowed = new Set<OsAgentSettingsSection>([
        "models",
        "tools",
        "memory",
        "browserAutomation",
        "desktopAutomation",
        "automationSecurity",
        "conversation",
        "notification",
        "appearance",
        "privacy",
      ]);
      openSystemAgentSettings(
        allowed.has(requested as OsAgentSettingsSection)
          ? (requested as OsAgentSettingsSection)
          : "models",
      );
    };
    window.addEventListener("echo:open-system-settings", open);
    return () => window.removeEventListener("echo:open-system-settings", open);
  }, [openSystemAgentSettings]);

  const [missionControlOpen, setMissionControlOpen] = useState(false);

  // 触控板多指捏合 (Pinch) 与两指滚动快速唤起调度中心
  const handleDesktopWheel = useCallback(
    (e: React.WheelEvent<HTMLElement>) => {
      if ((e.target as HTMLElement).closest("[data-desktop-interactive]"))
        return;
      if (e.ctrlKey) {
        if (e.deltaY < -12 && !missionControlOpen) {
          setMissionControlOpen(true);
          playSystemSound("whoosh");
        } else if (e.deltaY > 12 && missionControlOpen) {
          setMissionControlOpen(false);
          playSystemSound("whoosh");
        }
      }
    },
    [missionControlOpen],
  );
  useDesktopWorkspaceRequest({
    ready:
      applianceAuthed === true &&
      !authLoading &&
      (authStatus?.enabled === false || isAuthenticated),
    onOpen: openWorkspace,
  });
  const browserSessionReady =
    !authLoading &&
    !authError &&
    (authStatus?.enabled === false || isAuthenticated) &&
    applianceAuthed === true;
  useDesktopBrowserRequest({ ready: browserSessionReady, onOpen: openBrowser });
  useEffect(() => {
    if (!browserSessionReady) return;
    const open = () => openBrowser();
    window.addEventListener(BROWSER_OPEN_URL_REQUEST_EVENT, open);
    return () =>
      window.removeEventListener(BROWSER_OPEN_URL_REQUEST_EVENT, open);
  }, [browserSessionReady, openBrowser]);
  useEffect(() => {
    if (authLoading || authError) {
      setApplianceAuthRequired(null);
      setApplianceAuthed(null);
      setApplianceRole(null);
      setApplianceAuthError(null);
      return;
    }

    let alive = true;
    fetchApplianceAuthStatus()
      .then((s) => {
        if (alive) {
          setApplianceAuthRequired(s.authRequired);
          setApplianceAuthed(!s.authRequired || s.authenticated);
          setApplianceRole(s.role);
          setApplianceAuthError(null);
        }
      })
      .catch((error: unknown) => {
        if (!alive) return;
        // 非 appliance 的开发母体没有此接口；仅明确的 404 可以放行。
        if (error instanceof ApplianceAuthStatusError && error.status === 404) {
          setApplianceAuthRequired(false);
          setApplianceAuthed(true);
          setApplianceRole("operator");
          setApplianceAuthError(null);
          return;
        }
        setApplianceAuthRequired(null);
        setApplianceAuthed(null);
        setApplianceRole(null);
        setApplianceAuthError(
          error instanceof Error ? error : new Error("无法确认 appliance 会话"),
        );
      });
    return () => {
      alive = false;
    };
  }, [applianceAuthProbe, authError, authLoading]);

  useEffect(() => {
    // 只读取同源存储配置；Agent 工作台本身已经内建。
    void loadAgentWorkspaceConfig();
  }, []);

  // The OS session is the single authentication boundary. If its backend
  // identity expires while the desktop is open, return to the system login
  // screen instead of letting an embedded workbench render another login.
  useEffect(() => {
    if (authLoading || applianceAuthRequired !== true) return;
    setApplianceAuthed(isAuthenticated);
  }, [applianceAuthRequired, authLoading, isAuthenticated]);

  const {
    systemControls,
    availableSystemActions,
    pendingSystemAction,
    systemActionBusy,
    systemActionError,
    applySystemControl,
    lockScreen,
    requestSystemAction,
    cancelSystemAction,
    confirmSystemAction,
  } = useSystemControls({
    closeTransientPanels: () => {
      closeTransient();
    },
  });
  const {
    capabilities: systemUpdateCapabilities,
    status: systemUpdateStatus,
    busy: systemUpdateBusy,
    refresh: refreshSystemUpdate,
    apply: applySystemUpdate,
  } = useSystemUpdates({
    surfaceOpen:
      aboutOpen ||
      (accountSecurityOpen && accountSecuritySection === "general"),
  });

  const refreshNativeNotifications = useCallback(async () => {
    const notifications = window.echo?.notifications;
    if (!notifications) {
      setNotificationServiceAvailable(false);
      setNativeNotifications([]);
      return;
    }
    try {
      const result = await notifications.list();
      setNotificationServiceAvailable(result.ok);
      if (result.ok) setNativeNotifications(result.notifications);
    } catch (error) {
      setNotificationServiceAvailable(false);
      console.warn("[echo] native notification refresh failed", error);
    }
  }, []);

  useEffect(() => {
    if (!window.echo?.notifications) return;
    void refreshNativeNotifications();
    const tick = () => {
      // 页面不可见时暂停轮询，回到前台立即补一次，避免后台空转
      if (document.hidden) return;
      void refreshNativeNotifications();
    };
    const timer = window.setInterval(tick, notificationsOpen ? 1_500 : 5_000);
    return () => window.clearInterval(timer);
  }, [notificationsOpen, refreshNativeNotifications]);

  const dismissNativeNotification = async (notificationId: number) => {
    const notifications = window.echo?.notifications;
    if (!notifications) return;
    const result = await notifications.close(notificationId).catch(() => ({
      ok: false,
      error: "系统通知服务不可用",
    }));
    if (!result.ok) {
      toast.error(result.error || "通知清除失败");
      return;
    }
    setNativeNotifications((current) =>
      current.filter((notification) => notification.id !== notificationId),
    );
  };

  const clearNativeNotifications = async () => {
    const notifications = window.echo?.notifications;
    if (!notifications) return;
    const result = await notifications.clear().catch(() => ({
      ok: false,
      error: "系统通知服务不可用",
    }));
    if (!result.ok) {
      toast.error(result.error || "通知清除失败");
      return;
    }
    setNativeNotifications([]);
  };

  useEffect(() => {
    const onSystemShortcut = (event: globalThis.KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        document.querySelector(
          '[role="dialog"][data-state="open"], [aria-modal="true"]',
        )
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.code === "Space") {
        event.preventDefault();
        if (spotlightOpen) setOverlay("spotlight", false);
        else openSpotlight();
        return;
      }
      if (
        event.ctrlKey &&
        (event.metaKey || event.altKey) &&
        event.code === "KeyQ"
      ) {
        event.preventDefault();
        void lockScreen();
        return;
      }
      if (event.key === "F3" || (event.ctrlKey && event.key === "ArrowUp")) {
        event.preventDefault();
        setMissionControlOpen((prev) => !prev);
        return;
      }
      if (event.key !== "Escape") return;
      setMissionControlOpen(false);
      closeTransient();
    };
    window.addEventListener("keydown", onSystemShortcut);
    return () => window.removeEventListener("keydown", onSystemShortcut);
  }, [spotlightOpen, lockScreen, openSpotlight, setOverlay, closeTransient]);

  const openPhoneMirror = (device: LinkedDevice) => {
    if (!isDeviceOperator || !device.online || device.platform !== "android")
      return;
    setDeviceLinkOpen(false);
    const id = `phone-mirror:${device.id}`;
    openWindow({
      id,
      title: `${[device.brand, device.model].filter(Boolean).join(" ") || device.id} · 手机协同`,
      url: "/phone-mirror",
      integratedChrome: true,
      content: (
        <PhoneMirrorApp deviceId={device.id} onClose={() => closeWindow(id)} />
      ),
    });
  };

  const openApp = (app: DesktopApp, routeOverride?: string) => {
    const registeredApp = findWorkbenchApp(app.route);
    if (
      registeredApp?.delivery === "remote" &&
      workbenchAvailability?.get(registeredApp.moduleId) !== true
    ) {
      toast.info("应用尚未安装、已停用或状态未确认，请在应用中心查看。");
      return;
    }
    if (
      !isDeviceOperator &&
      OPERATOR_ONLY_APP_ROUTES.has(workbenchRoutePath(app.route))
    ) {
      toast.info("家庭成员不能打开设备级管理工具");
      return;
    }
    if (app.route === "/browser") {
      openBrowser();
      setOverlay("launchpad", false);
      setOverlay("spotlight", false);
      return;
    }
    if (app.route === "/photos") {
      setPhotosOpen(true);
      setOverlay("launchpad", false);
      setOverlay("spotlight", false);
      return;
    }
    if (app.route === "/storage-center") {
      setStorageCenterOpen(true);
      setOverlay("launchpad", false);
      setOverlay("spotlight", false);
      return;
    }
    if (app.route === "/phone-mirror") {
      setDeviceLinkOpen(true);
      setOverlay("launchpad", false);
      setOverlay("spotlight", false);
      return;
    }
    if (app.route === "/device-link") {
      setDeviceLinkOpen(true);
      setOverlay("launchpad", false);
      setOverlay("spotlight", false);
      return;
    }
    if (app.route === "/hub") {
      setHubOpen(true);
      setOverlay("launchpad", false);
      setOverlay("spotlight", false);
      return;
    }
    if (workbenchRoutePath(app.route) === "/workspace") {
      openSystemSettings();
      return;
    }
    if (isLocalDatabaseRoute(app.route)) {
      const route = routeOverride || app.route;
      openWindow({
        id: `agent-app:${route}`,
        title: app.name,
        url: resolveAgentAppUrl(route),
        content: (
          <LocalDatabaseApp
            initialRoute={route}
            onOpenWorkbench={openWorkspace}
          />
        ),
      });
      setOverlay("launchpad", false);
      setOverlay("spotlight", false);
      return;
    }
    // Agent 工作台类应用直接作为 React 内容开进桌面窗口。
    if (app.windowed) {
      openWorkspace(routeOverride || app.route, { title: app.name });
      setOverlay("launchpad", false);
      setOverlay("spotlight", false);
      return;
    }
    navigate(app.route);
  };

  const chooseAppPresentation = (app: DesktopApp) => {
    if (findWorkbenchApp(app.route)) {
      setOverlay("launchpad", false);
      setOverlay("spotlight", false);
      setAppOpenChoice(app);
    } else openApp(app);
  };

  // Echo OS:Dock 的"本地应用"段只接真实数据(Docker 应用注册器)。
  // API 不可用或没有应用时保持为空，不能用不可启动的占位图标伪报能力。
  const { apps: applianceApps, refresh: refreshApplianceApps } =
    useApplianceApps(applianceAuthed === true);
  // 原生 shell:本地已装应用(仅 Electron 会话 shell;web 端为空,Dock 不变)。
  const reportNativeAppLaunchError = useCallback(
    (message: string) => toast.error(message),
    [],
  );
  const {
    apps: nativeApps,
    windows: nativeWindows,
    open: openNativeApp,
    focus: focusNativeWindow,
    minimize: minimizeNativeWindow,
    close: closeNativeWindow,
  } = useNativeApps({
    onLaunchError: reportNativeAppLaunchError,
  });
  const appStoreApp = nativeApps.find((app) => app.id === ECHO_APP_STORE_ID);
  const nativeFileManagerApp = findNativeFileManagerApp(nativeApps);
  const dockNativeApps = nativeApps.filter(
    (app) =>
      app.id !== ECHO_APP_STORE_ID &&
      app.id !== nativeFileManagerApp?.id &&
      !isNativeSystemSettingsApp(app),
  );
  const openAppStore = useCallback(() => {
    setHubOpen(true);
  }, [setHubOpen]);
  useEffect(() => {
    const openHubFromCatalog = () => openAppStore();
    window.addEventListener(OPEN_ECHO_HUB_EVENT, openHubFromCatalog);
    return () =>
      window.removeEventListener(OPEN_ECHO_HUB_EVENT, openHubFromCatalog);
  }, [openAppStore]);
  const openFinder = () => {
    if (nativeFileManagerApp) {
      openNativeApp(nativeFileManagerApp);
      return;
    }
    openFiles();
  };
  const libraryApplianceApps = useMemo(
    () => applianceAppsForLibrary(applianceApps),
    [applianceApps],
  );
  const dockApplianceApps = useMemo(
    () => applianceAppsForDock(applianceApps),
    [applianceApps],
  );
  const openApplianceApp = (app: ApplianceApp) => {
    if (app.state !== "running") {
      if (!isDeviceOperator) {
        toast.info("请让设备管理员先启动这个应用");
        return;
      }
      setPendingAppControl({ operation: "start", app });
      return;
    }
    const url = appOpenUrl(app);
    // 原生路线:开成桌面内窗口;Electron 寄生模式仍走新标签(无窗口系统)。
    if (!url) return;
    if (IS_NATIVE_DESKTOP || !isElectronShell) {
      openWindow({ id: app.id, title: app.name, url });
    } else {
      window.open(url, "_blank", "noopener");
    }
  };

  const confirmAppControl = async (password: string) => {
    if (!pendingAppControl) return;
    const { app, operation } = pendingAppControl;
    const approval = await requestHighRiskApproval(
      operation === "start" ? "app.start" : "app.stop",
      app.id,
      password,
    );
    if (operation === "start") {
      await startApplianceApp(app.id, approval.approvalToken);
    } else {
      await stopApplianceApp(app.id, approval.approvalToken);
      closeWindow(app.id);
    }
    refreshApplianceApps();
    setPendingAppControl(null);
    toast.success(`${app.name} 已${operation === "start" ? "启动" : "停止"}`);
  };

  const resolveHubApplianceApp = async (
    hubApp: HubApp,
  ): Promise<ApplianceApp | null> => {
    const containerId = hubApp.installation.containerId;
    if (!containerId) return null;
    const cached = applianceApps.find((app) => app.id === containerId);
    if (cached) return cached;
    try {
      const latest = await fetchApplianceApps();
      if (!latest.available) return null;
      return latest.apps.find((app) => app.id === containerId) ?? null;
    } catch {
      return null;
    }
  };

  const openHubApplianceApp = async (hubApp: HubApp) => {
    const app = await resolveHubApplianceApp(hubApp);
    if (!app) {
      refreshApplianceApps();
      toast.error("应用入口仍在同步，请刷新 Hub 后重试");
      return;
    }
    setHubOpen(false);
    openApplianceApp(app);
  };

  const isAppWindowOpen = (route: string) =>
    windows.some((win) => {
      const path = (win.workspaceRoute ?? win.url).split(/[?#]/)[0];
      return route === "/workspace/realtime/new"
        ? path?.startsWith("/workspace/realtime/")
        : path === route.split(/[?#]/)[0];
    });

  const macShellApps: MacShellApp[] = [
    ...visibleDesktopApps.map((app) => ({
      id: `echo:${app.route}`,
      name: app.name,
      subtitle: app.subtitle,
      icon: app.icon,
      gradient: app.color,
      iconState:
        app.route === "/workspace/realtime/new" &&
        (taskProjection?.counts.active ?? 0) > 0
          ? ("thinking" as const)
          : undefined,
      running:
        app.route === "/browser"
          ? browserOpen
          : app.route === "/photos"
            ? photosOpen
            : app.route === "/storage-center"
              ? storageCenterOpen
              : app.route === "/device-link"
                ? deviceLinkOpen
                : app.route === "/hub"
                  ? hubOpen
                  : app.windowed && isAppWindowOpen(app.route),
      onOpen: () => chooseAppPresentation(app),
    })),
    ...libraryApplianceApps.map((app) => ({
      id: `appliance:${app.id}`,
      name: app.name,
      subtitle: app.description || app.status,
      icon: AppWindowIcon,
      iconUrl: app.icon || undefined,
      gradient: "linear-gradient(145deg, #f8fafc, #b8c2d0)",
      running: app.state === "running",
      muted: app.state !== "running",
      onOpen: () => openApplianceApp(app),
    })),
    ...nativeApps.slice(0, 12).map((app) => ({
      id: `native:${app.id}`,
      name: app.name,
      subtitle: app.source === "flatpak" ? "沙箱应用" : "本地应用",
      icon: AppWindowIcon,
      iconUrl: app.iconDataUrl || undefined,
      gradient: "linear-gradient(145deg, #f8fafc, #b8c2d0)",
      running: nativeWindows.some((item) => nativeWindowMatchesApp(item, app)),
      onOpen: () => openNativeApp(app),
    })),
  ];

  const documentLibraryApp = macShellApps.find((app) =>
    isLocalDatabaseRoute(app.id.slice("echo:".length)),
  );
  const desktopShortcuts: MacShellApp[] = [
    {
      id: "system:files",
      name: "文件",
      subtitle: "文件",
      icon: FolderIcon,
      gradient: "linear-gradient(145deg, #6bc9ff, #1d78d4)",
      onOpen: openFinder,
    },
    ...(documentLibraryApp
      ? [
          {
            ...documentLibraryApp,
            name: "文档库",
          },
        ]
      : []),
    ...(nativeFileManagerApp
      ? [
          {
            id: "system:disk",
            name: "Echo HD",
            subtitle: "系统磁盘",
            icon: MAC_SYSTEM_APPS.disk.icon,
            gradient: MAC_SYSTEM_APPS.disk.gradient,
            onOpen: openFinder,
          },
        ]
      : []),
  ].filter(Boolean);

  useEffect(() => {
    if (!organizerEnabled) return;
    const off = window.echo?.on?.("desktop:organize-now", () => {
      setDesktopCategory("all");
      setDesktopSearch("");
      setDesktopDrawerOpen(true);
    });
    return () => off?.();
  }, [organizerEnabled]);

  useEffect(() => {
    // 寄生模式专属:透明叠加真实桌面。原生 OS 桌面不透明,跳过。
    if (IS_NATIVE_DESKTOP || !organizerEnabled) return;
    document.documentElement.classList.add("desktop-overlay");
    return () => {
      document.documentElement.classList.remove("desktop-overlay");
      void window.echo?.window?.setMousePassthrough?.(false);
    };
  }, [organizerEnabled]);

  useEffect(() => {
    // 寄生模式专属:空白处鼠标穿透到真实桌面。原生 OS 桌面不需要。
    if (IS_NATIVE_DESKTOP || !organizerEnabled) return;
    if (!window.echo?.window?.setMousePassthrough) return;

    const setPassthrough = (enabled: boolean) => {
      if (mousePassthroughRef.current === enabled) return;
      mousePassthroughRef.current = enabled;
      void window.echo?.window?.setMousePassthrough?.(enabled).catch(() => {
        mousePassthroughRef.current = !enabled;
      });
    };

    if (desktopDrawerOpen) {
      setPassthrough(false);
      return;
    }

    const onPointerMove = (event: PointerEvent) => {
      const target = event.target;
      const overInteractive =
        target instanceof Element &&
        !!target.closest("[data-desktop-interactive]");
      setPassthrough(!overInteractive);
    };

    const onPointerLeave = () => setPassthrough(true);

    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerleave", onPointerLeave, true);
    setPassthrough(true);

    return () => {
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerleave", onPointerLeave, true);
      setPassthrough(false);
    };
  }, [desktopDrawerOpen, organizerEnabled]);

  useEffect(() => {
    if (!organizerEnabled) return;
    let alive = true;
    if (!window.echo?.desktop) return;
    setLoadingItems(true);
    setItemsError(null);
    window.echo.desktop
      .listItems()
      .then((result) => {
        if (!alive) return;
        setLoadingItems(false);
        if (!result.ok) {
          setItemsError(result.error || "读取桌面文件失败");
          setNativeDesktopItems([]);
          return;
        }
        setNativeDesktopItems(result.items);
      })
      .catch((e) => {
        if (!alive) return;
        setLoadingItems(false);
        setItemsError(e instanceof Error ? e.message : "读取桌面文件失败");
        setNativeDesktopItems([]);
      });
    return () => {
      alive = false;
    };
  }, [organizerEnabled]);

  useEffect(() => {
    if (!desktopDrawerOpen) return;
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [desktopDrawerOpen]);

  useEffect(() => {
    if (!desktopDrawerOpen) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setDesktopDrawerOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [desktopDrawerOpen]);

  useEffect(() => {
    const closeMenus = () => {
      setContextMenu(null);
      setDesktopMenu(null);
      setNativeWindowMenu(null);
      setTrashMenu(null);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeMenus();
    };
    document.addEventListener("click", closeMenus);
    // Capture phase: a new right-click closes the open menu before the
    // target's own onContextMenu opens its menu, so two never stack.
    document.addEventListener("contextmenu", closeMenus, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", closeMenus);
      document.removeEventListener("contextmenu", closeMenus, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const cycleWallpaper = () => {
    cycleWallpaperAppearance();
    setDesktopMenu(null);
  };

  const filteredDesktopItems = useMemo(() => {
    const search = debouncedSearch.trim().toLowerCase();
    return nativeDesktopItems.filter((item) => {
      const matchesCategory =
        desktopCategory === "all" ||
        getDesktopItemCategory(item) === desktopCategory;
      if (!matchesCategory) return false;
      if (!search) return true;
      return `${item.name} ${item.subtitle} ${item.extension}`
        .toLowerCase()
        .includes(search);
    });
  }, [desktopCategory, debouncedSearch, nativeDesktopItems]);

  const groupedDesktopItems = useMemo(
    () => groupDesktopItems(filteredDesktopItems),
    [filteredDesktopItems],
  );

  const openDesktopFile = (item: NativeDesktopItem) => {
    void window.echo?.desktop?.openItem(item.path);
  };

  const refreshDesktopItems = () => {
    if (!window.echo?.desktop) return;
    setLoadingItems(true);
    setItemsError(null);
    window.echo.desktop
      .listItems()
      .then((result) => {
        setLoadingItems(false);
        if (result.ok) {
          setNativeDesktopItems(result.items);
        } else {
          setItemsError(result.error || "刷新失败");
        }
      })
      .catch((e) => {
        setLoadingItems(false);
        setItemsError(e instanceof Error ? e.message : "刷新失败");
      });
  };

  const organizer = useDesktopOrganizer(refreshDesktopItems);
  const archiving = organizer.busy === "move";
  const undoing = organizer.busy === "undo";

  const archiveDesktopFile = (srcPath: string, folderName: string) =>
    organizer.run(
      "move",
      async () => {
        const desktop = window.echo?.desktop;
        if (!desktop?.moveItem)
          return { ok: false, failed: 1, error: "桌面整理服务不可用" };
        const listing = await desktop.listItems();
        if (!listing.ok || !listing.desktopPath) {
          return {
            ok: false,
            failed: 1,
            error: "无法读取桌面位置，未执行移动",
          };
        }
        const separator = listing.desktopPath.includes("\\") ? "\\" : "/";
        const destDir =
          listing.desktopPath.replace(/[\\/]$/, "") + separator + folderName;
        return desktop.moveItem(srcPath, destDir);
      },
      true,
    );

  const handleAutoArchive = async () => {
    if (!window.echo?.desktop?.moveItemsBatch) return;
    const fileItems = nativeDesktopItems.filter(
      (item) => item.kind === "file" && getDesktopItemCategory(item) !== "app",
    );
    if (fileItems.length === 0) {
      toast.info("桌面上没有可整理的文件");
      return;
    }
    const batch = fileItems.map((item) => ({
      srcPath: item.path,
      category: getDesktopItemCategory(item),
    }));
    const desktop = window.echo.desktop;
    await organizer.run("move", () => desktop.moveItemsBatch(batch));
  };

  const handleUndo = async () => {
    if (!window.echo?.desktop?.undoMoves) return;
    const desktop = window.echo.desktop;
    await organizer.run("undo", (operationId) =>
      desktop.undoMoves(operationId),
    );
  };

  const handleContextMenuAction = async (
    action: "open" | "archive",
    item: NativeDesktopItem,
  ) => {
    setContextMenu(null);
    if (action === "open") {
      openDesktopFile(item);
    } else if (action === "archive") {
      if (!window.echo?.desktop?.moveItem) return;
      const category = getDesktopItemCategory(item);
      if (category === "app" || category === "folder") {
        toast.info("仅支持归档文件");
        return;
      }
      const folderName = ARCHIVE_FOLDER_MAP[category];
      if (folderName) await archiveDesktopFile(item.path, folderName);
    }
  };

  const submit = () => {
    const value = query.trim().toLowerCase();
    if (!value) return;
    const app = visibleDesktopApps.find((item) => {
      const haystack = `${item.name} ${item.subtitle}`.toLowerCase();
      return (
        haystack.includes(value) || value.includes(item.name.toLowerCase())
      );
    });
    if (app) {
      setOverlay("spotlight", false);
      chooseAppPresentation(app);
      return;
    }
    setOverlay("spotlight", false);
    openBrowser(query.trim());
  };

  const retryDesktopAuth = () => {
    setApplianceAuthError(null);
    setApplianceAuthed(null);
    void retryAuth().finally(() => {
      setApplianceAuthProbe((current) => current + 1);
    });
  };

  // 主认证或 appliance 会话未确认时失败关闭，不渲染桌面内容。
  if (authLoading || applianceAuthed === null) {
    return (
      <ApplianceSessionGate
        state={
          authError || applianceAuthError
            ? "unavailable"
            : isBackendStarting
              ? "starting"
              : "checking"
        }
        onRetry={retryDesktopAuth}
      />
    );
  }

  // Appliance 认证门:需登录且未登录时显示原生登录屏。
  if (applianceAuthed === false) {
    return (
      <>
        <ApplianceLogin
          onSuccess={() => {
            void retryAuth()
              .then(() => fetchApplianceAuthStatus())
              .then((status) => {
                setApplianceAuthRequired(status.authRequired);
                setApplianceRole(status.role);
                setApplianceAuthed(
                  !status.authRequired || status.authenticated,
                );
              })
              .catch(() => {
                setApplianceAuthRequired(true);
                setApplianceRole(null);
                setApplianceAuthed(false);
                toast.error("登录成功，但无法确认当前账号权限");
              });
          }}
          systemCapabilities={availableSystemActions}
          onSystemAction={requestSystemAction}
        />
        <MacSystemActionDialog
          action={pendingSystemAction}
          busy={systemActionBusy}
          error={systemActionError}
          onCancel={cancelSystemAction}
          onConfirm={() => void confirmSystemAction()}
        />
      </>
    );
  }

  const focusedWindowTitle = focusedWin
    ? windows.find((win) => win.id === focusedWin)?.title
    : null;
  const menuBarActiveApp =
    !focusedWindowTitle || focusedWindowTitle === "文件"
      ? "文件管理器"
      : focusedWindowTitle;

  const openTaskSpace = (taskId?: string) => {
    setTaskSpaceFocus(taskId ? { taskId } : null);
    setTaskSpaceOpen(true);
  };
  const openTaskThread = (task: EchoTaskProjection, artifact?: string) => {
    if (!task.threadId) {
      openTaskSpace(task.id);
      return;
    }
    openWorkspace(
      taskWorkspaceRoute({
        threadId: task.threadId,
        agentId: task.agentId,
        artifact,
      }),
      { title: `任务 · ${task.title}` },
    );
  };

  // 系统应用的关闭收尾：窗口红绿灯和应用内部的关闭入口走同一条路径。
  const closeFilesApp = () => {
    setFileManagerOpen(false);
    setFileOpenTrash(false);
  };
  const closePhotosApp = () => {
    setPhotosOpen(false);
    setPhotoSearchRequest(null);
  };
  const closeSystemApp = (app: SystemAppId) => {
    if (app === "files") closeFilesApp();
    else if (app === "photos") closePhotosApp();
    else if (app === "hub") setHubOpen(false);
    else if (app === "storage-center") setStorageCenterOpen(false);
    else if (app === "device-link") setDeviceLinkOpen(false);
    else if (app === "activity-monitor") setShowWidget(false);
    else if (app === "decision-inbox") setDecisionInboxOpen(false);
    else if (app === "settings") {
      if (settingsBusy) return;
      setAccountSecurityOpen(false);
    } else if (app === "browser") {
      setBrowserSearchRequest(null);
      setBrowserOpen(false);
    } else setTaskSpaceOpen(false);
  };

  // 系统应用窗口的内容每次渲染时按当前状态生成，打开请求（定位到某个文件、
  // 搜索某张照片）才能送达已经打开的窗口。
  const renderSystemApp = (app: SystemAppId): ReactNode => {
    switch (app) {
      case "browser":
        return (
          <Suspense
            fallback={
              <p role="status" className="p-6 text-sm text-slate-500">
                正在打开 AI 浏览器…
              </p>
            }
          >
            <BrowserPage
              active={
                focusedWin === "system:browser" &&
                !minimized.has("system:browser")
              }
              searchRequest={browserSearchRequest}
            />
          </Suspense>
        );
      case "settings":
        return isDeviceOperator ? (
          <AccountSecurityPanel
            open={accountSecurityOpen}
            onBusyChange={setSettingsBusy}
            initialSection={accountSecuritySection}
            initialAgentSection={agentSettingsSection}
            systemDeviceSettings={{
              controls: systemControls,
              wallpaper: wallpaper,
              notificationCount: nativeNotifications.length,
              notificationServiceAvailable,
              updateCapabilities: systemUpdateCapabilities,
              updateStatus: systemUpdateStatus,
              updateBusy: systemUpdateBusy,
              lockAvailable: availableSystemActions.lock,
              onSetWifiEnabled: (enabled) =>
                applySystemControl("Wi-Fi", () =>
                  window.echo!.systemControls!.setWifiEnabled(enabled),
                ),
              onSetBluetoothEnabled: (enabled) =>
                applySystemControl("蓝牙", () =>
                  window.echo!.systemControls!.setBluetoothEnabled(enabled),
                ),
              onSetAudioVolume: (percentage) =>
                applySystemControl("音量", () =>
                  window.echo!.systemControls!.setAudioVolume(percentage),
                ),
              onSetDisplayBrightness: (percentage) =>
                applySystemControl("显示器亮度", () =>
                  window.echo!.systemControls!.setDisplayBrightness(percentage),
                ),
              onWallpaperChange: setWallpaper,
              onOpenNotifications: () => {
                setAccountSecurityOpen(false);
                setOverlay("notifications", true);
              },
              onLock: () => void lockScreen(),
              onRefreshUpdate: () => void refreshSystemUpdate(),
              onApplyUpdate: () => void applySystemUpdate(),
              onOpenGettingStarted: () => {
                setAccountSecurityOpen(false);
                window.dispatchEvent(new Event(OPEN_DESKTOP_START_GUIDE_EVENT));
              },
            }}
            onClose={() => setAccountSecurityOpen(false)}
            onSessionEnded={(message) => {
              setAccountSecurityOpen(false);
              setApplianceRole(null);
              setApplianceAuthed(false);
              toast.success(message);
            }}
          />
        ) : null;
      case "activity-monitor":
        return (
          <ActivityMonitorPanel
            onClose={() => setShowWidget(false)}
            visible={!minimized.has("system:activity-monitor")}
          />
        );
      case "files":
        return (
          <FileManager
            initialShowTrash={fileOpenTrash}
            onAskAgent={(context) => {
              setFileManagerOpen(false);
              setFileOpenTrash(false);
              openWorkspace(
                taskWorkspaceRoute({ prompt: desktopAgentDraft(context) }),
              );
            }}
            openRequest={fileOpenRequest}
            onClose={closeFilesApp}
            onOpenSystemFiles={
              nativeFileManagerApp
                ? () => {
                    setFileManagerOpen(false);
                    setFileOpenTrash(false);
                    openNativeApp(nativeFileManagerApp);
                  }
                : undefined
            }
            onOpenSettings={() => {
              setFileManagerOpen(false);
              setFileOpenTrash(false);
              openStorageSettings();
            }}
          />
        );
      case "photos":
        return (
          <PhotosPanel
            open
            searchRequest={photoSearchRequest}
            onAskAgent={(context) =>
              openWorkspace(
                taskWorkspaceRoute({ prompt: desktopAgentDraft(context) }),
              )
            }
            onClose={closePhotosApp}
          />
        );
      case "hub":
        return (
          <HubPanel
            open
            canManageDevice={isDeviceOperator}
            onClose={() => setHubOpen(false)}
            onAppsChanged={refreshApplianceApps}
            onOpenDeviceApp={(app) => void openHubApplianceApp(app)}
            onOpenWorkbench={(route) => {
              setHubOpen(false);
              openWorkspace(route);
            }}
            onOpenSystemApp={(route) => {
              const registeredApp = findWorkbenchApp(route);
              if (
                registeredApp?.delivery === "remote" &&
                workbenchAvailability?.get(registeredApp.moduleId) !== true
              ) {
                toast.info("应用状态尚未就绪，请刷新应用中心后重试。");
                return;
              }
              setHubOpen(false);
              const app = visibleDesktopApps.find(
                (entry) => entry.route.split("?")[0] === route.split("?")[0],
              );
              if (app) openApp(app, route);
              else
                openWorkspace(
                  `${route}${route.includes("?") ? "&" : "?"}embedded=app`,
                  {
                    title: findWorkbenchApp(route)?.name ?? "应用",
                  },
                );
            }}
            onOpenAgentAssets={(asset) => {
              setHubOpen(false);
              openWorkspace(agentAssetManagementRoute(asset), {
                title: asset.kind === "skill" ? "Agent 技能" : "Agent 插件",
              });
            }}
          />
        );
      case "storage-center":
        return isDeviceOperator ? (
          <StorageCenterPanel
            open
            onClose={() => setStorageCenterOpen(false)}
            onOpenFiles={() => {
              setStorageCenterOpen(false);
              openFiles();
            }}
          />
        ) : null;
      case "device-link":
        return isDeviceOperator ? (
          <DeviceLinkPanel
            open
            onClose={() => setDeviceLinkOpen(false)}
            onOpenPhoneMirror={openPhoneMirror}
          />
        ) : null;
      case "task-space":
        return (
          <TaskSpacePanel
            open
            focusTaskRequest={taskSpaceFocus}
            projection={taskProjection}
            loading={taskProjectionLoading}
            error={taskProjectionError}
            onClose={() => setTaskSpaceOpen(false)}
            onRefresh={refreshTaskProjection}
            onTakeover={takeoverTaskProjection}
            onResumeExecution={resumeTaskProjection}
            onApprovalDecision={decideTaskApproval}
            onOpenWorkspace={(task, artifact) => {
              setTaskSpaceOpen(false);
              if (task?.threadId) {
                const route = taskWorkspaceRoute({
                  threadId: task.threadId,
                  agentId: task.agentId,
                  artifact,
                });
                openWorkspace(route, {
                  title: `任务 · ${task.title}`,
                });
                return;
              }
              openApp(DESKTOP_WORKBENCH_APP);
            }}
          />
        );
      case "decision-inbox":
        return (
          <DecisionInbox
            projection={taskProjection}
            loading={taskProjectionLoading}
            error={taskProjectionError}
            onClose={() => setDecisionInboxOpen(false)}
            onRefresh={refreshTaskProjection}
            onDecision={decideTaskApproval}
            onOpenTask={(task) => openTaskSpace(task.id)}
          />
        );
    }
  };

  return (
    <main
      aria-label="ECHO OS 桌面"
      className={cn(
        "macos-desktop-root relative h-screen overflow-hidden bg-transparent",
        desktopTheme,
        desktopTheme === "theme-white" ? "text-slate-900" : "text-white dark",
        desktopMode === "pure" && "is-mode-pure",
        `mac-wallpaper-${wallpaper}`,
        `mac-liquid-${liquidGlassStyle}`,
      )}
      style={liquidGlassVariables}
      data-liquid-intensity={liquidGlassIntensity}
      data-liquid-custom="true"
      data-liquid-tuning={liquidGlassUsesNativeDefaults ? "default" : "custom"}
      data-liquid-transparency={liquidGlassTuning.transparency}
      data-liquid-refraction={liquidGlassTuning.refraction}
      data-liquid-frost={liquidGlassTuning.frost}
      data-liquid-thickness={liquidGlassTuning.thickness}
      data-liquid-dispersion={liquidGlassTuning.dispersion}
      data-liquid-saturation={liquidGlassTuning.saturation}
      data-liquid-tint={liquidGlassTuning.tint}
      data-liquid-tint-strength={liquidGlassTuning.tintStrength}
      onPointerMove={liquidGlassPointer.onPointerMove}
      onWheel={handleDesktopWheel}
      onContextMenu={(event) => {
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest("[data-desktop-interactive]")
        ) {
          return;
        }
        event.preventDefault();
        setDesktopMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <MacLiquidGlassOptics />
      {/* 桌面壁纸。原生 OS 桌面始终铺壁纸；母体寄生模式仅浏览器铺，
          Electron 叠加时不渲染以让真实系统桌面透过来。 */}
      {(IS_NATIVE_DESKTOP || !isElectronShell) && (
        <div aria-hidden className="desktop-wallpaper absolute inset-0 z-0">
          <MacDesktopWallpaperArtwork />
        </div>
      )}
      <MacNativeLiquidGlass
        enabled={
          liquidGlassStyle === "crystal" && liquidGlassUsesNativeDefaults
        }
        wallpaper={wallpaper}
      />
      <MacLiquidGlassWebGL />
      {/* 不在这里建立层叠上下文：菜单栏（z-100）、Dock（z-90）和系统浮层
          必须与窗口层（z-40）同场比较，才能始终位于应用窗口之上。 */}
      <section className="relative flex h-full min-h-0 flex-col">
        <MacMenuBar
          modelStatus={
            <AiNetworkPulse
              onOpenWorkbench={() =>
                openApp(DESKTOP_WORKBENCH_APP, taskWorkspaceRoute({}))
              }
              onOpenSettings={() => openSystemAgentSettings("models")}
              onOpenPhoneMirror={openPhoneMirror}
            />
          }
          activeApp={menuBarActiveApp}
          controlCenterOpen={controlCenterOpen}
          notificationsOpen={notificationsOpen}
          liquidGlassOpen={liquidGlassOpen}
          onOpenSpotlight={openSpotlight}
          onToggleControlCenter={toggleControlCenter}
          onToggleNotifications={toggleNotifications}
          desktopTheme={desktopTheme}
          onToggleTheme={handleToggleDesktopTheme}
          onOpenAbout={() => setOverlay("about", true)}
          onOpenFiles={openFinder}
          onOpenSettings={openSystemSettings}
          appStoreAvailable
          onOpenAppStore={openAppStore}
          onOpenLaunchpad={() => setOverlay("launchpad", true)}
          onToggleMissionControl={() => setMissionControlOpen((prev) => !prev)}
          systemCapabilities={availableSystemActions}
          systemControls={systemControls}
          onLockScreen={lockScreen}
          onSystemAction={requestSystemAction}
          notificationCount={nativeNotifications.length}
          centerContent={
            <MacWorkspaceDropdown
              desktopMode={desktopMode}
              onToggleMode={() => {
                setDesktopMode((prev) => {
                  const next = prev === "pure" ? "workspace" : "pure";
                  toast.info(
                    next === "pure"
                      ? "已进入意图纯净态，工作区窗口已收起"
                      : "已恢复多窗口工作台",
                    {
                      description:
                        next === "pure"
                          ? "点击空白壁纸或按空格键可随时恢复窗口"
                          : "点击空白壁纸或按空格键可返回意图纯净态",
                    },
                  );
                  return next;
                });
              }}
              activeRoom={desktopActiveRoom}
              onSelectRoom={(room) => {
                setDesktopActiveRoom(room);
                if (desktopMode === "pure") {
                  setDesktopMode("workspace");
                }
                const roomInfo = OPEN_ROOMS.find((r) => r.id === room);
                toast.info(`已进入协作空间：${roomInfo?.title || room}`, {
                  description: `${roomInfo?.agentLabel || ""} · ${roomInfo?.desc || ""}`,
                });
              }}
            />
          }
        />
        {/* 桌面内容（意图面、任务卡、桌面图标）自成一层，整体位于窗口之下。 */}
        <div className="relative z-10 min-h-0 flex-1 pt-[25px]">
          <IntentDesktopSurface
            onOpenPhoneMirror={openPhoneMirror}
            mode={desktopMode}
            onModeChange={setDesktopMode}
            theme={desktopTheme}
            onThemeChange={handleSelectDesktopTheme}
            activeRoom={desktopActiveRoom}
            onActiveRoomChange={setDesktopActiveRoom}
            hideTopControlBar={true}
            tasks={
              taskProjection?.tasks ?? (taskProjectionError ? [] : undefined)
            }
            tasksAvailable={
              taskProjection ? taskProjection.available : !taskProjectionError
            }
            agents={desktopAgents}
            onOpenTask={openTaskThread}
            onOpenTaskSpace={openTaskSpace}
            onOpenWorkbench={(prompt, agentId) =>
              openApp(
                DESKTOP_WORKBENCH_APP,
                taskWorkspaceRoute({ prompt, agentId }),
              )
            }
            onDispatchIntent={(prompt, agentId) =>
              // 后台启动，不开工作台窗口。需要授权的操作由服务端挂起，停在
              // 任务空间等用户决定，不会因为没人看着而被超时拒绝。
              startEchoTask(prompt, agentId).then(
                () => {
                  // 任务登记后尽快出现在桌面和任务轨上，不必等下一轮轮询。
                  refreshTaskProjection();
                  window.setTimeout(refreshTaskProjection, 2_000);
                  return true;
                },
                (error: unknown) => {
                  toast.error(
                    error instanceof Error ? error.message : "无法启动任务",
                    {
                      description: "已在工作台里保留草稿，检查后可以手动发送。",
                    },
                  );
                  openApp(
                    DESKTOP_WORKBENCH_APP,
                    taskWorkspaceRoute({ prompt, agentId }),
                  );
                  return false;
                },
              )
            }
            onOpenApp={(appId) => {
              const app = visibleDesktopApps.find(
                (entry) => entry.route === appId,
              );
              if (app) openApp(app);
            }}
          >
            <DesktopStartGuide
              identity={user?.actor_id || user?.user_id || "local"}
              completedTasks={taskProjection?.counts.completed ?? 0}
              onStorage={() => openSystemSettingsSection("sharing")}
              onModel={() => openSystemAgentSettings("models")}
              onPermissions={() =>
                openSystemAgentSettings("automationSecurity")
              }
              onStart={(prompt) =>
                openApp(DESKTOP_WORKBENCH_APP, taskWorkspaceRoute({ prompt }))
              }
              onResults={() => setTaskSpaceOpen(true)}
              onDatabase={() => {
                const app = visibleDesktopApps.find((entry) =>
                  isLocalDatabaseRoute(entry.route),
                );
                if (app) openApp(app);
              }}
              onApps={openAppStore}
            />
            <div className="mac-desktop-icons">
              {desktopShortcuts.map((app) => (
                <MacDesktopIcon key={app.id} app={app} />
              ))}
            </div>
          </IntentDesktopSurface>
        </div>

        {window.echo?.desktop && (
          <div
            aria-hidden={!desktopDrawerOpen}
            className={cn(
              "absolute inset-0 z-[65] transition-all duration-300 ease-out",
              desktopDrawerOpen
                ? "pointer-events-auto opacity-100"
                : "pointer-events-none opacity-0",
            )}
          >
            <div
              data-desktop-interactive
              className={cn(
                "absolute inset-0 bg-black/18 px-8 pb-28 pt-14 backdrop-blur-sm transition-opacity duration-300",
                desktopDrawerOpen ? "opacity-100" : "opacity-0",
              )}
              onClick={() => setDesktopDrawerOpen(false)}
            />
            <section
              ref={drawerRef}
              className={cn(
                "absolute inset-x-8 bottom-28 top-14 mx-auto max-w-[760px] rounded-[28px] border border-border bg-card/90 p-5 text-card-foreground shadow-2xl shadow-black/24 backdrop-blur-2xl transition-all duration-300 ease-out",
                desktopDrawerOpen
                  ? "translate-y-0 opacity-100"
                  : "translate-y-4 opacity-0",
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold">桌面助手</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {loadingItems
                      ? "正在读取桌面文件..."
                      : itemsError
                        ? itemsError
                        : `${nativeDesktopItems.length} 个桌面项目已收纳`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {!itemsError && (
                    <button
                      type="button"
                      onClick={handleAutoArchive}
                      disabled={Boolean(organizer.busy) || loadingItems}
                      className="inline-flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                      title="一键整理桌面文件"
                    >
                      <ArchiveIcon className="size-3" />
                      {archiving ? "整理中..." : "一键整理"}
                    </button>
                  )}
                  {!itemsError && (
                    <button
                      type="button"
                      onClick={handleUndo}
                      disabled={Boolean(organizer.busy) || loadingItems}
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition hover:bg-foreground/5 disabled:opacity-50"
                      title="撤销上一次整理"
                    >
                      <RotateCcwIcon className="size-3" />
                      {undoing ? "撤销中..." : "撤销"}
                    </button>
                  )}
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => setDesktopDrawerOpen(false)}
                    className="grid size-8 place-items-center rounded-full bg-foreground/8 text-muted-foreground transition hover:bg-foreground/14 hover:text-foreground"
                    aria-label="关闭桌面文件"
                  >
                    <XIcon className="size-4" />
                  </button>
                </div>
              </div>

              {organizer.receipt && (
                <OrganizerResult receipt={organizer.receipt} />
              )}

              {itemsError && (
                <div className="mt-4 rounded-2xl border border-breach/30 bg-breach/10 px-4 py-3 text-xs text-breach">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">读取失败</span>
                    <button
                      type="button"
                      onClick={refreshDesktopItems}
                      className="ml-auto rounded-md border border-breach/30 px-2 py-0.5 text-xs font-medium text-breach transition hover:bg-breach/10"
                    >
                      重试
                    </button>
                  </div>
                  <p className="mt-1 opacity-80">{itemsError}</p>
                </div>
              )}

              {!itemsError && (
                <>
                  <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border bg-muted/60 px-3 py-2">
                    <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
                    <input
                      value={desktopSearch}
                      onChange={(event) => setDesktopSearch(event.target.value)}
                      placeholder="搜索桌面文件、应用、图片"
                      className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    {desktopSearch && (
                      <button
                        type="button"
                        onClick={() => setDesktopSearch("")}
                        aria-label="清除搜索"
                        className="grid size-4 place-items-center rounded-full text-muted-foreground transition hover:text-foreground"
                      >
                        <XIcon className="size-3" />
                      </button>
                    )}
                  </div>

                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {DESKTOP_CATEGORIES.map((category) => {
                      const count =
                        category.key === "all"
                          ? nativeDesktopItems.length
                          : nativeDesktopItems.filter(
                              (item) =>
                                getDesktopItemCategory(item) === category.key,
                            ).length;
                      return (
                        <button
                          key={category.key}
                          type="button"
                          onClick={() => setDesktopCategory(category.key)}
                          onDragOver={(e) => {
                            if (category.key === "all") return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            setDragOverCategory(category.key);
                          }}
                          onDragLeave={() => setDragOverCategory(null)}
                          onDrop={async (e) => {
                            e.preventDefault();
                            setDragOverCategory(null);
                            const srcPath =
                              e.dataTransfer.getData("text/plain");
                            if (!srcPath || !window.echo?.desktop?.moveItem)
                              return;
                            const folderName = ARCHIVE_FOLDER_MAP[category.key];
                            if (!folderName) return;
                            await archiveDesktopFile(srcPath, folderName);
                          }}
                          className={cn(
                            "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition",
                            desktopCategory === category.key
                              ? "bg-primary text-primary-foreground"
                              : dragOverCategory === category.key
                                ? "bg-core/15 text-core ring-2 ring-core"
                                : "bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
                          )}
                        >
                          {category.label}
                          <span className="ml-1 opacity-65">{count}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 max-h-[calc(100%-132px)] overflow-auto pr-1">
                    {loadingItems ? (
                      <div className="grid h-56 place-items-center">
                        <div className="text-center">
                          <Loader2Icon className="mx-auto size-8 animate-spin text-muted-foreground" />
                          <p className="mt-3 text-sm font-medium text-muted-foreground">
                            正在读取桌面文件...
                          </p>
                        </div>
                      </div>
                    ) : filteredDesktopItems.length > 0 ? (
                      <div className="space-y-5">
                        {(desktopCategory === "all"
                          ? groupedDesktopItems
                          : [
                              {
                                key: desktopCategory,
                                title:
                                  DESKTOP_CATEGORIES.find(
                                    (item) => item.key === desktopCategory,
                                  )?.label || "文件",
                                items: filteredDesktopItems,
                              },
                            ]
                        ).map((group) => (
                          <div key={group.key}>
                            <div className="mb-2 text-xs font-semibold text-muted-foreground">
                              {group.title}
                            </div>
                            <div className="grid grid-cols-5 gap-3">
                              {group.items.map((item) => {
                                const category = getDesktopItemCategory(item);
                                const Icon =
                                  category === "folder"
                                    ? FolderIcon
                                    : category === "app"
                                      ? AppWindowIcon
                                      : category === "image"
                                        ? ImageIcon
                                        : FileTextIcon;
                                return (
                                  <button
                                    key={item.path}
                                    type="button"
                                    draggable={item.kind === "file"}
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData(
                                        "text/plain",
                                        item.path,
                                      );
                                      e.dataTransfer.effectAllowed = "move";
                                    }}
                                    onClick={() => openDesktopFile(item)}
                                    onContextMenu={(e) => {
                                      e.preventDefault();
                                      setContextMenu({
                                        x: e.clientX,
                                        y: e.clientY,
                                        item,
                                      });
                                    }}
                                    title={item.path}
                                    className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-2xl p-2 text-center transition hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-core focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                                  >
                                    {/* One graphite tile for every item: the
                                        glyph, not a colour, tells folders,
                                        apps, images and files apart. */}
                                    <span
                                      data-echo-theme="graphite"
                                      className="grid size-12 place-items-center rounded-[14px] bg-card text-foreground shadow-lg shadow-black/12 ring-1 ring-border transition-transform duration-150 group-hover:scale-105"
                                    >
                                      <Icon className="size-6" />
                                    </span>
                                    <span className="line-clamp-2 max-w-24 text-xs font-medium leading-tight text-foreground">
                                      {item.name}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid h-56 place-items-center rounded-3xl border border-dashed border-border bg-muted/40 text-center">
                        <div>
                          <SearchIcon className="mx-auto size-8 text-muted-foreground" />
                          <p className="mt-3 text-sm font-medium text-foreground">
                            {desktopSearch.trim()
                              ? "未找到匹配的文件"
                              : nativeDesktopItems.length === 0
                                ? "桌面暂无文件"
                                : "该分类下暂无文件"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {desktopSearch.trim()
                              ? "尝试更换搜索关键词"
                              : "将文件放到桌面即可在此管理"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {desktopMenu && (
          <div
            data-desktop-interactive
            data-liquid-surface="thick"
            className="mac-desktop-context-menu"
            style={{
              left: Math.min(desktopMenu.x, window.innerWidth - 230),
              top: Math.min(desktopMenu.y, window.innerHeight - 260),
            }}
            onClick={(event) => {
              event.stopPropagation();
              setDesktopMenu(null);
            }}
          >
            <button
              type="button"
              onClick={() => toast.info("请在文件管理器中创建新文件夹")}
            >
              新建文件夹<span>Ctrl+Shift+N</span>
            </button>
            <div />
            <button type="button" onClick={() => setOverlay("about", true)}>
              显示简介<span>Ctrl+I</span>
            </button>
            <button type="button" onClick={cycleWallpaper}>
              更改墙纸…
            </button>
            <button type="button" onClick={openLiquidGlass}>
              流光玻璃…
              <span>{liquidGlassStyle === "crystal" ? "晶透" : "柔光"}</span>
            </button>
            {window.echo?.desktop && (
              <>
                <div />
                <button
                  type="button"
                  onClick={() => setDesktopDrawerOpen(true)}
                >
                  整理<span>Ctrl+0</span>
                </button>
              </>
            )}
            <button type="button" onClick={() => setOverlay("launchpad", true)}>
              显示应用库
            </button>
            <button
              type="button"
              onClick={() => setOverlay("controlCenter", true)}
            >
              查看显示选项
            </button>
          </div>
        )}

        {nativeWindowMenu && (
          <div
            data-desktop-interactive
            data-liquid-surface="thick"
            className="mac-desktop-context-menu"
            style={{
              left: Math.min(nativeWindowMenu.x, window.innerWidth - 230),
              top: Math.min(nativeWindowMenu.y, window.innerHeight - 210),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                focusNativeWindow(nativeWindowMenu.window.id);
                setNativeWindowMenu(null);
              }}
            >
              显示 {nativeWindowMenu.appName}
            </button>
            <button
              type="button"
              onClick={() => {
                minimizeNativeWindow(nativeWindowMenu.window.id);
                setNativeWindowMenu(null);
              }}
            >
              最小化
            </button>
            <div />
            <button
              type="button"
              onClick={() => {
                closeNativeWindow(nativeWindowMenu.window.id);
                setNativeWindowMenu(null);
              }}
            >
              退出
            </button>
          </div>
        )}

        {trashMenu && (
          <div
            data-desktop-interactive
            data-liquid-surface="thick"
            className="mac-desktop-context-menu"
            style={{
              left: Math.min(trashMenu.x, window.innerWidth - 210),
              top: Math.max(10, trashMenu.y - 100),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                handleOpenTrash();
                setTrashMenu(null);
              }}
            >
              打开废纸篓
            </button>
            <div />
            <button
              type="button"
              disabled={trashEntries.length === 0}
              onClick={() => {
                handleEmptyTrash();
                setTrashMenu(null);
              }}
            >
              清空废纸篓
            </button>
          </div>
        )}

        {contextMenu && (
          <div
            data-desktop-interactive
            className="fixed z-50 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              onClick={() => handleContextMenuAction("open", contextMenu.item)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-100"
            >
              <ExternalLinkIcon className="size-3.5" />
              打开
            </button>
            {contextMenu.item.kind === "file" && (
              <button
                type="button"
                onClick={() =>
                  handleContextMenuAction("archive", contextMenu.item)
                }
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-100"
              >
                <FolderInputIcon className="size-3.5" />
                归档到分类
              </button>
            )}
          </div>
        )}

        {/* 从 Dock 切换应用前收起 Spotlight、启动台等瞬态浮层；应用窗口保持原样。 */}
        <Dock className="mac-dock" onItemActivate={closeTransient}>
          <DockItem onClick={openFinder} title="文件" running>
            <MacAppIcon
              icon={FolderIcon}
              gradient="linear-gradient(150deg, #60a5fa 0%, #2563eb 60%, #1d4ed8 100%)"
              appId="system:finder"
            />
          </DockItem>
          <DockItem
            onClick={() => setOverlay("launchpad", true)}
            title="应用库"
          >
            <MacAppIcon
              icon={MAC_SYSTEM_APPS.launchpad.icon}
              gradient={MAC_SYSTEM_APPS.launchpad.gradient}
              appId="system:launchpad"
            />
          </DockItem>
          <DockItem onClick={openAppStore} title="Echo Hub" running={hubOpen}>
            <MacAppIcon
              icon={ShoppingBagIcon}
              iconUrl={appStoreApp?.iconDataUrl || undefined}
              gradient={MAC_SYSTEM_APPS.appStore.gradient}
              appId="system:app-store"
            />
          </DockItem>
          {visibleDesktopApps
            .filter((app) => app.dock)
            .map((app) => {
              const Icon = app.icon;
              const running =
                app.route === "/browser"
                  ? browserOpen
                  : app.route === "/photos"
                    ? photosOpen
                    : app.route === "/storage-center"
                      ? storageCenterOpen
                      : app.windowed && isAppWindowOpen(app.route);
              return (
                <DockItem
                  key={app.name}
                  onClick={() => chooseAppPresentation(app)}
                  title={app.name}
                  running={running}
                >
                  <MacAppIcon
                    icon={Icon}
                    gradient={app.color}
                    appId={`echo:${app.route}`}
                    state={
                      app.route === "/workspace/realtime/new" &&
                      (taskProjection?.counts.active ?? 0) > 0
                        ? "thinking"
                        : running
                          ? "active"
                          : "default"
                    }
                  />
                </DockItem>
              );
            })}
          {dockApplianceApps.length > 0 && (
            <>
              <span className="mac-dock-separator" />
              {dockApplianceApps.map((app) => (
                <DockItem
                  key={app.id}
                  onClick={() => openApplianceApp(app)}
                  title={
                    app.state === "running"
                      ? `${app.name} · ${app.status}`
                      : `${app.name} · 已停止,点击启动`
                  }
                  className={cn(
                    app.state !== "running" && "opacity-55 saturate-50",
                  )}
                  running={app.state === "running"}
                >
                  <MacAppIcon
                    icon={AppWindowIcon}
                    iconUrl={app.icon || undefined}
                    gradient="linear-gradient(145deg, #f8fafc, #b8c2d0)"
                    appId={`appliance:${app.id}`}
                  />
                </DockItem>
              ))}
            </>
          )}
          {dockNativeApps.length > 0 && (
            <>
              <span className="mac-dock-separator" />
              {dockNativeApps.slice(0, 8).map((app) => (
                <DockItem
                  key={`native:${app.id}`}
                  onClick={() => openNativeApp(app)}
                  onContextMenu={(event) => {
                    const nativeWindow = nativeWindows.find((item) =>
                      nativeWindowMatchesApp(item, app),
                    );
                    if (!nativeWindow) return;
                    event.preventDefault();
                    event.stopPropagation();
                    setNativeWindowMenu({
                      x: event.clientX,
                      y: event.clientY,
                      appName: app.name,
                      window: nativeWindow,
                    });
                  }}
                  title={`${app.name} · ${app.source === "flatpak" ? "沙箱应用" : "本地应用"}`}
                  running={nativeWindows.some((item) =>
                    nativeWindowMatchesApp(item, app),
                  )}
                >
                  <MacAppIcon
                    icon={AppWindowIcon}
                    iconUrl={app.iconDataUrl || undefined}
                    gradient="linear-gradient(145deg, #f8fafc, #b8c2d0)"
                    appId={`native:${app.id}`}
                  />
                </DockItem>
              ))}
            </>
          )}
          <DockItem
            onClick={() => setTaskSpaceOpen(true)}
            title="任务空间"
            running={taskSpaceOpen}
          >
            <div className="relative">
              <MacAppIcon
                icon={ListChecksIcon}
                gradient="linear-gradient(150deg, #a5b4fc 0%, #6366f1 60%, #4338ca 100%)"
                appId="system:tasks"
              />
              <ApprovalCountBadge
                count={taskProjection?.counts.waitingApproval ?? 0}
              />
            </div>
          </DockItem>
          <DockItem
            onClick={() => setDecisionInboxOpen(true)}
            title="审批收件箱"
            running={decisionInboxOpen}
          >
            <div className="relative">
              <MacAppIcon
                icon={ShieldCheckIcon}
                gradient="linear-gradient(150deg, #fcd34d, #d97706)"
                appId="system:decision-inbox"
              />
              <ApprovalCountBadge
                count={pendingApprovalCount(taskProjection)}
              />
            </div>
          </DockItem>
          <DockItem
            onClick={() => setShowWidget(true)}
            title="活动监视器"
            running={showWidget}
          >
            <MacAppIcon
              icon={CpuIcon}
              gradient="linear-gradient(150deg, #1e293b 0%, #0f172a 60%, #020617 100%)"
              appId="system:activity-monitor"
            />
          </DockItem>
          <DockItem onClick={openSystemSettings} title="系统设置">
            <MacAppIcon
              icon={MAC_SYSTEM_APPS.settings.icon}
              gradient={MAC_SYSTEM_APPS.settings.gradient}
              appId="system:settings"
            />
          </DockItem>
          {/* 任务轨：进行中的 Agent 任务和应用并列，窗口挡不住 */}
          <DockTaskRail
            tasks={taskProjection?.tasks}
            agents={desktopAgents}
            onOpenTask={openTaskThread}
            onOpenTaskSpace={openTaskSpace}
          />
          <span className="mac-dock-separator" />
          {/* 最小化窗口托盘 */}
          {windows
            .filter((win) => minimized.has(win.id))
            .map((win) => (
              <DockItem
                key={`minimized:${win.id}`}
                onClick={() => {
                  restoreWindow(win.id);
                  playSystemSound("whoosh");
                }}
                title={`${win.title} · 点击恢复窗口`}
              >
                <div className="mac-dock-minimized-window">
                  <div className="mac-dock-mini-titlebar">
                    <span className="mini-dot bg-[#ff5f56]" />
                    <span className="mini-dot bg-[#ffbd2e]" />
                    <span className="mini-dot bg-[#27c93f]" />
                  </div>
                  <div className="mac-dock-mini-body">
                    <span className="text-[8px] font-medium text-slate-200 truncate max-w-[40px] leading-tight select-none">
                      {win.title}
                    </span>
                  </div>
                  <span className="mac-dock-mini-badge">
                    <EchoMark tone="brand" className="size-2.5" />
                  </span>
                </div>
              </DockItem>
            ))}
          {/* 下载堆栈 (Downloads Stack) */}
          <DockItem
            onClick={() => {
              setFileOpenTrash(false);
              setFileOpenRequest({ path: "Downloads" });
              setFileManagerOpen(true);
              playSystemSound("pop");
            }}
            title="下载"
          >
            <MacDockDownloadsStack />
          </DockItem>
          {/* 原汁原味 macOS 独立立体晶透废纸篓 */}
          <DockItem
            onClick={handleOpenTrash}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setTrashMenu({ x: event.clientX, y: event.clientY });
            }}
            title={
              trashEntries.length > 0
                ? `废纸篓 (${trashEntries.length} 项)`
                : "废纸篓"
            }
          >
            <MacDockTrash
              isFull={trashEntries.length > 0}
              itemCount={trashEntries.length}
            />
          </DockItem>
        </Dock>
      </section>

      <div
        inert={desktopMode === "pure"}
        aria-hidden={desktopMode === "pure" || undefined}
        className={cn(
          "pointer-events-none absolute inset-0 z-40 transition-all duration-500",
          desktopMode === "pure"
            ? "pointer-events-none scale-95 opacity-0"
            : "pointer-events-none scale-100 opacity-100 [&>*]:pointer-events-auto",
        )}
      >
        {/* 最小化只隐藏不卸载：iframe 不重载，Agent 窗口保留当前会话和路由。 */}
        {windows.map((win, i) => {
          const systemApp = systemAppForWindow(win.id);
          return (
            <AppWindow
              key={win.id}
              win={
                systemApp
                  ? {
                      ...win,
                      content: (
                        <SystemAppWindowProvider>
                          {renderSystemApp(systemApp)}
                        </SystemAppWindowProvider>
                      ),
                    }
                  : win
              }
              index={i}
              focused={focusedWin === win.id}
              hidden={minimized.has(win.id)}
              stackOrder={windowStack.indexOf(win.id)}
              initialGeometry={geometries?.[win.id]}
              onGeometryChange={(geom) => updateWindowGeometry(win.id, geom)}
              onFocus={() => focusWindow(win.id)}
              onClose={() =>
                systemApp ? closeSystemApp(systemApp) : closeWindow(win.id)
              }
              onMinimize={() => minimizeWindow(win.id)}
            />
          );
        })}
      </div>

      {/* System-owned surfaces are siblings of application windows so their
          z-index is not trapped inside the desktop-content stacking context. */}
      <MacSpotlight
        open={spotlightOpen}
        query={query}
        apps={macShellApps}
        onQueryChange={setQuery}
        onClose={() => setOverlay("spotlight", false)}
        onSubmit={submit}
      />
      <AppOpenChoice
        name={appOpenChoice?.name}
        presentation={
          findWorkbenchApp(appOpenChoice?.route ?? "")?.presentation
        }
        supportedPresentations={
          findWorkbenchApp(appOpenChoice?.route ?? "")?.supportedPresentations
        }
        onClose={() => setAppOpenChoice(null)}
        onStandalone={() => {
          const selected = appOpenChoice;
          setAppOpenChoice(null);
          if (selected) openApp(selected);
        }}
        onWorkbench={() => {
          const selected = appOpenChoice;
          setAppOpenChoice(null);
          const current = visibleDesktopApps.find(
            (app) => app.route === selected?.route,
          );
          if (current) navigate(workbenchRoute(current.route));
          else toast.info("应用当前不可用，请在应用中心查看。");
        }}
      />
      <MacLaunchpad
        open={launchpadOpen}
        apps={macShellApps}
        onClose={() => setOverlay("launchpad", false)}
      />
      <MissionControl
        open={missionControlOpen}
        windows={windows}
        activeWindowId={focusedWin}
        onSelectWindow={(id) => {
          playSystemSound("snap");
          focusWindow(id);
          setMissionControlOpen(false);
        }}
        onCloseWindow={(id) => {
          playSystemSound("toggle");
          const app = systemAppForWindow(id);
          if (app) closeSystemApp(app);
          else closeWindow(id);
        }}
        onClose={() => {
          playSystemSound("whoosh");
          setMissionControlOpen(false);
        }}
      />
      <MacControlCenter
        open={controlCenterOpen}
        onClose={() => setOverlay("controlCenter", false)}
        onOpenSettings={openSystemSettings}
        onOpenLiquidGlass={openLiquidGlass}
        systemControls={systemControls}
        onSetWifiEnabled={(enabled) =>
          applySystemControl("Wi-Fi", () =>
            window.echo!.systemControls!.setWifiEnabled(enabled),
          )
        }
        onSetBluetoothEnabled={(enabled) =>
          applySystemControl("蓝牙", () =>
            window.echo!.systemControls!.setBluetoothEnabled(enabled),
          )
        }
        onSetAudioVolume={(percentage) =>
          applySystemControl("音量", () =>
            window.echo!.systemControls!.setAudioVolume(percentage),
          )
        }
        onSetDisplayBrightness={(percentage) =>
          applySystemControl("显示器亮度", () =>
            window.echo!.systemControls!.setDisplayBrightness(percentage),
          )
        }
      />
      <MacLiquidGlassPanel
        open={liquidGlassOpen}
        style={liquidGlassStyle}
        intensity={liquidGlassIntensity}
        tuning={liquidGlassTuning}
        desktopTheme={desktopTheme}
        onDesktopThemeChange={handleSelectDesktopTheme}
        onStyleChange={setLiquidGlassStyle}
        onIntensityChange={setLiquidGlassIntensity}
        onTuningChange={patchLiquidGlassTuning}
        onResetTuning={resetLiquidGlass}
        onClose={() => setOverlay("liquidGlass", false)}
      />
      <MacNotificationCenter
        open={notificationsOpen}
        onClose={() => setOverlay("notifications", false)}
        notifications={nativeNotifications}
        nativeServiceAvailable={notificationServiceAvailable}
        onDismiss={(notificationId) => {
          void dismissNativeNotification(notificationId);
        }}
        onClear={() => {
          void clearNativeNotifications();
        }}
      />
      <MacAboutDialog
        open={aboutOpen}
        onClose={() => setOverlay("about", false)}
        onOpenSettings={openSystemSettings}
        agentHealth={agentDesktopHealth}
        updateStatus={systemUpdateStatus}
        updateCapabilities={systemUpdateCapabilities}
        updateBusy={systemUpdateBusy}
        onRefreshUpdate={() => void refreshSystemUpdate()}
        onApplyUpdate={() => void applySystemUpdate()}
        onRestart={
          availableSystemActions.restart
            ? () => requestSystemAction("restart")
            : undefined
        }
      />

      <MacSystemActionDialog
        action={pendingSystemAction}
        busy={systemActionBusy}
        error={systemActionError}
        onCancel={cancelSystemAction}
        onConfirm={() => void confirmSystemAction()}
      />

      <HighRiskApprovalDialog
        open={pendingAppControl !== null}
        title={`${pendingAppControl?.operation === "stop" ? "停止" : "启动"}“${pendingAppControl?.app.name ?? "应用"}”？`}
        description={
          pendingAppControl?.operation === "stop"
            ? "停止后应用页面将不可访问，但配置和 NAS 数据不会删除；之后可以随时重新启动。"
            : "启动容器会改变设备运行状态并占用存储、内存和网络端口，需要管理员本人复核。"
        }
        targetLabel={
          pendingAppControl?.app.description || pendingAppControl?.app.image
        }
        confirmLabel={
          pendingAppControl?.operation === "stop" ? "确认停止" : "确认启动"
        }
        onCancel={() => setPendingAppControl(null)}
        onConfirm={confirmAppControl}
      />
    </main>
  );
}
