import {
  currentActorId,
  getAuthSessionRevision,
  getToken,
} from "@/core/auth/api";
import type {
  EchoTaskProjection,
  EchoTaskProjectionResponse,
} from "./task-space";

export const APPROVAL_SESSION_CHANGED = "登录状态已变化，请重新查看并确认操作";
export const APPROVAL_SESSION_CHANGED_AFTER_SUBMIT =
  "登录状态在提交期间发生变化，请刷新后核对审批结果";
export const APPROVAL_UNVERIFIABLE =
  "当前任务服务无法核验审批版本，请升级服务后刷新。";

export type ApprovalConsent = ReturnType<typeof captureApprovalConsent>;
export const APPROVAL_TASK_INTERRUPTED =
  "任务已中断，这个审批暂时无法处理。请在任务空间接管任务后再确认。";
export const APPROVAL_EXPIRED = "任务已超时，审批已失效";
export const APPROVAL_EXPIRED_DETAIL =
  "Agent 等你确认时用完了任务时限，这次操作没有执行。需要的话可以重新运行这个任务。";
export const APPROVAL_NO_LONGER_PENDING =
  "这个审批已经结束：任务可能已超时，或已在别处处理。请刷新后查看任务状态。";

/** 审批因任务时限而失效（不是你的拒绝），只对已经离开等待状态的任务成立。 */
export function isExpiredApproval(task: EchoTaskProjection) {
  return task.status !== "waiting_approval" && Boolean(task.approvalExpired);
}

const DISMISSED_EXPIRED_KEY = "echo.decision-inbox.dismissed-expired";

/** 用户已移除的"审批已失效"提示（只存任务 id，只在本浏览器生效）。 */
export function readDismissedExpiredApprovals(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISSED_EXPIRED_KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function dismissExpiredApproval(taskId: string): string[] {
  const next = [
    ...readDismissedExpiredApprovals().filter((id) => id !== taskId),
    taskId,
  ].slice(-200);
  try {
    window.localStorage.setItem(DISMISSED_EXPIRED_KEY, JSON.stringify(next));
  } catch {
    // A private window may refuse storage; the notice simply shows again.
  }
  return next;
}

function clockTime(date: Date) {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * "请在 14:05 前确认（还剩 23 分钟）"。没有截止时间的旧记录返回 null，
 * 已过截止时间时说明审批即将失效，不再倒数。
 */
export function approvalDeadlineText(
  expiresAt: string | null | undefined,
  now = Date.now(),
): string | null {
  const deadline = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (!Number.isFinite(deadline)) return null;
  const remainingMs = deadline - now;
  if (remainingMs <= 0) return "已到任务时限，审批即将失效";
  const minutes = Math.ceil(remainingMs / 60_000);
  const remaining =
    minutes >= 60
      ? `还剩 ${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
      : `还剩 ${minutes} 分钟`;
  return `请在 ${clockTime(new Date(deadline))} 前确认（${remaining}）`;
}

/** A parked approval whose task lost its lease can no longer be answered here. */
export function isInterruptedApproval(task: EchoTaskProjection) {
  return Boolean(task.leaseHealth?.recoveryNeeded);
}

/**
 * The task service answers a refused decision with its own diagnostic
 * (for example "task '…' lease is no longer current: lease expired"). The
 * owner gets what happened and what to do instead.
 */
export function approvalDecisionErrorMessage(message: string) {
  if (/lease|租约/i.test(message)) return APPROVAL_TASK_INTERRUPTED;
  if (/not waiting for approval/i.test(message))
    return APPROVAL_NO_LONGER_PENDING;
  if (/approval request changed|version/i.test(message))
    return "审批内容已变化，请刷新后重新确认。";
  if (/[\u4e00-\u9fff]/.test(message)) return message;
  return "无法提交审批决定，请刷新后重试。";
}

/** 只有运行时还能被管理员决定放行的等待（策略/能力拦截不算）。 */
export function isDecidableApproval(task: EchoTaskProjection) {
  return task.status === "waiting_approval" && Boolean(task.approval?.required);
}

export function pendingApprovalCount(
  projection: EchoTaskProjectionResponse | null,
) {
  return (projection?.tasks ?? []).filter(isDecidableApproval).length;
}

export function captureApprovalConsent(
  task: EchoTaskProjection,
  approved: boolean,
) {
  return {
    task,
    approved,
    actor: currentActorId(),
    // 旧版 localStorage 迁移会写入令牌但不递增会话版本，所以令牌本身也要比对。
    credential: getToken(),
    sessionRevision: getAuthSessionRevision(),
  };
}

export function assertApprovalConsent(
  consent: ApprovalConsent,
  tasks: EchoTaskProjection[],
) {
  if (!approvalConsentSessionCurrent(consent)) {
    throw new Error(APPROVAL_SESSION_CHANGED);
  }
  const current = tasks.find((task) => task.id === consent.task.id);
  const version = consent.task.approval?.version;
  if (
    !version ||
    current?.status !== "waiting_approval" ||
    current.approval?.version !== version
  ) {
    throw new Error("审批内容已变化或无法核验，请刷新后重新确认");
  }
  return version;
}

export function approvalConsentSessionCurrent(consent: ApprovalConsent) {
  return (
    consent.actor === currentActorId() &&
    consent.credential === getToken() &&
    consent.sessionRevision === getAuthSessionRevision()
  );
}
