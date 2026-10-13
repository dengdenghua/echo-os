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
  if (/approval request changed|version/i.test(message))
    return "审批内容已变化，请刷新后重新确认。";
  if (/[一-鿿]/.test(message)) return message;
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
