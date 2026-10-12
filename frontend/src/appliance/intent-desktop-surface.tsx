"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  DropletIcon,
  FileTextIcon,
  ListChecksIcon,
  MoonIcon,
  PictureInPicture2Icon,
  ShieldAlertIcon,
  SparklesIcon,
  SunIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { LinkedDevice } from "./device-link";
import { cn } from "@/lib/utils";
import { currentActorId } from "@/core/auth/api";
import {
  actorScopedStorageKey,
  readActorScopedStorageValue,
} from "@/core/auth/scoped-storage";
import { formatTimeAgo } from "@/core/utils/datetime";
import { AgentPipMonitor, type PipTask } from "./agent-pip-monitor";
import { ACTIVE_TASK_STATUSES, type EchoTaskProjection } from "./task-space";
import {
  approvalText,
  attentionRank,
  selectDesktopTasks,
  taskHeadline,
  taskProgress,
  taskStatusView,
  type TaskTone,
} from "./task-presentation";

/**
 * 桌面意图面：用户在这里说出想完成的事，并看到 Agent 正在为自己做的事。
 *
 * 只呈现真实数据：任务来自任务投影（task projection），Agent 来自后端
 * 名册。没有数据时显示空状态，不用演示内容填充首屏。
 *
 * 桌面形态（pure / workspace）按**账号作用域**保存。依据仓库既定的偏好边界
 * （`docs/desktop-workbench-ux-optimization.md`）："工作形态"类偏好一律
 * actor 作用域；旧设备级键由 `readActorScopedStorageValue` 按当前账号做一次性迁移。
 */
const DESKTOP_MODE_STORAGE_KEY = "echo-desktop-mode";

function readPersistedDesktopMode(): DesktopMode | null {
  try {
    const saved = readActorScopedStorageValue(DESKTOP_MODE_STORAGE_KEY);
    return saved === "pure" || saved === "workspace" ? saved : null;
  } catch {
    return null;
  }
}

function persistDesktopMode(mode: DesktopMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      actorScopedStorageKey(DESKTOP_MODE_STORAGE_KEY),
      mode,
    );
  } catch {
    // 存储不可用时静默降级为会话内状态
  }
}

export type DesktopMode = "pure" | "workspace";
export type DesktopTheme = "theme-white" | "theme-glass" | "theme-dark";
export type OpenRoomType = "all" | "researcher" | "builder" | "operator";

export interface OpenRoom {
  id: OpenRoomType;
  title: string;
  agentLabel: string;
  icon: string;
  desc: string;
}

/** 空间按 Agent 的职能筛选桌面上的任务。 */
export const OPEN_ROOMS: OpenRoom[] = [
  {
    id: "all",
    title: "全局总览",
    agentLabel: "全部 Agent",
    icon: "◫",
    desc: "所有任务统一呈现",
  },
  {
    id: "researcher",
    title: "调研室 (Research)",
    agentLabel: "通用助理",
    icon: "🔍",
    desc: "写作、调研、总结与问答",
  },
  {
    id: "builder",
    title: "工坊 (Builder Studio)",
    agentLabel: "编码 Agent",
    icon: "⚡",
    desc: "代码、构建与工程任务",
  },
  {
    id: "operator",
    title: "中枢 (Operator Suite)",
    agentLabel: "设备管家",
    icon: "🛡️",
    desc: "桌面操作、存储与设备管理",
  },
];

/** 按真实 Agent 的职能把任务归入空间；未知 Agent 归入调研室（通用）。 */
export function roomForAgent(
  agentId: string | null | undefined,
): Exclude<OpenRoomType, "all"> {
  const id = (agentId ?? "").toLowerCase();
  if (/(coder|developer|engineer|codex|opencode|builder)/.test(id)) {
    return "builder";
  }
  if (/(operator|admin|device|desktop)/.test(id)) return "operator";
  return "researcher";
}

/** 后端 Agent 名册中的一项（由桌面页从 `useAgents` 传入）。 */
export interface DesktopAgentOption {
  id: string;
  name: string;
  icon?: string | null;
  description?: string | null;
}

export interface IntentDesktopSurfaceProps {
  initialMode?: DesktopMode;
  initialTheme?: DesktopTheme;
  mode?: DesktopMode;
  onModeChange?: (mode: DesktopMode) => void;
  theme?: DesktopTheme;
  onThemeChange?: (theme: DesktopTheme) => void;
  activeRoom?: OpenRoomType;
  onActiveRoomChange?: (room: OpenRoomType) => void;
  hideTopControlBar?: boolean;
  /** 打开工作台并带上意图草稿；agentId 缺省时由工作台使用默认 Agent。 */
  onOpenWorkbench?: (prompt?: string, agentId?: string) => void;
  /**
   * 把意图直接交给 Agent 在后台执行（不打开工作台窗口）。任务被接受时
   * resolve 为 true；为 false 表示调用方已经提示过失败并接管了草稿。
   * 未提供时，提交意图退化为只在工作台里准备草稿。
   */
  onDispatchIntent?: (prompt: string, agentId?: string) => Promise<boolean>;
  onOpenApp?: (appId: string) => void;
  onOpenPhoneMirror?: (device: LinkedDevice) => void;
  /** 任务投影；undefined 表示尚未加载。 */
  tasks?: readonly EchoTaskProjection[];
  /** 任务服务明确不可用时为 false。 */
  tasksAvailable?: boolean;
  agents?: readonly DesktopAgentOption[];
  /** 在工作台中打开任务所在的会话；artifact 为要定位的产物 resourceId。 */
  onOpenTask?: (task: EchoTaskProjection, artifact?: string) => void;
  /** 打开任务空间；带 taskId 时展开该任务的详情（审批、接管、恢复都在那里）。 */
  onOpenTaskSpace?: (taskId?: string) => void;
  children?: ReactNode;
  className?: string;
}

