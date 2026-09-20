"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  ArrowRightIcon,
  BotIcon,
  CastIcon,
  CpuIcon,
  DatabaseIcon,
  DropletIcon,
  FolderIcon,
  MoonIcon,
  PictureInPicture2Icon,
  SparklesIcon,
  SunIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AgentPipMonitor,
  DEFAULT_PIP_TASK,
  type PipTask,
} from "./agent-pip-monitor";

const OPERATOR_BG_PIP_TASK: PipTask = {
  id: "pip-task-operator-bg",
  title: "OpenZFS 阵列与硬件中枢遥测",
  agentName: "Operator (管家)",
  agentType: "operator",
  stepText: "物理中枢遥测中: RK3576 NPU 负载 32% · 双盘镜像健康",
  progress: 92,
  needsApproval: true,
  approvalRiskMessage: "申请执行 ZFS 定期 Scrub 校验与释放 TRIM",
};

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

export const OPEN_ROOMS: OpenRoom[] = [
  {
    id: "all",
    title: "全局总览",
    agentLabel: "全员在场",
    icon: "◫",
    desc: "所有任务与空间统一呈现",
  },
  {
    id: "researcher",
    title: "调研室 (Research)",
    agentLabel: "Researcher 在场",
    icon: "🔍",
    desc: "文献图谱、全网检索与技术分析",
  },
  {
    id: "builder",
    title: "工坊 (Builder Studio)",
    agentLabel: "Builder 在场",
    icon: "⚡",
    desc: "终端构建、代码编译与装配流水线",
  },
  {
    id: "operator",
    title: "中枢 (Operator Suite)",
    agentLabel: "Operator 在场",
    icon: "🛡️",
    desc: "ZFS 存储、NPU 算力与硬件监控",
  },
];

export interface TaskObject {
  id: string;
  title: string;
  agent: "researcher" | "builder" | "operator";
  agentName: string;
  status: "running" | "completed" | "idle";
  progress: number;
  outputPreview: string;
  contextLinks: Array<{ label: string; icon: "file" | "db" | "terminal" }>;
  side: "left" | "right";
  handover?: {
    toAgent: "researcher" | "builder" | "operator";
    toAgentName: string;
    artifactName: string;
    note: string;
  };
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
  onOpenWorkbench?: (prompt?: string) => void;
  onOpenApp?: (appId: string) => void;
  children?: ReactNode;
  className?: string;
}

const DEFAULT_TASKS: TaskObject[] = [
  {
    id: "task-01",
    title: "全网分析 DeepSeek V3 架构并生成与 Qwen2.5 对比评测",
    agent: "researcher",
    agentName: "Researcher (调研员)",
    status: "running",
    progress: 78,
    outputPreview:
      "已完成 4 篇论文交叉对比与算力评估；正在汇总 MoE 门控稀疏激活模式与显存驻留测试曲线...",
    contextLinks: [
      { label: "arxiv_2412.19437.pdf", icon: "file" },
      { label: "Vector DB (知识库)", icon: "db" },
      { label: "Web Search Cache", icon: "terminal" },
    ],
    side: "left",
    handover: {
      toAgent: "builder",
      toAgentName: "Builder (架构师)",
      artifactName: "deepseek_moe_spec.json",
      note: "已将稀疏门控算力参数自动交割至工坊交叉编译流水线",
    },
  },
  {
    id: "task-02",
    title: "RK3576 ARM64 固件装配与 NPU 加速驱动交叉编译",
    agent: "builder",
    agentName: "Builder (架构师)",
    status: "completed",
    progress: 100,
    outputPreview:
      "已完成 Makefile 参数适配并成功链接 OpenZFS 存储池与 6.0 TOPS NPU 驱动包。",
    contextLinks: [
      { label: "Makefile", icon: "file" },
      { label: "rknpu2_driver.c", icon: "file" },
      { label: "ZFS Storage", icon: "db" },
    ],
    side: "left",
    handover: {
      toAgent: "operator",
      toAgentName: "Operator (中枢)",
      artifactName: "rknpu2.ko",
      note: "驱动构建产物已归档，已移交至运维审计工作区等待系统放行审批",
    },
  },
  {
    id: "task-03",
    title: "NAS ZFS 双盘镜像完整性巡检与本地私有相册聚类",
    agent: "operator",
    agentName: "Operator (中枢)",
    status: "running",
    progress: 42,
    outputPreview:
      "正在执行 OpenZFS 存储池全盘校验；已自动对齐 NAS 物理阵列健康状态。",
    contextLinks: [
      { label: "zfs_pool_status.log", icon: "file" },
      { label: "tank/dataset", icon: "db" },
      { label: "SMART Health Monitor", icon: "terminal" },
    ],
    side: "right",
  },
];

export interface IntentTemplate {
  label: string;
  prompt: string;
  agent: "researcher" | "builder" | "operator";
  room: OpenRoomType;
}

