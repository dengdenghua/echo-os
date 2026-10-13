import { useEffect, useRef, useState } from "react";
import { InboxIcon, RefreshCwIcon, ShieldCheckIcon } from "lucide-react";
import { SystemAppFrame, SystemAppLightsSpacer } from "./system-app-window";
import {
  APPROVAL_SESSION_CHANGED,
  APPROVAL_SESSION_CHANGED_AFTER_SUBMIT,
  APPROVAL_TASK_INTERRUPTED,
  APPROVAL_UNVERIFIABLE,
  approvalDecisionErrorMessage,
  type ApprovalConsent,
  assertApprovalConsent,
  approvalConsentSessionCurrent,
  captureApprovalConsent,
  isDecidableApproval,
  isInterruptedApproval,
} from "./task-approval-consent";
import { TaskApprovalDialog, approvalOperation } from "./task-approval-dialog";
import type {
  EchoTaskProjection,
  EchoTaskProjectionResponse,
} from "./task-space";

export function DecisionInbox({
  projection,
  loading,
  error,
  onClose,
  onRefresh,
  onOpenTask,
  onDecision,
}: {
  projection: EchoTaskProjectionResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onOpenTask: (task: EchoTaskProjection) => void;
  /** 提交审批决定；成功后由它负责刷新任务投影。 */
  onDecision: (
    id: string,
    approved: boolean,
    reason: string,
    version?: string,
  ) => Promise<unknown>;
}) {
  const [consent, setConsent] = useState<ApprovalConsent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const waiting = (projection?.tasks ?? []).filter(isDecidableApproval);
  const confirm = async () => {
    if (!consent || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      const version = assertApprovalConsent(consent, projection?.tasks ?? []);
      await onDecision(
        consent.task.id,
        consent.approved,
        `设备管理员从审批收件箱${consent.approved ? "批准" : "拒绝"}任务操作`,
        version,
      );
      if (!alive.current) return;
      if (approvalConsentSessionCurrent(consent))
        setMessage(consent.approved ? "操作已批准" : "操作已拒绝");
      else setActionError(APPROVAL_SESSION_CHANGED_AFTER_SUBMIT);
    } catch (reason) {
      if (alive.current)
        setActionError(
          !approvalConsentSessionCurrent(consent)
            ? APPROVAL_SESSION_CHANGED
            : reason instanceof Error
              ? approvalDecisionErrorMessage(reason.message)
              : "无法提交审批决定",
        );
    } finally {
      busyRef.current = false;
      if (alive.current) {
        setBusy(false);
        setConsent(null);
      }
    }
  };
  return (
    <SystemAppFrame
      label="审批收件箱"
      onClose={onClose}
      overlayClassName="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-6"
      className="relative flex h-full min-h-0 flex-col bg-background"
      windowClassName="relative flex h-full min-h-0 flex-col bg-background"
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <SystemAppLightsSpacer />
        <ShieldCheckIcon className="size-4 text-warning" />
        <h1 className="flex-1 text-sm font-semibold">审批收件箱</h1>
        <button
          type="button"
          aria-label="刷新审批"
          onClick={onRefresh}
          disabled={busy}
          className="rounded-lg p-2"
        >
          <RefreshCwIcon className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <p className="mb-4 text-xs text-muted-foreground">
          查看 Agent 当前请求，逐项确认后继续原任务。
        </p>
        {(error || actionError) && (
          <p role="alert" className="mb-3 text-sm text-breach">
            {actionError || error}
          </p>
        )}
        {message && (
          <p role="status" className="mb-3 text-sm text-core">
            {message}
          </p>
        )}
        {!projection?.available ? (
          <p role="status" className="text-sm text-muted-foreground">
            {loading ? "正在读取审批…" : "任务服务暂时不可用"}
          </p>
        ) : waiting.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <InboxIcon
              aria-hidden
              className="size-10 text-muted-foreground"
              strokeWidth={1.4}
            />
            <p className="mt-3 text-sm font-medium text-foreground">
              当前没有等待确认的操作
            </p>
            <p className="mt-1 max-w-80 text-xs text-muted-foreground">
              现在无需处理。Agent 需要你确认时会暂停任务，请求会出现在这里。
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {waiting.map((task) => (
              <li
                key={task.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <h2 className="text-sm font-semibold">{task.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {approvalOperation(task)}
                </p>
                <p className="mt-2 text-sm">
                  {task.approval?.reason || "任务需要人工确认"}
                </p>
                {!task.approval?.version && (
                  <p className="mt-2 text-xs text-warning">
                    {APPROVAL_UNVERIFIABLE}
                  </p>
                )}
                {isInterruptedApproval(task) && (
                  <p className="mt-2 text-xs text-warning">
                    {APPROVAL_TASK_INTERRUPTED}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenTask(task)}
                    className="mr-auto text-xs text-core"
                  >
                    打开原任务
                  </button>
                  {[false, true].map((approved) => (
                    <button
                      key={String(approved)}
                      type="button"
                      disabled={
                        busy ||
                        !task.approval?.version ||
                        isInterruptedApproval(task)
                      }
                      onClick={() => {
                        setActionError(null);
                        setMessage(null);
                        setConsent(captureApprovalConsent(task, approved));
                      }}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-40"
                    >
                      {approved ? "批准操作" : "拒绝操作"}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {consent && (
        <TaskApprovalDialog
          consent={consent}
          busy={busy}
          onCancel={() => setConsent(null)}
          onConfirm={() => void confirm()}
        />
      )}
    </SystemAppFrame>
  );
}
