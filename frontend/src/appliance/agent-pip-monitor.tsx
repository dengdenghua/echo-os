"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  AlertCircleIcon,
  CastIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  GripHorizontalIcon,
  Maximize2Icon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
import { LiveDeviceList } from "./live-device-list";
import type { LinkedDevice } from "./device-link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  clampToWorkArea,
  getDesktopWorkArea,
} from "./desktop-screen-bounds";

export interface PipTask {
  id: string;
  title: string;
  agentName: string;
  agentType: string;
  stepText: string;
  progress: number;
  needsApproval?: boolean;
  approvalRiskMessage?: string;
}

export interface AgentPipMonitorProps {
  task?: PipTask;
  visible?: boolean;
  onExpandToWindow?: () => void;
  onClose?: () => void;
  onApprove?: (task: PipTask) => void;
  onReject?: (task: PipTask) => void;
  onOpenPhoneMirror?: (device: LinkedDevice) => void;
  className?: string;
}

export const DEFAULT_PIP_TASK: PipTask = {
  id: "pip-task-live",
  title: "RK3576 驱动装配与编译",
  agentName: "Builder (架构师)",
  agentType: "builder",
  stepText:
    "正在执行交叉编译: aarch64-linux-gnu-gcc -O2 rknpu2.c -o rknpu2.ko...",
  progress: 68,
  needsApproval: true,
  approvalRiskMessage:
    "申请写入系统内核模块 /lib/modules/6.1.0/kernel/drivers/rknpu",
};

