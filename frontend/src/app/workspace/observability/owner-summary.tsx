/**
 * 可观测性 › 总览 for the owner: is my agent healthy, what ran, what failed and
 * what to do. Monochrome surfaces; colour appears only on real state (core for
 * healthy, warning for work waiting on the owner, breach for a real failure or
 * an unreachable backend). The developer dashboard lives behind 开发者详情.
 */
import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon, RefreshCwIcon } from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  fetchAgentTraceTaskRuns,
  type AgentTraceTaskRun,
} from "@/core/agent-trace/api";
import { authHeaders } from "@/core/auth/api";
import { getBackendBaseURL } from "@/core/config";
import { useI18n } from "@/core/i18n/hooks";
import type { Locale } from "@/core/i18n/locale";
import {
  observabilityOwnerCopy,
  type ObservabilityOwnerCopy,
} from "@/core/i18n/locales/observability-owner";
import { useModels } from "@/core/models/hooks";
import type { Model } from "@/core/models/types";
import { preserveWorkbenchPresentation } from "@/core/router/desktop-workspace-route";
import { useTasks } from "@/core/tasks/hooks";
import type { TasksListResponse } from "@/core/tasks/api";
import { formatRelativeTimestamp } from "@/core/utils/datetime";
import { cn } from "@/lib/utils";

const POLL_MS = 15_000;
const RECENT_LIMIT = 6;
const FAILED_TODO_LIMIT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export type OwnerRunStatus = keyof ObservabilityOwnerCopy["runStatus"];

export interface OwnerRun {
  id: string;
  threadId: string | null;
  title: string;
  status: OwnerRunStatus;
  at: string | null;
}

interface BackendHealth {
  status?: string;
  lifecycle?: { restartRequired?: boolean };
}

export type OwnerTodo =
  | { kind: "add-model" }
  | { kind: "restart" }
  | { kind: "waiting"; count: number; threadId: string | null }
  | { kind: "failed"; run: OwnerRun };

export type OwnerVerdict =
  | "checking"
  | "offline"
  | "needs-model"
  | "attention"
  | "healthy"
  | "idle";

/** Models the picker can actually run: connected custom models. Echo Mix is a
 * virtual router over them and does not count on its own. */
export function connectedModelCount(models: readonly Model[]): number {
  return new Set(
    models
      .filter((model) => model.custom === true)
      .map((model) => model.entry_id || model.id),
  ).size;
}

function runTime(run: AgentTraceTaskRun): string | null {
  return run.updated_at || run.completed_at || run.started_at || null;
}

function tokensSpent(run: AgentTraceTaskRun): number {
  const totals = run.token_totals ?? {};
  return (totals.input_tokens ?? 0) + (totals.output_tokens ?? 0);
}

/** A run's state in owner words. A failure that never reached a model while no
 * model is connected did not start; that is setup, not a task failure. */
export function ownerRunStatus(
  run: AgentTraceTaskRun,
  hasModel: boolean,
): OwnerRunStatus {
  switch (run.status) {
    case "completed":
      return "completed";
    case "running":
      return "running";
    case "paused":
      return "paused";
    case "interrupted":
      return "interrupted";
    case "cancelled":
      return "cancelled";
    case "failed":
      return !hasModel &&
        (run.tool_calls_started ?? 0) === 0 &&
        tokensSpent(run) === 0
        ? "notStarted"
        : "failed";
    default:
      return "unknown";
  }
}

export function toOwnerRuns(
  runs: readonly AgentTraceTaskRun[],
  hasModel: boolean,
  untitled: string,
): OwnerRun[] {
  return runs.map((run) => ({
    id: run.task_id,
    threadId: run.thread_id ?? null,
    title: (run.title || run.summary || "").trim() || untitled,
    status: ownerRunStatus(run, hasModel),
    at: runTime(run),
  }));
}

function isToday(at: string | null, now: number): boolean {
  if (!at) return false;
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return false;
  return new Date(now).toDateString() === date.toDateString();
}

/** Failed runs that still matter: the latest run of their conversation and
 * from the last day. An older failure already retried is not a to-do. */
export function openFailures(runs: readonly OwnerRun[], now: number) {
  const latestByThread = new Map<string, OwnerRun>();
  for (const run of runs) {
    const key = run.threadId ?? run.id;
    const seen = latestByThread.get(key);
    if (!seen || (run.at ?? "") > (seen.at ?? "")) latestByThread.set(key, run);
  }
  return [...latestByThread.values()]
    .filter(
      (run) =>
        run.status === "failed" &&
        run.at !== null &&
        now - new Date(run.at).getTime() < DAY_MS,
    )
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .slice(0, FAILED_TODO_LIMIT);
}

