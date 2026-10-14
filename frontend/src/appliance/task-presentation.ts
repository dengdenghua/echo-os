/**
 * 任务在桌面上的呈现规则：哪些任务值得出现、按什么顺序、用什么文案。
 * 桌面任务卡片、画中画和 Dock 任务轨共用这一套，避免各处说法不一致。
 */

import {
  ACTIVE_TASK_STATUSES,
  FAILED_TASK_STATUSES,
  type EchoTaskProjection,
} from "./task-space";

const RECENT_TERMINAL_MS = 24 * 60 * 60 * 1000;

export type TaskTone = "active" | "attention" | "done" | "failed" | "muted";

export function taskStatusView(task: EchoTaskProjection): {
  label: string;
  tone: TaskTone;
} {
  if (task.leaseHealth?.recoveryNeeded) {
    return { label: "需要恢复", tone: "attention" };
  }
  // A task that ended because its approval ran out with the time limit did
  // not fail or get cancelled by anyone: it waits for a re-run.
  if (
    task.approvalExpired &&
    task.displayStatus !== "waiting_approval" &&
    !ACTIVE_TASK_STATUSES.includes(task.displayStatus)
  ) {
    return { label: "审批已失效", tone: "attention" };
  }
  switch (task.displayStatus) {
    case "waiting_approval":
      return { label: "待你批准", tone: "attention" };
    case "pending":
      return { label: "排队中", tone: "active" };
    case "running":
      return { label: "执行中", tone: "active" };
    case "verifying":
      return { label: "校验中", tone: "active" };
    case "repairing":
      return { label: "修复中", tone: "active" };
    case "paused":
      return { label: "已暂停", tone: "muted" };
    case "completed":
      return { label: "已完成", tone: "done" };
    case "failed":
      return { label: "失败", tone: "failed" };
    case "disconnected":
      return { label: "已断开", tone: "failed" };
    case "cancelled":
      return { label: "已取消", tone: "failed" };
    default:
      return {
        label: String(task.displayStatus || task.status),
        tone: "muted",
      };
  }
}

function parseTime(value: string | null | undefined): number {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function taskTime(task: EchoTaskProjection): number {
  return parseTime(task.updatedAt ?? task.completedAt ?? task.startedAt);
}

/**
 * 越小越需要用户：0 等待批准，1 需要恢复，2 进行中，3 暂停，4 失败，5 完成。
 */
export function attentionRank(task: EchoTaskProjection): number {
  if (task.displayStatus === "waiting_approval") return 0;
  if (task.leaseHealth?.recoveryNeeded) return 1;
  if (ACTIVE_TASK_STATUSES.includes(task.displayStatus)) return 2;
  if (task.displayStatus === "paused") return 3;
  if (FAILED_TASK_STATUSES.includes(task.displayStatus)) return 4;
  return 5;
}

/** 等待用户处理的任务（批准或恢复）。 */
export function taskNeedsUser(task: EchoTaskProjection): boolean {
  return attentionRank(task) <= 1;
}

/**
 * 桌面只摆需要关注的任务：等你处理的、进行中的、暂停的，以及 24 小时内
 * 刚结束的。排序先看是否需要你，再看最近更新时间。
 */
export function selectDesktopTasks(
  tasks: readonly EchoTaskProjection[],
  now = Date.now(),
): EchoTaskProjection[] {
  return tasks
    .filter(
      (task) =>
        attentionRank(task) <= 3 || now - taskTime(task) <= RECENT_TERMINAL_MS,
    )
    .sort(
      (a, b) =>
        attentionRank(a) - attentionRank(b) || taskTime(b) - taskTime(a),
    );
}

/** Dock 任务轨只放还没结束的任务：等你处理的、进行中的和暂停的。 */
export function selectLiveTasks(
  tasks: readonly EchoTaskProjection[],
): EchoTaskProjection[] {
  return selectDesktopTasks(tasks).filter((task) => attentionRank(task) <= 3);
}

/** 0–100；Agent 没有汇报进度时为 null，界面不应编造一个百分比。 */
export function taskProgress(task: EchoTaskProjection): number | null {
  if (task.displayStatus === "completed") return 100;
  if (
    typeof task.progressPercent === "number" &&
    Number.isFinite(task.progressPercent)
  ) {
    return Math.max(0, Math.min(100, Math.round(task.progressPercent)));
  }
  return null;
}

export function approvalText(task: EchoTaskProjection): string {
  return (
    task.approval?.reason ??
    task.approval?.action ??
    task.approval?.tool ??
    "Agent 请求执行一项需要你授权的操作"
  );
}

/**
 * 一句话进展：优先任务摘要，其次终止原因和最近一条活动。
 * 审批原因由调用方单独呈现，这里不重复。
 */
export function taskHeadline(task: EchoTaskProjection): string | null {
  const summary = task.summary?.trim();
  if (summary) return summary;
  const reason = task.terminalReason?.trim();
  if (reason) return reason;
  const latest = [...task.activity].sort(
    (a, b) => parseTime(b.at) - parseTime(a.at),
  )[0];
  if (latest) return [latest.action, latest.target].filter(Boolean).join(" · ");
  return null;
}
