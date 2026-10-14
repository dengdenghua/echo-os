import { useEffect, useRef, useState } from "react";
import {
  currentActorId,
  getAuthSessionRevision,
  getToken,
} from "@/core/auth/api";
import { desktopActionHref } from "./desktop-actions";
import {
  captureChangesSession,
  changesFileAction,
  fetchTaskChanges,
  previewTaskUndo,
  type TaskChanges,
  type TaskFileChange,
} from "./task-changes";

function ChangesList({ view }: { view: TaskChanges }) {
  const [all, setAll] = useState(false);
  const planned = view.phase === "planned";
  const rows = all ? view.changes : view.changes.slice(0, 8);
  return (
    <div className="mt-2 space-y-2">
      <p className="text-[12px] text-slate-500">
        {planned ? "原位置 → 计划位置" : "执行前 → 目前可核验的位置"}
      </p>
      {rows.map((change: TaskFileChange) => {
        const after = planned ? change.plannedAfter : change.after;
        return (
          <div
            key={change.id}
            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[12px]"
          >
            <p className="break-all text-slate-600">{change.before.path}</p>
            <p className="mt-1 break-all font-medium text-slate-800">
              → {after.path ?? (planned ? "待确定" : "暂无法核验")}
            </p>
            <p className="mt-1 text-slate-500">
              {change.evidence === "verified"
                ? "已核验移动结果，内容保持一致"
                : change.evidence === "reverted"
                  ? "已撤销，原位置和内容已核验"
                  : change.evidence === "unchanged"
                    ? "未确认执行变更，原文件仍可核验"
                    : change.evidence === "planned"
                      ? change.status === "ready"
                        ? "计划中的移动，尚未执行"
                        : "计划中存在待复核项"
                      : "执行情况待核验"}
            </p>
            {!planned &&
              change.evidence === "uncertain" &&
              change.plannedAfter.path && (
                <p className="mt-1 break-all text-amber-700">
                  计划位置：{change.plannedAfter.path}
                </p>
              )}
          </div>
        );
      })}
      {!all && view.changes.length > rows.length && (
        <button
          type="button"
          className="text-[12px] text-blue-600"
          onClick={() => setAll(true)}
        >
          查看全部 {view.changes.length} 条
        </button>
      )}
    </div>
  );
}

export function TaskChangesPanel({ taskId }: { taskId: string }) {
  const [view, setView] = useState<TaskChanges | null>(null);
  const [undo, setUndo] = useState<TaskChanges | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const session = useRef(captureChangesSession());
  const actor = currentActorId();
  const authRevision = getAuthSessionRevision();
  const token = getToken();
  useEffect(() => {
    mounted.current = true;
    const request = new AbortController();
    controller.current?.abort();
    controller.current = request;
    session.current = captureChangesSession();
    setView(null);
    setUndo(null);
    setError(null);
    setLoading(true);
    setBusy(false);
    busyRef.current = false;
    fetchTaskChanges(taskId, request.signal)
      .then((result) => {
        if (!request.signal.aborted && session.current.current())
          setView(result);
      })
      .catch((reason) => {
        if (!request.signal.aborted && session.current.current())
          setError(
            reason instanceof Error ? reason.message : "无法读取变更记录。",
          );
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => {
      mounted.current = false;
      request.abort();
      controller.current?.abort();
    };
  }, [taskId, revision, actor, authRevision, token]);
  const makeUndo = async () => {
    if (!view || undo || busyRef.current || !session.current.current()) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setUndo(null);
    const request = new AbortController();
    controller.current?.abort();
    controller.current = request;
    try {
      const preview = await previewTaskUndo(view, request.signal);
      if (
        !request.signal.aborted &&
        mounted.current &&
        session.current.current()
      )
        setUndo(preview);
    } catch (reason) {
      if (
        !request.signal.aborted &&
        mounted.current &&
        session.current.current()
      )
        setError(
          reason instanceof Error ? reason.message : "无法生成撤销预览。",
        );
    } finally {
      if (!request.signal.aborted && mounted.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const current = session.current.current();
  const visible = current ? view : null;
  const visibleUndo = current ? undo : null;
  const files = visibleUndo ? changesFileAction(visibleUndo) : null;
  return (
    <section
      aria-label="任务变化记录"
      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-800">执行变化</h3>
        <button
          type="button"
          className="text-[12px] text-blue-600"
          disabled={loading || busy}
          onClick={() => setRevision((value) => value + 1)}
        >
          刷新变更
        </button>
      </div>
      {loading && (
        <p className="mt-2 text-[12px] text-slate-500">正在核验操作记录…</p>
      )}
      {error && current && (
        <p role="alert" className="mt-2 text-[12px] text-red-700">
          {error}
        </p>
      )}
      {visible && !visible.available && (
        <p className="mt-2 text-[12px] leading-5 text-slate-500">
          {visible.reason === "provider_unavailable"
            ? "当前服务无法读取此任务的操作证据。"
            : "此任务尚无可核验的文件变化记录。"}
        </p>
      )}
      {visible?.available && (
        <>
          <p className="mt-2 text-[12px] leading-5 text-slate-500">
            {visible.phase === "planned"
              ? "这是已保存的预演计划，尚未执行。执行前仍会重新核验文件与权限。"
              : "记录来自文件服务的执行回执，并重新核验目前的文件位置和内容。"}
          </p>
          <ChangesList
            key={[visible.planId, visible.revision].join(":")}
            view={visible}
          />
          {visible.canPreviewUndo && (
            <button
              type="button"
              onClick={makeUndo}
              disabled={busy || Boolean(visibleUndo)}
              className="mt-3 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[12px] disabled:opacity-50"
            >
              {busy
                ? "正在生成预览…"
                : visibleUndo
                  ? "撤销预览已生成"
                  : "预览撤销"}
            </button>
          )}
        </>
      )}
      {visibleUndo && (
        <section
          aria-label="撤销预演"
          className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-2"
        >
          <h4 className="text-xs font-semibold text-blue-800">撤销预演</h4>
          <p className="mt-1 text-[12px] leading-5 text-blue-700">
            仅生成了新计划，尚未移动文件。确认执行仍需在文件管理器审批；冲突项不会直接恢复。
          </p>
          <ChangesList key={visibleUndo.planId} view={visibleUndo} />
          {files && (
            <a
              href={desktopActionHref(files)}
              className="mt-2 inline-block text-[12px] text-blue-700"
            >
              在文件管理器查看并确认
            </a>
          )}
        </section>
      )}
    </section>
  );
}
