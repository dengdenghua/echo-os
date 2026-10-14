import { useEffect, useState } from "react";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDotIcon,
  FileDiffIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  ACTION_LABELS,
  EVIDENCE_LABELS,
  fetchAgentTaskFileChanges,
  type AgentFileChange,
  type AgentTaskFileChanges,
} from "./agent-file-changes";

const VISIBLE_ROWS = 8;

function EvidenceMark({ change }: { change: AgentFileChange }) {
  const Icon =
    change.evidence === "verified"
      ? CircleCheckIcon
      : change.evidence === "changed_since" || change.evidence === "missing"
        ? CircleAlertIcon
        : CircleDotIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        change.evidence === "verified"
          ? "text-core"
          : change.evidence === "changed_since" || change.evidence === "missing"
            ? "text-warning"
            : "text-muted-foreground",
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {EVIDENCE_LABELS[change.evidence]}
    </span>
  );
}

function ChangeRow({ change }: { change: AgentFileChange }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-border bg-background px-2.5 py-2 text-[12px]">
      <div className="flex items-start gap-2">
        <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 font-medium text-foreground">
          {ACTION_LABELS[change.action]}
        </span>
        <span
          className="min-w-0 flex-1 break-all font-mono text-foreground"
          title={change.path}
        >
          {change.displayPath}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <EvidenceMark change={change} />
        {change.diff && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1 text-core"
          >
            <FileDiffIcon aria-hidden className="size-3.5" />
            {open ? "收起差异" : "查看差异"}
          </button>
        )}
      </div>
      {!change.inWorkspace && (
        <p className="mt-1 text-muted-foreground">位于任务工作区之外</p>
      )}
      {open && change.diff && (
        <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-muted px-2 py-1.5 font-mono text-[12px] leading-5 whitespace-pre text-foreground">
          {change.diff}
        </pre>
      )}
      {open && change.diffTruncated && (
        <p className="mt-1 text-muted-foreground">差异较长，只显示开头部分。</p>
      )}
    </li>
  );
}

export function AgentFileChangesPanel({ taskId }: { taskId: string }) {
  const [view, setView] = useState<AgentTaskFileChanges | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setView(null);
    setError(null);
    fetchAgentTaskFileChanges(taskId, controller.signal)
      .then(setView)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "暂时无法读取这个任务的文件改动记录",
        );
      });
    return () => controller.abort();
  }, [taskId]);

  const rows = view
    ? showAll
      ? view.changes
      : view.changes.slice(0, VISIBLE_ROWS)
    : [];
  const verified =
    view?.changes.filter((change) => change.evidence === "verified").length ??
    0;
  return (
    <section aria-label="文件改动">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[12px] font-semibold text-muted-foreground">
          文件改动
          {view?.available && view.changes.length > 0
            ? ` · ${view.changes.length} 处`
            : ""}
        </div>
        {view?.available && view.changes.length > 0 && (
          <span className="text-[12px] text-muted-foreground">
            已核验 {verified} 处
          </span>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[12px] text-warning">
          {error}
        </p>
      ) : !view ? (
        <p role="status" className="mt-2 text-[12px] text-muted-foreground">
          正在读取文件改动记录…
        </p>
      ) : !view.available ? (
        <p className="mt-2 text-[12px] text-muted-foreground">
          暂时无法读取这个任务的文件改动记录。
        </p>
      ) : view.changes.length === 0 ? (
        <p className="mt-2 text-[12px] text-muted-foreground">
          这个任务没有记录到文件改动。
        </p>
      ) : (
        <>
          <ul className="mt-2 space-y-2">
            {rows.map((change) => (
              <ChangeRow key={change.id} change={change} />
            ))}
          </ul>
          {!showAll && view.changes.length > rows.length && (
            <button
              type="button"
              className="mt-2 text-[12px] text-core"
              onClick={() => setShowAll(true)}
            >
              查看全部 {view.changes.length} 处
            </button>
          )}
          <p className="mt-2 text-[12px] text-muted-foreground">
            核验方式：比对任务写入时记录的 SHA-256 与磁盘上的当前文件。
          </p>
        </>
      )}
    </section>
  );
}