export const INTENT_TEMPLATES: IntentTemplate[] = [
  {
    label: "全网调研 DeepSeek",
    prompt: "全网深度调研 DeepSeek V3 架构并生成与主流闭源模型评测对比",
    agent: "researcher",
    room: "researcher",
  },
  {
    label: "arXiv 论文综述",
    prompt: "检索近一年具身智能 (Embodied AI) 顶级论文并提炼技术图谱",
    agent: "researcher",
    room: "researcher",
  },
  {
    label: "固件装配编译",
    prompt: "交叉编译 RK3576 ARM64 内核与 NPU 加速运行时驱动并打包镜像",
    agent: "builder",
    room: "builder",
  },
  {
    label: "容器沙箱装配",
    prompt: "构建 Alpine Linux 隔离容器沙箱并配置严格 seccomp 策略",
    agent: "builder",
    room: "builder",
  },
  {
    label: "存储快照体检",
    prompt: "执行 NAS ZFS 双盘镜像完整性 Scrub 校验与离线相册聚类",
    agent: "operator",
    room: "operator",
  },
  {
    label: "NPU 算力调度",
    prompt: "巡检本地 6.0 TOPS NPU 芯片负载与温度，分配独占运行队列",
    agent: "operator",
    room: "operator",
  },
];

function getSafeInitialMode(initialMode: DesktopMode): DesktopMode {
  if (typeof window === "undefined") return initialMode;
  try {
    const saved = localStorage.getItem(
      "echo-desktop-mode",
    ) as DesktopMode | null;
    return saved === "pure" || saved === "workspace" ? saved : initialMode;
  } catch {
    return initialMode;
  }
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
  children,
  className,
}: IntentDesktopSurfaceProps) {
  const [internalMode, setInternalMode] = useState<DesktopMode>(() =>
    getSafeInitialMode(initialMode),
  );
  const [internalTheme, setInternalTheme] = useState<DesktopTheme>(() =>
    getSafeInitialTheme(initialTheme),
  );

  const theme = controlledTheme ?? internalTheme;

  const mode = controlledMode ?? internalMode;
  const setMode = useCallback(
    (nextOrFn: DesktopMode | ((prev: DesktopMode) => DesktopMode)) => {
      const next = typeof nextOrFn === "function" ? nextOrFn(mode) : nextOrFn;
      setInternalMode(next);
      onModeChange?.(next);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("echo-desktop-mode", next);
        } catch {
          // ignore
        }
      }
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
  const [selectedAgent, setSelectedAgent] = useState<
    "researcher" | "builder" | "operator"
  >("researcher");
  const [tasks, setTasks] = useState<TaskObject[]>(DEFAULT_TASKS);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [pipVisible, setPipVisible] = useState(true);
  const [pinnedPipTask, setPinnedPipTask] = useState<PipTask | null>(null);
  const [inspectingAsset, setInspectingAsset] = useState<{
    label: string;
    icon: "file" | "db" | "terminal";
    taskTitle: string;
    agentName: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 窗口卡片拖拽系统
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
    (e: React.PointerEvent<HTMLDivElement>, cardId: string) => {
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

  // 弹窗拖拽系统（用于展开详情与资产检视窗口）
  const [modalOffset, setModalOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const modalDragRef = useRef<{
    startX: number;
    startY: number;
    initX: number;
    initY: number;
  } | null>(null);

  const handleModalDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
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

      modalDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        initX: modalOffset.x,
        initY: modalOffset.y,
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (!modalDragRef.current) return;
        const dx = moveEvent.clientX - modalDragRef.current.startX;
        const dy = moveEvent.clientY - modalDragRef.current.startY;
        setModalOffset({
          x: Math.round(modalDragRef.current.initX + dx),
          y: Math.round(modalDragRef.current.initY + dy),
        });
      };

      const onPointerUp = () => {
        modalDragRef.current = null;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [modalOffset],
  );

  const activePipTask: PipTask = useMemo(() => {
    if (pinnedPipTask) return pinnedPipTask;
    if (activeRoom === "builder" || activeRoom === "all") {
      return OPERATOR_BG_PIP_TASK;
    }
    return DEFAULT_PIP_TASK;
  }, [pinnedPipTask, activeRoom]);

  const handlePinToPip = (task: TaskObject) => {
    setPinnedPipTask({
      id: task.id,
      title: task.title,
      agentName: task.agentName,
      agentType: task.agent,
      stepText: task.outputPreview,
      progress: task.progress,
      needsApproval: task.agent === "operator",
      approvalRiskMessage:
        task.agent === "operator"
          ? "申请执行物理存储阵列 Scrub 校验与 TRIM 释放"
          : undefined,
    });
    setPipVisible(true);
    toast.success(
      `已将 [${task.agentName.split(" ")[0]}] 任务钉入右下角画中画监视`,
    );
  };

  const dynamicTemplates = useMemo(() => {
    const list = INTENT_TEMPLATES.filter(
      (t: IntentTemplate) => t.agent === selectedAgent,
    );
    return list.length > 0 ? list : INTENT_TEMPLATES.slice(0, 3);
  }, [selectedAgent]);

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
      "theme-glass": "静谧液态玻璃",
      "theme-dark": "纯粹暗夜黑",
    };
    toast.success(`桌面主题已切换为：${themeNames[newTheme]}`);
  };

  const handleDismissTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    toast.info("任务已收纳移除");
  };

  const handleTogglePause = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          const nextStatus = t.status === "running" ? "idle" : "running";
          toast.info(
            nextStatus === "idle"
              ? `已暂停任务：${t.title}`
              : `已恢复任务：${t.title}`,
          );
          return { ...t, status: nextStatus };
        }
        return t;
      }),
    );
  };

  const handleInspectAsset = (
    link: { label: string; icon: "file" | "db" | "terminal" },
    task: TaskObject,
  ) => {
    setInspectingAsset({
      label: link.label,
      icon: link.icon,
      taskTitle: task.title,
      agentName: task.agentName,
    });
    toast.info(`已挂载活体资产：${link.label}`, {
      description: `资产类型：${link.icon === "file" ? "文件系统" : link.icon === "db" ? "向量知识图谱" : "沙箱终端"}`,
    });
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

  // 全局键盘人机工程学：Cmd+K / Ctrl+K / '/' 聚焦意图，Escape 退出，Space 双态互换
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInput = activeTag === "input" || activeTag === "textarea";

      // Cmd+K / Ctrl+K 或 '/' 快速聚焦意图输入框
      if (
        (e.key === "k" && (e.metaKey || e.ctrlKey)) ||
        (e.key === "/" && !isInput)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }

      // Escape 退出展开态或退散回纯净态
      if (e.key === "Escape") {
        if (inspectingAsset) {
          setInspectingAsset(null);
          return;
        }
        if (expandedTaskId) {
          setExpandedTaskId(null);
          return;
        }
        if (isInput) {
          (document.activeElement as HTMLElement)?.blur();
          return;
        }
        if (mode === "workspace") {
          toggleMode();
        }
        return;
      }

      if (!isInput && e.code === "Space") {
        e.preventDefault();
        toggleMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandedTaskId, inspectingAsset, mode, toggleMode]);

  // 提交意图
  const handleSubmitIntent = () => {
    const trimmed = intentInput.trim();
    if (!trimmed) return;

    const agentNames = {
      researcher: "Researcher (调研员)",
      builder: "Builder (架构师)",
      operator: "Operator (管家)",
    };

    const newTask: TaskObject = {
      id: `task-${Date.now()}`,
      title: trimmed,
      agent: selectedAgent,
      agentName: agentNames[selectedAgent],
      status: "running",
      progress: 12,
      outputPreview: `[Agent 启动] 已分配至 ${agentNames[selectedAgent]}，正在规划执行子图与分配算力配额...`,
      contextLinks: [
        { label: "User Prompt Intent", icon: "file" },
        { label: "Active Execution Engine", icon: "terminal" },
      ],
      side: tasks.length % 2 === 0 ? "left" : "right",
    };

    setTasks((prev) => [newTask, ...prev]);
    setIntentInput("");

    // 自动切换为多窗口工作台模式以展示任务执行
    if (mode === "pure") {
      setMode("workspace");
      localStorage.setItem("echo-desktop-mode", "workspace");
    }

    toast.success(`新任务已创建并分派给 ${agentNames[selectedAgent]}`, {
      description: trimmed,
    });

    onOpenWorkbench?.(trimmed);
  };

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitIntent();
    } else if (
      e.key === "Tab" &&
      !intentInput.trim() &&
      dynamicTemplates.length > 0
    ) {
      e.preventDefault();
      const firstTpl = dynamicTemplates[0];
      if (firstTpl) {
        setIntentInput(firstTpl.prompt);
        setSelectedAgent(firstTpl.agent);
        setActiveRoom(firstTpl.room);
      }
    }
  };

  return (
    <div
      className={cn(
        "relative flex size-full select-none flex-col overflow-hidden transition-colors duration-500",
        theme,
        theme === "theme-white" &&
          "bg-[radial-gradient(circle_at_50%_15%,#fffdfa_0%,#fbf7ef_45%,#f3ebe0_100%)] text-slate-800",
        theme === "theme-glass" &&
          "bg-[radial-gradient(at_15%_15%,rgba(45,75,130,0.5)_0%,transparent_55%),radial-gradient(at_85%_85%,rgba(125,45,110,0.4)_0%,transparent_55%),linear-gradient(135deg,#0c111c_0%,#121927_50%,#090d15_100%)] text-slate-100",
        theme === "theme-dark" &&
          "bg-[radial-gradient(circle_at_50%_0%,#151820_0%,#090b0e_65%,#040507_100%)] text-slate-100",
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
                  ? "border-black/10 bg-white/70 text-slate-700 hover:bg-white"
                  : "border-white/15 bg-white/10 text-slate-200 hover:bg-white/20",
              )}
              title="点击或按空格键在【意图纯净态】与【多窗口工作台】间无缝切换"
            >
              <span
                className={cn(
                  "size-2 rounded-full transition-transform group-hover:scale-125",
                  mode === "pure" ? "bg-emerald-500" : "bg-blue-500",
                )}
              />
              <span>{mode === "pure" ? "意图纯净态" : "多窗口工作台"}</span>
              <kbd className="rounded border border-black/10 bg-black/5 px-1 py-0.2 text-[9px] text-slate-400 dark:border-white/15 dark:bg-white/10">
                Space
              </kbd>
            </button>

            {/* OpenRoom 空间选择器 */}
            <div
              role="tablist"
              aria-label="OpenRoom 协作空间切换"
              className="flex items-center gap-1 rounded-full border border-black/5 bg-black/[0.03] p-0.5 text-[11px] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04]"
              onClick={(e) => e.stopPropagation()}
            >
              {OPEN_ROOMS.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  role="tab"
                  aria-selected={activeRoom === room.id}
                  onClick={() => {
                    setActiveRoom(room.id);
                    toast.info(`已进入协作空间：${room.title}`, {
                      description: `${room.agentLabel} · ${room.desc}`,
                    });
                  }}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all",
                    activeRoom === room.id
                      ? "bg-white text-slate-900 shadow-sm dark:bg-white/20 dark:text-white font-semibold"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
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
                ? "border-black/10 bg-black/5 text-slate-600"
                : "border-white/15 bg-white/5 text-slate-300",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => handleSelectTheme("theme-white")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-0.5 transition-all",
                theme === "theme-white" && "bg-white text-slate-900 shadow-sm",
              )}
            >
              <SunIcon className="size-3" />
              <span>象牙白</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectTheme("theme-glass")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-0.5 transition-all",
                theme === "theme-glass" &&
                  "bg-blue-500/20 text-blue-300 shadow-sm",
              )}
            >
              <DropletIcon className="size-3" />
              <span>液态玻璃</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectTheme("theme-dark")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-0.5 transition-all",
                theme === "theme-dark" && "bg-slate-800 text-white shadow-sm",
              )}
            >
              <MoonIcon className="size-3" />
              <span>暗夜黑</span>
            </button>
          </div>
        </div>
      )}

      {/* 桌面主要视口区域 */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 pb-20">
        {/* 中央 Zen Intent 意图核心 */}
        <div
          className={cn(
            "z-20 flex w-full max-w-2xl flex-col items-center text-center transition-all duration-500",
            mode === "workspace"
              ? "-translate-y-20 scale-90 opacity-80 pointer-events-auto"
              : "translate-y-0 scale-100 opacity-100",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Echo 核心液态呼吸脉冲节点 */}
          <div
            className="group relative mb-5 flex size-14 cursor-pointer items-center justify-center transition-transform hover:scale-110 active:scale-95"
            onClick={toggleMode}
            title="点击在【纯净意图态】与【多窗口工作台】间切换 (Space)"
            role="button"
            aria-label="Echo 意图节点"
          >
            {/* 外层微折射呼吸环 */}
            <span className="absolute inset-0 rounded-full border border-blue-500/25 bg-blue-500/10 backdrop-blur-md animate-ping-slow dark:border-blue-400/30 dark:bg-blue-400/10" />
            {/* 中层液态玻璃光晕 */}
            <span className="absolute inset-1.5 rounded-full border border-black/10 bg-gradient-to-tr from-blue-500/20 via-purple-500/15 to-amber-500/20 shadow-lg shadow-blue-500/10 backdrop-blur-lg dark:border-white/20 dark:from-blue-400/30 dark:to-purple-400/20" />
            {/* 核心声学脉冲球 */}
            <span className="relative flex size-7 items-center justify-center rounded-full bg-slate-900 text-white shadow-md transition-all group-hover:bg-blue-600 dark:bg-white dark:text-slate-900 dark:group-hover:bg-blue-400">
              <SparklesIcon className="size-3.5 animate-pulse text-amber-300 dark:text-blue-600" />
            </span>
          </div>

          <h2 className="text-sm font-medium tracking-wide text-slate-500 dark:text-slate-400">
            下午好，今天有什么探索计划？
          </h2>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
            意图优先 · 让 Agent 驱动执行
          </h1>

          {/* 意图输入胶囊 */}
          <div
            className={cn(
              "mt-6 w-full rounded-2xl border p-3 shadow-2xl backdrop-blur-2xl transition-all focus-within:ring-2 focus-within:ring-blue-500/30",
              theme === "theme-white"
                ? "border-black/10 bg-white/95 text-slate-900 shadow-black/5"
                : "border-white/15 bg-slate-900/80 text-white shadow-black/40",
            )}
          >
            <div className="flex items-center gap-3">
              <SparklesIcon className="size-5 shrink-0 text-blue-500" />
              <input
                ref={inputRef}
                type="text"
                value={intentInput}
                onChange={(e) => setIntentInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="输入意图，例如：分析 NAS 存储碎片化并生成优化方案... (Tab 键自动带入预设)"
                className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={handleSubmitIntent}
                disabled={!intentInput.trim()}
                className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition-all hover:scale-105 disabled:opacity-40 dark:bg-white dark:text-slate-900"
                aria-label="提交意图"
              >
                <ArrowRightIcon className="size-4" />
              </button>
            </div>

            {/* 意图标签与 Agent 切换 */}
            <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-2.5 text-xs dark:border-white/10">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold text-slate-400">
                  分派:
                </span>
                {(
                  [
                    { key: "researcher", label: "Researcher" },
                    { key: "builder", label: "Builder" },
                    { key: "operator", label: "Operator" },
                  ] as const
                ).map((ag) => (
                  <button
                    key={ag.key}
                    type="button"
                    onClick={() => setSelectedAgent(ag.key)}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[11px] font-medium transition-all",
                      selectedAgent === ag.key
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-black/5 text-slate-600 hover:bg-black/10 dark:bg-white/10 dark:text-slate-300",
                    )}
                  >
                    {ag.label}
                  </button>
                ))}
              </div>

              <div className="hidden items-center gap-1.5 sm:flex">
                <span className="text-[10px] text-slate-400">快捷推荐:</span>
                {INTENT_TEMPLATES.map((tpl: IntentTemplate) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => {
                      setIntentInput(tpl.prompt);
                      setSelectedAgent(tpl.agent);
                      setActiveRoom(tpl.room);
                      inputRef.current?.focus();
                    }}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] transition-all",
                      selectedAgent === tpl.agent
                        ? "bg-blue-500/15 text-blue-700 font-semibold dark:bg-blue-400/20 dark:text-blue-300"
                        : "bg-black/5 text-slate-500 hover:text-slate-900 dark:bg-white/10 dark:text-slate-400 dark:hover:text-white",
                    )}
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Task Objects 任务窗口卡片 (多窗口工作区一级公民) */}
        <div className="pointer-events-none absolute inset-x-8 bottom-16 top-24 z-30 flex items-center justify-between gap-6 transition-all duration-500">
          {(() => {
            const filteredTasks =
              activeRoom === "all"
                ? tasks
                : tasks.filter((t) => t.agent === activeRoom);

            if (filteredTasks.length === 0) {
              return (
                <div
                  data-task-card="true"
                  className={cn(
                    "pointer-events-auto mx-auto flex h-48 w-full max-w-md flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center backdrop-blur-md transition-all",
                    theme === "theme-white"
                      ? "border-black/15 bg-white/50 text-slate-600"
                      : "border-white/15 bg-slate-900/50 text-slate-300",
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <BotIcon className="size-8 text-slate-400" />
                  <p className="mt-2 text-xs font-semibold">
                    该协同空间暂无进行中的任务
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    可在上方意图条输入目标，直接指派给该空间专属 Agent
                  </p>
                </div>
              );
            }

            const cards = filteredTasks.slice(0, 2).map((task) => {
              const isLeft = task.side === "left";
              const cardPos = cardPositions[task.id] || { x: 0, y: 0 };
              const isDragging = activeDraggingCard === task.id;
              return (
                <div
                  key={task.id}
                  data-task-card="true"
                  className={cn(
                    "flex h-[360px] w-full max-w-[500px] flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-2xl transition-all duration-500",
                    isDragging &&
                      "transition-none shadow-[0_30px_70px_rgba(0,0,0,0.5)] ring-2 ring-blue-500/40",
                    theme === "theme-white"
                      ? "border-amber-900/10 bg-white/95 text-slate-800 shadow-[0_22px_45px_-12px_rgba(180,155,120,0.22),0_1px_3px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.03]"
                      : "border-white/15 bg-slate-900/90 text-slate-100 shadow-black/60",
                    // 双态退散核心动效：pure 模式向左/右滑出屏幕并淡化
                    mode === "pure" &&
                      (isLeft
                        ? "-translate-x-[115%] scale-90 opacity-15 pointer-events-none"
                        : "translate-x-[115%] scale-90 opacity-15 pointer-events-none"),
                    mode === "workspace" &&
                      "scale-100 opacity-100 pointer-events-auto",
                  )}
                  style={{
                    transform:
                      mode === "workspace"
                        ? `translate3d(${cardPos.x}px, ${cardPos.y}px, 0)`
                        : undefined,
                    zIndex: isDragging ? 50 : 30,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* 窗口头部：可拖拽标题栏与 macOS 交通灯 */}
                  <div
                    onPointerDown={(e) => handleCardDragStart(e, task.id)}
                    className="flex h-9 cursor-grab active:cursor-grabbing select-none items-center justify-between border-b border-black/5 bg-black/[0.02] px-3.5 dark:border-white/10 dark:bg-white/[0.02]"
                    title="按住并拖动标题栏可自由移动此任务窗口"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDismissTask(task.id);
                          }}
                          className="size-2.5 rounded-full bg-red-400/80 transition-transform hover:scale-125 hover:bg-red-500"
                          title="收纳移除此任务"
                          aria-label="关闭任务"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePause(task.id);
                          }}
                          className="size-2.5 rounded-full bg-amber-400/80 transition-transform hover:scale-125 hover:bg-amber-500"
                          title={
                            task.status === "running" ? "暂停任务" : "恢复执行"
                          }
                          aria-label="暂停或继续任务"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedTaskId(task.id);
                          }}
                          className="size-2.5 rounded-full bg-emerald-400/80 transition-transform hover:scale-125 hover:bg-emerald-500"
                          title="展开任务详情"
                          aria-label="展开任务详情"
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-slate-400">
                        [{task.agentName.split(" ")[0]}]
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          task.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                        )}
                      >
                        {task.status === "completed"
                          ? "已完成 100%"
                          : `执行中 ${task.progress}%`}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePinToPip(task);
                        }}
                        className="flex size-5 items-center justify-center rounded text-slate-400 transition-colors hover:bg-black/5 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
                        title="将此任务钉入右下角画中画"
                        aria-label="钉在画中画"
                      >
                        <PictureInPicture2Icon className="size-3" />
                      </button>
                    </div>
                  </div>

                  {/* 窗口分栏：左侧 Context，右侧 Live Execution */}
                  <div className="flex flex-1 overflow-hidden">
                    {/* Context Pane */}
                    <div className="flex w-36 flex-col border-r border-black/5 bg-black/[0.01] p-3 dark:border-white/10 dark:bg-white/[0.01]">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        上下文关联
                      </span>
                      <div className="mt-2 flex flex-col gap-1.5 text-[11px]">
                        {task.contextLinks.map((link, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInspectAsset(link, task);
                            }}
                            className="flex items-center gap-1.5 truncate rounded px-1 py-0.5 text-left text-slate-600 transition-colors hover:bg-black/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
                            title={`点击检查上下文资产：${link.label}`}
                          >
                            {link.icon === "file" && (
                              <FolderIcon className="size-3 shrink-0 text-amber-500" />
                            )}
                            {link.icon === "db" && (
                              <DatabaseIcon className="size-3 shrink-0 text-blue-500" />
                            )}
                            {link.icon === "terminal" && (
                              <TerminalIcon className="size-3 shrink-0 text-emerald-500" />
                            )}
                            <span className="truncate">{link.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Live Stream / Progress Pane */}
                    <div className="flex flex-1 flex-col justify-between p-3.5">
                      <div>
                        <h4 className="line-clamp-2 text-xs font-semibold leading-relaxed">
                          {task.title}
                        </h4>
                        <div className="mt-3 rounded-lg bg-black/[0.03] p-2.5 font-mono text-[11px] leading-relaxed text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">
                          {task.outputPreview}
                        </div>

                        {/* Agent 接力协作纽带微条 */}
                        {task.handover && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveRoom(task.handover!.toAgent);
                              toast.success(
                                `已穿梭至 ${task.handover!.toAgentName} 的空间`,
                                {
                                  description: task.handover!.note,
                                },
                              );
                            }}
                            className="mt-2.5 flex cursor-pointer items-center justify-between rounded-lg border border-blue-500/20 bg-blue-500/5 px-2.5 py-1.5 text-[10px] transition-colors hover:bg-blue-500/10 dark:border-blue-400/20 dark:bg-blue-950/20 dark:hover:bg-blue-950/40"
                            title={`点击跳转至 ${task.handover.toAgentName} 的协同工坊`}
                            data-testid={`handover-pill-${task.id}`}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="font-bold text-blue-600 dark:text-blue-400">
                                ⮑ 接力协作
                              </span>
                              <span className="truncate text-slate-500 dark:text-slate-400">
                                产物 {task.handover.artifactName} 交付至
                              </span>
                            </div>
                            <span className="shrink-0 font-semibold text-blue-600 dark:text-blue-400">
                              {task.handover.toAgentName.split(" ")[0]} →
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <span>Agent 持续自适应迭代中</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setExpandedTaskId(task.id)}
                            className="rounded-lg border border-black/10 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-black/5 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
                          >
                            查看详情
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenWorkbench?.(task.title)}
                            className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white transition-all hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                          >
                            打开空间 →
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            });

            // 当处于中枢 (Operator Suite) 空间时，渲染物理硬件与泛在网络 HUD
            if (activeRoom === "operator") {
              const hudPos = cardPositions["operator-hardware-hud"] || {
                x: 0,
                y: 0,
              };
              const isDraggingHud =
                activeDraggingCard === "operator-hardware-hud";
              cards.push(
                <div
                  key="operator-hardware-hud"
                  data-task-card="true"
                  className={cn(
                    "flex h-[360px] w-full max-w-[500px] flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-2xl transition-all duration-500",
                    isDraggingHud &&
                      "transition-none shadow-[0_30px_70px_rgba(0,0,0,0.5)] ring-2 ring-blue-500/40",
                    theme === "theme-white"
                      ? "border-black/10 bg-white/90 text-slate-800 shadow-slate-300/40"
                      : "border-white/15 bg-slate-900/90 text-slate-100 shadow-black/60",
                    mode === "pure" &&
                      "translate-x-[115%] scale-90 opacity-15 pointer-events-none",
                    mode === "workspace" &&
                      "scale-100 opacity-100 pointer-events-auto",
                  )}
                  style={{
                    transform:
                      mode === "workspace"
                        ? `translate3d(${hudPos.x}px, ${hudPos.y}px, 0)`
                        : undefined,
                    zIndex: isDraggingHud ? 50 : 30,
                  }}
                  onClick={(e) => e.stopPropagation()}
                  data-testid="operator-hardware-hud"
                >
                  <div
                    onPointerDown={(e) =>
                      handleCardDragStart(e, "operator-hardware-hud")
                    }
                    className="flex h-9 cursor-grab active:cursor-grabbing select-none items-center justify-between border-b border-black/5 bg-black/[0.02] px-3.5 dark:border-white/10 dark:bg-white/[0.02]"
                    title="按住并拖动标题栏可自由移动中枢硬件遥测窗口"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <CpuIcon className="size-3.5 text-blue-500" />
                      <span>物理硬件中枢与泛在广播 (Hardware HUD)</span>
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      ● 物理安全在线
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col justify-between p-3.5 text-xs">
                    <div className="space-y-2.5">
                      {/* NPU */}
                      <div className="rounded-xl border border-black/5 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
                        <div className="flex items-center justify-between font-semibold text-[11px]">
                          <span className="flex items-center gap-1.5">
                            <CpuIcon className="size-3 text-blue-500" />
                            RK3576 NPU 加速芯片
                          </span>
                          <span className="font-mono text-emerald-600 dark:text-emerald-400">
                            6.0 TOPS · 32% 负载
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                          <div className="h-full w-[32%] bg-blue-500" />
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[9px] text-slate-400">
                          <span>核心温度: 41.5°C</span>
                          <span>
                            离线免流: 100% 本地物理隔离 (0 云端 Token)
                          </span>
                        </div>
                      </div>

                      {/* ZFS Storage */}
                      <div className="rounded-xl border border-black/5 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
                        <div className="flex items-center justify-between font-semibold text-[11px]">
                          <span className="flex items-center gap-1.5">
                            <DatabaseIcon className="size-3 text-amber-500" />
                            OpenZFS 存储池 ('tank')
                          </span>
                          <span className="font-mono text-emerald-600 dark:text-emerald-400">
                            双盘镜像 · HEALTHY
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                          <div className="h-full w-[50%] bg-emerald-500" />
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[9px] text-slate-400">
                          <span>已用 1.82TB / 可用 1.82TB</span>
                          <span>完整性校验: 0 Checksum 错误</span>
                        </div>
                      </div>

                      {/* AI Hotspot Radio */}
                      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-2.5 dark:border-blue-400/20 dark:bg-blue-950/20">
                        <div className="flex items-center justify-between font-semibold text-[11px]">
                          <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                            <CastIcon className="size-3" />
                            AI Hotspot 局域网算力广播
                          </span>
                          <span className="font-mono text-[10px] text-blue-500">
                            3 台设备在场
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                          已向 iPhone 16 Pro、客厅 Ambient TV 与工作站开放本地
                          NPU 向量与语音推理通道。
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-black/5 pt-2 text-[10px] text-slate-400 dark:border-white/10">
                      <span>硬件看门狗持续轮询中</span>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenWorkbench?.("NAS 存储与 NPU 硬件监控")
                        }
                        className="rounded-lg bg-slate-900 px-2.5 py-1 font-semibold text-white transition-all hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                      >
                        管理硬件底座 →
                      </button>
                    </div>
                  </div>
                </div>,
              );
            }

            return cards;
          })()}
        </div>

        {/* 纯净意图态下的底部轻提示 */}
        {mode === "pure" && (
          <div
            className={cn(
              "pointer-events-none absolute bottom-4 z-20 flex items-center gap-2 rounded-full border px-4 py-1 text-xs font-medium shadow-sm backdrop-blur-md transition-all",
              theme === "theme-white"
                ? "border-black/10 bg-white/80 text-slate-600"
                : "border-white/15 bg-slate-900/80 text-slate-300",
            )}
          >
            <span className="size-1.5 animate-ping rounded-full bg-emerald-500" />
            <span>纯净意图态 · 按 Space 空格键或点击空白壁纸召回工作台</span>
          </div>
        )}

        {/* 展开的任务全图与上下文 Drawer/Dialog */}
        {expandedTaskId &&
          (() => {
            const expandedTask = tasks.find((t) => t.id === expandedTaskId);
            if (!expandedTask) return null;
            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
                onClick={() => setExpandedTaskId(null)}
              >
                <div
                  className={cn(
                    "relative flex h-[480px] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border p-6 shadow-2xl backdrop-blur-2xl transition-all",
                    theme === "theme-white"
                      ? "border-black/10 bg-white/95 text-slate-800 shadow-black/10"
                      : "border-white/15 bg-slate-900/95 text-slate-100 shadow-black/60",
                  )}
                  style={{
                    transform: `translate3d(${modalOffset.x}px, ${modalOffset.y}px, 0)`,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    onPointerDown={handleModalDragStart}
                    className="flex cursor-grab active:cursor-grabbing select-none items-center justify-between border-b border-black/5 pb-3.5 dark:border-white/10"
                    title="按住并拖动标题栏可自由移动弹窗"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-bold text-blue-600 dark:text-blue-400">
                        {expandedTask.agentName.charAt(0)}
                      </span>
                      <div>
                        <h3 className="text-sm font-bold leading-tight">
                          {expandedTask.title}
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          分派员工：{expandedTask.agentName} · 执行进度：
                          {expandedTask.progress}%
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedTaskId(null)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-black/5 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
                      aria-label="关闭详情"
                    >
                      <XIcon className="size-4" />
                    </button>
                  </div>

                  <div className="my-4 flex-1 space-y-4 overflow-y-auto pr-1 text-xs">
                    <div>
                      <h4 className="font-semibold text-slate-400">
                        实时执行流与控制台日志
                      </h4>
                      <div className="mt-1.5 rounded-xl bg-black/[0.03] p-3 font-mono text-[11px] leading-relaxed text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">
                        {expandedTask.outputPreview}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-slate-400">
                        挂载上下文资产 (Context Graph)
                      </h4>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {expandedTask.contextLinks.map((link, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() =>
                              handleInspectAsset(link, expandedTask)
                            }
                            className="flex items-center gap-1.5 rounded-lg border border-black/5 bg-black/[0.02] px-2.5 py-1 text-[11px] text-slate-600 transition-colors hover:bg-black/5 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                            title={`点击检查上下文资产：${link.label}`}
                          >
                            {link.icon === "file" && (
                              <FolderIcon className="size-3 text-amber-500" />
                            )}
                            {link.icon === "db" && (
                              <DatabaseIcon className="size-3 text-blue-500" />
                            )}
                            {link.icon === "terminal" && (
                              <TerminalIcon className="size-3 text-emerald-500" />
                            )}
                            <span>{link.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-black/5 pt-3.5 dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => handleTogglePause(expandedTask.id)}
                      className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-black/5 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
                    >
                      {expandedTask.status === "running"
                        ? "暂停任务"
                        : "恢复执行"}
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          handleDismissTask(expandedTask.id);
                          setExpandedTaskId(null);
                        }}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        收纳移除
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedTaskId(null);
                          onOpenWorkbench?.(expandedTask.title);
                        }}
                        className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition-all hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                      >
                        在工作台中深入会话 →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

        {/* Context Graph 活体资产检查抽屉 / 弹窗 */}
        {inspectingAsset && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md"
            onClick={() => setInspectingAsset(null)}
            data-testid="context-asset-inspector"
          >
            <div
              className={cn(
                "relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border p-5 shadow-2xl backdrop-blur-2xl transition-all",
                theme === "theme-white"
                  ? "border-black/10 bg-white/95 text-slate-800 shadow-slate-300/60"
                  : "border-white/15 bg-slate-900/95 text-slate-100 shadow-black/80",
              )}
              style={{
                transform: `translate3d(${modalOffset.x}px, ${modalOffset.y}px, 0)`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                onPointerDown={handleModalDragStart}
                className="flex cursor-grab active:cursor-grabbing select-none items-center justify-between border-b border-black/5 pb-3 dark:border-white/10"
                title="按住并拖动标题栏可自由移动弹窗"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg",
                      inspectingAsset.icon === "file" &&
                        "bg-amber-500/15 text-amber-600",
                      inspectingAsset.icon === "db" &&
                        "bg-blue-500/15 text-blue-600",
                      inspectingAsset.icon === "terminal" &&
                        "bg-emerald-500/15 text-emerald-600",
                    )}
                  >
                    {inspectingAsset.icon === "file" && (
                      <FolderIcon className="size-4" />
                    )}
                    {inspectingAsset.icon === "db" && (
                      <DatabaseIcon className="size-4" />
                    )}
                    {inspectingAsset.icon === "terminal" && (
                      <TerminalIcon className="size-4" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">
                      {inspectingAsset.label}
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      挂载任务：{inspectingAsset.taskTitle} · 责任 Agent：
                      {inspectingAsset.agentName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectingAsset(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-black/5 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
                  aria-label="关闭资产检查"
                >
                  <XIcon className="size-4" />
                </button>
              </div>

              <div className="my-3 grid grid-cols-3 gap-2 rounded-xl bg-black/[0.02] p-2.5 text-[11px] dark:bg-white/[0.02]">
                <div>
                  <span className="text-[9px] text-slate-400">资产属性</span>
                  <p className="font-semibold">
                    {inspectingAsset.icon === "file" && "系统镜像 / 文档"}
                    {inspectingAsset.icon === "db" && "向量知识图谱"}
                    {inspectingAsset.icon === "terminal" && "沙箱执行上下文"}
                  </p>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400">存储位置</span>
                  <p className="truncate font-mono text-[10px] font-semibold">
                    {inspectingAsset.icon === "file" && "/vault/assets"}
                    {inspectingAsset.icon === "db" && "pgvector://local"}
                    {inspectingAsset.icon === "terminal" && "pts/1 · tty"}
                  </p>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400">隔离与隐私</span>
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                    100% 本地沙箱
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold text-slate-400">
                  活体资产快照 (Live Snapshot)
                </span>
                <div className="rounded-xl border border-black/5 bg-black/[0.03] p-3 font-mono text-[11px] leading-relaxed text-slate-600 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-300">
                  {inspectingAsset.icon === "file" && (
                    <>
                      $ sha256sum {inspectingAsset.label}
                      <br />
                      &gt;
                      e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
                      <br />
                      &gt; Header: PDF-1.7 / 18 pages / OCR indexed (37,410
                      tokens)
                      <br />
                      &gt; Status: Ready for Agent embedding retrieval.
                    </>
                  )}
                  {inspectingAsset.icon === "db" && (
                    <>
                      -- Collection: echo_memory_vault
                      <br />
                      -- Embedding: text-embedding-3-small (1536 dim)
                      <br />
                      -- Chunks count: 14,280 | Index: HNSW (M=16, ef=64)
                      <br />
                      -- Similarity score: 0.942 | Cosine distance: 0.058
                    </>
                  )}
                  {inspectingAsset.icon === "terminal" && (
                    <>
                      $ echo $SHELL; uname -m; zfs list tank
                      <br />
                      &gt; /bin/bash (sandbox container)
                      <br />
                      &gt; aarch64 (Rockchip RK3576 NPU 6 TOPS)
                      <br />
                      &gt; tank 1.82T 3.64T 1.82T /tank (HEALTHY)
                    </>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-3 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(inspectingAsset.label);
                    toast.success("资产引用已复制到剪贴板");
                  }}
                  className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-black/5 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
                >
                  复制资产引用
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const label = inspectingAsset.label;
                    setInspectingAsset(null);
                    onOpenWorkbench?.(`深入分析资产: ${label}`);
                  }}
                  className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition-all hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  在工作台中深入探索 →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Codex 风格画中画 (PiP) 浮窗：后台执行监视与危险操作放行审批 */}
        <AgentPipMonitor
          visible={pipVisible}
          task={activePipTask}
          onClose={() => setPipVisible(false)}
          onExpandToWindow={() => {
            setMode("workspace");
            onOpenWorkbench?.(activePipTask.title);
          }}
        />

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
