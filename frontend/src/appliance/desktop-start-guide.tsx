import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon, CompassIcon } from "lucide-react";

type Phase = "new" | "started" | "done" | "review";
export const OPEN_DESKTOP_START_GUIDE_EVENT = "echo:open-desktop-start-guide";
export const STARTER_TASK_PROMPT =
  "请为我写一份简洁的每周工作计划模板，包含目标、任务、时间安排和复盘。先在对话中展示结果，不修改本地文件。";

/** Optional guidance; opening a template never sends it on the user's behalf. */
export function DesktopStartGuide({
  identity,
  completedTasks,
  onStorage,
  onModel,
  onPermissions,
  onStart,
  onResults,
  onDatabase,
  onApps,
  children,
}: {
  identity: string;
  completedTasks: number;
  onStorage: () => void;
  onModel: () => void;
  onPermissions: () => void;
  onStart: (prompt: string) => void;
  onResults: () => void;
  onDatabase: () => void;
  onApps: () => void;
  children?: ReactNode;
}) {
  return (
    <Guide
      key={identity}
      {...{
        identity,
        completedTasks,
        onStorage,
        onModel,
        onPermissions,
        onStart,
        onResults,
        onDatabase,
        onApps,
        children,
      }}
    />
  );
}

function Guide(props: Parameters<typeof DesktopStartGuide>[0]) {
  const key = `echo:desktop-start.v2:${props.identity}`;
  const [collapsed, setCollapsed] = useState(true);
  const [phase, setPhase] = useState<Phase>(() => {
    try {
      const value = localStorage.getItem(key);
      return value === "started" || value === "done" ? value : "new";
    } catch {
      return "new";
    }
  });
  const changePhase = (next: Phase) => {
    setPhase(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      /* Keep the desktop usable without storage. */
    }
  };
  useEffect(() => {
    const openGuide = () => {
      setPhase("review");
      setCollapsed(false);
    };
    window.addEventListener(OPEN_DESKTOP_START_GUIDE_EVENT, openGuide);
    return () =>
      window.removeEventListener(OPEN_DESKTOP_START_GUIDE_EVENT, openGuide);
  }, []);
  const [guideOffset, setGuideOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const guideDragRef = useRef<{
    startX: number;
    startY: number;
    initX: number;
    initY: number;
  } | null>(null);

  const handleGuideDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (
      (e.target as HTMLElement).closest(
        "button, a, input, select, textarea, [role='button']",
      )
    ) {
      return;
    }
    if (e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    guideDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: guideOffset.x,
      initY: guideOffset.y,
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!guideDragRef.current) return;
      const dx = moveEvent.clientX - guideDragRef.current.startX;
      const dy = moveEvent.clientY - guideDragRef.current.startY;
      setGuideOffset({
        x: Math.round(guideDragRef.current.initX + dx),
        y: Math.round(guideDragRef.current.initY + dy),
      });
    };

    const onPointerUp = () => {
      guideDragRef.current = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  if (phase === "done" || (phase === "new" && props.completedTasks > 0))
    return props.children ?? null;
  const finished = phase === "started" && props.completedTasks > 0;

  if (collapsed) {
    return (
      <aside
        className="mac-widget-stack"
        data-desktop-interactive
        style={{
          transform: `translate3d(${guideOffset.x}px, ${guideOffset.y}px, 0)`,
        }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="group flex items-center gap-1.5 rounded-full border border-black/10 bg-background/90 px-3 py-1.5 text-xs font-semibold shadow-md backdrop-blur-md transition-all hover:scale-105 hover:bg-background dark:border-white/15"
          title="点击展开新手使用向导"
          aria-label="展开新手引导"
        >
          <CompassIcon className="size-3.5 text-blue-500" />
          <span>新手引导</span>
          <span className="rounded-full bg-blue-500/10 px-1.5 py-0.2 text-[10px] text-blue-600 dark:text-blue-400">
            {finished ? "已完成" : "4步"}
          </span>
          <ChevronRightIcon className="size-3 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="mac-widget-stack"
      data-desktop-interactive
      style={{
        transform: `translate3d(${guideOffset.x}px, ${guideOffset.y}px, 0)`,
      }}
    >
      <section
        aria-label="开始使用 Echo"
        className="rounded-2xl border border-white/40 bg-background/95 p-4 text-foreground shadow-lg"
      >
        <div
          onPointerDown={handleGuideDragStart}
          className="flex cursor-grab active:cursor-grabbing select-none items-center justify-between"
          title="按住标题栏可自由移动新手向导"
        >
          <h2 className="text-base font-semibold">
            {finished ? "结果出来后，接着这样用" : "从第一个任务开始"}
          </h2>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            title="收起引导至小标签"
            aria-label="收起新手引导"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {finished
            ? "在任务面板查看完成结果。本地数据库管理文件，应用中心可以把常用应用添加到侧栏。"
            : "依次确认数据目录、模型连接和执行权限，再准备一个工作计划模板。每一步只打开设置；任务内容只会填入输入框，由你确认发送。"}
        </p>
        <div className="mt-3 flex flex-col gap-2 text-xs">
          {finished ? (
            <>
              <button
                className="rounded-lg bg-primary px-3 py-2 text-primary-foreground"
                onClick={props.onResults}
              >
                查看任务结果
              </button>
              <button
                className="rounded-lg border px-3 py-2"
                onClick={props.onDatabase}
              >
                打开本地数据库
              </button>
              <button
                className="rounded-lg border px-3 py-2"
                onClick={props.onApps}
              >
                添加常用应用
              </button>
            </>
          ) : (
            <>
              <button
                className="rounded-lg border px-3 py-2"
                onClick={props.onStorage}
              >
                1. 数据目录与共享
              </button>
              <button
                className="rounded-lg border px-3 py-2"
                onClick={props.onModel}
              >
                2. 模型与连接
              </button>
              <button
                className="rounded-lg border px-3 py-2"
                onClick={props.onPermissions}
              >
                3. 执行与安全权限
              </button>
              <button
                className="rounded-lg bg-primary px-3 py-2 text-primary-foreground"
                onClick={() => {
                  changePhase("started");
                  props.onStart(STARTER_TASK_PROMPT);
                }}
              >
                4. 在 Agent 工作台准备示例任务
              </button>
            </>
          )}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          点击左侧 Echo Agent
          卡片可随时打开工作台。插件、渠道和自动化可以稍后按需设置。
        </p>
        <button
          className="mt-3 text-xs text-muted-foreground underline"
          onClick={() => changePhase("done")}
        >
          {finished ? "知道了" : phase === "review" ? "关闭引导" : "跳过引导"}
        </button>
      </section>
    </aside>
  );
}
