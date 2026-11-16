import { useEffect, useRef, useState } from "react";
import type {
  useEchoTaskProjection,
  EchoTaskProjection,
} from "@/appliance/task-space";
import { useRealtimeThread } from "@/core/realtime/use-realtime-thread";
import type { Item } from "@/core/realtime/items";
import { TVTextField } from "./text-field";

export function tvItemText(item: Item): string {
  switch (item.type) {
    case "agentMessage":
    case "userMessage":
    case "steeringUserMessage":
    case "plan":
      return item.text;
    case "commandExecution":
      return [
        item.command,
        item.cwd && `目录：${item.cwd}`,
        item.aggregatedOutput,
        item.exitCode !== null && `退出码：${item.exitCode}`,
      ]
        .filter((x) => x !== false && x != null)
        .join("\n");
    case "mcpToolCall":
      return `${item.server} / ${item.tool}\n${JSON.stringify(item.arguments, null, 2)}\n${item.error ?? JSON.stringify(item.result, null, 2)}`;
    case "fileChange":
      return item.changes
        .map((c) => `${c.op} ${c.path}\n${c.diff ?? ""}`)
        .join("\n");
    case "reasoning":
      return item.summary.join("\n");
    case "approval":
      return `${item.decision}\n${JSON.stringify(item.params, null, 2)}`;
    default:
      return JSON.stringify(item, null, 2);
  }
}
export const tvStatus = (value: string) =>
  ({
    inProgress: "处理中",
    running: "处理中",
    completed: "已完成",
    interrupted: "已停止",
    cancelled: "已取消",
    failed: "执行失败",
    waiting_approval: "等待确认",
  })[value] ?? value;

