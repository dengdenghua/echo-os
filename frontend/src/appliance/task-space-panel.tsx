import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BotIcon,
  CheckCircle2Icon,
  CirclePauseIcon,
  ClockAlertIcon,
  Clock3Icon,
  GitBranchIcon,
  Loader2Icon,
  MessageSquareTextIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { TaskApprovalDialog } from "./task-approval-dialog";
import { AgentFileChangesPanel } from "./agent-file-changes-panel";
import { TaskChangesPanel } from "./task-changes-panel";
import {
  APPROVAL_EXPIRED,
  APPROVAL_EXPIRED_DETAIL,
  APPROVAL_SESSION_CHANGED,
  APPROVAL_SESSION_CHANGED_AFTER_SUBMIT,
  APPROVAL_UNVERIFIABLE,
  approvalDeadlineText,
  approvalDecisionErrorMessage,
  type ApprovalConsent,
  assertApprovalConsent,
  approvalConsentSessionCurrent,
  captureApprovalConsent,
  isExpiredApproval,
} from "./task-approval-consent";
import {
  SystemAppFrame,
  SystemAppLightsSpacer,
  useInSystemAppWindow,
  SystemAppTrafficLights,
} from "@/appliance/system-app-window";
import {
  ACTIVE_TASK_STATUSES,
  FAILED_TASK_STATUSES,
  type EchoTaskProjection,
  type EchoTaskProjectionResponse,
  type EchoTaskStatus,
} from "@/appliance/task-space";

type TaskFilter =
  | "all"
  | "active"
  | "waiting"
  | "paused"
  | "recovery"
  | "completed"
  | "failed";

const STATUS: Record<
  string,
  { label: string; color: string; icon: typeof Clock3Icon }
> = {
  pending: {
    label: "准备中",
    color: "text-muted-foreground",
    icon: Clock3Icon,
  },
  running: { label: "进行中", color: "text-core", icon: Loader2Icon },
  waiting_approval: {
    label: "等待确认",
    color: "text-warning",
    icon: ShieldCheckIcon,
  },
  paused: {
    label: "已暂停",
    color: "text-muted-foreground",
    icon: CirclePauseIcon,
  },
  verifying: { label: "验证中", color: "text-core", icon: Loader2Icon },
  repairing: { label: "修复中", color: "text-warning", icon: Loader2Icon },
  completed: {
    label: "已完成",
    color: "text-core",
    icon: CheckCircle2Icon,
  },
  failed: { label: "失败", color: "text-breach", icon: AlertCircleIcon },
  disconnected: {
    label: "已断开",
    color: "text-breach",
    icon: AlertCircleIcon,
  },
  cancelled: { label: "已取消", color: "text-muted-foreground", icon: XIcon },
};

const UNKNOWN_STATUS = {
  label: "状态未知",
  color: "text-muted-foreground",
  icon: AlertCircleIcon,
} satisfies (typeof STATUS)[string];

const FILTERS: Array<{ id: TaskFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "active", label: "进行中" },
  { id: "waiting", label: "待确认" },
  { id: "paused", label: "已暂停" },
  { id: "recovery", label: "待恢复" },
  { id: "completed", label: "已完成" },
  { id: "failed", label: "异常" },
];

// Lease health reaches the panel as runtime identifiers (expired,
// takeover_for_approval …). The owner reads what they mean; an identifier
// the panel does not know is left out rather than shown raw.
const LEASE_STATE_LABELS: Record<string, string> = {
  ok: "正常",
  expired: "已失效",
  missing_lease: "没有租约",
  terminal: "已结束",
};
const RECOVERY_ACTION_LABELS: Record<string, string> = {
  takeover: "建议：接管任务",
  takeover_and_resume: "建议：接管后从检查点继续",
  takeover_for_approval: "建议：接管后再处理审批",
  resume_from_checkpoint: "建议：从检查点继续",
  restart: "建议：重新运行",
  resume_paused_task: "建议：继续已暂停的任务",
};

function statusMeta(status: EchoTaskStatus) {
  return STATUS[status] ?? UNKNOWN_STATUS;
}

function executionEngineLabel(engine: string | null | undefined): string {
  if (engine === "codex") return "Codex";
  if (engine === "echo") return "Echo 原生";
  return "未记录";
}

