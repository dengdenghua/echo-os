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
import { clampToWorkArea, getDesktopWorkArea } from "./desktop-screen-bounds";

export interface PipTask {
  id: string;
  title: string;
  agentName: string;
  agentType: string;
  stepText: string;
  /** null 表示 Agent 没有汇报进度，界面显示"进行中"而不是一个假的百分比。 */
  progress: number | null;
  /**
   * Set when the task has stopped (failed, finished, cancelled). The monitor
   * then shows this state instead of a running progress bar.
   */
  endedLabel?: string;
  needsApproval?: boolean;
  approvalRiskMessage?: string;
}

export interface AgentPipMonitorProps {
  task?: PipTask;
  visible?: boolean;
  demo?: boolean;
  initialCollapsed?: boolean;
  onExpandToWindow?: () => void;
  onClose?: () => void;
  onApprove?: (task: PipTask) => void | Promise<void>;
  onReject?: (task: PipTask) => void | Promise<void>;
  /** 审批需要完整上下文时，只提供一个入口，把决定交给任务空间完成。 */
  onReviewApproval?: (task: PipTask) => void;
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
  demo = task === DEFAULT_PIP_TASK,
  initialCollapsed = false,
  onExpandToWindow,
  onClose,
  onApprove,
  onReject,
  onReviewApproval,
  onOpenPhoneMirror,
  className,
}: AgentPipMonitorProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [approvalHandled, setApprovalHandled] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);
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
        const element = collapsed ? pillRef.current : containerRef.current;
        const width = element?.offsetWidth || 320;
        const height = element?.offsetHeight || 240;
        const bounded = clampToWorkArea(prev.x, prev.y, width, height);
        return {
          ...bounded,
          y: Math.min(
            bounded.y,
            Math.max(32, window.innerHeight - height - 96),
          ),
        };
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [collapsed]);

  useEffect(() => {
    setApprovalHandled(false);
  }, [task.id, task.needsApproval]);

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
      setPosition({
        ...clamped,
        y: Math.min(clamped.y, Math.max(32, window.innerHeight - height - 96)),
      });
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

  const handleDecision = async (approve: boolean) => {
    const callback = approve ? onApprove : onReject;
    if (demo || !callback || approvalPending) return;
    setApprovalPending(true);
    try {
      await callback(task);
      setApprovalHandled(true);
      if (approve)
        toast.success("已批准执行高危操作", {
          description: task.approvalRiskMessage,
        });
      else toast.error("已拦截并拒绝高危操作");
    } catch {
      toast.error("审批未完成，请重试");
    } finally {
      setApprovalPending(false);
    }
  };

  const agentFirstName = (task.agentName || "Agent").split(" ")[0];
  const ended = Boolean(task.endedLabel);
  const progressLabel =
    task.endedLabel ?? (task.progress == null ? "进行中" : `${task.progress}%`);
  // 收起的胶囊只有一行字：等你批准比进度更值得被看见。
  const pillLabel =
    task.needsApproval && !approvalHandled ? "待批准" : progressLabel;

  // 极简折叠态：仅留一个微脉冲呼吸胶囊 (同样支持拖动)
  if (collapsed) {
    return (
      <div
        ref={pillRef}
        role="button"
        tabIndex={0}
        aria-label="展开任务画中画"
        onPointerDown={(e) => handlePointerDown(e, true)}
        onDoubleClick={handleResetPosition}
        className={cn(
          "fixed z-50 flex cursor-grab items-center gap-2 rounded-full border border-black/10 bg-card/85 px-3 py-1.5 shadow-xl backdrop-blur-xl transition-all hover:scale-105 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-core/30 active:cursor-grabbing",
          !position && "bottom-24 right-4",
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
          <span
            className={cn(
              "relative inline-flex size-1.5 rounded-full",
              ended ? "bg-muted-foreground" : "bg-core",
            )}
          />
        </span>
        <span className="text-[12px] font-semibold text-foreground">
          {agentFirstName} 画中画 · {pillLabel}
          {demo ? " · 演示" : ""}
        </span>
        <ChevronUpIcon className="size-3 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed z-50 flex w-80 max-w-[calc(100vw-32px)] max-h-[calc(100dvh-140px)] flex-col overflow-y-auto rounded-2xl border border-black/10 bg-card/90 text-foreground shadow-2xl shadow-black/15 backdrop-blur-2xl",
        !position && "bottom-24 right-4",
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
          "flex h-8 select-none items-center justify-between border-b border-black/5 bg-black/[0.02] px-3  dark:bg-white/[0.02]",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        title="按住拖拽移动窗口 · 双击还原至右下角"
      >
        <div className="flex items-center gap-1.5">
          <GripHorizontalIcon className="size-3 text-muted-foreground opacity-60 hover:opacity-100" />
          <span className="relative flex size-2 items-center justify-center">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-core opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-core" />
          </span>
          <span className="text-[12px] font-bold uppercase text-muted-foreground">
            任务画中画 · {agentFirstName}
          </span>
        </div>

        <div className="flex items-center gap-1 text-muted-foreground">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowCastMenu((value) => !value)}
              aria-label="选择手机"
              title="选择手机"
              className="rounded p-1 hover:bg-black/5 "
            >
              <CastIcon className="size-3" />
            </button>
            {showCastMenu && (
              <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-black/10 bg-card/95 p-3 text-foreground shadow-2xl backdrop-blur-xl">
                <LiveDeviceList
                  onOpen={
                    onOpenPhoneMirror
                      ? (device) => {
                          setShowCastMenu(false);
                          onOpenPhoneMirror(device);
                        }
                      : undefined
                  }
                />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded p-1 hover:bg-black/5 hover:text-foreground"
            title="最小化为胶囊"
            aria-label="最小化"
          >
            <ChevronDownIcon className="size-3" />
          </button>
          <button
            type="button"
            onClick={onExpandToWindow}
            className="rounded p-1 hover:bg-black/5 hover:text-foreground"
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
            className="rounded p-1 hover:bg-black/5 hover:text-foreground"
            title="关闭画中画"
            aria-label="关闭画中画"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      </div>

      <div className="p-3">
        {demo && (
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            演示预览 · 非实时数据，不执行操作
          </p>
        )}
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="truncate pr-2">{task.title}</span>
          <span
            className={cn(
              "shrink-0 text-[12px] font-mono",
              ended ? "text-muted-foreground" : "text-core",
            )}
          >
            {progressLabel}
          </span>
        </div>

        {/* 紧凑进度条 */}
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-black/5 ">
          <div
            className={cn(
              "h-full bg-primary transition-all duration-300",
              !ended && task.progress == null && "w-1/3 animate-pulse",
              ended && "bg-muted-foreground/50",
            )}
            style={
              ended
                ? { width: `${task.progress ?? 100}%` }
                : task.progress == null
                  ? undefined
                  : { width: `${task.progress}%` }
            }
          />
        </div>

        {/* 控制台微预览 */}
        <div className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-black/[0.04] p-2 font-mono text-[12px] leading-relaxed text-muted-foreground dark:bg-white/[0.04]">
          <TerminalIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
          <span className="line-clamp-2">{task.stepText}</span>
        </div>

        {/* 关键安全决策卡片 (Human-in-the-loop 快速批准) */}
        {task.needsApproval && !approvalHandled && (
          <div className="mt-2.5 rounded-lg border border-warning/30 bg-warning/10 p-2 text-[12px]">
            <div className="flex items-center gap-1.5 font-semibold text-warning">
              <AlertCircleIcon className="size-3.5 shrink-0" />
              <span>需要操作授权</span>
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {task.approvalRiskMessage}
            </p>
            {onReviewApproval ? (
              <div className="mt-2 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => onReviewApproval(task)}
                  className="rounded-md bg-warning px-2 py-0.5 text-[12px] font-semibold text-primary-foreground shadow-sm hover:bg-warning"
                >
                  去处理
                </button>
              </div>
            ) : (
              <div className="mt-2 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleDecision(false)}
                  disabled={demo || !onReject || approvalPending}
                  className="rounded-md border border-black/10 bg-card px-2 py-0.5 text-[12px] font-medium text-muted-foreground hover:bg-background disabled:cursor-not-allowed disabled:opacity-45"
                >
                  拦截
                </button>
                <button
                  type="button"
                  onClick={() => void handleDecision(true)}
                  disabled={demo || !onApprove || approvalPending}
                  className="rounded-md bg-warning px-2 py-0.5 text-[12px] font-semibold text-primary-foreground shadow-sm hover:bg-warning disabled:cursor-not-allowed disabled:opacity-45"
                >
                  批准放行
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