export function ownerTodos({
  hasModel,
  modelsKnown,
  restartRequired,
  tasks,
  runs,
  now,
}: {
  hasModel: boolean;
  modelsKnown: boolean;
  restartRequired: boolean;
  tasks: TasksListResponse | undefined;
  runs: readonly OwnerRun[];
  now: number;
}): OwnerTodo[] {
  const todos: OwnerTodo[] = [];
  if (modelsKnown && !hasModel) todos.push({ kind: "add-model" });
  if (restartRequired) todos.push({ kind: "restart" });
  const waiting = [...(tasks?.pending ?? []), ...(tasks?.paused ?? [])];
  if (waiting.length > 0) {
    todos.push({
      kind: "waiting",
      count: waiting.length,
      threadId: waiting[0]?.thread_id || null,
    });
  }
  for (const run of openFailures(runs, now))
    todos.push({ kind: "failed", run });
  return todos;
}

export function ownerVerdict({
  healthLoading,
  healthError,
  todos,
  runs,
}: {
  healthLoading: boolean;
  healthError: boolean;
  todos: readonly OwnerTodo[];
  runs: readonly OwnerRun[];
}): OwnerVerdict {
  if (healthError) return "offline";
  if (healthLoading) return "checking";
  if (todos.some((todo) => todo.kind === "add-model")) return "needs-model";
  if (todos.length > 0) return "attention";
  return runs.length > 0 ? "healthy" : "idle";
}

function openModelSettings() {
  window.dispatchEvent(
    new CustomEvent("echo:open-settings", { detail: { tab: "models" } }),
  );
}

