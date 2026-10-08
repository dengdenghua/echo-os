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
  CheckIcon,
  ChevronDownIcon,
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
import type { LinkedDevice } from "./device-link";
import { cn } from "@/lib/utils";
import { currentActorId } from "@/core/auth/api";
import {
  actorScopedStorageKey,
  readActorScopedStorageValue,
} from "@/core/auth/scoped-storage";
import {
  AgentPipMonitor,
  DEFAULT_PIP_TASK,
  type PipTask,
} from "./agent-pip-monitor";

/**
 * 桌面形态（pure / workspace）按**账号作用域**保存。
 *
 * 依据仓库既定的偏好边界（`docs/desktop-workbench-ux-optimization.md`）：
 * 设备级只保留"硬件桌面外观"（主题 / 壁纸 / 液态玻璃 / 圆角密度），
 * 而"工作形态"类偏好一律 actor 作用域 —— 与聊天模式覆盖 `echo:modeOverride`、
 * 侧栏折叠与面板宽度、Design 工作区布局属同一侧。
 *
 * 桌面形态记录的是"这个账号想怎么工作"（沉浸意图态 vs 多窗口工作台），
 * 不是这台设备的硬件外观，因此按账号隔离；共享设备上多账号不会再互相覆盖。
 * 旧设备级键由 `readActorScopedStorageValue` 按当前账号做一次性迁移。
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

export type BuiltinAgentId =
  | "codex"
  | "claude"
  | "hermes"
  | "pi"
  | "opencode"
  | "researcher"
  | "builder"
  | "operator";

export function agentToOpenRoom(agent: BuiltinAgentId): OpenRoomType {
  if (agent === "researcher" || agent === "builder" || agent === "operator") {
    return agent;
  }
  if (agent === "codex" || agent === "opencode" || agent === "hermes") {
    return "builder";
  }
  return "researcher";
}

export interface TaskObject {
  id: string;
  title: string;
  agent: BuiltinAgentId;
  agentName: string;
  status: "running" | "completed" | "idle";
  progress: number;
  outputPreview: string;
  contextLinks: Array<{ label: string; icon: "file" | "db" | "terminal" }>;
  side: "left" | "right";
  handover?: {
    toAgent: BuiltinAgentId;
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
  onOpenWorkbench?: (prompt?: string, agentId?: string) => void;
  onOpenApp?: (appId: string) => void;
  onOpenPhoneMirror?: (device: LinkedDevice) => void;
  children?: ReactNode;
  className?: string;
}

export interface AgentPreset {
  key: BuiltinAgentId;
  label: string;
  name: string;
  title: string;
  icon: string;
  category: "frontier" | "role";
  badge: string;
  brandTag: string;
  engine: string;
  placeholder: string;
  outputPreview: string;
  colorScheme: {
    activeBg: string;
    activeText: string;
    border: string;
    badgeBg: string;
    badgeText: string;
    halo: string;
    dot: string;
  };
}

export const BUILTIN_AGENTS: AgentPreset[] = [
  // 旗舰模型 Agent (Omarchy 开发者生态)
  {
    key: "codex",
    label: "Codex",
    name: "Codex (工程专家)",
    title: "OpenAI Codex",
    icon: "🤖",
    category: "frontier",
    badge: "OpenAI",
    brandTag: "工程规划 · 复杂重构 · 测试套件生成",
    engine: "Codex-Engine // v0.153 · AST Parser",
    placeholder:
      "让 Codex 规划软件工程：重构代码架构、生成测试套件或排查系统缺陷...",
    outputPreview:
      "已初始化 AST 语法树分析器；正在解构核心调度流水线并生成多步工程重构实施计划...",
    colorScheme: {
      activeBg: "bg-emerald-600 text-white shadow-emerald-500/30",
      activeText: "text-emerald-500 dark:text-emerald-400",
      border: "border-emerald-500/40",
      badgeBg:
        "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      badgeText: "text-emerald-600 dark:text-emerald-400",
      halo: "shadow-[0_0_20px_rgba(16,185,129,0.25)]",
      dot: "bg-emerald-500",
    },
  },
  {
    key: "claude",
    label: "Claude",
    name: "Claude (深度思考)",
    title: "Claude Code",
    icon: "🟣",
    category: "frontier",
    badge: "Anthropic",
    brandTag: "深度推演 · 长文规范 · 架构权衡",
    engine: "Claude-3.7-Sonnet // Extended Thinking Core",
    placeholder:
      "向 Claude 请教：深度思考推理、技术长文架构设计或跨模块系统权衡...",
    outputPreview:
      "正在展开深度思维链 (Thinking Process)；已对微内核与宏内核边界完成 3 轮推演对比...",
    colorScheme: {
      activeBg: "bg-purple-600 text-white shadow-purple-500/30",
      activeText: "text-purple-500 dark:text-purple-400",
      border: "border-purple-500/40",
      badgeBg:
        "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
      badgeText: "text-purple-600 dark:text-purple-400",
      halo: "shadow-[0_0_20px_rgba(168,85,247,0.25)]",
      dot: "bg-purple-500",
    },
  },
  {
    key: "hermes",
    label: "Hermes",
    name: "Hermes (自主工具)",
    title: "Nous Hermes",
    icon: "⚡",
    category: "frontier",
    badge: "Nous",
    brandTag: "端侧工具链 · Function Calling · 自动化流",
    engine: "Hermes-Agent-3 // Local Tooling Bus",
    placeholder:
      "唤醒 Hermes：调用端侧 Function Calling 工具链与执行自动化多步流...",
    outputPreview:
      "正在探测本地注册 Function Calling 工具链；已自动挂载 NAS 主板温度与转速传感器控制端...",
    colorScheme: {
      activeBg: "bg-amber-600 text-white shadow-amber-500/30",
      activeText: "text-amber-500 dark:text-amber-400",
      border: "border-amber-500/40",
      badgeBg:
        "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      badgeText: "text-amber-600 dark:text-amber-400",
      halo: "shadow-[0_0_20px_rgba(245,158,11,0.25)]",
      dot: "bg-amber-500",
    },
  },
  {
    key: "pi",
    label: "Pi",
    name: "Pi (智能陪伴)",
    title: "Inflection Pi",
    icon: "🥧",
    category: "frontier",
    badge: "Inflection",
    brandTag: "亲和交互 · 灵感脑暴 · 敏捷陪伴",
    engine: "Inflection-Pi // Empathic Core",
    placeholder: "与 Pi 随心交流：探讨产品灵感、整理思维碎片或敏捷日常问答...",
    outputPreview:
      "已捕获并理解您的产品灵感碎片；正在将其整理为结构化且富有美感的极简执行清单...",
    colorScheme: {
      activeBg: "bg-pink-600 text-white shadow-pink-500/30",
      activeText: "text-pink-500 dark:text-pink-400",
      border: "border-pink-500/40",
      badgeBg:
        "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20",
      badgeText: "text-pink-600 dark:text-pink-400",
      halo: "shadow-[0_0_20px_rgba(236,72,153,0.25)]",
      dot: "bg-pink-500",
    },
  },
  {
    key: "opencode",
    label: "OpenCode",
    name: "OpenCode (开源全栈)",
    title: "OpenCode Zen",
    icon: "💻",
    category: "frontier",
    badge: "OpenCode",
    brandTag: "开源沙箱 · Python 科学计算 · 数据脚本",
    engine: "OpenCode-Interpreter // Sandboxed Python 3.12",
    placeholder:
      "让 OpenCode 在沙箱中执行：运行 Python 数据分析、科学计算与运维脚本...",
    outputPreview:
      "已在沙箱中成功拉起 Python 3.12 隔离内核；已预装 NumPy / Pandas 并准备执行数据清洗与制图...",
    colorScheme: {
      activeBg: "bg-cyan-600 text-white shadow-cyan-500/30",
      activeText: "text-cyan-500 dark:text-cyan-400",
      border: "border-cyan-500/40",
      badgeBg:
        "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
      badgeText: "text-cyan-600 dark:text-cyan-400",
      halo: "shadow-[0_0_20px_rgba(6,182,212,0.25)]",
      dot: "bg-cyan-500",
    },
  },
  // 系统核心职能 Agent
  {
    key: "researcher",
    label: "Researcher",
    name: "Researcher (调研员)",
    title: "调研员",
    icon: "🔍",
    category: "role",
    badge: "Research",
    brandTag: "全网文献检索 · 技术情报对比 · 知识综述",
    engine: "Echo Neural Perceptor // Multi-Source Crawler",
    placeholder: "输入意图，例如：全网深度调研 DeepSeek V3 架构对比评测...",
    outputPreview:
      "已完成 4 篇论文交叉对比与算力评估；正在汇总 MoE 门控稀疏激活模式与显存驻留测试曲线...",
    colorScheme: {
      activeBg: "bg-blue-600 text-white shadow-blue-500/30",
      activeText: "text-blue-500 dark:text-blue-400",
      border: "border-blue-500/40",
      badgeBg:
        "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      badgeText: "text-blue-600 dark:text-blue-400",
      halo: "shadow-[0_0_20px_rgba(59,130,246,0.25)]",
      dot: "bg-blue-500",
    },
  },
  {
    key: "builder",
    label: "Builder",
    name: "Builder (架构师)",
    title: "架构师",
    icon: "🛠️",
    category: "role",
    badge: "Builder",
    brandTag: "交叉编译 · 固件构建 · 内核驱动适配",
    engine: "Echo Compiler Toolchain // aarch64-linux-gnu",
    placeholder: "输入意图，例如：交叉编译 RK3576 ARM64 固件与 NPU 驱动...",
    outputPreview:
      "已完成 Makefile 参数适配并成功链接 OpenZFS 存储池与 6.0 TOPS NPU 驱动包。",
    colorScheme: {
      activeBg: "bg-indigo-600 text-white shadow-indigo-500/30",
      activeText: "text-indigo-500 dark:text-indigo-400",
      border: "border-indigo-500/40",
      badgeBg:
        "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
      badgeText: "text-indigo-600 dark:text-indigo-400",
      halo: "shadow-[0_0_20px_rgba(99,102,241,0.25)]",
      dot: "bg-indigo-500",
    },
  },
  {
    key: "operator",
    label: "Operator",
    name: "Operator (中枢)",
    title: "管家中枢",
    icon: "⚡",
    category: "role",
    badge: "SysAdmin",
    brandTag: "NAS 存储体检 · NPU 算力调度 · 硬件巡检",
    engine: "Echo System Daemon // Hardware Monitor",
    placeholder: "输入意图，例如：执行 NAS ZFS 存储池完整性校验与快照体检...",
    outputPreview:
      "正在执行 OpenZFS 存储池全盘校验；已自动对齐 NAS 物理阵列健康状态。",
    colorScheme: {
      activeBg: "bg-emerald-600 text-white shadow-emerald-500/30",
      activeText: "text-emerald-500 dark:text-emerald-400",
      border: "border-emerald-500/40",
      badgeBg:
        "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      badgeText: "text-emerald-600 dark:text-emerald-400",
      halo: "shadow-[0_0_20px_rgba(16,185,129,0.25)]",
      dot: "bg-emerald-500",
    },
  },
];

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
    side: "right",
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
  agent: BuiltinAgentId;
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
  // Codex 专属推荐
  {
    label: "API 吞吐重构",
    prompt: "重构 FastAPI 异步网关服务与连接池，提升高并发数据流吞吐与响应延迟",
    agent: "codex",
    room: "builder",
  },
  {
    label: "单元测试补全",
    prompt: "为核心状态机与调度器编写 100% 分支覆盖率的 Vitest/Pytest 测试套件",
    agent: "codex",
    room: "builder",
  },
  // Claude 专属推荐
  {
    label: "微内核架构权衡",
    prompt:
      "深度推演 Microkernel 与 Monolithic 架构在边缘 Agentic OS 场景下的稳定性与性能权衡",
    agent: "claude",
    room: "researcher",
  },
  {
    label: "隐私规范白皮书",
    prompt: "起草 Echo OS 本地化端侧安全、沙箱隔离机制与差分隐私协议规范白皮书",
    agent: "claude",
    room: "researcher",
  },
  // Hermes 专属推荐
  {
    label: "传感器接口联动",
    prompt:
      "自动发现并调用 NAS 硬件主板传感器、磁盘 S.M.A.R.T. 与风扇转速控制接口",
    agent: "hermes",
    room: "operator",
  },
  {
    label: "自动化流水线",
    prompt: "编排自动化网络工具流，抓取前沿开源社区进展并生成格式化日报交付",
    agent: "hermes",
    room: "operator",
  },
  // Pi 专属推荐
  {
    label: "人机交互脑暴",
    prompt: "从人类直觉与多模态交互视角，探讨空间计算与桌面 Agent 的融合形态",
    agent: "pi",
    room: "researcher",
  },
  {
    label: "日程待办整理",
    prompt: "梳理今日工作台未完成的高优事项，并给出清晰精炼的番茄钟执行计划",
    agent: "pi",
    room: "researcher",
  },
  // OpenCode 专属推荐
  {
    label: "沙箱数据可视化",
    prompt:
      "在隔离沙箱中读取系统历史负载日志，使用 Matplotlib 绘制 24h 波动趋势图",
    agent: "opencode",
    room: "builder",
  },
  {
    label: "局域网探测脚本",
    prompt: "编写基于 Scapy 的异步轻量级局域网存活主机与端口探测分析脚本",
    agent: "opencode",
    room: "builder",
  },
];

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
  onOpenPhoneMirror,
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
  // （与 local-brain-setup / 侧栏折叠态等 actor 作用域偏好的既有范式一致。）
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
  const [selectedAgent, setSelectedAgent] =
    useState<BuiltinAgentId>("researcher");
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
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const [isAutoRoute, setIsAutoRoute] = useState(false);
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
      if (e.key === "Escape") {
        setIsAgentMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleMenuKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleMenuKeyDown);
    };
  }, [isAgentMenuOpen]);

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
      "theme-dark": "深空",
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

      // Cmd+K / Ctrl+K 或 '/' 快速聚焦意图输入框
      // 仅主键区 '/'（排除小键盘 NumpadDivide），且不位于任何可聚焦控件内——
      // 否则小键盘 '/' 会吃掉输入、按钮内 '/' 会误触发聚焦。
      if (e.key === "/" && e.code !== "NumpadDivide" && !isInput) {
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

      // Space 双态互换；仅当焦点在 body 上（即无控件聚焦）时才全局响应——
      // Space 是按钮/链接的原生激活键，若焦点在可聚焦元素上须让位给默认行为。
      if (
        e.code === "Space" &&
        !isInput &&
        activeTag !== "button" &&
        activeTag !== "a" &&
        activeTag !== "select" &&
        activeTag !== "summary"
      ) {
        e.preventDefault();
        toggleMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandedTaskId, inspectingAsset, mode, toggleMode]);

  const currentAgentDescriptor = useMemo(() => {
    return (
      BUILTIN_AGENTS.find((a) => a.key === selectedAgent) ??
      BUILTIN_AGENTS.find((a) => a.key === "researcher")!
    );
  }, [selectedAgent]);

  const sortedTemplates = useMemo(() => {
    const current = INTENT_TEMPLATES.filter((t) => t.agent === selectedAgent);
    const others = INTENT_TEMPLATES.filter((t) => t.agent !== selectedAgent);
    return [...current, ...others];
  }, [selectedAgent]);

  // 提交意图
  const handleSubmitIntent = () => {
    const trimmed = intentInput.trim();
    if (!trimmed) return;

    let targetAgent = selectedAgent;
    if (isAutoRoute) {
      const lower = trimmed.toLowerCase();
      if (
        /code|git|compile|build|重构|编译|驱动|架构|测试|api|bug/i.test(lower)
      ) {
        targetAgent = "codex";
      } else if (/think|reason|思考|论证|白皮书|哲学|设计模式/i.test(lower)) {
        targetAgent = "claude";
      } else if (/nas|zfs|disk|存储|磁盘|硬件|npu|温度|风扇/i.test(lower)) {
        targetAgent = "operator";
      } else if (/python|pandas|沙箱|脚本|数据分析|matplotlib/i.test(lower)) {
        targetAgent = "opencode";
      } else {
        targetAgent = "researcher";
      }
    }

    const agentNames: Record<BuiltinAgentId, string> = {
      codex: "Codex (工程专家)",
      claude: "Claude (深度思考)",
      hermes: "Hermes (自主工具)",
      pi: "Pi (智能陪伴)",
      opencode: "OpenCode (开源全栈)",
      researcher: "Researcher (调研员)",
      builder: "Builder (架构师)",
      operator: "Operator (管家)",
    };

    const activeDescriptor =
      BUILTIN_AGENTS.find((a) => a.key === targetAgent) ??
      currentAgentDescriptor;

    const newTask: TaskObject = {
      id: `task-${Date.now()}`,
      title: trimmed,
      agent: targetAgent,
      agentName: agentNames[targetAgent],
      status: "running",
      progress: 12,
      outputPreview: `[${activeDescriptor.label} 启动] ${activeDescriptor.outputPreview}`,
      contextLinks: [
        { label: "User Prompt Intent", icon: "file" },
        {
          label:
            activeDescriptor.engine.split("//")[0]?.trim() || "Active Engine",
          icon: "terminal",
        },
      ],
      side: tasks.length % 2 === 0 ? "left" : "right",
    };

    setTasks((prev) => [newTask, ...prev]);
    setIntentInput("");

    // 自动平滑展开为多窗口工作台模式以展示任务执行与产物
    if (mode === "pure") {
      setMode("workspace");
      toast.info("已自适应展开多窗口工作台", {
        description: `检测到任务已分派给 ${agentNames[targetAgent]}，按 Alt+D 可随时切回极简意图`,
      });
    } else {
      toast.success(`新任务已创建并分派给 ${agentNames[targetAgent]}`, {
        description: trimmed,
      });
    }

    onOpenWorkbench?.(trimmed, targetAgent);
  };

  const agentPlaceholders: Record<BuiltinAgentId, string> = {
    codex: "让 Codex 规划软件工程：重构代码架构、生成测试套件或排查系统缺陷...",
    claude: "向 Claude 请教：深度思考推理、技术长文架构设计或跨模块系统权衡...",
    hermes:
      "唤醒 Hermes：调用端侧 Function Calling 工具链与执行自动化多步流...",
    pi: "与 Pi 随心交流：探讨产品灵感、整理思维碎片或敏捷日常问答...",
    opencode:
      "让 OpenCode 在沙箱中执行：运行 Python 数据分析、科学计算与运维脚本...",
    researcher: "输入意图，例如：全网深度调研 DeepSeek V3 架构对比评测...",
    builder: "输入意图，例如：交叉编译 RK3576 ARM64 固件与 NPU 驱动...",
    operator: "输入意图，例如：执行 NAS ZFS 存储池完整性校验与快照体检...",
  };

  const handleApplyTemplate = (tpl: IntentTemplate) => {
    setIntentInput(tpl.prompt);
    setSelectedAgent(tpl.agent);
    setIsAutoRoute(false);
    setActiveRoom(tpl.room);
    inputRef.current?.focus();
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
        handleApplyTemplate(firstTpl);
      }
    }
  };

  return (
    <div
      className={cn(
        "relative flex size-full select-none flex-col overflow-hidden transition-colors duration-500",
        theme,
        theme !== "theme-white" && "dark",
        theme === "theme-white" && "bg-transparent text-slate-800",
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
              <span>深空</span>
            </button>
          </div>
        </div>
      )}

      {/* 桌面主要视口区域 */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 pb-20">
        {/* 中央 Zen Intent 意图核心 */}
        <div
          className={cn(
            "z-30 flex w-full max-w-2xl flex-col items-center text-center transition-all duration-500",
            mode === "workspace"
              ? "absolute inset-x-4 top-6 mx-auto w-auto pointer-events-auto"
              : "translate-y-0 scale-100 opacity-100",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 精致微形态切换胶囊 (Breathing Dual-Mode Switcher) */}
          <button
            type="button"
            onClick={toggleMode}
            className={cn(
              "group mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium shadow-md backdrop-blur-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
              theme === "theme-white"
                ? "border-black/10 bg-white/75 text-slate-700 shadow-black/5 hover:bg-white/90"
                : "border-white/15 bg-slate-900/65 text-slate-200 shadow-black/20 hover:bg-slate-900/85",
              "order-last mb-0 mt-5 border-transparent bg-transparent text-slate-600 shadow-none backdrop-blur-none hover:bg-white/20 dark:bg-transparent dark:text-slate-200",
            )}
            title="点击在【极简意图态】与【多窗口工作台】间切换 (快捷键: Alt+D / Space)"
            aria-label="双态形态切换"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <span
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  mode === "pure" ? "bg-emerald-400" : "bg-blue-400",
                )}
              />
              <span>
                {mode === "pure" ? "打开任务视图" : "多窗口工作台 · 演示任务"}
              </span>
            </span>
            <kbd className="rounded border border-black/10 bg-black/5 px-1.5 py-0.5 text-[9px] font-mono text-slate-400 dark:border-white/10 dark:bg-white/10 dark:text-slate-300">
              Alt+D
            </kbd>
          </button>

          {mode === "pure" && (
            <h1 className="text-2xl font-medium tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              今天想完成什么？
            </h1>
          )}

          {/* 意图输入中心卡片 (Frosted Command Hub) */}
          <div
            data-intent-composer
            className={cn(
              "mt-6 w-full rounded-2xl border p-3.5 backdrop-blur-2xl transition-all duration-300 focus-within:ring-2 focus-within:ring-sky-400/30",
              mode === "workspace" && "mt-0",
              theme === "theme-white"
                ? "border-black/10 bg-white/85 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_20px_45px_-12px_rgba(0,0,0,0.12)] focus-within:border-blue-500/40"
                : "border-sky-400/20 bg-slate-900/80 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_35px_rgba(56,189,248,0.14),0_20px_50px_-10px_rgba(0,0,0,0.5)] focus-within:border-sky-400/50 focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_0_50px_rgba(56,189,248,0.26),0_25px_60px_-10px_rgba(0,0,0,0.6)]",
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
                placeholder={agentPlaceholders[selectedAgent]}
                className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={handleSubmitIntent}
                disabled={!intentInput.trim()}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
                  intentInput.trim()
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/30 hover:scale-105 active:scale-95"
                    : "cursor-not-allowed bg-slate-800/20 text-slate-400 opacity-40 dark:bg-white/10 dark:text-slate-500",
                )}
                aria-label="提交意图"
                title={
                  intentInput.trim() ? "提交意图 (Enter)" : "请输入意图内容"
                }
              >
                <ArrowRightIcon className="size-4" />
              </button>
            </div>

            {/* 底部精炼功能栏：只有一行！左侧是优雅的 Agent 弹窗选择器，右侧是快捷推荐 */}
            <div className="relative mt-2.5 flex items-center justify-between gap-3 border-t border-black/5 pt-2.5 dark:border-white/10">
              {/* 左侧：Agent 弹窗选择触发器 (完全贴合 Image 2 的纯净质感与层级规范) */}
              <div
                className="relative flex shrink-0 items-center gap-1.5"
                ref={agentMenuRef}
              >
                <span className="select-none text-[11px] font-semibold text-slate-400">
                  分派:
                </span>
                <button
                  type="button"
                  data-testid="agent-selector-trigger"
                  onClick={() => setIsAgentMenuOpen((v) => !v)}
                  className={cn(
                    "group inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all duration-150 active:scale-95",
                    "border-black/10 bg-black/[0.04] text-slate-700 hover:bg-black/[0.07] hover:text-slate-900",
                    "dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white",
                    isAgentMenuOpen &&
                      "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:border-blue-400/40 dark:bg-blue-400/15 dark:text-blue-300",
                  )}
                  title={`当前分派：${isAutoRoute ? "自动选择" : currentAgentDescriptor.name} (点击切换)`}
                  aria-label={`分派 Agent: ${isAutoRoute ? "自动" : currentAgentDescriptor.label}`}
                  aria-expanded={isAgentMenuOpen}
                >
                  <span className="text-sm">
                    {isAutoRoute ? "✨" : currentAgentDescriptor.icon}
                  </span>
                  <span className="font-semibold">
                    {isAutoRoute ? "自动" : currentAgentDescriptor.label}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-400">
                    {isAutoRoute
                      ? "(智能路由)"
                      : `(${currentAgentDescriptor.badge})`}
                  </span>
                  <ChevronDownIcon
                    className={cn(
                      "size-3 text-slate-400 transition-transform duration-200 group-hover:text-slate-600 dark:group-hover:text-slate-200",
                      isAgentMenuOpen &&
                        "rotate-180 text-blue-500 dark:text-blue-400",
                    )}
                  />
                </button>

                {/* 弹出式 Agent 选择菜单 (匹配 Image 2 规范) */}
                {isAgentMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Agent 选择菜单"
                    className={cn(
                      "absolute bottom-full left-0 mb-2 z-50 w-72 sm:w-80 max-h-[380px] overflow-y-auto rounded-2xl border p-1.5 shadow-2xl backdrop-blur-xl transition-all duration-150 animate-in fade-in-0 zoom-in-95",
                      "border-black/10 bg-white/95 text-slate-800 shadow-slate-900/15",
                      "dark:border-white/15 dark:bg-slate-900/95 dark:text-slate-100 dark:shadow-black/50",
                      "[scrollbar-width:thin]",
                    )}
                  >
                    {/* 选项 0: ✨ 自动 */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsAutoRoute(true);
                        setIsAgentMenuOpen(false);
                        toast.info("已切换为自动分派模式", {
                          description:
                            "系统将根据您的意图关键词自动路由至最合适的 Agent 引擎",
                        });
                      }}
                      className={cn(
                        "group flex w-full cursor-pointer select-none items-start gap-2.5 rounded-xl p-2.5 text-left transition-colors",
                        isAutoRoute
                          ? "bg-blue-500/10 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300 font-medium"
                          : "hover:bg-black/5 dark:hover:bg-white/5",
                      )}
                    >
                      <span className="mt-0.5 text-base">✨</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-900 dark:text-white">
                            自动
                          </span>
                          {isAutoRoute && (
                            <CheckIcon className="size-4 text-blue-600 dark:text-blue-400 shrink-0" />
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          按任务自动选择 · 当前 {currentAgentDescriptor.label}
                        </p>
                      </div>
                    </button>

                    <div className="my-1 h-px bg-black/5 dark:bg-white/10" />

                    {/* 分组 1: 旗舰模型组 */}
                    <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      <span>旗舰模型 (Frontier Agents)</span>
                      <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-mono text-sky-600 dark:bg-sky-500/20 dark:text-sky-300">
                        Omarchy Matrix
                      </span>
                    </div>

                    {BUILTIN_AGENTS.filter(
                      (a) => a.category === "frontier",
                    ).map((ag) => {
                      const isSelected =
                        !isAutoRoute && selectedAgent === ag.key;
                      return (
                        <button
                          key={ag.key}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setIsAutoRoute(false);
                            setSelectedAgent(ag.key);
                            setIsAgentMenuOpen(false);
                          }}
                          className={cn(
                            "group flex w-full cursor-pointer select-none items-start gap-2.5 rounded-xl p-2.5 text-left transition-colors",
                            isSelected
                              ? "bg-blue-500/10 dark:bg-blue-400/15 font-medium"
                              : "hover:bg-black/5 dark:hover:bg-white/5",
                          )}
                        >
                          <span className="mt-0.5 text-base">{ag.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                                  {ag.label}
                                </span>
                                <span className="rounded bg-black/5 px-1 py-0.2 text-[9px] font-mono text-slate-400 dark:bg-white/10 dark:text-slate-400">
                                  {ag.badge}
                                </span>
                              </div>
                              {isSelected && (
                                <CheckIcon className="size-4 text-blue-600 dark:text-blue-400 shrink-0" />
                              )}
                            </div>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                              使用 {ag.label} 身份，{ag.brandTag}
                            </p>
                            <p className="mt-0.5 text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                              {ag.engine} · 运行就绪
                            </p>
                          </div>
                        </button>
                      );
                    })}

                    <div className="my-1 h-px bg-black/5 dark:bg-white/10" />

                    {/* 分组 2: 系统专属职能 */}
                    <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      系统专属职能 (System Roles)
                    </div>

                    {BUILTIN_AGENTS.filter((a) => a.category === "role").map(
                      (ag) => {
                        const isSelected =
                          !isAutoRoute && selectedAgent === ag.key;
                        return (
                          <button
                            key={ag.key}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setIsAutoRoute(false);
                              setSelectedAgent(ag.key);
                              setIsAgentMenuOpen(false);
                            }}
                            className={cn(
                              "group flex w-full cursor-pointer select-none items-start gap-2.5 rounded-xl p-2.5 text-left transition-colors",
                              isSelected
                                ? "bg-blue-500/10 dark:bg-blue-400/15 font-medium"
                                : "hover:bg-black/5 dark:hover:bg-white/5",
                            )}
                          >
                            <span className="mt-0.5 text-base">{ag.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                                  {ag.title} ({ag.label})
                                </span>
                                {isSelected && (
                                  <CheckIcon className="size-4 text-blue-600 dark:text-blue-400 shrink-0" />
                                )}
                              </div>
                              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                                {ag.brandTag}
                              </p>
                              <p className="mt-0.5 text-[10px] font-mono text-slate-400">
                                系统原生常驻在场
                              </p>
                            </div>
                          </button>
                        );
                      },
                    )}
                  </div>
                )}
              </div>

              <details
                className={cn(
                  "relative ml-auto text-left",
                  mode === "pure" && "hidden",
                )}
              >
                <summary className="cursor-pointer rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-black/5 dark:text-slate-300">
                  示例任务
                </summary>
                <div className="absolute right-0 top-full z-50 mt-2 grid max-h-64 w-72 max-w-[80vw] gap-2 overflow-y-auto rounded-2xl border border-black/10 bg-white p-3 shadow-xl dark:border-white/15 dark:bg-slate-900">
                  {" "}
                  {sortedTemplates.map((tpl: IntentTemplate) => {
                    const isCurrentAgent = selectedAgent === tpl.agent;
                    return (
                      <button
                        key={tpl.label}
                        type="button"
                        onClick={(event) => {
                          handleApplyTemplate(tpl);
                          event.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                        }}
                        className={cn(
                          "inline-flex shrink-0 cursor-pointer select-none items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium transition-all duration-150 active:scale-95",
                          isCurrentAgent
                            ? "border-blue-500/30 bg-blue-500/10 font-medium text-blue-600 dark:border-blue-400/30 dark:bg-blue-400/15 dark:text-blue-300"
                            : "border-black/5 bg-black/5 text-slate-500 hover:bg-black/10 hover:text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200",
                        )}
                        title={`${tpl.prompt} (分派给 ${tpl.agent})`}
                      >
                        <SparklesIcon
                          className={cn(
                            "size-2.5 shrink-0",
                            isCurrentAgent
                              ? "text-blue-500 dark:text-blue-400"
                              : "text-slate-400 opacity-60",
                          )}
                        />
                        <span>{tpl.label}</span>
                      </button>
                    );
                  })}
                </div>
              </details>
            </div>
          </div>
        </div>

        {/* Task Objects 任务窗口卡片 (多窗口工作区一级公民) */}
        <div className="pointer-events-none absolute inset-x-5 bottom-28 top-[clamp(14rem,27vh,19rem)] z-20 mx-auto flex max-w-[1120px] flex-col items-center justify-start gap-6 overflow-y-auto px-1 pb-6 lg:flex-row lg:items-start">
          {(() => {
            const filteredTasks =
              activeRoom === "all"
                ? tasks
                : tasks.filter((t) => t.agent === activeRoom);

            const cards = filteredTasks.slice(0, 2).map((task) => {
              const isLeft = task.side === "left";
              const cardPos = cardPositions[task.id] || { x: 0, y: 0 };
              const isDragging = activeDraggingCard === task.id;
              return (
                <div
                  key={task.id}
                  data-task-card="true"
                  className={cn(
                    "flex w-full min-w-0 shrink-0 lg:shrink max-w-[548px] flex-col overflow-hidden rounded-[22px] border shadow-2xl backdrop-blur-2xl transition-all duration-500",
                    isDragging &&
                      "transition-none shadow-[0_30px_70px_rgba(0,0,0,0.5)] ring-2 ring-blue-500/40",
                    theme === "theme-white"
                      ? "border-white/60 bg-white/85 text-slate-800 shadow-[0_22px_45px_-12px_rgba(180,155,120,0.22),0_1px_3px_rgba(0,0,0,0.05)] "
                      : "border-white/15 bg-slate-900/90 text-slate-100 shadow-black/60",
                    // 双态退散核心动效：pure 模式彻底退散消失（opacity-0 + invisible），绝对不在背景形成重叠鬼影
                    mode === "pure" &&
                      (isLeft
                        ? "-translate-x-[120%] scale-90 opacity-0 pointer-events-none invisible"
                        : "translate-x-[120%] scale-90 opacity-0 pointer-events-none invisible"),
                    mode === "workspace" &&
                      "scale-100 opacity-100 pointer-events-auto visible",
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
                    className="flex h-11 cursor-grab active:cursor-grabbing select-none items-center justify-between px-5 pt-2"
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
                      <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">
                        {task.agentName.split(" ")[0]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[13px] font-semibold",
                          task.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                        )}
                      >
                        {task.status === "completed"
                          ? "已完成 100%"
                          : `${task.status === "running" ? "执行中" : "已暂停"} ${task.progress}%`}
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
                  <div className="flex flex-1 flex-col overflow-hidden">
                    {/* Context Pane */}
                    <details className="order-2 border-t border-black/5 px-5 py-3 dark:border-white/10">
                      <summary className="cursor-pointer text-[13px] font-medium text-slate-600 dark:text-slate-300">
                        上下文关联 · {task.contextLinks.length} 项资料
                      </summary>
                      <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
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
                              <FolderIcon className="size-4 shrink-0 text-slate-500" />
                            )}
                            {link.icon === "db" && (
                              <DatabaseIcon className="size-4 shrink-0 text-slate-500" />
                            )}
                            {link.icon === "terminal" && (
                              <TerminalIcon className="size-4 shrink-0 text-slate-500" />
                            )}
                            <span className="truncate">{link.label}</span>
                          </button>
                        ))}
                      </div>
                    </details>

                    {/* Live Stream / Progress Pane */}
                    <div className="flex min-w-0 flex-1 flex-col gap-5 p-5">
                      <div>
                        <h4 className="min-h-[3.25rem] text-[17px] font-semibold leading-relaxed tracking-tight">
                          {task.title}
                        </h4>
                        <div className="mt-3 min-h-[4.5rem] text-sm leading-6 text-slate-600 dark:text-slate-300">
                          {task.outputPreview}
                        </div>

                        {/* Agent 接力协作纽带微条 */}
                        {task.handover && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveRoom(
                                agentToOpenRoom(task.handover!.toAgent),
                              );
                              toast.success(
                                `已穿梭至 ${task.handover!.toAgentName} 的空间`,
                                {
                                  description: task.handover!.note,
                                },
                              );
                            }}
                            className="mt-4 flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg py-2 text-left text-[13px] transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-white/10"
                            title={`点击跳转至 ${task.handover.toAgentName} 的协同工坊`}
                            data-testid={`handover-pill-${task.id}`}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="shrink-0 font-medium text-slate-600 dark:text-slate-300">
                                ⮑ 接力协作
                              </span>
                              <span className="truncate text-slate-500 dark:text-slate-400">
                                产物 {task.handover.artifactName} 交付至
                              </span>
                            </div>
                            <span className="shrink-0 font-medium text-slate-600 dark:text-slate-300">
                              {task.handover.toAgentName.split(" ")[0]} →
                            </span>
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <span className="text-[13px] text-slate-500 dark:text-slate-400">
                          演示任务
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setExpandedTaskId(task.id)}
                            className="rounded-xl px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                          >
                            查看详情
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenWorkbench?.(task.title)}
                            className="rounded-xl bg-blue-600 px-3 py-2 text-[13px] font-semibold text-white transition-all hover:bg-blue-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
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
                    "ml-auto flex h-[360px] w-full max-w-[500px] flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-2xl transition-all duration-500",
                    isDraggingHud &&
                      "transition-none shadow-[0_30px_70px_rgba(0,0,0,0.5)] ring-2 ring-blue-500/40",
                    theme === "theme-white"
                      ? "border-black/10 bg-white/90 text-slate-800 shadow-slate-300/40"
                      : "border-white/15 bg-slate-900/90 text-slate-100 shadow-black/60",
                    mode === "pure" &&
                      "translate-x-[120%] scale-90 opacity-0 pointer-events-none invisible",
                    mode === "workspace" &&
                      "scale-100 opacity-100 pointer-events-auto visible",
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

            if (cards.length === 0) {
              if (mode === "pure") return null;
              return (
                <div
                  data-task-card="true"
                  className={cn(
                    "pointer-events-auto mx-auto flex h-36 w-full max-w-md flex-col items-center justify-center rounded-2xl border border-dashed p-4 text-center backdrop-blur-md transition-all duration-500 self-end mb-6 sm:mb-10",
                    theme === "theme-white"
                      ? "border-black/15 bg-white/60 text-slate-600 shadow-sm"
                      : "border-white/15 bg-slate-900/60 text-slate-300 shadow-sm",
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <BotIcon className="size-7 text-slate-400" />
                  <p className="mt-2 text-xs font-semibold">
                    该协同空间暂无进行中的任务
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    可在上方意图条输入目标，直接指派给该空间专属 Agent
                  </p>
                </div>
              );
            }

            return cards;
          })()}
        </div>

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
          demo
          initialCollapsed
          visible={pipVisible && mode === "workspace"}
          task={activePipTask}
          onOpenPhoneMirror={onOpenPhoneMirror}
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
