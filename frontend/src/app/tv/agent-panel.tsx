import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startEchoTask, useEchoTaskProjection } from "@/appliance/task-space";
import { tvRequest } from "@/core/tv/api";
import { getCoderModelProfile } from "@/core/coder/api";
import { useAuth } from "@/providers/AuthProvider";
import { useTVDialogFocus } from "./use-tv-focus";
import { TVTextField } from "./text-field";
import { TVThread, tvStatus } from "./thread";

export function TVAgentPanel({
  onClose,
  initialPrompt = "",
  onSettings = () => {},
  initialThread = null,
  onThreadChange = () => {},
}: {
  onClose: () => void;
  initialPrompt?: string;
  onSettings?: () => void;
  initialThread?: string | null;
  onThreadChange?: (id: string | null) => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    submitting = useRef(false),
    alive = useRef(true);
  const [prompt, setPrompt] = useState(initialPrompt),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [thread, setThread] = useState<string | null>(initialThread),
    [history, setHistory] = useState(false);
  useEffect(() => {
    if (initialThread) setThread(initialThread);
  }, [initialThread]);
  const { user } = useAuth();
  const actor = user?.actor_id || user?.user_id || "local";
  const readiness = useQuery({
    queryKey: ["tv-agent-readiness", actor],
    queryFn: ({ signal }) => getCoderModelProfile(signal),
    staleTime: 0,
    retry: false,
  });
  const [engine, setEngine] = useState<"codex" | "codebuddy">("codex");
  const [model, setModel] = useState("auto");
  const models = useQuery({
    queryKey: ["codebuddy-models"],
    queryFn: ({ signal }) =>
      tvRequest<{ models: string[] }>(
        "/api/config/codebuddy/models",
        "GET",
        undefined,
        signal,
      ),
    enabled: engine === "codebuddy",
    retry: false,
  });
  const buddy = useQuery({
    queryKey: ["codebuddy-status"],
    queryFn: ({ signal }) =>
      tvRequest<{ available: boolean }>(
        "/api/config/codebuddy/status",
        "GET",
        undefined,
        signal,
      ),
    retry: false,
  });
  const projection = useEchoTaskProjection(true);
  const ready =
    engine === "codex"
      ? readiness.data?.execution_available === true
      : buddy.data?.available === true;
  useTVDialogFocus(root);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const submit = async () => {
    if (!prompt.trim() || submitting.current || !ready) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await startEchoTask(
        prompt.trim(),
        undefined,
        false,
        engine,
        engine === "codebuddy" && model !== "auto"
          ? `codebuddy/${model}`
          : undefined,
      );
      if (alive.current) {
        setThread(result.thread_id);
        onThreadChange(result.thread_id);
        setPrompt("");
        projection.refresh();
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "暂时无法连接 Echo");
    } finally {
      submitting.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <div className="tv-dialog-backdrop">
      <section
        className="tv-conversation"
        ref={root}
        data-tv-dialog
        role="dialog"
        aria-modal="true"
        aria-label="Echo 对话"
      >
        {history && (
          <div>
            <header className="tv-panel-header">
              <button
                data-tv-focus
                data-tv-back
                onClick={() => setHistory(false)}
              >
                返回对话
              </button>
              <h2>对话与任务</h2>
              <button
                data-tv-focus
                onClick={() => {
                  setThread(null);
                  onThreadChange(null);
                  setHistory(false);
                }}
              >
                新对话
              </button>
            </header>
            {projection.error && (
              <p role="alert">
                {projection.error}
                <button data-tv-focus onClick={projection.refresh}>
                  重试
                </button>
              </p>
            )}
            <div className="tv-history-list">
              {projection.projection?.tasks
                .filter((t) => t.threadId)
                .map((t) => (
                  <button
                    data-tv-focus
                    key={t.id}
                    onClick={() => {
                      setThread(t.threadId);
                      onThreadChange(t.threadId);
                      setHistory(false);
                    }}
                  >
                    <strong>{t.title}</strong>
                    <small>{tvStatus(t.displayStatus || t.status)}</small>
                  </button>
                ))}
              {!projection.loading && !projection.projection?.tasks.length && (
                <p>还没有对话记录</p>
              )}
            </div>
          </div>
        )}
        <div
          hidden={history}
          className={thread ? "tv-thread-view" : "tv-welcome-view"}
        >
          {thread ? (
            <TVThread
              key={thread}
              threadId={thread}
              engine={engine}
              model={
                engine === "codebuddy" && model !== "auto"
                  ? `codebuddy/${model}`
                  : undefined
              }
              task={projection.projection?.tasks.find(
                (t) => t.threadId === thread,
              )}
              decideApproval={projection.decideApproval}
              onBack={onClose}
              onHistory={() => setHistory(true)}
            />
          ) : (
            <>
              <header className="tv-panel-header">
                <button data-tv-focus data-tv-back onClick={onClose}>
                  返回大屏
                </button>
                <h2>有什么想做的？</h2>
                <button data-tv-focus onClick={() => setHistory(true)}>
                  对话记录
                </button>
              </header>
              <p className="tv-muted">
                聊想法、检索知识，或交给 Echo 一个任务。
              </p>
              <div className="tv-welcome-mark" aria-hidden="true">
                <img src="/images/echo.svg" alt="" />
              </div>
              {!ready && (
                <section role="status">
                  <p>
                    {readiness.isPending
                      ? "正在检查助手…"
                      : readiness.isError
                        ? "暂时无法检查助手状态，请重试。"
                        : "请先在大屏模型设置中接入可用模型。"}
                  </p>
                  <button
                    data-tv-focus
                    onClick={() => void readiness.refetch()}
                  >
                    重新检查
                  </button>
                  <button data-tv-focus onClick={onSettings}>
                    打开模型设置
                  </button>
                </section>
              )}
              <div aria-label="执行引擎">
                <button
                  data-tv-focus
                  aria-pressed={engine === "codex"}
                  onClick={() => setEngine("codex")}
                >
                  Codex
                </button>
                <button
                  data-tv-focus
                  aria-pressed={engine === "codebuddy"}
                  onClick={() => setEngine("codebuddy")}
                >
                  CodeBuddy
                </button>
              </div>
              {engine === "codebuddy" && models.data?.models?.length ? (
                <select
                  data-tv-focus
                  aria-label="CodeBuddy 模型"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  <option value="auto">官方默认模型</option>
                  {models.data.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : null}
              <TVTextField
                label="给 Agent 的任务"
                multiline
                value={prompt}
                onChange={setPrompt}
                placeholder="说说你的想法…"
              />
              <button
                data-tv-focus
                className="tv-primary"
                disabled={!prompt.trim() || busy || !ready}
                onClick={() => void submit()}
              >
                {busy ? "正在提交…" : "发送任务"}
              </button>
              {error && (
                <p role="alert" className="tv-error">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
