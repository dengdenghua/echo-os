import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tvRequest } from "@/core/tv/api";
import { useTVAction } from "./settings-shared";

type Engine = {
  id: string;
  name: string;
  installed_version: string | null;
  state: string;
  pending_version: string | null;
  previous_version: string | null;
  active_tasks: number;
  revision: number;
  can_rollback: boolean;
  job?: { state: string; error?: string | null } | null;
};

export function TVEngineSettings() {
  const cache = useQueryClient();
  const action = useTVAction();
  const engines = useQuery({
    queryKey: ["engines"],
    queryFn: async ({ signal }) => {
      const result = await tvRequest<{ engines: Engine[] }>(
        "/api/engines",
        "GET",
        undefined,
        signal,
      );
      if (!Array.isArray(result.engines)) throw new Error("引擎状态格式无效");
      return result;
    },
    refetchInterval: (query) =>
      query.state.data?.engines.some((e) =>
        ["installing", "pending_activation"].includes(e.state),
      )
        ? 1000
        : 30000,
  });
  const revision = engines.data?.engines
    .map((e) => `${e.id}:${e.revision}`)
    .join("|");
  const previous = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (previous.current !== undefined && previous.current !== revision) {
      for (const key of [
        "tv-settings",
        "tv-agent-readiness",
        "coder",
        "models",
        "codebuddy-models",
      ]) {
        void cache.invalidateQueries({ queryKey: [key] });
      }
    }
    previous.current = revision;
  }, [revision, cache]);
  const run = (engine: Engine, operation: "update" | "rollback") =>
    void action.run(async () => {
      await tvRequest(`/api/engines/${engine.id}/${operation}`, "POST");
      await engines.refetch();
    }, "已受理，版本切换会等待当前任务结束");
  return (
    <section aria-label="执行引擎">
      <h3>执行引擎</h3>
      <p>独立升级与回退 · 任务结束后切换 · 自动刷新模型目录</p>
      {engines.isError && (
        <p role="alert">
          暂时无法读取引擎状态{" "}
          <button data-tv-focus onClick={() => void engines.refetch()}>
            重试
          </button>
        </p>
      )}
      {engines.data?.engines.map((engine) => {
        const pending = ["installing", "pending_activation"].includes(
          engine.state,
        );
        return (
          <div key={engine.id} className="tv-settings-row">
            <strong>{engine.name}</strong>
            {engine.id === "codebuddy" && (
              <p>对话入口已接入，请在官方 CodeBuddy 中登录账号。</p>
            )}
            <p role="status">
              {engine.state === "pending_activation"
                ? `v${engine.pending_version} 已就绪，等待 ${engine.active_tasks} 个任务结束`
                : engine.state === "installing"
                  ? "正在检查和安装官方稳定版…"
                  : engine.installed_version
                    ? `当前 v${engine.installed_version}`
                    : "使用内置或本机版本"}
            </p>
            {engine.job?.state === "failed" && (
              <p role="alert">更新未完成，原版本保持可用，请重试。</p>
            )}
            <button
              data-tv-focus
              disabled={action.busy || pending}
              onClick={() => run(engine, "update")}
            >
              检查并升级
            </button>
            <button
              data-tv-focus
              disabled={action.busy || pending || !engine.can_rollback}
              onClick={() => run(engine, "rollback")}
            >
              回退
              {engine.previous_version
                ? `到 v${engine.previous_version}`
                : "（暂无上一版本）"}
            </button>
          </div>
        );
      })}
      {action.feedback}
    </section>
  );
}
