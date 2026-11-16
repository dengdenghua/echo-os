import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { currentActorId } from "@/core/auth/api";
import {
  createNASSource,
  listNASSources,
  listNASDirectory,
  createNASIndexJob,
  getNASIndexJob,
  deleteNASSource,
  type NASDirectoryEntry,
} from "@/core/storage/api";
import { tvRequest } from "@/core/tv/api";
import { TVTextField } from "./text-field";
import { TVConfirm, useTVAction } from "./settings-shared";

type KnowledgeStatus = {
  installed: boolean;
  enabled: boolean;
  up: boolean;
  installed_version?: string;
  version?: string;
};
export function TVLibrarySettings() {
  const actor = currentActorId(),
    cache = useQueryClient(),
    action = useTVAction();
  const [path, setPath] = useState("/home/echo"),
    [entries, setEntries] = useState<NASDirectoryEntry[] | null>(null),
    [job, setJob] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    text: string;
    run: () => Promise<unknown>;
  } | null>(null);
  const status = useQuery({
    queryKey: ["tv-settings", actor, "knowledge-status"],
    queryFn: ({ signal }) =>
      tvRequest<KnowledgeStatus>(
        "/api/storage/status",
        "GET",
        undefined,
        signal,
      ),
    retry: false,
  });
  const sources = useQuery({
    queryKey: ["tv-settings", actor, "sources"],
    queryFn: listNASSources,
    enabled: status.data?.up === true,
    retry: false,
  });
  const index = useQuery({
    queryKey: ["tv-settings", actor, "index", job],
    queryFn: () => getNASIndexJob(job!),
    enabled: Boolean(job),
    refetchInterval: (q) =>
      q.state.status !== "error" &&
      ["pending", "running"].includes(q.state.data?.status ?? "pending")
        ? 1500
        : false,
    retry: false,
  });
  const refresh = () =>
    cache.invalidateQueries({ queryKey: ["tv-settings", actor] });
  const lifecycle = async (name: string) => {
    await tvRequest(
      `/api/plugin-hub/plugins/knowledge_storage/${name === "uninstall" ? "install" : name}`,
      name === "uninstall" ? "DELETE" : "POST",
    );
    await refresh();
  };
  const browse = (folder: string) =>
    void action.run(async () => {
      try {
        setEntries(await listNASDirectory(folder));
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          error.status === 403
        )
          throw new Error(
            "目录尚未授权或无访问权限。首次添加请先选择“授权并建立索引”。",
          );
        throw error;
      }
      setPath(folder);
    }, "目录已读取");
  return (
    <section>
      <h3>资料与媒体来源</h3>
      <p>
        知识库：
        {!status.data
          ? "正在检查"
          : !status.data.installed
            ? "未安装"
            : !status.data.enabled
              ? "已停用"
              : status.data.up
                ? "运行中"
                : "已停止"}{" "}
        {status.data?.version || status.data?.installed_version}
      </p>
      {status.isError && (
        <p role="alert">
          无法读取知识库状态
          <button data-tv-focus onClick={() => void status.refetch()}>
            重试
          </button>
        </p>
      )}
      <div className="tv-actions">
        {status.data &&
          (!status.data.installed ? (
            <button
              data-tv-focus
              disabled={action.busy}
              onClick={() =>
                void action.run(() => lifecycle("install"), "知识库已安装")
              }
            >
              安装知识库
            </button>
          ) : (
            <>
              <button
                data-tv-focus
                disabled={action.busy}
                onClick={() =>
                  void action.run(
                    () =>
                      lifecycle(
                        status.data!.enabled && status.data!.up
                          ? "disable"
                          : "enable",
                      ),
                    "知识库状态已更新",
                  )
                }
              >
                {status.data.enabled && status.data.up
                  ? "停用知识库"
                  : "启用知识库"}
              </button>
              <button
                data-tv-focus
                disabled={action.busy}
                onClick={() =>
                  void action.run(() => lifecycle("upgrade"), "知识库已更新")
                }
              >
                更新组件
              </button>
              <button
                data-tv-focus
                disabled={action.busy}
                onClick={() =>
                  setConfirm({
                    title: "卸载知识库",
                    text: "卸载插件并保留索引、授权目录和资料数据，重新安装后可以恢复使用。",
                    run: () => lifecycle("uninstall"),
                  })
                }
              >
                卸载并保留数据
              </button>
            </>
          ))}
      </div>
      {status.data?.up && (
        <>
          <h3>授权目录</h3>
          <p className="tv-muted">
            首次添加请输入完整目录并授权；浏览仅显示已授权范围内的文件夹。
          </p>
          {sources.isError && (
            <p role="alert">
              目录读取失败
              <button data-tv-focus onClick={() => void sources.refetch()}>
                重试
              </button>
            </p>
          )}
          {sources.data?.map((s) => (
            <div className="tv-settings-row" key={s.source_id}>
              <span>
                {s.display_name}
                <small>
                  {s.path} · {s.file_count} 文件 / {s.chunk_count} 片段
                </small>
              </span>
              <button
                data-tv-focus
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    setJob((await createNASIndexJob([s.source_id])).job_id);
                  }, "索引任务已提交")
                }
              >
                索引
              </button>
              <button
                data-tv-focus
                disabled={action.busy}
                onClick={() =>
                  setConfirm({
                    title: "移除授权目录",
                    text: `移除 ${s.display_name} 的索引授权，原始文件保留。`,
                    run: async () => {
                      await deleteNASSource(s.source_id);
                      await sources.refetch();
                    },
                  })
                }
              >
                移除目录
              </button>
            </div>
          ))}
          <TVTextField
            label="目录路径"
            value={path}
            onChange={setPath}
            disabled={action.busy}
          />
          <div className="tv-actions">
            <button
              data-tv-focus
              disabled={action.busy || !path}
              onClick={() => browse(path)}
            >
              浏览目录
            </button>
            <button
              data-tv-focus
              disabled={action.busy || !path}
              onClick={() =>
                void action.run(async () => {
                  const source = await createNASSource(path);
                  setJob((await createNASIndexJob([source.source_id])).job_id);
                  await sources.refetch();
                }, "目录已授权，正在索引")
              }
            >
              授权并建立索引
            </button>
          </div>
          {entries && (
            <div className="tv-folder-list">
              <button
                data-tv-focus
                disabled={action.busy || path === "/"}
                onClick={() => browse(path.replace(/\/?[^/]+\/?$/, "") || "/")}
              >
                上级目录
              </button>
              {entries
                .filter((e) => e.type === "dir")
                .map((e) => (
                  <button
                    data-tv-focus
                    disabled={action.busy}
                    key={e.path}
                    onClick={() => browse(e.path)}
                  >
                    {e.name}
                  </button>
                ))}
              {!entries.some((e) => e.type === "dir") && (
                <p>此目录没有子文件夹</p>
              )}
            </div>
          )}
          {job && (
            <p role="status">
              索引：
              {index.isError
                ? "状态读取失败，请重试"
                : index.data?.status === "complete"
                  ? "完成"
                  : index.data?.status === "failed"
                    ? "失败"
                    : "处理中"}{" "}
              {index.data?.message}
              <button
                data-tv-focus
                onClick={() =>
                  void Promise.all([index.refetch(), sources.refetch()])
                }
              >
                刷新索引状态
              </button>
            </p>
          )}
        </>
      )}
      {action.feedback}
      {confirm && (
        <TVConfirm
          title={confirm.title}
          busy={action.busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            void action.run(async () => {
              await confirm.run();
              setConfirm(null);
            }, "操作已完成")
          }
        >
          {confirm.text}
        </TVConfirm>
      )}
    </section>
  );
}
