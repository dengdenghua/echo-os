import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { currentActorId } from "@/core/auth/api";
import {
  hubListPlugins,
  hubDiscoverPlugins,
  hubLoadPlugin,
  hubStartPlugin,
  hubStopPlugin,
  hubUnloadPlugin,
  hubGetPluginConfig,
  hubUpdatePluginConfig,
} from "@/core/plugins/api";
import { TVTextField } from "./text-field";
import { TVConfirm, useTVAction } from "./settings-shared";
import { useTVDialogFocus } from "./use-tv-focus";

export function TVPluginSettings() {
  const actor = currentActorId(),
    cache = useQueryClient(),
    action = useTVAction();
  const [confirm, setConfirm] = useState<{ name: string; id: string } | null>(
      null,
    ),
    [config, setConfig] = useState<{
      id: string;
      values: Record<string, unknown>;
    } | null>(null);
  const plugins = useQuery({
    queryKey: ["tv-settings", actor, "plugins"],
    queryFn: hubListPlugins,
    retry: false,
  });
  const discovered = useQuery({
    queryKey: ["tv-settings", actor, "discovered"],
    queryFn: hubDiscoverPlugins,
    retry: false,
  });
  const refresh = () =>
    cache.invalidateQueries({ queryKey: ["tv-settings", actor] });
  return (
    <section>
      <h3>插件</h3>
      <p className="tv-muted">启停现有插件，保留插件自己的数据目录。</p>
      {(plugins.isError || discovered.isError) && (
        <p role="alert">
          插件列表读取失败
          <button data-tv-focus onClick={() => void refresh()}>
            重试
          </button>
        </p>
      )}
      {plugins.data?.map((p) => (
        <div className="tv-plugin-card" key={p.id}>
          <h4>
            {p.display_name || p.name} · {p.version}
          </h4>
          <p>{p.description}</p>
          <p>
            {p.state}
            {p.error && ` · ${p.error}`}
          </p>
          <div className="tv-actions">
            <button
              data-tv-focus
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await (p.enabled ? hubStopPlugin : hubStartPlugin)(p.id);
                  await refresh();
                }, "插件状态已更新")
              }
            >
              {p.enabled ? "停止" : "启动"} {p.display_name || p.name}
            </button>
            <button
              data-tv-focus
              disabled={action.busy}
              onClick={() =>
                setConfirm({ id: p.id, name: p.display_name || p.name })
              }
            >
              卸载运行实例
            </button>
            <button
              data-tv-focus
              disabled={action.busy}
              onClick={() =>
                void action.run(
                  async () =>
                    setConfig({
                      id: p.id,
                      values: await hubGetPluginConfig(p.id),
                    }),
                  "配置已读取",
                )
              }
            >
              配置 {p.display_name || p.name}
            </button>
          </div>
        </div>
      ))}
      {discovered.data
        ?.filter((p) => !p.loaded)
        .map((p) => (
          <button
            data-tv-focus
            disabled={action.busy}
            key={p.id}
            onClick={() =>
              void action.run(async () => {
                await hubLoadPlugin(p.id);
                await refresh();
              }, "插件已加载")
            }
          >
            加载 {p.display_name || p.name}
          </button>
        ))}
      {config && (
        <TVPluginConfig
          id={config.id}
          values={config.values}
          onClose={() => setConfig(null)}
          onSaved={refresh}
        />
      )}
      {action.feedback}
      {confirm && (
        <TVConfirm
          title="卸载插件运行实例"
          busy={action.busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            void action.run(async () => {
              await hubUnloadPlugin(confirm.id);
              setConfirm(null);
              await refresh();
            }, "插件实例已卸载")
          }
        >
          停止并卸载 {confirm.name}，插件文件和数据保留，可重新加载。
        </TVConfirm>
      )}
    </section>
  );
}

export function parseTVPluginConfig(
  original: Record<string, unknown>,
  draft: Record<string, string | boolean>,
) {
  return Object.fromEntries(
    Object.entries(original).map(([key, value]) => {
      const raw = draft[key];
      if (typeof value === "boolean") return [key, raw === true];
      if (typeof value === "string") return [key, String(raw)];
      if (typeof value === "number") {
        const number = Number(raw);
        if (!String(raw).trim() || !Number.isFinite(number))
          throw new Error(`${key} 需要有效数字`);
        return [key, number];
      }
      try {
        return [key, JSON.parse(String(raw)) as unknown];
      } catch {
        throw new Error(`${key} 的 JSON 格式不正确`);
      }
    }),
  );
}
function TVPluginConfig({
  id,
  values,
  onClose,
  onSaved,
}: {
  id: string;
  values: Record<string, unknown>;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const root = useRef<HTMLDivElement>(null),
    action = useTVAction();
  useTVDialogFocus(root);
  const [draft, setDraft] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        typeof value === "boolean"
          ? value
          : typeof value === "string"
            ? value
            : JSON.stringify(value, null, 2),
      ]),
    ),
  );
  return (
    <section
      ref={root}
      data-tv-dialog
      role="dialog"
      aria-label="插件配置"
      className="tv-plugin-card"
    >
      <button
        data-tv-focus
        data-tv-back
        disabled={action.busy}
        onClick={onClose}
      >
        返回插件设置
      </button>
      <h4>插件配置</h4>
      {Object.entries(values).map(([key, value]) =>
        typeof value === "boolean" ? (
          <button
            key={key}
            data-tv-focus
            disabled={action.busy}
            aria-pressed={draft[key] === true}
            onClick={() => setDraft((d) => ({ ...d, [key]: !d[key] }))}
          >
            {key}：{draft[key] ? "开" : "关"}
          </button>
        ) : (
          <TVTextField
            key={key}
            label={key}
            value={String(draft[key])}
            onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
            disabled={action.busy}
            secret={/key|secret|token|password/i.test(key)}
            multiline={value === null || typeof value === "object"}
            maxLength={100000}
          />
        ),
      )}
      {action.feedback}
      <button
        data-tv-focus
        disabled={action.busy}
        onClick={() =>
          void action.run(async () => {
            await hubUpdatePluginConfig(id, parseTVPluginConfig(values, draft));
            await onSaved();
            onClose();
          })
        }
      >
        保存插件配置
      </button>
    </section>
  );
}