function matches(task: EchoTaskProjection, filter: TaskFilter) {
  if (filter === "all") return true;
  if (filter === "active") {
    return ACTIVE_TASK_STATUSES.includes(task.displayStatus || task.status);
  }
  if (filter === "waiting") return task.status === "waiting_approval";
  if (filter === "paused") return task.status === "paused";
  if (filter === "recovery") return Boolean(task.leaseHealth?.recoveryNeeded);
  if (filter === "completed") return task.status === "completed";
  return FAILED_TASK_STATUSES.includes(task.displayStatus || task.status);
}

function relativeTime(value: string | null) {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1_000));
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function TaskCard({
  task,
  selected,
  onSelect,
}: {
  task: EchoTaskProjection;
  selected: boolean;
  onSelect: () => void;
}) {
  const visibleStatus = task.displayStatus || task.status;
  const meta = statusMeta(visibleStatus);
  const StatusIcon = meta.icon;
  const latestCapability = task.capabilityDecisions.at(-1);
  return (
    <button
      type="button"
      aria-label={`查看任务：${task.title}`}
      onClick={onSelect}
      className={cn(
        "w-full rounded-2xl border bg-card/86 p-4 text-left shadow-sm transition hover:border-border hover:shadow-md",
        selected ? "border-core/30 ring-2 ring-core/30" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <BotIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {task.title}
            </h3>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[12px] font-medium",
                meta.color,
              )}
            >
              <StatusIcon
                className={cn(
                  "size-3.5",
                  ["running", "verifying", "repairing"].includes(
                    visibleStatus,
                  ) && "animate-spin",
                )}
              />
              {meta.label}
            </span>
          </div>
          {task.summary && (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {task.summary}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            {task.agentId && <span>{task.agentId}</span>}
            {task.executionEngine && (
              <span>· {executionEngineLabel(task.executionEngine)}</span>
            )}
            {task.modelName && <span>· {task.modelName}</span>}
            {task.mode && <span>· {task.mode}</span>}
            <span>· {relativeTime(task.updatedAt || task.startedAt)}</span>
          </div>
        </div>
      </div>

      {task.progressPercent !== null && task.status !== "completed" && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[12px] text-muted-foreground">
            <span>任务进度</span>
            <span>{Math.round(task.progressPercent)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-core transition-all"
              style={{ width: `${task.progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {task.approval && (
        <div className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <div className="flex items-center gap-1.5 font-medium">
            <ShieldCheckIcon className="size-3.5" />
            需要管理员确认
          </div>
          <p className="mt-1 text-[12px] text-warning">
            {task.approval.reason ||
              task.approval.tool ||
              "高风险系统操作正在等待确认"}
          </p>
        </div>
      )}

      {isExpiredApproval(task) && (
        <div className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <div className="flex items-center gap-1.5 font-medium">
            <ClockAlertIcon className="size-3.5" />
            {APPROVAL_EXPIRED}
          </div>
          <p className="mt-1 text-[12px] text-warning">
            {task.canRerun
              ? "操作没有执行。打开详情可以重新运行。"
              : "操作没有执行，任务正在收尾。"}
          </p>
        </div>
      )}

      {task.leaseHealth?.recoveryNeeded && (
        <div className="mt-3 rounded-xl border border-breach/30 bg-breach/10 px-3 py-2 text-xs text-breach">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertCircleIcon className="size-3.5" />
            上次执行已中断
          </div>
          <p className="mt-1 text-[12px] text-breach">
            {task.leaseHealth.canResume
              ? "存在检查点，可在工作台接管并继续。"
              : "任务租约已失效，请在工作台检查后重新接管。"}
          </p>
        </div>
      )}

      {task.executionRecovery?.canStart && (
        <div className="mt-3 rounded-xl border border-core/30 bg-core/10 px-3 py-2 text-xs text-core">
          <div className="flex items-center gap-1.5 font-medium">
            <PlayIcon className="size-3.5" />
            检查点已验证
          </div>
          <p className="mt-1 text-[12px] text-core">
            可在原线程继续第 {task.executionRecovery.iteration ?? "?"}{" "}
            轮之后的执行。
          </p>
        </div>
      )}

      {latestCapability && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-background px-2.5 py-2 text-[12px] text-muted-foreground">
          <ShieldCheckIcon className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-muted-foreground">
            {latestCapability.capabilityId || latestCapability.target}
          </span>
          <span>· {latestCapability.outcome.toUpperCase()}</span>
          {latestCapability.risk && <span>· {latestCapability.risk}</span>}
        </div>
      )}
      <div className="mt-3 flex items-center justify-end gap-1 text-[12px] font-medium text-core">
        查看详情
        <ArrowRightIcon className="size-3" />
      </div>
    </button>
  );
}

function TaskDetailDrawer({
  task,
  busy,
  actionError,
  actionMessage,
  onClose,
  onOpenWorkspace,
  onRequestTakeover,
  onRequestResume,
  onRequestApproval,
  onRequestRerun,
}: {
  task: EchoTaskProjection;
  busy: boolean;
  actionError: string | null;
  actionMessage: string | null;
  onClose: () => void;
  onOpenWorkspace: (artifact?: string) => void;
  onRequestTakeover: () => void;
  onRequestResume: () => void;
  onRequestApproval: (approved: boolean) => void;
  onRequestRerun?: () => void;
}) {
  const visibleStatus = task.displayStatus || task.status;
  const meta = statusMeta(visibleStatus);
  const StatusIcon = meta.icon;
  const latestActivity = task.activity.slice(-8).reverse();
  return (
    <>
      <button
        type="button"
        aria-label="关闭任务详情"
        onClick={onClose}
        className="absolute inset-0 top-12 z-10 bg-slate-950/12 backdrop-blur-[1px]"
      />
      <aside
        aria-label="任务详情"
        className="absolute bottom-0 right-0 top-12 z-20 flex w-[min(410px,100%)] flex-col border-l border-border bg-card/96 shadow-2xl backdrop-blur-2xl"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <BotIcon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-2 text-sm font-semibold text-foreground">
              {task.title}
            </h2>
            <div
              className={cn("mt-1 flex items-center gap-1 text-xs", meta.color)}
            >
              <StatusIcon className="size-3.5" />
              {meta.label}
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {task.id.slice(0, 8)}
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="收起任务详情"
            onClick={onClose}
            className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {task.summary && (
            <section>
              <div className="text-[12px] font-semibold uppercase text-muted-foreground">
                任务目标
              </div>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                {task.summary}
              </p>
            </section>
          )}

          {task.terminalReason &&
            ["failed", "disconnected", "cancelled"].includes(task.status) && (
              <section className="rounded-xl border border-breach/30 bg-breach/10 px-3 py-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-breach">
                  <AlertCircleIcon className="size-3.5" />
                  结束原因
                </div>
                <p className="mt-1.5 text-[12px] leading-5 text-breach">
                  {task.terminalReason}
                </p>
              </section>
            )}

          <section className="grid grid-cols-2 gap-2">
            {[
              ["Agent", task.agentId || "未记录"],
              ["引擎", executionEngineLabel(task.executionEngine)],
              ["模型", task.modelName || "自动选择"],
              ["模式", task.mode || "默认"],
              ["类型", task.kind || "task"],
              ["线程", task.threadId ? task.threadId.slice(0, 8) : "未关联"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-background px-3 py-2">
                <div className="text-[12px] text-muted-foreground">{label}</div>
                <div className="mt-0.5 truncate text-[12px] font-medium text-foreground">
                  {value}
                </div>
              </div>
            ))}
          </section>

          {task.leaseHealth?.recoveryNeeded && (
            <section className="rounded-xl border border-breach/30 bg-breach/10 px-3 py-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-breach">
                <GitBranchIcon className="size-3.5" />
                Agent 租约需要恢复
              </div>
              <p className="mt-1.5 text-[12px] leading-5 text-breach">
                {task.leaseHealth.canResume
                  ? "Agent 找到了检查点。先接管任务租约，再回到原任务触发继续。"
                  : "当前没有可直接恢复的检查点。接管只会重新取得任务控制权，不会假装任务已经继续执行。"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
                {LEASE_STATE_LABELS[task.leaseHealth.state] && (
                  <span className="rounded-md bg-card/70 px-2 py-1 text-breach">
                    租约{LEASE_STATE_LABELS[task.leaseHealth.state]}
                  </span>
                )}
                {task.leaseHealth.recommendedAction &&
                  RECOVERY_ACTION_LABELS[
                    task.leaseHealth.recommendedAction
                  ] && (
                    <span className="rounded-md bg-card/70 px-2 py-1 text-breach">
                      {
                        RECOVERY_ACTION_LABELS[
                          task.leaseHealth.recommendedAction
                        ]
                      }
                    </span>
                  )}
              </div>
            </section>
          )}

          {task.executionRecovery?.checkpointAvailable && (
            <section className="rounded-xl border border-core/30 bg-core/10 px-3 py-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-core">
                <PlayIcon className="size-3.5" />
                Agent 执行检查点
              </div>
              <p className="mt-1.5 text-[12px] leading-5 text-core">
                {task.executionRecovery.reason}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
                <span className="rounded-md bg-card/70 px-2 py-1 text-core">
                  第 {task.executionRecovery.iteration ?? "?"} 轮
                </span>
                {task.executionRecovery.phase && (
                  <span className="rounded-md bg-card/70 px-2 py-1 font-mono text-core">
                    {task.executionRecovery.phase}
                  </span>
                )}
              </div>
            </section>
          )}

          {task.resultArtifacts && task.resultArtifacts.length > 0 && (
            <section>
              <div className="text-[12px] font-semibold uppercase text-muted-foreground">
                任务产物
              </div>
              <div className="mt-2 space-y-1.5">
                {task.resultArtifacts.map((artifact) => (
                  <button
                    key={artifact.resourceId}
                    type="button"
                    onClick={() => onOpenWorkspace(artifact.resourceId)}
                    className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left text-[12px] text-foreground transition hover:border-core/30 hover:bg-core/10"
                  >
                    <ArrowRightIcon className="size-3 shrink-0 text-core" />
                    <span className="min-w-0 flex-1 truncate">
                      {artifact.name}
                    </span>
                    <span className="shrink-0 text-[12px] text-muted-foreground">
                      {artifact.area}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {task.approval && (
            <section className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                <ShieldCheckIcon className="size-3.5" />
                等待人工确认
              </div>
              <p className="mt-1.5 text-[12px] leading-5 text-warning">
                {task.approval.reason ||
                  "该任务需要在原任务中完成确认。涉及系统能力时仍必须经过设备密码与能力策略，任务空间不会旁路批准。"}
              </p>
              {approvalDeadlineText(task.approval.expiresAt) && (
                <p className="mt-1.5 text-[12px] font-medium text-warning">
                  {approvalDeadlineText(task.approval.expiresAt)}
                </p>
              )}
            </section>
          )}

          {isExpiredApproval(task) && (
            <section className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                <ClockAlertIcon className="size-3.5" />
                {APPROVAL_EXPIRED}
              </div>
              <p className="mt-1.5 text-[12px] leading-5 text-warning">
                {APPROVAL_EXPIRED_DETAIL}
              </p>
              {task.approvalExpired?.reason && (
                <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
                  {task.approvalExpired.reason}
                </p>
              )}
            </section>
          )}

          {task.changeProvider === "echo-os.files" ? (
            <TaskChangesPanel key={task.id} taskId={task.id} />
          ) : task.changeProvider === "echo-agent.files" ? (
            <AgentFileChangesPanel key={task.id} taskId={task.id} />
          ) : (
            <p className="text-[12px] text-muted-foreground">
              本任务尚无可核验的文件变更记录。
            </p>
          )}

          {task.runtimeCapabilityGroups.length > 0 && (
            <section>
              <div className="text-[12px] font-semibold uppercase text-muted-foreground">
                Agent 运行能力
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {task.runtimeCapabilityGroups.map((group) => (
                  <span
                    key={group}
                    className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[12px] text-muted-foreground"
                  >
                    {group}
                  </span>
                ))}
              </div>
            </section>
          )}

          {latestActivity.length > 0 && (
            <section>
              <div className="text-[12px] font-semibold uppercase text-muted-foreground">
                最近系统活动
              </div>
              <div className="mt-2 space-y-2">
                {latestActivity.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border bg-background px-2.5 py-2 text-[12px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-foreground">
                        {item.capabilityId || item.action}
                      </span>
                      <span className="shrink-0 uppercase text-muted-foreground">
                        {item.outcome}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-muted-foreground">
                      {item.target}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {actionError && (
            <div className="rounded-xl border border-breach/30 bg-breach/10 px-3 py-2 text-xs text-breach">
              {actionError}
            </div>
          )}
          {actionMessage && (
            <div className="rounded-xl border border-core/30 bg-core/10 px-3 py-2 text-xs text-core">
              {actionMessage}
            </div>
          )}
        </div>

        <footer className="shrink-0 space-y-2 border-t border-border bg-background/90 px-5 py-4">
          {task.approval?.required && !task.approval.version && (
            <p className="text-[12px] text-warning">{APPROVAL_UNVERIFIABLE}</p>
          )}
          {task.approval?.required && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onRequestApproval(false)}
                disabled={busy || !task.approval.version}
                className="rounded-xl border border-breach/30 bg-card px-3 py-2.5 text-xs font-semibold text-breach transition hover:bg-breach/10 disabled:cursor-wait disabled:opacity-60"
              >
                拒绝操作
              </button>
              <button
                type="button"
                onClick={() => onRequestApproval(true)}
                disabled={busy || !task.approval.version}
                className="rounded-xl bg-warning px-3 py-2.5 text-xs font-semibold text-primary-foreground transition hover:bg-warning disabled:cursor-wait disabled:opacity-60"
              >
                批准操作
              </button>
            </div>
          )}
          {task.executionRecovery?.canStart && (
            <button
              type="button"
              onClick={onRequestResume}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <PlayIcon className="size-4" />
              )}
              恢复执行并打开原任务…
            </button>
          )}
          {task.leaseHealth?.canTakeover && (
            <button
              type="button"
              onClick={onRequestTakeover}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-breach/30 bg-card px-3 py-2.5 text-xs font-semibold text-breach transition hover:bg-breach/10 disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <GitBranchIcon className="size-4" />
              )}
              接管任务租约…
            </button>
          )}
          {task.canRerun && onRequestRerun && (
            <button
              type="button"
              onClick={onRequestRerun}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-wait disabled:opacity-60"
            >
              <RotateCcwIcon className="size-4" />
              重新运行
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenWorkspace()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground transition hover:bg-slate-700"
          >
            <MessageSquareTextIcon className="size-4" />
            {task.threadId ? "打开原任务" : "打开工作台"}
          </button>
        </footer>
      </aside>
    </>
  );
}

export function TaskSpacePanel({
  open,
  projection,
  loading,
  error,
  onClose,
  onRefresh,
  onOpenWorkspace,
  onTakeover,
  onResumeExecution,
  onApprovalDecision,
  onRerun,
  focusTaskRequest,
}: {
  open: boolean;
  projection: EchoTaskProjectionResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onOpenWorkspace: (task?: EchoTaskProjection, artifact?: string) => void;
  onTakeover: (taskId: string, reason: string) => Promise<unknown>;
  onResumeExecution: (taskId: string, reason: string) => Promise<unknown>;
  onApprovalDecision: (
    taskId: string,
    approved: boolean,
    reason: string,
    expectedApprovalVersion?: string,
  ) => Promise<unknown>;
  /** 以原任务目标重新运行；成功后由它负责刷新任务投影。 */
  onRerun?: (task: EchoTaskProjection) => Promise<unknown>;
  /** 从桌面任务卡片跳转过来时要展开的任务；每次请求是一个新对象。 */
  focusTaskRequest?: { taskId: string } | null;
}) {
  const inWindow = useInSystemAppWindow();
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [takeoverCandidate, setTakeoverCandidate] =
    useState<EchoTaskProjection | null>(null);
  const [resumeCandidate, setResumeCandidate] =
    useState<EchoTaskProjection | null>(null);
  const [approvalCandidate, setApprovalCandidate] =
    useState<ApprovalConsent | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const tasks = useMemo(
    () => (projection?.tasks ?? []).filter((task) => matches(task, filter)),
    [filter, projection?.tasks],
  );
  const selectedTask =
    projection?.tasks.find((task) => task.id === selectedTaskId) ?? null;
  useEffect(() => {
    if (open) return;
    setSelectedTaskId(null);
    setTakeoverCandidate(null);
    setResumeCandidate(null);
    setApprovalCandidate(null);
    setActionError(null);
    setActionMessage(null);
  }, [open]);
  useEffect(() => {
    if (!open || !focusTaskRequest) return;
    setFilter("all");
    setSelectedTaskId(focusTaskRequest.taskId);
  }, [focusTaskRequest, open]);
  useEffect(() => {
    // 窗口形态由窗口管理器负责焦点与关闭，Esc 不关闭整个应用。
    if (!open || inWindow) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const focusHandle = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(focusHandle);
    };
  }, [inWindow, onClose, open]);
  if (!open) return null;

  const confirmTakeover = async () => {
    if (!takeoverCandidate || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      await onTakeover(
        takeoverCandidate.id,
        "设备管理员从 Echo 任务空间接管中断任务",
      );
      setActionMessage(
        "任务租约已接管。Agent 会重新核验检查点，再允许恢复执行。",
      );
      setTakeoverCandidate(null);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "无法接管任务");
      setTakeoverCandidate(null);
    } finally {
      setActionBusy(false);
    }
  };

  const confirmResumeExecution = async () => {
    if (!resumeCandidate || actionBusy) return;
    const task = resumeCandidate;
    setActionBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      await onResumeExecution(
        task.id,
        "设备管理员从 Echo 任务空间确认恢复检查点执行",
      );
      setResumeCandidate(null);
      onOpenWorkspace(task);
    } catch (reason) {
      setActionError(
        reason instanceof Error ? reason.message : "无法恢复任务执行",
      );
      setResumeCandidate(null);
    } finally {
      setActionBusy(false);
    }
  };

  const confirmApprovalDecision = async () => {
    if (!approvalCandidate || actionBusy) return;
    const { task, approved } = approvalCandidate;
    setActionBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const version = assertApprovalConsent(
        approvalCandidate,
        projection?.tasks ?? [],
      );
      await onApprovalDecision(
        task.id,
        approved,
        `设备管理员${approved ? "批准" : "拒绝"}任务操作`,
        version,
      );
      if (approvalConsentSessionCurrent(approvalCandidate))
        setActionMessage(
          approved
            ? "操作已批准，任务将继续执行。"
            : "操作已拒绝，任务已停止等待。",
        );
      else setActionError(APPROVAL_SESSION_CHANGED_AFTER_SUBMIT);
    } catch (reason) {
      setActionError(
        !approvalConsentSessionCurrent(approvalCandidate)
          ? APPROVAL_SESSION_CHANGED
          : reason instanceof Error
            ? approvalDecisionErrorMessage(reason.message)
            : "无法提交审批决定",
      );
    } finally {
      setApprovalCandidate(null);
      setActionBusy(false);
    }
  };

  const rerunTask = async (task: EchoTaskProjection) => {
    if (!onRerun || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      await onRerun(task);
      setActionMessage("已重新运行。新的任务已开始，会出现在列表顶部。");
    } catch (reason) {
      setActionError(
        reason instanceof Error ? reason.message : "无法重新运行这个任务",
      );
    } finally {
      setActionBusy(false);
    }
  };

  const counts = projection?.counts;
  return (
    <SystemAppFrame
      label="Echo 任务空间"
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[88] flex items-center justify-center bg-slate-950/18 p-4 backdrop-blur-[2px]"
      className="relative flex h-[min(720px,calc(100vh-64px))] w-[min(920px,calc(100vw-32px))] flex-col overflow-hidden rounded-[22px] border border-border bg-background/94 text-foreground shadow-2xl shadow-slate-950/35 backdrop-blur-3xl"
      windowClassName="relative flex size-full flex-col overflow-hidden bg-background text-foreground"
    >
      <header className="flex h-12 shrink-0 items-center border-b border-border bg-card/70 px-4">
        <div className="flex gap-2">
          {inWindow ? (
            <SystemAppLightsSpacer />
          ) : (
            <SystemAppTrafficLights
              closeLabel="关闭任务空间"
              onClose={onClose}
              closeButtonRef={closeButtonRef}
            />
          )}
        </div>
        <div
          id="echo-task-space-title"
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-sm font-medium text-muted-foreground"
        >
          任务空间
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            aria-label="刷新任务"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted/70"
          >
            <RefreshCwIcon
              className={cn("size-4", loading && "animate-spin")}
            />
          </button>
          <button
            type="button"
            onClick={() => onOpenWorkspace()}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-slate-700"
          >
            打开工作台
          </button>
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-3 gap-3 border-b border-border px-5 py-4 sm:grid-cols-7">
        {(
          [
            ["全部", counts?.total ?? 0, "text-foreground"],
            ["进行中", counts?.active ?? 0, "text-core"],
            ["待确认", counts?.waitingApproval ?? 0, "text-warning"],
            ["已暂停", counts?.paused ?? 0, "text-muted-foreground"],
            ["待恢复", counts?.recoveryNeeded ?? 0, "text-warning"],
            ["异常", counts?.failed ?? 0, "text-breach"],
            ["完成", counts?.completed ?? 0, "text-core"],
          ] satisfies Array<[string, number, string]>
        ).map(([label, value, color]) => (
          <div
            key={label}
            className="rounded-xl bg-card/75 px-3 py-2 text-center shadow-sm"
          >
            <div className={cn("text-lg font-semibold", color)}>
              {counts ? value : "—"}
            </div>
            <div className="text-[12px] text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <nav className="flex shrink-0 gap-1 border-b border-border px-5 py-2.5">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            aria-pressed={filter === item.id}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs transition",
              filter === item.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <span
            className={cn(
              "size-2 rounded-full",
              projection?.auditIntegrity.ok === false
                ? "bg-breach"
                : projection?.auditIntegrity.ok === true
                  ? "bg-core"
                  : "bg-slate-300",
            )}
          />
          审计链
        </div>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {error && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-breach/30 bg-breach/10 px-4 py-3 text-xs text-breach"
          >
            <span className="min-w-0">{error}</span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="shrink-0 rounded-lg border border-breach/30 bg-card/80 px-2.5 py-1.5 font-medium text-breach transition hover:bg-card disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? "读取中…" : "重试读取"}
            </button>
          </div>
        )}
        {!projection?.available && !loading ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <BotIcon className="mx-auto size-9 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                {error ? "任务服务暂时不可用" : "任务服务正在初始化"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {error
                  ? "请检查 Agent 服务状态，或点击上方“重试读取”。"
                  : "Echo 会直接读取 Echo Agent 的真实 TaskSupervisor，不创建副本。"}
              </p>
            </div>
          </div>
        ) : loading && !projection ? (
          <div className="grid h-full place-items-center text-muted-foreground">
            <Loader2Icon className="size-7 animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <CheckCircle2Icon className="mx-auto size-9 text-core" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                当前没有这类任务
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                新的 Agent 任务会自动出现在这里。
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                selected={selectedTaskId === task.id}
                onSelect={() => {
                  setSelectedTaskId(task.id);
                  setActionError(null);
                  setActionMessage(null);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          busy={actionBusy}
          actionError={actionError}
          actionMessage={actionMessage}
          onClose={() => setSelectedTaskId(null)}
          onOpenWorkspace={(artifact) =>
            artifact
              ? onOpenWorkspace(selectedTask, artifact)
              : onOpenWorkspace(selectedTask)
          }
          onRequestTakeover={() => setTakeoverCandidate(selectedTask)}
          onRequestResume={() => setResumeCandidate(selectedTask)}
          onRequestApproval={(approved) =>
            setApprovalCandidate(captureApprovalConsent(selectedTask, approved))
          }
          onRequestRerun={
            onRerun ? () => void rerunTask(selectedTask) : undefined
          }
        />
      )}

      {approvalCandidate && (
        <TaskApprovalDialog
          consent={approvalCandidate}
          busy={actionBusy}
          onCancel={() => setApprovalCandidate(null)}
          onConfirm={() => void confirmApprovalDecision()}
        />
      )}

      {takeoverCandidate && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950/30 p-5 backdrop-blur-sm">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-label="确认接管任务"
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-breach/10 text-breach">
                <GitBranchIcon className="size-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  接管这个中断任务？
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Echo 将让当前 Agent worker 重新取得“
                  {takeoverCandidate.title}
                  ”的租约。这个动作不会自动执行任务；接管后仍需回到原任务确认并继续。
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTakeoverCandidate(null)}
                disabled={actionBusy}
                className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-background"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void confirmTakeover()}
                disabled={actionBusy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-breach px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-breach disabled:cursor-wait disabled:opacity-60"
              >
                {actionBusy && (
                  <Loader2Icon className="size-3.5 animate-spin" />
                )}
                确认接管
              </button>
            </div>
          </section>
        </div>
      )}

      {resumeCandidate && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950/30 p-5 backdrop-blur-sm">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-label="确认恢复任务执行"
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-core/10 text-core">
                <PlayIcon className="size-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  从 Agent 检查点继续？
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Echo 将在原线程恢复“{resumeCandidate.title}
                  ”，随后打开原任务查看实时进度。新的系统操作仍会按原规则等待人工确认，不会自动批准。
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResumeCandidate(null)}
                disabled={actionBusy}
                className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-background"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void confirmResumeExecution()}
                disabled={actionBusy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary disabled:cursor-wait disabled:opacity-60"
              >
                {actionBusy && (
                  <Loader2Icon className="size-3.5 animate-spin" />
                )}
                确认恢复
              </button>
            </div>
          </section>
        </div>
      )}
    </SystemAppFrame>
  );
}
