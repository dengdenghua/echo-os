import { TVEngineSettings } from "./engine-settings";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCoderModelProfile,
  updateCoderModelProfile,
  startCoderLogin,
  getCoderAccount,
  cancelCoderLogin,
  type CoderLoginResult,
} from "@/core/coder/api";
import { loadModels } from "@/core/models/api";
import { currentActorId } from "@/core/auth/api";
import { tvRequest } from "@/core/tv/api";
import { TVTextField } from "./text-field";
import { useTVAction, TVConfirm } from "./settings-shared";
import { useTVDialogFocus } from "./use-tv-focus";

type Connection = {
  id: string;
  name: string;
  display_name: string;
  base_url: string;
  models: string[];
  provider: string;
  has_api_key: boolean;
};
function ModelEditor({
  entry,
  onClose,
  onSaved,
}: {
  entry: Connection | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const root = useRef<HTMLDivElement>(null);
  useTVDialogFocus(
    root,
    entry ? `编辑 ${entry.display_name || entry.name}` : "添加模型",
  );
  const [name, setName] = useState(entry?.display_name ?? ""),
    [url, setURL] = useState(entry?.base_url ?? ""),
    [model, setModel] = useState(entry?.models?.join(", ") ?? ""),
    [key, setKey] = useState("");
  const [provider, setProvider] = useState(entry?.provider ?? "openai");
  const action = useTVAction();
  const save = () =>
    void action.run(async () => {
      const parsed = new URL(url);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
      )
        throw new Error("请输入有效的 HTTP 或 HTTPS 接口地址");
      const models = model
        .split(/[,，\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!models.length) throw new Error("请填写模型名称");
      const body = {
        ...(entry ? { id: entry.id } : {}),
        base_url: url.trim(),
        ...(key ? { api_key: key } : {}),
        model: models[0],
        provider,
      };
      const tested = await tvRequest<{ ok: boolean; error?: string }>(
        "/api/config/custom-models/test",
        "POST",
        body,
      );
      if (!tested.ok) throw new Error(tested.error || "连接测试失败，未保存");
      const id = entry?.id ?? `tv-${crypto.randomUUID()}`;
      await tvRequest(
        `/api/config/custom-models/${encodeURIComponent(id)}`,
        "PUT",
        {
          ...body,
          name: entry?.name ?? id,
          display_name: name || models[0],
          models,
        },
      );
      setKey("");
      await onSaved();
      onClose();
    }, "模型已保存");
  return (
    <section
      ref={root}
      data-tv-dialog
      role="dialog"
      aria-label="编辑模型连接"
      className="tv-settings-form"
    >
      <button
        data-tv-focus
        data-tv-back
        disabled={action.busy}
        onClick={onClose}
      >
        返回模型设置
      </button>
      <h3>{entry ? "编辑连接" : "添加模型连接"}</h3>
      <TVTextField
        label="连接名称"
        value={name}
        onChange={setName}
        disabled={action.busy}
      />
      <TVTextField
        label="接口地址"
        value={url}
        onChange={setURL}
        disabled={action.busy}
        placeholder="https://api.example.com/v1"
      />
      <TVTextField
        label="模型名称"
        value={model}
        onChange={setModel}
        disabled={action.busy}
        placeholder="多个模型用逗号分隔"
      />
      <TVTextField
        label="API 密钥"
        value={key}
        onChange={setKey}
        disabled={action.busy}
        secret
        placeholder={entry?.has_api_key ? "已保存，留空保留" : "输入密钥"}
      />
      <div className="tv-actions">
        {["openai", "anthropic"].map((p) => (
          <button
            key={p}
            data-tv-focus
            disabled={action.busy}
            aria-pressed={p === provider}
            onClick={() => setProvider(p)}
          >
            {p === "openai" ? "OpenAI 兼容" : "Anthropic"}
          </button>
        ))}
        <button
          data-tv-focus
          disabled={action.busy || !url || !model}
          onClick={save}
        >
          {action.busy ? "测试并保存中…" : "测试连接并保存"}
        </button>
      </div>
      {action.feedback}
    </section>
  );
}

export function TVModelSettings() {
  const actor = currentActorId(),
    cache = useQueryClient(),
    action = useTVAction();
  const [editing, setEditing] = useState<Connection | null | undefined>(
      undefined,
    ),
    [remove, setRemove] = useState<Connection | null>(null),
    [login, setLogin] = useState<CoderLoginResult | null>(null);
  const profile = useQuery({
    queryKey: ["tv-settings", actor, "profile"],
    queryFn: ({ signal }) => getCoderModelProfile(signal),
    retry: false,
  });
  const models = useQuery({
    queryKey: ["tv-settings", actor, "models"],
    queryFn: loadModels,
    retry: false,
  });
  const connections = useQuery({
    queryKey: ["tv-settings", actor, "connections"],
    queryFn: ({ signal }) =>
      tvRequest<{ models: Connection[] }>(
        "/api/config/custom-models",
        "GET",
        undefined,
        signal,
      ),
    retry: false,
  });
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ["tv-settings", actor] });
    await cache.invalidateQueries({ queryKey: ["tv-agent-readiness", actor] });
  };
  if (editing !== undefined)
    return (
      <ModelEditor
        entry={editing}
        onClose={() => setEditing(undefined)}
        onSaved={refresh}
      />
    );
  return (
    <section>
      <TVEngineSettings />
      <h3>模型与账号</h3>
      <p>
        当前模型：{profile.data?.effective_model ?? "未配置"} ·{" "}
        {profile.data?.execution_available ? "可用" : "未就绪"}
      </p>
      {(profile.isError || models.isError || connections.isError) && (
        <p role="alert">
          模型设置暂时不可用
          <button data-tv-focus onClick={() => void refresh()}>
            重试
          </button>
        </p>
      )}
      <div className="tv-settings-list">
        <button
          data-tv-focus
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              await updateCoderModelProfile({ source: "follow_system" });
              await refresh();
            })
          }
        >
          跟随系统默认模型
        </button>
        {models.data
          ?.filter((m) => m.id !== "mix" && m.supports_tool_use !== false)
          .map((m) => (
            <button
              key={m.selection_id ?? m.id}
              data-tv-focus
              disabled={action.busy}
              aria-pressed={
                profile.data?.selected_model === (m.selection_id ?? m.id)
              }
              onClick={() =>
                void action.run(async () => {
                  await updateCoderModelProfile({
                    source: "follow_system",
                    model: m.selection_id ?? m.id,
                    reasoning_effort: profile.data?.reasoning_effort,
                  });
                  await refresh();
                })
              }
            >
              {m.display_name || m.name}
              <small>{m.provider}</small>
            </button>
          ))}
      </div>
      <h3>已保存的连接</h3>
      {connections.data?.models.map((c) => (
        <div className="tv-settings-row" key={c.id}>
          <span>
            {c.display_name || c.name}
            <small>
              {c.models?.join(" · ")} ·{" "}
              {c.has_api_key ? "密钥已保存" : "无密钥"}
            </small>
          </span>
          <button
            data-tv-focus
            disabled={action.busy}
            onClick={() => setEditing(c)}
          >
            编辑 {c.display_name || c.name}
          </button>
          <button
            data-tv-focus
            disabled={action.busy}
            onClick={() => setRemove(c)}
          >
            移除
          </button>
        </div>
      ))}
      <div className="tv-actions">
        <button data-tv-focus onClick={() => setEditing(null)}>
          添加模型
        </button>
        <button
          data-tv-focus
          disabled={action.busy || Boolean(login)}
          onClick={() =>
            void action.run(
              async () => setLogin(await startCoderLogin("chatgptDeviceCode")),
              "请按设备码提示完成登录",
            )
          }
        >
          使用 ChatGPT 设备码登录
        </button>
      </div>
      {login && (
        <section className="tv-task-card">
          <p>在另一设备打开：{login.verification_url ?? login.auth_url}</p>
          <p>设备码：{login.user_code}</p>
          <button
            data-tv-focus
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                const account = await getCoderAccount();
                if (!account.account) throw new Error("尚未完成登录");
                await updateCoderModelProfile({ source: "codex_account" });
                setLogin(null);
                await refresh();
              })
            }
          >
            检查登录结果
          </button>
          <button
            data-tv-focus
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                if (login.login_id) await cancelCoderLogin(login.login_id);
                setLogin(null);
              }, "登录已取消")
            }
          >
            取消登录
          </button>
        </section>
      )}
      {action.feedback}
      {remove && (
        <TVConfirm
          title="移除模型连接"
          busy={action.busy}
          onCancel={() => setRemove(null)}
          onConfirm={() =>
            void action.run(async () => {
              await tvRequest(
                `/api/config/custom-models/${encodeURIComponent(remove.id)}`,
                "DELETE",
              );
              setRemove(null);
              await refresh();
            }, "连接已移除")
          }
        >
          移除 {remove.display_name || remove.name}{" "}
          的连接和已保存密钥；已有对话保留。
        </TVConfirm>
      )}
    </section>
  );
}
