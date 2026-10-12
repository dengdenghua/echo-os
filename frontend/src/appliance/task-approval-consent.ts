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
