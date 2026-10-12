import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  APPROVAL_SESSION_CHANGED,
  APPROVAL_SESSION_CHANGED_AFTER_SUBMIT,
  APPROVAL_UNVERIFIABLE,
  type ApprovalConsent,
  assertApprovalConsent,
  approvalConsentSessionCurrent,
  captureApprovalConsent,
  isDecidableApproval,
} from "@/appliance/task-approval-consent";
import {
  useEchoTaskProjection,
  type EchoTaskProjection,
} from "@/appliance/task-space";

export function TaskApprovalBanner({ threadId }: { threadId: string }) {
  const { projection, decideApproval, takeover, resumeExecution, refresh } =
    useEchoTaskProjection(Boolean(threadId));
  // 用户点“批准/拒绝”时就固定下所审阅的请求；确认时只提交这份快照的版本。
  const [candidate, setCandidate] = useState<ApprovalConsent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const task = projection?.tasks.find(
    (item) =>
      item.threadId === threadId &&
      (isDecidableApproval(item) ||
        (item.status === "paused" && item.executionRecovery?.canStart)),
  );
  if (!task) return null;
  const recover = Boolean(
    task.leaseHealth?.recoveryNeeded || task.status === "paused",
  );
  const canRecover = Boolean(
    task.executionRecovery?.checkpointAvailable &&
    (task.leaseHealth?.canTakeover || task.executionRecovery?.canStart),
  );
  const verifiable = Boolean(task.approval?.version);

  async function submit(consent: ApprovalConsent) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const version = assertApprovalConsent(consent, projection?.tasks ?? []);
      await decideApproval(
        consent.task.id,
        consent.approved,
        consent.approved ? "工作台批准" : "工作台拒绝",
        version,
      );
      if (!approvalConsentSessionCurrent(consent))
        setError(APPROVAL_SESSION_CHANGED_AFTER_SUBMIT);
    } catch (reason) {
      setError(
        !approvalConsentSessionCurrent(consent)
          ? APPROVAL_SESSION_CHANGED
          : reason instanceof Error
            ? reason.message
            : "无法提交审批决定",
      );
      refresh();
    } finally {
      setCandidate(null);
      setBusy(false);
    }
  }

  async function recoverTask(current: EchoTaskProjection) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (current.leaseHealth?.canTakeover)
        await takeover(current.id, "工作台恢复中断任务");
      await resumeExecution(current.id, "恢复已保存的任务；操作需要重新审批");
      setCandidate(null);
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法恢复任务");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="region"
      aria-label="任务审批"
      className="border-b bg-muted/40 px-4 py-3 text-sm"
    >
      <p className="font-medium">
        {recover ? "任务等待恢复" : "需要你的审批"} · {task.title}
      </p>
      <p className="mt-1 break-words text-muted-foreground">
        {recover
          ? "原来的等待已中断。恢复保存的进度后，操作会重新经过审批。"
          : task.approval?.reason || task.approval?.tool || "请确认本次操作。"}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {recover ? (
          <Button
            size="sm"
            disabled={busy || !canRecover}
            onClick={() => void recoverTask(task)}
          >
            恢复任务
          </Button>
        ) : candidate?.task.id === task.id ? (
          <>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void submit(candidate)}
            >
              {candidate.approved ? "确认批准本次操作" : "确认拒绝本次操作"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setCandidate(null)}
            >
              取消
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              disabled={busy || !verifiable}
              onClick={() => {
                setError(null);
                setCandidate(captureApprovalConsent(task, true));
              }}
            >
              批准
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !verifiable}
              onClick={() => {
                setError(null);
                setCandidate(captureApprovalConsent(task, false));
              }}
            >
              拒绝
            </Button>
          </>
        )}
      </div>
      {!recover && !verifiable && (
        <p className="mt-2 text-muted-foreground">{APPROVAL_UNVERIFIABLE}</p>
      )}
      {recover && !canRecover && (
        <p className="mt-2">没有可恢复的执行快照，请重新发起任务。</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
