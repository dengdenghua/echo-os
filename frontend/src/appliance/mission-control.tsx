import { useEffect, useCallback } from "react";
import {
  LayoutGridIcon,
  XIcon,
  SparklesIcon,
  SmartphoneIcon,
  LaptopIcon,
  FileTextIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface MissionControlWindow {
  id: string;
  title: string;
  url: string;
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

  const getWindowIcon = (win: MissionControlWindow) => {
    if (win.url === "/phone-mirror") {
      return <SmartphoneIcon className="size-4 text-emerald-400" />;
    }
    if (win.url.includes("workspace")) {
      return <SparklesIcon className="size-4 text-blue-400" />;
    }
    return <FileTextIcon className="size-4 text-purple-400" />;
  };

  return (
    <div
      data-testid="mission-control-overlay"
      className="fixed inset-0 z-[9990] flex flex-col items-center select-none bg-slate-950/75 p-6 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-250"
      onClick={onClose}
    >
      {/* 调度中心顶部抬头栏 */}
      <div
        className="flex w-full max-w-5xl items-center justify-between py-2 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-xl bg-white/10 text-white shadow-sm ring-1 ring-white/20">
            <LayoutGridIcon className="size-4.5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wide">调度中心 · 窗口平铺全览</h2>
            <p className="text-[11px] text-slate-400">
              共 {windows.length} 个活动窗口 · 点击卡片切换或拖拽整理
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-xs text-slate-400 font-mono bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
            按 Esc 退出
          </span>
          <button
            type="button"
            data-testid="btn-close-mission-control"
            onClick={onClose}
            aria-label="关闭调度中心"
            className="grid size-8 place-items-center rounded-xl bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white transition-colors"
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
            className="flex flex-col items-center justify-center text-center p-8 rounded-3xl border border-white/10 bg-slate-900/50 backdrop-blur-xl max-w-md"
          >
            <LaptopIcon className="size-12 text-slate-500 mb-3" />
            <h3 className="text-base font-semibold text-slate-200">当前没有打开的窗口</h3>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
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
              windows.length >= 3 && windows.length <= 4 && "max-w-4xl grid-cols-2",
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
                    "group relative flex flex-col rounded-2xl border transition-all duration-300 ease-out cursor-pointer overflow-hidden shadow-2xl hover:scale-[1.03] active:scale-[0.99]",
                    isActive
                      ? "border-blue-400 bg-slate-900/90 ring-2 ring-blue-500/50 shadow-[0_12px_36px_rgba(59,130,246,0.3)]"
                      : "border-white/15 bg-slate-900/70 hover:border-white/30 hover:bg-slate-900/85",
                  )}
                  style={{
                    height: windows.length <= 2 ? "320px" : "240px",
                  }}
                >
                  {/* 卡片顶部仿拟物标题栏 */}
                  <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/10 bg-white/5 px-3 backdrop-blur-md">
                    <div className="flex items-center gap-2 min-w-0">
                      {getWindowIcon(win)}
                      <span className="truncate text-xs font-semibold text-slate-200">
                        {win.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                      {isActive && (
                        <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-blue-300 font-mono">
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
                        className="grid size-5.5 place-items-center rounded-md text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 卡片微缩内容体 */}
                  <div className="flex flex-1 items-center justify-center p-4 bg-gradient-to-b from-transparent to-black/20 text-slate-400 text-xs">
                    <div className="flex flex-col items-center gap-2">
                      <div className="size-10 rounded-2xl bg-white/10 grid place-items-center text-white/80 group-hover:text-blue-400 group-hover:bg-blue-500/20 transition-colors shadow-inner">
                        {getWindowIcon(win)}
                      </div>
                      <span className="text-[11px] font-medium text-slate-300">
                        {win.title}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]">
                        {win.url}
                      </span>
                    </div>
                  </div>

                  {/* 悬停光晕与指引 */}
                  <div className="absolute inset-0 pointer-events-none rounded-2xl ring-1 ring-inset ring-white/10 group-hover:ring-blue-400/40 transition-all" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