export function TVThread({
  threadId,
  engine = "codex",
  model,
  task,
  decideApproval,
  onBack,
  onHistory,
}: {
  threadId: string;
  engine?: "codex" | "codebuddy";
  model?: string;
  task?: EchoTaskProjection;
  decideApproval: ReturnType<typeof useEchoTaskProjection>["decideApproval"];
  onBack: () => void;
  onHistory: () => void;
}) {
  const live = useRealtimeThread({ threadId });
  const [draft, setDraft] = useState(""),
    [details, setDetails] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const sending = useRef(false),
    alive = useRef(true);
  const transcript = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  useEffect(() => {
    const element = transcript.current;
    if (element && followLatest.current)
      element.scrollTop = element.scrollHeight;
  }, [live.state.turns]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const turn = live.state.turns.at(-1),
    active = turn?.status === "inProgress";
  const recordedEngine = turn?.execution?.engine ?? task?.executionEngine;
  const conversationEngine =
    recordedEngine === "codebuddy" || recordedEngine === "codex"
      ? recordedEngine
      : engine;
  const approvals = live.state.pendingApprovals;
  const held =
    !approvals.length &&
    task?.approval?.required &&
    task.status === "waiting_approval"
      ? task.approval
      : null;
  const action = async (work: () => Promise<unknown>) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (alive.current)
        setError(
          e && typeof e === "object" && "message" in e
            ? String(e.message)
            : "操作失败，请重试",
        );
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const send = () => {
    const text = draft.trim();
    if (!text || active || !live.connected) return;
    void action(async () => {
      setDraft("");
      try {
        await live.startTurn({
          input: text,
          executionEngine: conversationEngine,
          ...(model ? { model } : {}),
          approvalPolicy: "on-request",
          clientItemId: `itm_tv_${crypto.randomUUID()}`,
        });
      } catch (e) {
        if (alive.current) setDraft(text);
        throw e;
      }
    });
  };
  return (
    <>
      <header className="tv-panel-header">
        <button
          data-tv-focus
          data-tv-back
          onClick={() => (details ? setDetails(false) : onBack())}
        >
          {details ? "返回对话" : "返回大屏"}
        </button>
        <h2>{details ? "任务详情" : "Echo 对话"}</h2>
        <button data-tv-focus onClick={onHistory}>
          对话记录
        </button>
        <button
          data-tv-focus
          onClick={() => {
            if (transcript.current) {
              transcript.current.scrollTop = transcript.current.scrollHeight;
              followLatest.current = true;
              transcript.current.focus();
            }
          }}
        >
          最新消息
        </button>
        <button
          data-tv-focus
          aria-pressed={details}
          onClick={() => setDetails((v) => !v)}
        >
          {details ? "查看对话" : "任务详情"}
        </button>
      </header>
      <p className="tv-connection" role="status">
        {live.connected
          ? live.state.resumeState === "resumed"
            ? "已连接"
            : "正在读取对话"
          : "正在恢复连接…"}{" "}
        · {turn ? tvStatus(turn.status) : "准备就绪"}
      </p>
      {!live.connected && (
        <button data-tv-focus onClick={() => void action(live.resume)}>
          重新连接
        </button>
      )}
      {error && (
        <p role="alert" className="tv-error">
          {error}
        </p>
      )}
      <div
        ref={transcript}
        className="tv-transcript"
        data-tv-focus
        data-tv-scroll
        tabIndex={0}
        onScroll={() => {
          const element = transcript.current;
          if (element)
            followLatest.current =
              element.scrollHeight - element.clientHeight - element.scrollTop <
              40;
        }}
        aria-label={details ? "任务执行记录" : "对话内容"}
      >
        {live.state.hasMoreTurns && (
          <button
            data-tv-focus
            disabled={busy}
            onClick={() => void action(live.loadOlderTurns)}
          >
            加载更早对话
          </button>
        )}
        {live.state.turns.length === 0 && (
          <p className="tv-muted">正在读取任务记录…</p>
        )}
        {live.state.turns.map((t) => (
          <section key={t.id} className="tv-turn">
            <p className="tv-turn-status">{tvStatus(t.status)}</p>
            {t.items
              .filter(
                (item) =>
                  details ||
                  [
                    "agentMessage",
                    "userMessage",
                    "steeringUserMessage",
                  ].includes(item.type),
              )
              .map((item) => (
                <article
                  key={item.id}
                  className={`tv-message tv-message-${item.type}`}
                >
                  <h3>
                    {item.type === "agentMessage"
                      ? "Echo"
                      : item.type === "userMessage" ||
                          item.type === "steeringUserMessage"
                        ? "你"
                        : `${item.type} · ${tvStatus(item.status)}`}
                  </h3>
                  <pre>{tvItemText(item)}</pre>
                </article>
              ))}
            {t.error && (
              <p className="tv-error">
                {String(
                  t.error.message ?? t.error.error ?? JSON.stringify(t.error),
                )}
              </p>
            )}
            {t.grounding?.length ? (
              <aside className="tv-citations">
                <h3>参考资料</h3>
                {t.grounding.map((g, i) => (
                  <p key={i}>{g.path}</p>
                ))}
              </aside>
            ) : null}
          </section>
        ))}
      </div>
      {(approvals.length > 0 || held) && (
        <section
          className="tv-approval"
          role="region"
          aria-label="等待你的确认"
        >
          <h3>执行前需要你确认</h3>
          {approvals.map((a) => (
            <div key={a.requestId}>
              <pre data-tv-focus data-tv-scroll tabIndex={0}>
                {JSON.stringify(a.params, null, 2)}
              </pre>
              <button
                data-tv-focus
                disabled={!live.connected}
                onClick={() => live.resolveApproval(a.requestId, false)}
              >
                拒绝本次
              </button>
              <button
                data-tv-focus
                disabled={!live.connected}
                onClick={() => live.resolveApproval(a.requestId, true)}
              >
                允许本次
              </button>
            </div>
          ))}
          {held && task && (
            <>
              <pre data-tv-focus data-tv-scroll tabIndex={0}>
                {[held.tool, held.action, held.reason]
                  .filter(Boolean)
                  .join("\n")}
              </pre>
              <button
                data-tv-focus
                disabled={busy}
                onClick={() =>
                  void action(() =>
                    decideApproval(
                      task.id,
                      false,
                      "TV 用户拒绝本次操作",
                      held.version ?? undefined,
                    ),
                  )
                }
              >
                拒绝本次
              </button>
              <button
                data-tv-focus
                disabled={busy}
                onClick={() =>
                  void action(() =>
                    decideApproval(
                      task.id,
                      true,
                      "TV 用户允许本次操作",
                      held.version ?? undefined,
                    ),
                  )
                }
              >
                允许本次
              </button>
            </>
          )}
        </section>
      )}
      <div className="tv-conversation-compose">
        <TVTextField
          label="继续对话"
          value={draft}
          onChange={setDraft}
          multiline
          placeholder="继续提问…"
        />
        <div className="tv-actions">
          <button
            data-tv-focus
            className="tv-primary"
            disabled={
              !draft.trim() ||
              busy ||
              active ||
              !live.connected ||
              live.state.resumeState !== "resumed"
            }
            onClick={send}
          >
            发送消息
          </button>
          {active && (
            <button
              data-tv-focus
              onClick={() =>
                void live.interrupt().catch((e) => setError(String(e)))
              }
            >
              停止任务
            </button>
          )}
        </div>
      </div>
    </>
  );
}
