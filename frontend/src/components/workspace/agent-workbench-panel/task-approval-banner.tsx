import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  useEchoTaskProjection,
  type EchoTaskProjection,
} from "@/appliance/task-space";

export function TaskApprovalBanner({ threadId }: { threadId: string }) {
  const { projection, decideApproval, takeover, resumeExecution, refresh } =
    useEchoTaskProjection(Boolean(threadId));
  const [candidate, setCandidate] = useState<{
    id: string;
    approved: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const task = projection?.tasks.find(
    (item) =>
      item.threadId === threadId &&
      (item.status === "waiting_approval" ||
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

  async function submit(current: EchoTaskProjection, approved: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await decideApproval(
        current.id,
        approved,
        approved ? "工作台批准" : "工作台拒绝",
      );
      setCandidate(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法提交审批决定");
      refresh();
    } finally {
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
        ) : candidate?.id === task.id ? (
          <>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void submit(task, candidate.approved)}
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
              disabled={busy}
              onClick={() => setCandidate({ id: task.id, approved: true })}
            >
              批准
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setCandidate({ id: task.id, approved: false })}
            >
              拒绝
            </Button>
          </>
        )}
      </div>
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
