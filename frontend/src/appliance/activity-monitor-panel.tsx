import { useEffect, useState } from "react";
import {
  CpuIcon,
  HardDriveIcon,
  Loader2Icon,
  MonitorIcon,
  XIcon,
} from "lucide-react";

import {
  SystemAppFrame,
  SystemAppLightsSpacer,
  useInSystemAppWindow,
} from "./system-app-window";

type SystemInfo = {
  cpu: { model: string; cores: number; usage: number };
  memory: { total: number; used: number; percent: number };
  uptime: number;
};
type MonitorStatus = "loading" | "ready" | "unavailable" | "error";
export const SYSTEM_INFO_POLL_MS = 3000;

function UsageBar({ label, percent }: { label: string; percent: number }) {
  const bounded = Math.min(100, Math.max(0, percent));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={bounded}
      className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
    >
      <div
        className={`h-full rounded-full transition-all ${bounded > 80 ? "bg-red-500" : bounded > 50 ? "bg-amber-500" : "bg-emerald-500"}`}
        style={{ width: `${bounded}%` }}
      />
    </div>
  );
}

export function ActivityMonitorPanel({
  onClose,
  visible = true,
}: {
  onClose: () => void;
  visible?: boolean;
}) {
  const inWindow = useInSystemAppWindow();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [status, setStatus] = useState<MonitorStatus>("loading");

  useEffect(() => {
    if (!visible) return;
    const getSystemInfo = window.echo?.desktop?.getSystemInfo;
    if (!getSystemInfo) {
      setStatus("unavailable");
      setInfo(null);
      return;
    }
    let alive = true;
    let pending = false;
    const poll = async () => {
      if (!alive || pending || document.hidden) return;
      pending = true;
      try {
        const result = await getSystemInfo();
        if (!alive) return;
        if (
          result.ok &&
          result.cpu &&
          result.memory &&
          typeof result.uptime === "number" &&
          [result.cpu.usage, result.memory.percent, result.uptime].every(
            Number.isFinite,
          )
        ) {
          setInfo({
            cpu: result.cpu,
            memory: result.memory,
            uptime: result.uptime,
          });
          setStatus("ready");
        } else {
          setStatus("error");
        }
      } catch {
        if (alive) setStatus("error");
      } finally {
        pending = false;
      }
    };
    setStatus("loading");
    void poll();
    const timer = window.setInterval(() => void poll(), SYSTEM_INFO_POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [visible]);

  return (
    <SystemAppFrame
      label="活动监视器"
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/25"
      className="w-[640px] max-w-[90vw] rounded-2xl border border-white/40 bg-white/90 shadow-2xl backdrop-blur-2xl"
      windowClassName="flex h-full min-h-0 flex-col bg-white/85 text-slate-800"
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200/80 px-4">
        {inWindow ? (
          <SystemAppLightsSpacer />
        ) : (
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭活动监视器"
            className="rounded-full p-1 hover:bg-slate-200"
          >
            <XIcon className="size-4" />
          </button>
        )}
        <h2 className="text-sm font-semibold">活动监视器</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <p className="mb-4 text-xs text-slate-500">本机 CPU、内存与运行时间</p>
        {info ? (
          <div className="space-y-5">
            <section
              aria-label="CPU 状态"
              className="rounded-xl border border-slate-200 bg-white/60 p-4"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <CpuIcon className="size-4" />
                  CPU
                </span>
                <span>{info.cpu.usage}%</span>
              </div>
              <UsageBar label="CPU 使用率" percent={info.cpu.usage} />
              <p className="mt-2 text-xs text-slate-500">
                {info.cpu.model} · {info.cpu.cores} 核心
              </p>
            </section>
            <section
              aria-label="内存状态"
              className="rounded-xl border border-slate-200 bg-white/60 p-4"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <HardDriveIcon className="size-4" />
                  内存
                </span>
                <span>{info.memory.percent}%</span>
              </div>
              <UsageBar label="内存使用率" percent={info.memory.percent} />
              <p className="mt-2 text-xs text-slate-500">
                {info.memory.used} / {info.memory.total} GB
              </p>
            </section>
            <p className="text-xs text-slate-500">
              运行时间：{Math.floor(info.uptime / 60)} 小时{" "}
              {Math.floor(info.uptime % 60)} 分钟
            </p>
            {status !== "ready" && (
              <p role="status" className="text-xs text-amber-700">
                {status === "loading"
                  ? "正在更新系统状态…"
                  : "暂时无法更新，显示上次读取的状态。"}
              </p>
            )}
          </div>
        ) : (
          <div
            role="status"
            className="rounded-xl border border-slate-200 bg-white/60 p-6 text-center"
          >
            {status === "loading" ? (
              <Loader2Icon className="mx-auto size-5 animate-spin" />
            ) : (
              <MonitorIcon className="mx-auto size-5 text-slate-400" />
            )}
            <p className="mt-3 text-sm">
              {status === "loading"
                ? "正在读取系统状态…"
                : status === "error"
                  ? "暂时无法读取系统状态"
                  : "浏览器模式未连接系统监控"}
            </p>
            {status !== "loading" && (
              <p className="mt-2 text-xs text-slate-500">
                在 Echo OS 桌面客户端中可查看实时 CPU、内存与运行时间。
              </p>
            )}
          </div>
        )}
      </div>
    </SystemAppFrame>
  );
}