export function AgentPipMonitor({
  task = DEFAULT_PIP_TASK,
  visible = true,
  onExpandToWindow,
  onClose,
  onApprove,
  onReject,
  onOpenPhoneMirror,
  className,
}: AgentPipMonitorProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [approvalHandled, setApprovalHandled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showCastMenu, setShowCastMenu] = useState(false);

  // 自由拖拽定位逻辑
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    initialLeft: number;
    initialTop: number;
    isPill: boolean;
  } | null>(null);

  // 窗口尺寸或多显示器变化时重新限制坐标，防止被遮挡在屏幕之外
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        if (!prev) return null;
        return clampToWorkArea(prev.x, prev.y, 320, 240);
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 当外部显式恢复 visible 时重置 dismissed 状态
  useEffect(() => {
    if (visible) {
      setIsDismissed(false);
    }
  }, [visible]);

  if (!visible || isDismissed) return null;

  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    isPill = false,
  ) => {
    // 忽略按钮、链接等可交互子元素点击
    if (
      (e.target as HTMLElement).closest(
        "button, a, input, select, textarea, [role='menu']",
      )
    ) {
      return;
    }
    if (e.button !== 0) return; // 仅左键

    const targetRef = isPill ? pillRef.current : containerRef.current;
    if (!targetRef) return;

    // 拖拽启动时刷新一次多屏真实物理边界
    void getDesktopWorkArea(true);

    const rect = targetRef.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialLeft: rect.left,
      initialTop: rect.top,
      isPill,
    };
    setIsDragging(true);

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!dragRef.current) return;
      const el = isPill ? pillRef.current : containerRef.current;
      if (!el) return;

      const dx = moveEvent.clientX - dragRef.current.startX;
      const dy = moveEvent.clientY - dragRef.current.startY;
      const newLeft = dragRef.current.initialLeft + dx;
      const newTop = dragRef.current.initialTop + dy;

      const width = el.offsetWidth || 320;
      const height = el.offsetHeight || 200;

      // 物理工作区安全区限制，跨副屏与负坐标精准贴靠
      const clamped = clampToWorkArea(newLeft, newTop, width, height);
      setPosition(clamped);
    };

    const onPointerUp = () => {
      setIsDragging(false);
      dragRef.current = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // 双击标题栏还原至默认右下角
  const handleResetPosition = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest("button, a, input, select, textarea")
    ) {
      return;
    }
    setPosition(null);
    toast.info("画中画已还原至默认位置");
  };

  const handleApprove = () => {
    setApprovalHandled(true);
    onApprove?.(task);
    toast.success("已批准执行高危操作", {
      description: task.approvalRiskMessage,
    });
  };

  const handleReject = () => {
    setApprovalHandled(true);
    onReject?.(task);
    toast.error("已拦截并拒绝高危操作");
  };

  const agentFirstName = (task.agentName || "Agent").split(" ")[0];

  // 极简折叠态：仅留一个微脉冲呼吸胶囊 (同样支持拖动)
  if (collapsed) {
    return (
      <div
        ref={pillRef}
        role="button"
        tabIndex={0}
        aria-label="展开 Codex 画中画监控"
        onPointerDown={(e) => handlePointerDown(e, true)}
        onDoubleClick={handleResetPosition}
        className={cn(
          "fixed z-50 flex cursor-grab items-center gap-2 rounded-full border border-black/10 bg-white/85 px-3 py-1.5 shadow-xl backdrop-blur-xl transition-all hover:scale-105 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:cursor-grabbing dark:border-white/15 dark:bg-slate-900/85 dark:hover:bg-slate-900",
          !position && "bottom-6 right-6",
          isDragging && "cursor-grabbing select-none transition-none",
          className,
        )}
        style={
          position
            ? {
                left: `${position.x}px`,
                top: `${position.y}px`,
                right: "auto",
                bottom: "auto",
              }
            : undefined
        }
        onClick={() => {
          if (!isDragging) {
            setCollapsed(false);
          }
        }}
        onKeyDown={(e: ReactKeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setCollapsed(false);
          }
        }}
        title="点击展开 · 按住拖拽 · 双击复位"
      >
        <span className="relative flex size-2 items-center justify-center">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-blue-500" />
        </span>
        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
          {agentFirstName} PiP · {task.progress}%
        </span>
        <ChevronUpIcon className="size-3 text-slate-400" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed z-50 flex w-80 flex-col overflow-hidden rounded-2xl border border-black/10 bg-white/90 text-slate-800 shadow-2xl shadow-black/15 backdrop-blur-2xl dark:border-white/15 dark:bg-slate-900/90 dark:text-slate-100",
        !position && "bottom-6 right-6",
        isDragging ? "select-none transition-none" : "transition-all",
        className,
      )}
      style={
        position
          ? {
              left: `${position.x}px`,
              top: `${position.y}px`,
              right: "auto",
              bottom: "auto",
            }
          : undefined
      }
      data-testid="agent-pip-monitor"
    >
      {/* 头部：Agent 身份、状态灯与控制按钮 (支持拖拽移动与双击还原) */}
      <div
        data-testid="pip-drag-handle"
        onPointerDown={(e) => handlePointerDown(e, false)}
        onDoubleClick={handleResetPosition}
        className={cn(
          "flex h-8 select-none items-center justify-between border-b border-black/5 bg-black/[0.02] px-3 dark:border-white/10 dark:bg-white/[0.02]",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        title="按住拖拽移动窗口 · 双击还原至右下角"
      >
        <div className="flex items-center gap-1.5">
          <GripHorizontalIcon className="size-3 text-slate-400 opacity-60 hover:opacity-100" />
          <span className="relative flex size-2 items-center justify-center">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Codex PiP 画中画 · {agentFirstName}
          </span>
        </div>

        <div className="flex items-center gap-1 text-slate-400">
          <div className="relative">
            <button type="button" onClick={() => setShowCastMenu((value) => !value)} aria-label="选择手机" title="选择手机" className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"><CastIcon className="size-3" /></button>
            {showCastMenu && <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-black/10 bg-white/95 p-3 text-slate-800 shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-slate-900/95 dark:text-slate-100">
              <LiveDeviceList onOpen={onOpenPhoneMirror ? (device) => { setShowCastMenu(false); onOpenPhoneMirror(device); } : undefined} />
            </div>}
          </div>

          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded p-1 hover:bg-black/5 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
            title="最小化为胶囊"
            aria-label="最小化"
          >
            <ChevronDownIcon className="size-3" />
          </button>
          <button
            type="button"
            onClick={onExpandToWindow}
            className="rounded p-1 hover:bg-black/5 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
            title="放大为全屏窗口"
            aria-label="放大为全屏窗口"
          >
            <Maximize2Icon className="size-3" />
          </button>
          <button
            type="button"
            onClick={() => {
              setIsDismissed(true);
              onClose?.();
            }}
            className="rounded p-1 hover:bg-black/5 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
            title="关闭画中画"
            aria-label="关闭画中画"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      </div>

      <div className="p-3">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="truncate pr-2">{task.title}</span>
          <span className="shrink-0 text-[10px] text-blue-600 dark:text-blue-400 font-mono">
            {task.progress}%
          </span>
        </div>

        {/* 紧凑进度条 */}
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${task.progress}%` }}
          />
        </div>

        {/* 控制台微预览 */}
        <div className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-black/[0.04] p-2 font-mono text-[10px] leading-relaxed text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">
          <TerminalIcon className="mt-0.5 size-3 shrink-0 text-slate-400" />
          <span className="line-clamp-2">{task.stepText}</span>
        </div>

        {/* 关键安全决策卡片 (Human-in-the-loop 快速批准) */}
        {task.needsApproval && !approvalHandled && (
          <div className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-50/70 p-2 text-[11px] dark:border-amber-400/30 dark:bg-amber-950/40">
            <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
              <AlertCircleIcon className="size-3.5 shrink-0" />
              <span>需要操作授权</span>
            </div>
            <p className="mt-1 text-[10px] text-slate-600 dark:text-slate-300">
              {task.approvalRiskMessage}
            </p>
            <div className="mt-2 flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={handleReject}
                className="rounded-md border border-black/10 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:bg-white/10 dark:text-slate-300"
              >
                拦截
              </button>
              <button
                type="button"
                onClick={handleApprove}
                className="rounded-md bg-amber-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm hover:bg-amber-700"
              >
                批准放行
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