const DESKTOP_CARD_LIMIT = 4;

const TONE_CHIP: Record<TaskTone, string> = {
  active: "bg-core/10 text-core",
  attention: "bg-warning/15 text-warning",
  done: "bg-core/10 text-core",
  failed: "bg-breach/10 text-breach",
  muted: "bg-slate-500/10 text-muted-foreground",
};

interface IntentExample {
  label: string;
  prompt: string;
}

/** 与具体 Agent 无关的起步示例，交给当前选择的 Agent。 */
const INTENT_EXAMPLES: IntentExample[] = [
  {
    label: "整理下载文件夹",
    prompt: "把下载文件夹里的文件按类型整理归档，完成后告诉我改动了什么",
  },
  {
    label: "总结最近的照片",
    prompt: "总结最近一周新增的照片，按地点和人物分组",
  },
  {
    label: "检查存储健康",
    prompt: "检查存储池和硬盘的健康状况，用通俗的话解释有什么风险",
  },
  {
    label: "写本周周报",
    prompt: "根据我本周完成的任务写一份简洁的周报",
  },
];

const DEFAULT_AGENT_ID = "general";

function getSafeInitialMode(initialMode: DesktopMode): DesktopMode {
  if (typeof window === "undefined") return initialMode;
  const saved = readPersistedDesktopMode();
  return saved ?? initialMode;
}

function getSafeInitialTheme(initialTheme: DesktopTheme): DesktopTheme {
  if (typeof window === "undefined") return initialTheme;
  try {
    const saved = localStorage.getItem(
      "echo-desktop-theme",
    ) as DesktopTheme | null;
    return saved === "theme-white" ||
      saved === "theme-glass" ||
      saved === "theme-dark"
      ? saved
      : initialTheme;
  } catch {
    return initialTheme;
  }
}