async function fetchBackendHealth(): Promise<BackendHealth> {
  const response = await fetch(`${getBackendBaseURL()}/api/health`, {
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as BackendHealth;
}

export function OwnerHealthSummary() {
  const { locale } = useI18n();
  const copy = observabilityOwnerCopy(locale);
  const { search } = useLocation();
  const health = useQuery({
    queryKey: ["observability", "owner", "health"],
    queryFn: fetchBackendHealth,
    refetchInterval: POLL_MS,
    retry: 1,
  });
  const taskRuns = useQuery({
    queryKey: ["observability", "owner", "task-runs"],
    queryFn: () => fetchAgentTraceTaskRuns(50),
    refetchInterval: POLL_MS,
    retry: 1,
  });
  const models = useModels();
  const tasks = useTasks("all");

  const hasModel = connectedModelCount(models.models) > 0;
  const modelsKnown = !models.isLoading && !models.error;
  const now = Date.now();
  const runs = useMemo(
    () => toOwnerRuns(taskRuns.data ?? [], hasModel, copy.untitledRun),
    [copy.untitledRun, hasModel, taskRuns.data],
  );
  const todos = ownerTodos({
    hasModel,
    modelsKnown,
    restartRequired: health.data?.lifecycle?.restartRequired === true,
    tasks: tasks.data,
    runs,
    now,
  });
  const verdict = ownerVerdict({
    healthLoading: health.isLoading,
    healthError: health.isError || (health.data?.status ?? "ok") !== "ok",
    todos,
    runs,
  });
  const today = runs.filter((run) => isToday(run.at, now));
  const completedToday = today.filter(
    (run) => run.status === "completed",
  ).length;
  const failedToday = today.filter((run) => run.status === "failed").length;
  const waiting =
    (tasks.data?.pending?.length ?? 0) + (tasks.data?.paused?.length ?? 0);
  const failedTodos = todos.filter((todo) => todo.kind === "failed").length;
  const updatedAt = Math.max(health.dataUpdatedAt, taskRuns.dataUpdatedAt);
  const refreshing = health.isFetching || taskRuns.isFetching;

  const headline =
    verdict === "offline"
      ? copy.offlineTitle
      : verdict === "checking"
        ? copy.checking
        : verdict === "needs-model"
          ? copy.needsModelTitle
          : verdict === "attention"
            ? copy.attentionTitle(todos.length)
            : copy.healthyTitle;
  const hint =
    verdict === "offline"
      ? copy.offlineHint
      : verdict === "needs-model"
        ? copy.needsModelHint
        : verdict === "attention"
          ? copy.attentionHint
          : verdict === "idle"
            ? copy.idleHint
            : verdict === "healthy"
              ? copy.healthyHint
              : "";
  const coreDot =
    verdict === "offline"
      ? "bg-destructive"
      : verdict === "attention" && failedTodos > 0
        ? "bg-destructive"
        : verdict === "attention"
          ? "bg-warning"
          : verdict === "healthy" || verdict === "idle"
            ? "bg-success"
            : "bg-muted-foreground/50";

  const threadHref = (threadId: string) =>
    preserveWorkbenchPresentation(
      `/workspace/realtime/${encodeURIComponent(threadId)}`,
      search,
    );

  return (
    <div className="space-y-4" data-testid="observability-owner-summary">
      <section
        aria-labelledby="owner-health-title"
        className="workspace-panel px-5 py-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              data-verdict={verdict}
              className={cn("mt-2 size-2.5 shrink-0 rounded-full", coreDot)}
            />
            <div className="min-w-0">
              <h2
                id="owner-health-title"
                className="text-base font-semibold"
                aria-live="polite"
              >
                {headline}
              </h2>
              {hint ? (
                <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {updatedAt > 0 ? (
              <span>
                {copy.updatedAt(
                  formatRelativeTimestamp(updatedAt, locale as Locale),
                )}
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={refreshing}
              onClick={() => {
                void health.refetch();
                void taskRuns.refetch();
                void tasks.refetch();
                void models.refetch();
              }}
            >
              <RefreshCwIcon className="mr-1.5 size-3.5" />
              {copy.refresh}
            </Button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <OwnerTile label={copy.tileRanToday} value={today.length} />
          <OwnerTile label={copy.tileCompleted} value={completedToday} />
          <OwnerTile
            label={copy.tileFailed}
            value={failedToday}
            tone={failedToday > 0 ? "breach" : undefined}
          />
          <OwnerTile
            label={copy.tileWaiting}
            value={waiting}
            tone={waiting > 0 ? "warning" : undefined}
          />
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section
          aria-labelledby="owner-todo-title"
          className="workspace-panel px-5 py-4"
        >
          <h3 id="owner-todo-title" className="text-sm font-semibold">
            {copy.todoTitle}
          </h3>
          {todos.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {verdict === "checking" ? copy.checking : copy.todoNone}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border-default">
              {todos.map((todo) => (
                <li
                  key={todo.kind === "failed" ? todo.run.id : todo.kind}
                  className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <OwnerTodoText todo={todo} copy={copy} />
                  {todo.kind === "add-model" ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 shrink-0"
                      onClick={openModelSettings}
                    >
                      {copy.todoAddModelAction}
                    </Button>
                  ) : todo.kind === "failed" && todo.run.threadId ? (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0"
                    >
                      <Link to={threadHref(todo.run.threadId)}>
                        {copy.todoOpenThread}
                      </Link>
                    </Button>
                  ) : todo.kind === "waiting" && todo.threadId ? (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0"
                    >
                      <Link to={threadHref(todo.threadId)}>
                        {copy.todoOpenThread}
                      </Link>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="owner-recent-title"
          className="workspace-panel px-5 py-4"
        >
          <h3 id="owner-recent-title" className="text-sm font-semibold">
            {copy.recentTitle}
          </h3>
          {runs.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {taskRuns.isLoading ? copy.checking : copy.recentEmpty}
            </p>
          ) : (
            <ul className="mt-2">
              {runs.slice(0, RECENT_LIMIT).map((run) => (
                <li key={run.id}>
                  <OwnerRunRow
                    run={run}
                    copy={copy}
                    locale={locale as Locale}
                    href={run.threadId ? threadHref(run.threadId) : null}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function OwnerTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning" | "breach";
}) {
  return (
    <div className="rounded-lg border border-border-default bg-background/40 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 font-mono text-xl font-semibold tabular-nums",
          tone === "breach"
            ? "text-destructive"
            : tone === "warning"
              ? "text-warning"
              : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function OwnerTodoText({
  todo,
  copy,
}: {
  todo: OwnerTodo;
  copy: ObservabilityOwnerCopy;
}) {
  const [title, hint] =
    todo.kind === "add-model"
      ? [copy.todoAddModelTitle, copy.todoAddModelHint]
      : todo.kind === "restart"
        ? [copy.todoRestartTitle, copy.todoRestartHint]
        : todo.kind === "waiting"
          ? [copy.todoWaitingTitle(todo.count), copy.todoWaitingHint]
          : [copy.todoFailedTitle(todo.run.title), copy.todoFailedHint];
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-medium" title={title}>
        {title}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

const RUN_DOT: Partial<Record<OwnerRunStatus, string>> = {
  completed: "bg-success",
  running: "bg-success animate-pulse motion-reduce:animate-none",
  failed: "bg-destructive",
  paused: "bg-warning",
};

function OwnerRunRow({
  run,
  copy,
  locale,
  href,
}: {
  run: OwnerRun;
  copy: ObservabilityOwnerCopy;
  locale: Locale;
  href: string | null;
}) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "size-2 shrink-0 rounded-full",
          RUN_DOT[run.status] ?? "bg-muted-foreground/45",
        )}
      />
      <span className="min-w-0 flex-1 truncate text-sm" title={run.title}>
        {run.title}
      </span>
      <span
        className={cn(
          "shrink-0 text-xs",
          run.status === "failed"
            ? "text-destructive"
            : "text-muted-foreground",
        )}
      >
        {copy.runStatus[run.status]}
      </span>
      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
        {run.at ? formatRelativeTimestamp(run.at, locale) : ""}
      </span>
      {href ? (
        <ArrowRightIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground/60"
        />
      ) : null}
    </>
  );
  const rowClass =
    "flex min-h-9 items-center gap-2.5 rounded-md px-2 -mx-2 py-1.5";
  return href ? (
    <Link
      to={href}
      className={cn(
        rowClass,
        "transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={rowClass}>{body}</div>
  );
}
