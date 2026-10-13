import { useEffect, useCallback, type ReactNode } from "react";
import { AppWindowIcon, LayoutGridIcon, LaptopIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { getEchoAppArtwork } from "./echo-app-artworks";

export interface MissionControlWindow {
  id: string;
  title: string;
  url: string;
  workspaceRoute?: string;
  integratedChrome?: boolean;
}

export interface MissionControlProps {
  open: boolean;
  windows: MissionControlWindow[];
  activeWindowId?: string | null;
  onSelectWindow: (id: string) => void;
  onCloseWindow: (id: string) => void;
  onClose: () => void;
}

/** 系统窗口（/system/<app>）对应 Dock 与启动台里的应用身份。 */
const SYSTEM_WINDOW_APP_IDS: Record<string, string> = {
  files: "system:files",
  photos: "echo:/photos",
  hub: "echo:/hub",
  "storage-center": "echo:/storage-center",
  "device-link": "echo:/device-link",
  "task-space": "system:tasks",
  "activity-monitor": "system:activity-monitor",
  settings: "system:settings",
  browser: "echo:/browser",
};

/** 按窗口找回它所属应用的 ID，用来画和 Dock 一样的应用图标。 */
export function missionControlAppId(win: MissionControlWindow): string | null {
  const route = (win.workspaceRoute ?? win.url).split(/[?#]/)[0] ?? "";
  const system = /^\/system\/([^/]+)/.exec(route)?.[1];
  if (system) return SYSTEM_WINDOW_APP_IDS[system] ?? null;
  if (route === "/phone-mirror") return "echo:/phone-mirror";
  if (route.includes("/workspace/observability"))
    return "echo:/workspace/observability";
  if (route.includes("/workspace/realtime"))
    return "echo:/workspace/realtime/new";
  return null;
}

function MissionControlAppIcon({
  win,
  size,
}: {
  win: MissionControlWindow;
  size: "sm" | "lg";
}) {
  const appId = missionControlAppId(win);
  const artwork: ReactNode = appId ? getEchoAppArtwork(appId) : null;
  return (
    <span
      aria-hidden
      data-app-id={appId ?? undefined}
      className={cn(
        "grid shrink-0 place-items-center bg-[var(--echo-surface-raised)] text-[var(--echo-ink)] ring-1 ring-[var(--echo-line-strong)] [&_svg]:size-full",
        size === "sm" ? "size-5 rounded-md" : "size-16 rounded-2xl",
      )}
    >
      {artwork ?? (
        <AppWindowIcon
          className={size === "sm" ? "size-3.5" : "size-8"}
          strokeWidth={1.5}
        />
      )}
    </span>
  );
}

export function MissionControl({
  open,
  windows,
  activeWindowId,
  onSelectWindow,
  onCloseWindow,
  onClose,
}: MissionControlProps) {
  // ESC 键退出调度中心
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      data-testid="mission-control-overlay"
      data-echo-theme="graphite"
      className="fixed inset-0 z-[9990] flex flex-col items-center select-none bg-[color-mix(in_srgb,var(--echo-ground)_78%,transparent)] p-6 text-foreground backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-250"
      onClick={onClose}
    >
      {/* 调度中心顶部抬头栏 */}
      <div
        className="flex w-full max-w-5xl items-center justify-between py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-xl bg-card ring-1 ring-border">
            <LayoutGridIcon className="size-4.5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">调度中心 · 窗口平铺全览</h2>
            <p className="text-[12px] text-muted-foreground">
              共 {windows.length} 个活动窗口 · 点击卡片切换窗口
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden rounded-lg border border-border bg-card px-2.5 py-1 text-[12px] text-muted-foreground sm:inline">
            按 <kbd className="font-mono">Esc</kbd> 退出
          </span>
          <button
            type="button"
            data-testid="btn-close-mission-control"
            onClick={onClose}
            aria-label="关闭调度中心"
            className="grid size-8 place-items-center rounded-xl bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* 窗口全览平铺矩阵 */}
      <div
        className="flex flex-1 w-full max-w-6xl items-center justify-center p-4 overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {windows.length === 0 ? (
          <div
            data-testid="mission-control-empty"
            className="flex max-w-md flex-col items-center justify-center rounded-3xl border border-border bg-card p-8 text-center"
          >
            <LaptopIcon className="mb-3 size-12 text-muted-foreground" />
            <h3 className="text-base font-semibold">当前没有打开的窗口</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              在底部 Dock 栏或启动台中点击任意应用即可开启多任务协作。
            </p>
          </div>
        ) : (
          <div
            data-testid="mission-control-grid"
            className={cn(
              "grid gap-6 w-full max-h-[82vh] transition-all",
              windows.length === 1 && "max-w-xl grid-cols-1",
              windows.length === 2 && "max-w-3xl grid-cols-1 sm:grid-cols-2",
              windows.length >= 3 &&
                windows.length <= 4 &&
                "max-w-4xl grid-cols-2",
              windows.length >= 5 && "max-w-5xl grid-cols-2 md:grid-cols-3",
            )}
          >
            {windows.map((win) => {
              const isActive = activeWindowId === win.id;
              return (
                <div
                  key={win.id}
                  data-testid={`mission-card-${win.id}`}
                  onClick={() => onSelectWindow(win.id)}
                  className={cn(
                    "group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card shadow-[var(--echo-shadow-raised)] transition-all duration-300 ease-out hover:scale-[1.03] active:scale-[0.99]",
                    isActive
                      ? "border-core/50 ring-2 ring-core/30"
                      : "border-border hover:border-[var(--echo-line-strong)]",
                  )}
                  style={{
                    height: windows.length <= 2 ? "320px" : "240px",
                  }}
                >
                  {/* 卡片顶部标题栏：应用图标 + 窗口标题 */}
                  <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <MissionControlAppIcon win={win} size="sm" />
                      <span className="truncate text-[12px] font-semibold">
                        {win.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 opacity-80 transition-opacity group-hover:opacity-100">
                      {isActive && (
                        <span className="rounded bg-core/15 px-1.5 py-0.5 text-[12px] font-medium text-core">
                          当前活跃
                        </span>
                      )}
                      <button
                        type="button"
                        data-testid={`btn-close-card-${win.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseWindow(win.id);
                        }}
                        aria-label={`关闭窗口 ${win.title}`}
                        title="关闭此窗口"
                        className="grid size-5.5 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-breach/15 hover:text-breach"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 卡片主体：大号应用图标 + 窗口标题 */}
                  <div className="flex flex-1 items-center justify-center p-4">
                    <div className="flex flex-col items-center gap-3">
                      <MissionControlAppIcon win={win} size="lg" />
                      <span className="max-w-[220px] truncate text-[13px] font-medium">
                        {win.title}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