export function IntentDesktopSurface({
  initialMode = "workspace",
  initialTheme = "theme-white",
  mode: controlledMode,
  onModeChange,
  theme: controlledTheme,
  onThemeChange,
  activeRoom: controlledActiveRoom,
  onActiveRoomChange,
  hideTopControlBar = false,
  onOpenWorkbench,
  onDispatchIntent,
  onOpenPhoneMirror,
  tasks,
  tasksAvailable = true,
  agents = [],
  onOpenTask,
  onOpenTaskSpace,
  children,
  className,
}: IntentDesktopSurfaceProps) {
  const actor = currentActorId();
  const [internalMode, setInternalMode] = useState<DesktopMode>(() =>
    getSafeInitialMode(initialMode),
  );
  const [internalTheme, setInternalTheme] = useState<DesktopTheme>(() =>
    getSafeInitialTheme(initialTheme),
  );

  // 账号切换：先重载新账号的桌面形态，避免旧账号的 pure/workspace 泄漏到新账号。
  const [modeActor, setModeActor] = useState(actor);
  useEffect(() => {
    if (modeActor === actor) return;
    setModeActor(actor);
    setInternalMode(readPersistedDesktopMode() ?? initialMode);
  }, [actor, modeActor, initialMode]);

  const theme = controlledTheme ?? internalTheme;

  const mode = controlledMode ?? internalMode;
  const setMode = useCallback(
    (nextOrFn: DesktopMode | ((prev: DesktopMode) => DesktopMode)) => {
      const next = typeof nextOrFn === "function" ? nextOrFn(mode) : nextOrFn;
      setInternalMode(next);
      onModeChange?.(next);
      persistDesktopMode(next);
    },
    [mode, onModeChange],
  );

  const [internalActiveRoom, setInternalActiveRoom] =
    useState<OpenRoomType>("all");
  const activeRoom = controlledActiveRoom ?? internalActiveRoom;
  const setActiveRoom = useCallback(
    (room: OpenRoomType) => {
      setInternalActiveRoom(room);
      onActiveRoomChange?.(room);
    },
    [onActiveRoomChange],
  );

  const [intentInput, setIntentInput] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [hiddenTaskIds, setHiddenTaskIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [pinnedTaskId, setPinnedTaskId] = useState<string | null>(null);
  const [pipDismissedId, setPipDismissedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const agentMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAgentMenuOpen) return;
    const handleClickOutside = (e: globalThis.MouseEvent) => {
      if (
        agentMenuRef.current &&
        !agentMenuRef.current.contains(e.target as Node)
      ) {
        setIsAgentMenuOpen(false);
      }
    };
    const handleMenuKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setIsAgentMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleMenuKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleMenuKeyDown);
    };
  }, [isAgentMenuOpen]);

  // 任务卡片可以拖动摆放
  const [cardPositions, setCardPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [activeDraggingCard, setActiveDraggingCard] = useState<string | null>(
    null,
  );
  const cardDragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    initX: number;
    initY: number;
  } | null>(null);

  const handleCardDragStart = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, cardId: string) => {
      if (
        (e.target as HTMLElement).closest(
          "button, a, input, select, textarea, [role='button']",
        )
      ) {
        return;
      }
      if (e.button !== 0) return;

      e.preventDefault();
      e.stopPropagation();

      const current = cardPositions[cardId] || { x: 0, y: 0 };
      cardDragRef.current = {
        id: cardId,
        startX: e.clientX,
        startY: e.clientY,
        initX: current.x,
        initY: current.y,
      };
      setActiveDraggingCard(cardId);

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (!cardDragRef.current || cardDragRef.current.id !== cardId) return;
        const dx = moveEvent.clientX - cardDragRef.current.startX;
        const dy = moveEvent.clientY - cardDragRef.current.startY;
        setCardPositions((prev) => ({
          ...prev,
          [cardId]: {
            x: Math.round(cardDragRef.current!.initX + dx),
            y: Math.round(cardDragRef.current!.initY + dy),
          },
        }));
      };

      const onPointerUp = () => {
        setActiveDraggingCard(null);
        cardDragRef.current = null;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [cardPositions],
  );

  // ---- 真实数据 ----
  const agentById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  );
  const defaultAgent = agentById.get(DEFAULT_AGENT_ID) ?? agents[0] ?? null;
  const selectedAgent =
    (selectedAgentId ? agentById.get(selectedAgentId) : undefined) ??
    defaultAgent;
  const agentLabel = (agentId: string | null | undefined) =>
    (agentId ? agentById.get(agentId)?.name : undefined) ??
    (agentId && agentId !== DEFAULT_AGENT_ID ? agentId : defaultAgent?.name) ??
    "Echo";
  const agentIcon = (agentId: string | null | undefined) =>
    (agentId ? agentById.get(agentId)?.icon : undefined) ??
    (agentId ? undefined : defaultAgent?.icon) ??
    "✦";

  const desktopTasks = useMemo(
    () =>
      selectDesktopTasks(tasks ?? []).filter(
        (task) => !hiddenTaskIds.has(task.id),
      ),
    [hiddenTaskIds, tasks],
  );
  const roomTasks =
    activeRoom === "all"
      ? desktopTasks
      : desktopTasks.filter(
          (task) => roomForAgent(task.agentId) === activeRoom,
        );
  const visibleCards = roomTasks.slice(0, DESKTOP_CARD_LIMIT);
  const overflowCount = roomTasks.length - visibleCards.length;
  const activeCount = (tasks ?? []).filter((task) =>
    ACTIVE_TASK_STATUSES.includes(task.displayStatus),
  ).length;

  // 画中画盯住用户钉选的任务；没有钉选时盯住最需要关注的进行中任务。
  const watchedTask = useMemo(() => {
    const pinned = pinnedTaskId
      ? tasks?.find((task) => task.id === pinnedTaskId)
      : undefined;
    return (
      pinned ?? desktopTasks.find((task) => attentionRank(task) <= 2) ?? null
    );
  }, [desktopTasks, pinnedTaskId, tasks]);
  const pipTask: PipTask | null = watchedTask
    ? {
        id: watchedTask.id,
        title: watchedTask.title,
        agentName: agentLabel(watchedTask.agentId),
        agentType: roomForAgent(watchedTask.agentId),
        stepText:
          taskHeadline(watchedTask) ?? taskStatusView(watchedTask).label,
        progress: taskProgress(watchedTask),
        needsApproval: watchedTask.displayStatus === "waiting_approval",
        approvalRiskMessage:
          watchedTask.displayStatus === "waiting_approval"
            ? approvalText(watchedTask)
            : undefined,
      }
    : null;

  const openTask = (task: EchoTaskProjection, artifact?: string) => {
    if (task.threadId && onOpenTask) onOpenTask(task, artifact);
    else onOpenTaskSpace?.(task.id);
  };

  const handlePinToPip = (task: EchoTaskProjection) => {
    setPinnedTaskId(task.id);
    setPipDismissedId(null);
    toast.success("已钉到右下角画中画", { description: task.title });
  };

  const handleHideTask = (task: EchoTaskProjection) => {
    setHiddenTaskIds((prev) => new Set(prev).add(task.id));
    if (pinnedTaskId === task.id) setPinnedTaskId(null);
    toast.info("已从桌面隐藏，任务本身不受影响", {
      description: "可在任务空间查看全部任务",
    });
  };

  const toggleMode = useCallback(() => {
    const next = mode === "pure" ? "workspace" : "pure";
    setMode(next);
    toast.info(
      next === "pure"
        ? "已进入纯净意图态 (已退散工作区窗口)"
        : "已恢复多窗口工作台",
      {
        description:
          next === "pure"
            ? "点击空白壁纸或按空格键可随时恢复窗口"
            : "点击空白壁纸或按空格键可返回纯净意图态",
      },
    );
  }, [mode, setMode]);

  const handleSelectTheme = (newTheme: DesktopTheme) => {
    setInternalTheme(newTheme);
    onThemeChange?.(newTheme);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("echo-desktop-theme", newTheme);
      } catch {
        // ignore
      }
    }
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove(
        "theme-white",
        "theme-glass",
        "theme-dark",
      );
      document.documentElement.classList.add(newTheme);
    }
    const themeNames = {
      "theme-white": "象牙温和白",
      "theme-glass": "神经玻璃",
      "theme-dark": "石墨",
    };
    toast.success(`桌面主题已切换为：${themeNames[newTheme]}`);
  };

  // 点击空白壁纸退散或召回窗口 (macOS 风格)
  const handleBackdropClick = (e: MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    // 忽略点击交互组件（按钮、链接、输入框、选择框、文本域、任务卡片、应用窗口、对话框等）
    if (
      target.closest(
        "button, a, input, select, textarea, [role='button'], [role='tab'], [role='dialog'], [data-desktop-interactive], [data-task-card]",
      )
    ) {
      return;
    }
    toggleMode();
  };

  // 点击窗口里的普通文字不会移动焦点（activeElement 仍是 body），所以要记住
  // 最近一次按下的位置：只有交互发生在桌面空白处时，Space/Escape 才切换形态。
  const lastPointerTarget = useRef<Element | null>(null);
  useEffect(() => {
    const remember = (event: globalThis.PointerEvent) => {
      lastPointerTarget.current =
        event.target instanceof Element ? event.target : null;
    };
    window.addEventListener("pointerdown", remember, true);
    return () => window.removeEventListener("pointerdown", remember, true);
  }, []);

  // 全局键盘人机工程学：Cmd+K / Ctrl+K / '/' 聚焦意图，Escape 退出，Space 双态互换
  useEffect(() => {
    const interactingWithSurface = () =>
      [document.activeElement, lastPointerTarget.current].some(
        (element) =>
          element instanceof Element &&
          element.closest(
            "[role='dialog'], [data-desktop-interactive], [data-task-card]",
          ) !== null,
      );
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        document.querySelector(
          '[role="dialog"][data-state="open"], [aria-modal="true"]',
        )
      )
        return;
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      // Cmd/Ctrl+K 是本组件的"聚焦意图输入框"快捷键，最先判定并保留；
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      // Alt+D / Option+D 全局形态快速切换
      if (e.altKey && (e.key.toLowerCase() === "d" || e.code === "KeyD")) {
        e.preventDefault();
        toggleMode();
        return;
      }

      // 其余组合键（Cmd/Ctrl/Alt）一律放行，交给系统/输入框默认行为，避免误吞粘贴、快捷键等
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const isInput =
        activeTag === "input" ||
        activeTag === "textarea" ||
        (document.activeElement as HTMLElement | null)?.isContentEditable ===
          true;

      // 仅主键区 '/'（排除小键盘 NumpadDivide），且不位于任何可聚焦控件内——
      // 否则小键盘 '/' 会吃掉输入、按钮内 '/' 会误触发聚焦。
      if (e.key === "/" && e.code !== "NumpadDivide" && !isInput) {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }

      // Escape 退出输入框或退散回纯净态
      if (e.key === "Escape") {
        if (isInput) {
          (document.activeElement as HTMLElement)?.blur();
          return;
        }
        // 窗口、调度中心等表面里的 Escape 属于它们自己，不能顺带隐藏全部窗口。
        if (mode === "workspace" && !interactingWithSurface()) {
          toggleMode();
        }
        return;
      }

      // Space 双态互换；仅当焦点在 body 上（即无控件聚焦）时才全局响应——
      // Space 是按钮/链接的原生激活键，若焦点在可聚焦元素上须让位给默认行为。
      if (
        e.code === "Space" &&
        !isInput &&
        activeTag !== "button" &&
        activeTag !== "a" &&
        activeTag !== "select" &&
        activeTag !== "summary" &&
        !interactingWithSurface()
      ) {
        e.preventDefault();
        toggleMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, toggleMode]);

  // 提交意图。默认直接交给 Agent 开始执行；"先编辑"只在工作台里准备草稿，
  // 由用户确认后再发送。
  const handleSubmitIntent = (intent: "dispatch" | "draft" = "dispatch") => {
    const trimmed = intentInput.trim();
    if (!trimmed) return;
    const agentName = selectedAgent?.name ?? "Echo";
    if (intent === "dispatch" && onDispatchIntent) {
      // 等服务端真正接受后再报喜；失败时调用方会提示并把草稿留在工作台。
      void onDispatchIntent(trimmed, selectedAgent?.id).then((accepted) => {
        if (!accepted) return;
        toast.success(`已交给 ${agentName}，在后台执行`, {
          description:
            "进展会出现在桌面卡片和 Dock 任务轨上；需要授权时会停在任务空间等你批准。",
        });
      });
    } else if (onOpenWorkbench) {
      onOpenWorkbench(trimmed, selectedAgent?.id);
      toast.success("已在工作台准备好任务", {
        description: `确认后交给 ${agentName} 执行`,
      });
    } else {
      toast.error("工作台暂不可用，请稍后再试");
      return;
    }
    setIntentInput("");
    if (mode === "pure") setMode("workspace");
  };

  const handleApplyExample = (example: IntentExample) => {
    setIntentInput(example.prompt);
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // IME 选字时的回车不是提交。
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      handleSubmitIntent(e.shiftKey ? "draft" : "dispatch");
    } else if (e.key === "Tab" && !intentInput.trim()) {
      e.preventDefault();
      const first = INTENT_EXAMPLES[0];
      if (first) handleApplyExample(first);
    }
  };

  const activeRoomInfo =
    OPEN_ROOMS.find((room) => room.id === activeRoom) ?? OPEN_ROOMS[0]!;

  return (
    <div
      className={cn(
        "relative flex size-full select-none flex-col overflow-hidden transition-colors duration-500",
        theme,
        theme !== "theme-white" && "dark",
        theme === "theme-white" && "bg-transparent text-foreground",
        theme === "theme-glass" &&
          "bg-[radial-gradient(at_15%_15%,rgba(56,189,248,0.15)_0%,transparent_55%),radial-gradient(at_85%_85%,rgba(168,85,247,0.12)_0%,transparent_55%),rgba(10,15,30,0.32)] text-slate-100",
        theme === "theme-dark" && "bg-transparent text-slate-100",
        className,
      )}
      onClick={handleBackdropClick}
      data-testid="intent-desktop-surface"
    >
      {/* 边缘提示微光 (当窗口退散到两端时给予视觉回馈) */}
      <div
        className={cn(
          "pointer-events-none absolute inset-y-12 left-0 w-3 transition-opacity duration-300",
          mode === "pure"
            ? "opacity-100 shadow-[inset_8px_0_20px_rgba(0,0,0,0.15)]"
            : "opacity-0",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-y-12 right-0 w-3 transition-opacity duration-300",
          mode === "pure"
            ? "opacity-100 shadow-[inset_-8px_0_20px_rgba(0,0,0,0.15)]"
            : "opacity-0",
        )}
      />

      {/* 顶部桌面快捷控制条 (当顶层统一菜单栏已接管时自动隐藏，消除两道横栏冗余) */}
      {!hideTopControlBar && (
        <div className="z-40 flex items-center justify-between px-6 py-2.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleMode();
              }}
              className={cn(
                "group inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur-md transition-all",
                theme === "theme-white"
                  ? "border-black/10 bg-card/70 text-foreground hover:bg-card"
                  : "border-border bg-card/10 text-slate-200 hover:bg-card/20",
              )}
              title="点击或按空格键在【意图纯净态】与【多窗口工作台】间无缝切换"
            >
              <span
                className={cn(
                  "size-2 rounded-full transition-transform group-hover:scale-125",
                  mode === "pure" ? "bg-core" : "bg-primary",
                )}
              />
              <span>{mode === "pure" ? "意图纯净态" : "多窗口工作台"}</span>
              <kbd className="rounded border border-black/10 bg-black/5 px-1 py-0.2 text-[9px] text-muted-foreground">
                Space
              </kbd>
            </button>

            {/* 空间选择器：按 Agent 职能筛选任务 */}
            <div
              role="tablist"
              aria-label="OpenRoom 协作空间切换"
              className="flex items-center gap-1 rounded-full border border-black/5 bg-black/[0.03] p-0.5 text-[11px] backdrop-blur-md  dark:bg-white/[0.04]"
              onClick={(e) => e.stopPropagation()}
            >
              {OPEN_ROOMS.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  role="tab"
                  aria-selected={activeRoom === room.id}
                  onClick={() => setActiveRoom(room.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all",
                    activeRoom === room.id
                      ? "bg-card text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  title={room.desc}
                >
                  <span>{room.icon}</span>
                  <span>{room.title.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 主题选择微组件 */}
          <div
            className={cn(
              "flex items-center rounded-lg border p-0.5 text-[11px] font-medium backdrop-blur-md",
              theme === "theme-white"
                ? "border-black/10 bg-black/5 text-muted-foreground"
                : "border-border bg-card/5 text-muted-foreground",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => handleSelectTheme("theme-white")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-0.5 transition-all",
                theme === "theme-white" && "bg-card text-foreground shadow-sm",
              )}
            >
              <SunIcon className="size-3" />
              <span>雪白</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectTheme("theme-glass")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-0.5 transition-all",
                theme === "theme-glass" && "bg-core/20 text-core shadow-sm",
              )}
            >
              <DropletIcon className="size-3" />
              <span>神经玻璃</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectTheme("theme-dark")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-0.5 transition-all",
                theme === "theme-dark" &&
                  "bg-primary text-primary-foreground shadow-sm",
              )}
            >
              <MoonIcon className="size-3" />
              <span>石墨</span>
            </button>
          </div>
        </div>
      )}

      {/* 桌面主要视口区域 */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 pb-20">
        {/* 中央意图核心 */}
        <div
          className={cn(
            "z-30 flex w-full max-w-2xl flex-col items-center text-center transition-all duration-500",
            mode === "workspace"
              ? "absolute inset-x-4 top-6 mx-auto w-auto pointer-events-auto"
              : "translate-y-0 scale-100 opacity-100",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 形态切换胶囊 */}
          <button
            type="button"
            onClick={toggleMode}
            className="group order-last mt-5 inline-flex items-center gap-2 rounded-full border border-transparent bg-transparent px-3 py-1 text-xs font-medium text-muted-foreground transition-all duration-200 hover:scale-[1.02] hover:bg-card/20 active:scale-[0.98]"
            title="点击在【极简意图态】与【多窗口工作台】间切换 (快捷键: Alt+D / Space)"
            aria-label="双态形态切换"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <span
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  mode === "pure" ? "bg-core" : "bg-primary",
                )}
              />
              <span>
                {mode === "pure"
                  ? activeCount > 0
                    ? `打开任务视图 · ${activeCount} 个进行中`
                    : "打开任务视图"
                  : "收起到纯净态"}
              </span>
            </span>
            <kbd className="rounded border border-black/10 bg-black/5 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
              Alt+D
            </kbd>
          </button>

          {mode === "pure" && (
            <h1 className="text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
              今天想完成什么？
            </h1>
          )}

          {/* 意图输入卡片 */}
          <div
            data-intent-composer
            className={cn(
              "mt-6 w-full rounded-2xl border p-3.5 backdrop-blur-2xl transition-all duration-300 focus-within:ring-2 focus-within:ring-core/30",
              mode === "workspace" && "mt-0",
              theme === "theme-white"
                ? "border-black/10 bg-card/85 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_20px_45px_-12px_rgba(0,0,0,0.12)] focus-within:border-core/30"
                : "border-core/30 bg-slate-900/80 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_35px_rgba(56,189,248,0.14),0_20px_50px_-10px_rgba(0,0,0,0.5)] focus-within:border-core/30",
            )}
          >
            <div className="flex items-center gap-3">
              <SparklesIcon className="size-5 shrink-0 text-core" />
              <input
                ref={inputRef}
                type="text"
                value={intentInput}
                onChange={(e) => setIntentInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={`输入意图，告诉 ${selectedAgent?.name ?? "Echo"} 你想完成什么…`}
                aria-label="输入意图"
                className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground"
              />
              {onDispatchIntent && onOpenWorkbench && intentInput.trim() && (
                <button
                  type="button"
                  onClick={() => handleSubmitIntent("draft")}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                  title="先在工作台里修改，再自己发送 (Shift+Enter)"
                >
                  在工作台中编辑
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSubmitIntent()}
                disabled={!intentInput.trim()}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
                  intentInput.trim()
                    ? "bg-primary text-primary-foreground shadow-md shadow-black/20 hover:scale-105 active:scale-95"
                    : "cursor-not-allowed bg-slate-800/20 text-muted-foreground opacity-40",
                )}
                aria-label="提交意图"
                title={
                  !intentInput.trim()
                    ? "请输入意图内容"
                    : onDispatchIntent
                      ? "交给 Agent 开始执行 (Enter)"
                      : "在工作台中继续 (Enter)"
                }
              >
                <ArrowRightIcon className="size-4" />
              </button>
            </div>

            {/* 底部：Agent 选择与起步示例 */}
            <div className="relative mt-2.5 flex items-center justify-between gap-3 border-t border-black/5 pt-2.5 ">
              <div
                className="relative flex shrink-0 items-center gap-1.5"
                ref={agentMenuRef}
              >
                <span className="select-none text-[11px] font-semibold text-muted-foreground">
                  交给:
                </span>
                <button
                  type="button"
                  data-testid="agent-selector-trigger"
                  onClick={() => setIsAgentMenuOpen((v) => !v)}
                  className={cn(
                    "group inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all duration-150 active:scale-95",
                    "border-black/10 bg-black/[0.04] text-foreground hover:bg-black/[0.07] hover:text-foreground",
                    " dark:bg-white/[0.06]   ",
                    isAgentMenuOpen && "border-core/30 bg-core/10 text-core",
                  )}
                  aria-label={`选择 Agent：${selectedAgent?.name ?? "默认 Agent"}`}
                  aria-haspopup="menu"
                  aria-expanded={isAgentMenuOpen}
                >
                  <span className="text-sm" aria-hidden>
                    {selectedAgent?.icon ?? "✦"}
                  </span>
                  <span className="font-semibold">
                    {selectedAgent?.name ?? "默认 Agent"}
                  </span>
                  <ChevronDownIcon
                    className={cn(
                      "size-3 text-muted-foreground transition-transform duration-200",
                      isAgentMenuOpen && "rotate-180 text-core",
                    )}
                  />
                </button>

                {isAgentMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Agent 选择菜单"
                    className={cn(
                      "absolute bottom-full left-0 z-50 mb-2 max-h-[340px] w-72 overflow-y-auto rounded-2xl border p-1.5 text-left shadow-2xl backdrop-blur-xl",
                      "border-black/10 bg-card/95 text-foreground shadow-slate-900/15",
                      "   ",
                    )}
                  >
                    {agents.length === 0 ? (
                      <p className="px-3 py-2.5 text-xs leading-5 text-muted-foreground">
                        暂时读不到 Agent 名册，任务会交给工作台的默认 Agent。
                      </p>
                    ) : (
                      agents.map((agent) => {
                        const checked = agent.id === selectedAgent?.id;
                        return (
                          <button
                            key={agent.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={checked}
                            onClick={() => {
                              setSelectedAgentId(agent.id);
                              setIsAgentMenuOpen(false);
                              inputRef.current?.focus();
                            }}
                            className={cn(
                              "flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                              checked
                                ? "bg-core/10 text-core"
                                : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                            )}
                          >
                            <span className="mt-0.5 text-base" aria-hidden>
                              {agent.icon ?? "✦"}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-semibold">
                                {agent.name}
                              </span>
                              {agent.description && (
                                <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-muted-foreground">
                                  {agent.description}
                                </span>
                              )}
                            </span>
                            {checked && (
                              <CheckIcon className="mt-1 size-3.5 shrink-0" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <div
                className="flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden"
                aria-label="起步示例"
              >
                {INTENT_EXAMPLES.slice(0, 3).map((example) => (
                  <button
                    key={example.label}
                    type="button"
                    onClick={() => handleApplyExample(example)}
                    title={example.prompt}
                    className="shrink-0 truncate rounded-full border border-black/5 bg-black/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-black/[0.06] hover:text-foreground dark:bg-white/[0.05]"
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 任务卡片：只呈现真实任务 */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-5 bottom-28 top-[clamp(14rem,27vh,19rem)] z-20 mx-auto flex max-w-[1120px] flex-col items-center gap-4 overflow-y-auto px-1 pb-6 transition-all duration-500",
            mode === "pure" && "invisible translate-y-6 opacity-0",
          )}
          aria-hidden={mode === "pure" || undefined}
        >
          {visibleCards.length > 0 && (
            <div className="grid w-full gap-4 lg:grid-cols-2">
              {visibleCards.map((task) => {
                const status = taskStatusView(task);
                const progress = taskProgress(task);
                const headline = taskHeadline(task);
                const artifacts = task.resultArtifacts ?? [];
                const cardPos = cardPositions[task.id] || { x: 0, y: 0 };
                const isDragging = activeDraggingCard === task.id;
                const updated = task.updatedAt ?? task.startedAt;
                return (
                  <article
                    key={task.id}
                    data-task-card="true"
                    aria-label={task.title}
                    className={cn(
                      "pointer-events-auto flex min-w-0 flex-col overflow-hidden rounded-[22px] border shadow-2xl backdrop-blur-2xl transition-shadow",
                      isDragging &&
                        "shadow-[0_30px_70px_rgba(0,0,0,0.5)] ring-2 ring-core/30",
                      theme === "theme-white"
                        ? "border-border bg-card/85 text-foreground shadow-[0_22px_45px_-12px_rgba(180,155,120,0.22),0_1px_3px_rgba(0,0,0,0.05)]"
                        : "border-border bg-slate-900/90 text-slate-100 shadow-black/60",
                    )}
                    style={{
                      transform: `translate3d(${cardPos.x}px, ${cardPos.y}px, 0)`,
                      zIndex: isDragging ? 50 : 30,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      onPointerDown={(e) => handleCardDragStart(e, task.id)}
                      className="flex h-11 cursor-grab select-none items-center justify-between gap-2 px-5 pt-2 active:cursor-grabbing"
                      title="按住拖动可移动卡片"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="text-base" aria-hidden>
                          {agentIcon(task.agentId)}
                        </span>
                        <span className="truncate text-[13px] font-semibold text-muted-foreground">
                          {agentLabel(task.agentId)}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            TONE_CHIP[status.tone],
                          )}
                        >
                          {status.label}
                          {status.tone === "active" && progress != null
                            ? ` ${progress}%`
                            : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => handlePinToPip(task)}
                          className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                          title="钉到右下角画中画"
                          aria-label="钉在画中画"
                        >
                          <PictureInPicture2Icon className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleHideTask(task)}
                          className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                          title="从桌面隐藏（不影响任务本身）"
                          aria-label="从桌面隐藏"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col gap-3 px-5 pb-4 pt-1">
                      <h3 className="line-clamp-2 text-[16px] font-semibold leading-snug tracking-tight">
                        {task.title}
                      </h3>
                      {headline && (
                        <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                          {headline}
                        </p>
                      )}
                      {status.tone === "active" && (
                        <div
                          className="h-1 w-full overflow-hidden rounded-full bg-black/5 "
                          role="progressbar"
                          aria-label="任务进度"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={progress ?? undefined}
                        >
                          <div
                            className={cn(
                              "h-full rounded-full bg-primary transition-all duration-500",
                              progress == null && "w-1/3 animate-pulse",
                            )}
                            style={
                              progress == null
                                ? undefined
                                : { width: `${progress}%` }
                            }
                          />
                        </div>
                      )}
                      {task.displayStatus === "waiting_approval" && (
                        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-[13px]">
                          <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
                          <span className="min-w-0 flex-1 text-warning">
                            {approvalText(task)}
                          </span>
                          {onOpenTaskSpace && (
                            <button
                              type="button"
                              onClick={() => onOpenTaskSpace(task.id)}
                              className="shrink-0 rounded-lg bg-warning px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-warning"
                            >
                              去处理
                            </button>
                          )}
                        </div>
                      )}
                      {artifacts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {artifacts.slice(0, 3).map((artifact) => (
                            <button
                              key={artifact.resourceId}
                              type="button"
                              onClick={() =>
                                openTask(task, artifact.resourceId)
                              }
                              className="inline-flex max-w-[14rem] items-center gap-1.5 truncate rounded-lg bg-black/[0.04] px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-black/[0.08] hover:text-foreground dark:bg-white/[0.06]"
                              title={`打开产物：${artifact.relativePath}`}
                            >
                              <FileTextIcon className="size-3.5 shrink-0" />
                              <span className="truncate">{artifact.name}</span>
                            </button>
                          ))}
                          {artifacts.length > 3 && (
                            <span className="px-1 py-1 text-xs text-muted-foreground">
                              +{artifacts.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <footer className="flex items-center justify-between gap-3 border-t border-black/5 px-5 py-3 text-xs ">
                      <span className="min-w-0 truncate text-muted-foreground">
                        {updated
                          ? `更新于 ${formatTimeAgo(updated, "zh-CN")}`
                          : ""}
                        {task.modelName ? ` · ${task.modelName}` : ""}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        {onOpenTaskSpace && (
                          <button
                            type="button"
                            onClick={() => onOpenTaskSpace(task.id)}
                            className="rounded-lg px-2 py-1 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                          >
                            查看详情
                          </button>
                        )}
                        {task.threadId && onOpenTask && (
                          <button
                            type="button"
                            onClick={() => openTask(task)}
                            className="rounded-lg bg-primary px-3 py-1 font-semibold text-primary-foreground shadow-sm shadow-black/20 transition-colors hover:bg-primary"
                          >
                            打开 →
                          </button>
                        )}
                      </div>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}

          {overflowCount > 0 && onOpenTaskSpace && (
            <button
              type="button"
              onClick={() => onOpenTaskSpace()}
              className="pointer-events-auto rounded-full bg-card/70 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-card hover:text-foreground"
            >
              还有 {overflowCount} 个任务 · 打开任务空间 →
            </button>
          )}

          {tasks !== undefined && visibleCards.length === 0 && (
            <div
              data-testid="desktop-task-empty"
              className={cn(
                "pointer-events-auto mt-2 w-full max-w-md rounded-2xl border p-5 text-center backdrop-blur-xl",
                theme === "theme-white"
                  ? "border-border bg-card/70 text-foreground"
                  : "border-border bg-slate-900/60 text-slate-200",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <ListChecksIcon className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">
                {!tasksAvailable
                  ? "任务服务暂时不可用"
                  : activeRoom === "all"
                    ? "现在没有需要你关注的任务"
                    : `${activeRoomInfo.title.split(" ")[0]}里暂时没有任务`}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {!tasksAvailable
                  ? "稍后会自动重试；已有任务不会丢失。"
                  : "在上方写下想完成的事，交给 Agent 后，进行中和等你批准的任务都会出现在这里。"}
              </p>
              {onOpenTaskSpace && tasksAvailable && (
                <button
                  type="button"
                  onClick={() => onOpenTaskSpace()}
                  className="mt-3 text-xs font-medium text-core hover:underline"
                >
                  查看全部任务
                </button>
              )}
            </div>
          )}
        </div>

        {/* 画中画：盯住一个真实任务；需要审批时引导到任务空间处理 */}
        {pipTask && (
          <AgentPipMonitor
            demo={false}
            initialCollapsed
            visible={mode === "workspace" && pipDismissedId !== pipTask.id}
            task={pipTask}
            onOpenPhoneMirror={onOpenPhoneMirror}
            onClose={() => {
              setPipDismissedId(pipTask.id);
              if (pinnedTaskId === pipTask.id) setPinnedTaskId(null);
            }}
            onExpandToWindow={() => {
              if (watchedTask) openTask(watchedTask);
            }}
            onReviewApproval={
              onOpenTaskSpace ? () => onOpenTaskSpace(pipTask.id) : undefined
            }
          />
        )}

        {/* 既有子节点（支持承载系统级窗口或扩展小组件） */}
        {children && (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-10 transition-all duration-500",
              mode === "pure"
                ? "scale-95 opacity-0 pointer-events-none"
                : "scale-100 opacity-100 pointer-events-none [&>*]:pointer-events-auto",
            )}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
