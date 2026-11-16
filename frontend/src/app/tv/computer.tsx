import { useEffect, useRef, useState } from "react";
import { Monitor, MoreHorizontal, X } from "lucide-react";
import { authHeaders } from "@/core/auth/api";
import { getBackendBaseURL } from "@/core/config";
import { startEchoTask, useEchoTaskProjection } from "@/appliance/task-space";
import { TVTextField } from "./text-field";
import { tvStatus } from "./thread";
import "./computer.css";

export type ComputerState = {
  running: boolean;
  controller: "human" | "agent" | "paused";
  generation: string;
  threads: string[];
  activity: { id: string; kind: string; label: string; threadId: string }[];
};
export async function computerRequest<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(
    `${getBackendBaseURL()}/api/work-computer/${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(
      typeof result?.detail === "string" ? result.detail : "工作窗口暂时不可用",
    );
  }
  return response.json() as Promise<T>;
}

export function TVComputer({
  onClose,
  onThread,
  covered = false,
}: {
  onClose: () => void;
  onThread: (id: string) => void;
  covered?: boolean;
}) {
  const [state, setState] = useState<ComputerState | null>(null);
  const [frame, setFrame] = useState("");
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const autoStarted = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState("");
  const [text, setText] = useState("");
  const [url, setURL] = useState("");
  const [cursor, setCursor] = useState({ x: 640, y: 360 });
  const [steering, setSteering] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const locked = useRef(false),
    alive = useRef(true);
  const projection = useEchoTaskProjection(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true,
      timer: ReturnType<typeof setTimeout>,
      imageURL = "";
    const controller = new AbortController();
    const update = async () => {
      try {
        let value = await computerRequest<ComputerState>("status");
        if (!active) return;
        if (!value.running && !autoStarted.current && !minimized && !covered) {
          autoStarted.current = true;
          setOpening(true);
          try {
            value = await computerRequest<ComputerState>("start", {});
          } finally {
            if (active) setOpening(false);
          }
        }
        if (!active) return;
        setState(value);
        if (value.controller !== "human") setSteering(false);
        if (value.running && !minimized && !covered) {
          const response = await fetch(
            `${getBackendBaseURL()}/api/work-computer/frame`,
            { headers: authHeaders(), signal: controller.signal },
          );
          if (!response.ok) throw new Error("画面暂时中断，正在重新连接…");
          const blob = await response.blob();
          if (!active) return;
          const next = URL.createObjectURL(blob);
          if (imageURL) URL.revokeObjectURL(imageURL);
          imageURL = next;
          setFrame(next);
          setConnectionError("");
        }
      } catch (e) {
        if (active)
          setConnectionError(
            e instanceof Error ? e.message : "正在重新连接工作窗口…",
          );
      } finally {
        if (active)
          timer = setTimeout(update, minimized || covered ? 2500 : 900);
      }
    };
    void update();
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
      if (imageURL) URL.revokeObjectURL(imageURL);
    };
  }, [minimized, covered]);
  useEffect(() => {
    if (!minimized && !covered) closeButton.current?.focus();
  }, [minimized, covered]);
  useEffect(() => {
    if (keyboardOpen)
      panel.current
        ?.querySelector<HTMLInputElement>('[aria-label="输入到电脑"]')
        ?.focus();
  }, [keyboardOpen]);
  const run = async (fn: () => Promise<unknown>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      if (alive.current)
        setState(await computerRequest<ComputerState>("status"));
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "操作失败，请重试");
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const input = (command: Record<string, unknown>) =>
    run(async () => {
      const result = await computerRequest<{ focusedEditable?: boolean }>(
        "input",
        {
          ...command,
          generation: state?.generation,
        },
      );
      if (
        alive.current &&
        result.focusedEditable &&
        (command.action === "click" ||
          (command.action === "key" && command.key === "Tab"))
      ) {
        setSteering(false);
        setKeyboardOpen(true);
        setTasksOpen(false);
      }
    });
  const human = state?.running && state.controller === "human";
  const tasks =
    projection.projection?.tasks
      .filter((t) => t.threadId && state?.threads.includes(t.threadId))
      .slice(0, 4) ?? [];
  const label = !state?.running
    ? opening
      ? "正在准备电脑"
      : "电脑未打开"
    : state.controller === "human"
      ? "你正在操作"
      : state.controller === "agent"
        ? "Echo 可操作"
        : "电脑已就绪";
  if (minimized)
    return (
      <button
        hidden={covered}
        data-tv-focus
        className="tv-computer-mini"
        onClick={() => setMinimized(false)}
      >
        <Monitor />
        <span>
          Echo 的电脑<small>{label}</small>
        </span>
      </button>
    );
  return (
    <section
      ref={panel}
      hidden={covered}
      className="tv-computer-window"
      data-tv-dialog
      role="dialog"
      onKeyDown={(e) => {
        if (
          e.key === "Escape" &&
          !steering &&
          !(e.target as HTMLElement).closest(".tv-keyboard")
        ) {
          e.preventDefault();
          e.stopPropagation();
          if (menuOpen) {
            setMenuOpen(false);
            moreButton.current?.focus();
          } else if (keyboardOpen) {
            setKeyboardOpen(false);
            moreButton.current?.focus();
          } else if (tasksOpen) {
            setTasksOpen(false);
            moreButton.current?.focus();
          } else setMinimized(true);
        }
      }}
      aria-label="Echo 的电脑悬浮窗口"
    >
      <header className="tv-computer-title">
        <div className="tv-computer-brand">
          <Monitor />
          <strong>Echo 的电脑</strong>
        </div>
        <span />
        <button
          ref={moreButton}
          data-tv-focus
          aria-label="更多电脑操作"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal />
        </button>
        <button
          ref={closeButton}
          data-tv-focus
          aria-label="关闭电脑窗口"
          onClick={onClose}
        >
          <X />
        </button>
      </header>
      {menuOpen && (
        <div
          className="tv-computer-menu"
          data-tv-dialog
          role="dialog"
          aria-label="电脑操作菜单"
        >
          <button
            data-tv-focus
            data-tv-back
            onClick={() => {
              setMenuOpen(false);
              moreButton.current?.focus();
            }}
          >
            返回电脑
          </button>
          <button
            data-tv-focus
            onClick={() => {
              setTasksOpen((v) => !v);
              setKeyboardOpen(false);
              setMenuOpen(false);
            }}
          >
            {tasksOpen ? "收起任务" : "任务"}
          </button>
          {human && (
            <button
              data-tv-focus
              onClick={() => {
                setKeyboardOpen((v) => !v);
                setTasksOpen(false);
                setMenuOpen(false);
              }}
            >
              {keyboardOpen ? "收起输入" : "电脑键盘"}
            </button>
          )}
          <button
            data-tv-focus
            disabled={busy || !human}
            onClick={() => {
              setMenuOpen(false);
              void input({ action: "home" });
            }}
          >
            工作笔记
          </button>
          <button
            data-tv-focus
            onClick={() => {
              setSteering(false);
              setMenuOpen(false);
              setMinimized(true);
            }}
          >
            收起电脑窗口
          </button>
          {state?.running && (
            <button
              data-tv-focus
              disabled={busy}
              onClick={() => {
                setMenuOpen(false);
                autoStarted.current = true;
                void run(() => computerRequest("stop", {}));
              }}
            >
              停止会话
            </button>
          )}
        </div>
      )}
      <div className="tv-computer-toolbar" data-controller={state?.controller}>
        <span>
          <i aria-hidden="true" />
          {label}
        </span>
        {!state?.running ? (
          <button
            data-tv-focus
            disabled={busy || opening}
            onClick={() => void run(() => computerRequest("start", {}))}
          >
            {opening ? "正在打开…" : "打开电脑"}
          </button>
        ) : (
          <button
            data-tv-focus
            disabled={busy}
            onClick={() =>
              void run(() =>
                computerRequest("control", {
                  controller: human ? "agent" : "human",
                  generation: state.generation,
                }),
              )
            }
          >
            {human ? "交还 Echo" : "我来接管"}
          </button>
        )}
      </div>
      <div className="tv-computer-body" data-tasks-open={tasksOpen}>
        <div>
          <div
            className="tv-computer-screen"
            tabIndex={0}
            data-tv-focus
            role="button"
            aria-label={
              steering
                ? "电脑指针，方向键移动，确认点击，返回退出"
                : "电脑画面，确认后操作指针"
            }
            onClick={(e) => {
              if (!human || busy) return;
              const r = e.currentTarget.getBoundingClientRect();
              if (e.detail)
                void input({
                  action: "click",
                  x: Math.min(
                    1279,
                    Math.max(
                      0,
                      Math.round(((e.clientX - r.left) / r.width) * 1280),
                    ),
                  ),
                  y: Math.min(
                    719,
                    Math.max(
                      0,
                      Math.round(((e.clientY - r.top) / r.height) * 720),
                    ),
                  ),
                });
              else setSteering(true);
            }}
            onKeyDown={(e) => {
              if (!human) return;
              if (!steering && e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                setSteering(true);
                return;
              }
              if (!steering) return;
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Enter",
                  "Escape",
                  "Backspace",
                ].includes(e.key)
              ) {
                e.preventDefault();
                e.stopPropagation();
              }
              if (e.key === "Escape" || e.key === "Backspace") {
                setSteering(false);
                closeButton.current?.focus();
              } else if (e.key === "Enter")
                void input({ action: "click", ...cursor });
              else if (e.key.startsWith("Arrow"))
                setCursor((c) => ({
                  x: Math.min(
                    1279,
                    Math.max(
                      0,
                      c.x +
                        (e.key === "ArrowRight"
                          ? 24
                          : e.key === "ArrowLeft"
                            ? -24
                            : 0),
                    ),
                  ),
                  y: Math.min(
                    719,
                    Math.max(
                      0,
                      c.y +
                        (e.key === "ArrowDown"
                          ? 24
                          : e.key === "ArrowUp"
                            ? -24
                            : 0),
                    ),
                  ),
                }));
            }}
          >
            {state?.running && frame ? (
              <img
                src={frame}
                alt="这台 Echo OS 上的独立工作窗口画面"
                draggable={false}
              />
            ) : (
              <div className="tv-computer-empty">
                <Monitor />
                <p>同一台 Echo OS，独立工作窗口</p>
                <small>关闭窗口不结束任务；停止会话保留资料。</small>
              </div>
            )}
            {steering && human && (
              <span
                className="tv-computer-cursor"
                style={{
                  left: `${(cursor.x / 1280) * 100}%`,
                  top: `${(cursor.y / 720) * 100}%`,
                }}
              />
            )}
          </div>
          {human && keyboardOpen && (
            <div className="tv-computer-inputs">
              <div className="tv-computer-drawer-title">
                <h3>输入到电脑</h3>
                <button
                  data-tv-focus
                  aria-label="收起输入"
                  onClick={() => {
                    setKeyboardOpen(false);
                    moreButton.current?.focus();
                  }}
                >
                  <X />
                </button>
              </div>
              <TVTextField label="输入到电脑" value={text} onChange={setText} />
              <button
                data-tv-focus
                disabled={busy || !text}
                onClick={() => void input({ action: "text", text })}
              >
                输入
              </button>
              {[
                ["Tab", "下一项"],
                ["Enter", "确认"],
                ["SelectAll", "全选"],
                ["Backspace", "退格"],
              ].map(([key, title]) => (
                <button
                  key={key}
                  data-tv-focus
                  disabled={busy}
                  onClick={() => void input({ action: "key", key })}
                >
                  {title}
                </button>
              ))}
              <TVTextField label="网页地址" value={url} onChange={setURL} />
              <button
                data-tv-focus
                disabled={busy || !url}
                onClick={() => void input({ action: "navigate", url })}
              >
                打开
              </button>
            </div>
          )}
        </div>
        <aside hidden={!tasksOpen} className="tv-computer-tasks">
          <div className="tv-computer-drawer-title">
            <h3>任务</h3>
            <button
              data-tv-focus
              aria-label="收起任务"
              onClick={() => {
                setTasksOpen(false);
                moreButton.current?.focus();
              }}
            >
              <X />
            </button>
          </div>
          <TVTextField
            label="交给 Echo"
            value={draft}
            onChange={setDraft}
            placeholder="在电脑里做点什么…"
          />
          <button
            data-tv-focus
            disabled={busy || !draft.trim() || opening}
            onClick={() =>
              void run(async () => {
                let current = await computerRequest<ComputerState>("status");
                if (!current.running)
                  current = await computerRequest<ComputerState>("start", {});
                if (current.controller !== "agent")
                  await computerRequest("control", {
                    controller: "agent",
                    generation: current.generation,
                  });
                await startEchoTask(draft, undefined, true);
                setDraft("");
                projection.refresh();
              })
            }
          >
            开始任务
          </button>
          {tasks.map((t) => (
            <button
              className="tv-computer-task"
              key={t.id}
              data-tv-focus
              onClick={() => onThread(t.threadId!)}
            >
              <strong>{t.title}</strong>
              <small>{tvStatus(t.displayStatus || t.status)} · 查看对话</small>
            </button>
          ))}
          {!tasks.length && (
            <p className="tv-muted">这里会显示此电脑的真实任务进度。</p>
          )}
          <div
            className="tv-computer-activity"
            data-tv-focus
            data-tv-scroll
            tabIndex={0}
            aria-label="电脑操作记录"
          >
            {state?.activity
              .slice(-5)
              .reverse()
              .map((a) => (
                <p key={a.id}>{a.label}</p>
              ))}
          </div>
        </aside>
      </div>
      {(error || connectionError || steering) && (
        <footer>
          {error || connectionError ? (
            <span role="alert">{error || connectionError}</span>
          ) : (
            <span>
              {steering
                ? "方向键移动指针 · 确认点击 · 返回退出指针"
                : "悬浮工作窗口 · 遥控器焦点与 Echo 操作分离"}
            </span>
          )}
        </footer>
      )}
    </section>
  );
}
