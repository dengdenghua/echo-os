import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Film,
  FolderOpen,
  Grid2X2,
  Home,
  Library,
  Play,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react";
import { getNASFileContentURL, type NASFileAsset } from "@/core/storage/api";
import { currentActorId } from "@/core/auth/api";
import { useAgentDesktopHealth } from "@/appliance/agent-health";
import { readWatchProgress } from "@/core/tv/playback";
import { loadTVLibrary } from "@/core/tv/library";
import { TVComputer } from "./computer";
import { TVAgentPanel } from "./agent-panel";
import { TVPlayer, type TVMedia, timeLabel } from "./player";
import { useTVFocus } from "./use-tv-focus";
import { TVHome, type TVHomeAction } from "./home";
import { TVSettings, type TVSettingsSection } from "./settings";
import { TVTextField } from "./text-field";
import { readTVPreferences, DEFAULT_TV_WALLPAPER } from "@/core/tv/preferences";
import "./interaction.css";
import "./tv.css";
import "./atv.css";
import "./glass.css";

type TVSection = "home" | "library" | "apps" | "search";
const navigation = [
  { id: "home", title: "首页", icon: Home },
  { id: "library", title: "影视库", icon: Film },
  { id: "apps", title: "应用", icon: Grid2X2 },
  { id: "search", title: "搜索", icon: Search },
] as const;

export default function TVPage() {
  const [params, setParams] = useSearchParams();
  const requestedThread = params.get("conversation");
  const root = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    localURL = useRef<string | null>(null);
  const [section, setSection] = useState<TVSection>("home"),
    [agent, setAgent] = useState(Boolean(requestedThread)),
    [media, setMedia] = useState<TVMedia | null>(null);
  const [controls, setControls] = useState(false);
  const [computer, setComputer] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<TVSettingsSection>("general");
  const [preferences, setPreferences] = useState(readTVPreferences);
  const [agentPrompt, setAgentPrompt] = useState("");
  const [assets, setAssets] = useState<NASFileAsset[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [revision, setRevision] = useState(0),
    [query, setQuery] = useState("");
  const [clock, setClock] = useState(new Date());
  const [partial, setPartial] = useState(false);
  const selectThread = useCallback(
    (id: string | null) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (id) next.set("conversation", id);
          else next.delete("conversation");
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  const closeAgent = useCallback(() => {
    setAgent(false);
    selectThread(null);
  }, [selectThread]);
  useEffect(() => {
    const open = (event: Event) => {
      const id = (event as CustomEvent<{ threadId?: string }>).detail?.threadId;
      selectThread(id && /^[a-zA-Z0-9_-]{1,160}$/.test(id) ? id : null);
      setAgentPrompt("");
      setControls(false);
      setAgent(true);
    };
    window.addEventListener("echo:companion-chat", open);
    return () => window.removeEventListener("echo:companion-chat", open);
  }, [selectThread]);
  const actor = currentActorId() || "local",
    health = useAgentDesktopHealth(true);
  useEffect(() => {
    const update = () => setPreferences(readTVPreferences());
    window.addEventListener("echo-tv-preferences", update);
    return () => window.removeEventListener("echo-tv-preferences", update);
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadTVLibrary(controller.signal)
      .then((library) => {
        if (active) {
          setAssets(library.items);
          setPartial(library.partial);
        }
      })
      .catch(() => {
        if (active) {
          setAssets([]);
          setError(
            "媒体库暂时不可用。可重试，或到来源管理中启用知识库并添加目录。",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [revision, actor]);
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30_000);
    return () => {
      clearInterval(timer);
      if (localURL.current) URL.revokeObjectURL(localURL.current);
    };
  }, []);
  const closePlayer = useCallback(() => {
    setMedia(null);
    if (localURL.current) {
      URL.revokeObjectURL(localURL.current);
      localURL.current = null;
    }
  }, []);
  const back = useCallback(() => {
    if (agent) closeAgent();
    else if (controls) setControls(false);
    else if (media) closePlayer();
    else {
      setSection("home");
      root.current?.querySelector<HTMLElement>("[data-tv-home]")?.focus();
    }
  }, [agent, controls, media, closePlayer, closeAgent]);
  useTVFocus(root, back);
  const history = readWatchProgress(actor);
  const visible = assets.filter(
    (asset) =>
      !query ||
      asset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const continued = history
    .flatMap((entry) => {
      const asset = assets.find((row) => row.asset_id === entry.id);
      return asset ? [{ asset, entry }] : [];
    })
    .slice(0, 6);
  const openAsset = (asset: NASFileAsset) =>
    setMedia({
      id: asset.asset_id,
      title: asset.name,
      url: getNASFileContentURL(asset.asset_id),
    });
  const openSettings = (category: TVSettingsSection = "general") => {
    closeAgent();
    setSettingsSection(category);
    setControls(true);
  };
  const manageSources = () => openSettings("sources");
  const openAgent = (prompt = "") => {
    selectThread(null);
    setAgentPrompt(prompt);
    setControls(false);
    setAgent(true);
  };
  const openHomeApp = (app: TVHomeAction) => {
    if (app === "echo") openAgent();
    else if (app === "computer") setComputer(true);
    else if (app === "knowledge") openAgent("请在我的知识库中查找：");
    else if (app === "settings") openSettings();
    else {
      setSection(app);
      setQuery("");
    }
  };
  const mediaCard = (asset: NASFileAsset, position?: number) => (
    <button
      key={asset.asset_id}
      className="tv-media-card"
      data-tv-focus
      onClick={() => openAsset(asset)}
    >
      <span className="tv-media-art">
        <Film />
        <span className="tv-media-format">
          {asset.extension.replace(/^\./, "").toUpperCase()}
        </span>
        <span className="tv-media-play">
          <Play />
        </span>
      </span>
      <strong>{asset.name}</strong>
      <small>
        {position === undefined
          ? "来自你的媒体库"
          : `继续播放 · ${timeLabel(position)}`}
      </small>
    </button>
  );
  return (
    <div
      ref={root}
      className="echo-tv"
      data-testid="tv-shell"
      data-large-text={preferences.largeText}
      data-reduce-motion={preferences.reduceMotion}
      data-wallpaper={preferences.wallpaper ?? DEFAULT_TV_WALLPAPER}
    >
      <div
        className="tv-main"
        inert={agent || controls || Boolean(media) || undefined}
      >
        <header className="tv-header">
          <span className="tv-brand">
            ECHO<span>TV</span>
          </span>
          {section !== "home" && (
            <nav aria-label="大屏导航">
              {navigation.map(({ id, title, icon: Icon }) => (
                <button
                  key={id}
                  data-tv-focus
                  data-tv-home={id === "home" || undefined}
                  aria-current={section === id ? "page" : undefined}
                  onClick={() => {
                    setSection(id);
                    setQuery("");
                  }}
                >
                  <Icon />
                  {title}
                </button>
              ))}
            </nav>
          )}
          <div className="tv-header-end">
            <time>
              {clock.toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
            <button
              data-tv-focus
              aria-label="控制中心"
              onClick={() => openSettings()}
            >
              <Settings />
            </button>
          </div>
        </header>
        <main className="tv-content">
          {section === "home" && (
            <>
              <TVHome onOpen={openHomeApp} ready={health.state === "ready"} />
              {continued.length > 0 && (
                <section className="tv-section">
                  <h2>继续观看</h2>
                  <div className="tv-rail">
                    {continued.map(({ asset, entry }) =>
                      mediaCard(asset, entry.position),
                    )}
                  </div>
                </section>
              )}
            </>
          )}
          {(section === "library" || section === "search") && (
            <section className="tv-section tv-library">
              <p className="tv-eyebrow">属于你的内容</p>
              <div className="tv-heading-row">
                <h1>{section === "search" ? "找到想看的" : "我的影视库"}</h1>
                <div className="tv-actions">
                  <button
                    data-tv-focus
                    onClick={() => setRevision((value) => value + 1)}
                  >
                    <RefreshCw />
                    刷新
                  </button>
                  <button data-tv-focus onClick={manageSources}>
                    <Settings />
                    管理来源
                  </button>
                  <button
                    data-tv-focus
                    onClick={() => fileInput.current?.click()}
                  >
                    <FolderOpen />
                    打开文件
                  </button>
                </div>
              </div>
              <TVTextField
                label="搜索影视库"
                value={query}
                onChange={setQuery}
                placeholder="搜索视频名称"
              />
              {partial && !loading && !error && (
                <p className="tv-muted">
                  当前显示部分视频。可在来源管理中选择更具体的目录。
                </p>
              )}
              {loading ? (
                <div role="status" className="tv-empty">
                  正在读取你的媒体库…
                </div>
              ) : error ? (
                <div role="alert" className="tv-empty">
                  <Library />
                  <h2>连接你的媒体库</h2>
                  <p>{error}</p>
                  <button data-tv-focus onClick={manageSources}>
                    管理媒体来源
                  </button>
                </div>
              ) : visible.length === 0 ? (
                <div className="tv-empty">
                  <Film />
                  <h2>{query ? "没有找到匹配的视频" : "从第一部影片开始"}</h2>
                  <p>
                    {query
                      ? "换个名称试试。"
                      : "添加已有的视频目录，或直接打开一个视频文件。"}
                  </p>
                  <button
                    data-tv-focus
                    onClick={() =>
                      query ? setQuery("") : fileInput.current?.click()
                    }
                  >
                    {query ? "清除搜索" : "打开视频文件"}
                  </button>
                </div>
              ) : (
                <div className="tv-media-grid">
                  {visible.map((asset) => mediaCard(asset))}
                </div>
              )}
              <input
                ref={fileInput}
                hidden
                type="file"
                accept="video/*,.mkv"
                aria-label="选择视频文件"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (localURL.current) URL.revokeObjectURL(localURL.current);
                  localURL.current = URL.createObjectURL(file);
                  setMedia({
                    id: `file:${file.name}:${file.size}:${file.lastModified}`,
                    title: file.name,
                    url: localURL.current,
                  });
                  event.target.value = "";
                }}
              />
            </section>
          )}
          {section === "apps" && (
            <section className="tv-section tv-library">
              <p className="tv-eyebrow">ECHO OS</p>
              <h1>你的应用，大屏相伴。</h1>
              <div className="tv-app-grid tv-apps-page">
                <button
                  data-tv-focus
                  className="tv-app-card tv-app-agent"
                  onClick={() => openAgent()}
                >
                  <Bot />
                  <div>
                    <strong>Echo Agent</strong>
                    <small>在大屏发起任务</small>
                  </div>
                </button>
                <button
                  data-tv-focus
                  className="tv-app-card tv-app-media"
                  onClick={() => setSection("library")}
                >
                  <Film />
                  <div>
                    <strong>影视库</strong>
                    <small>浏览与播放自己的视频</small>
                  </div>
                </button>
                <button
                  data-tv-focus
                  className="tv-app-card"
                  onClick={manageSources}
                >
                  <Library />
                  <div>
                    <strong>知识库</strong>
                    <small>管理资料目录与索引</small>
                  </div>
                </button>
                <button
                  data-tv-focus
                  className="tv-app-card"
                  onClick={() => openSettings("plugins")}
                >
                  <Grid2X2 />
                  <div>
                    <strong>插件中心</strong>
                    <small>管理插件启停与配置</small>
                  </div>
                </button>
                <button
                  data-tv-focus
                  className="tv-app-card"
                  onClick={() => openSettings("device")}
                >
                  <Settings />
                  <div>
                    <strong>设备设置</strong>
                    <small>声音、显示与连接</small>
                  </div>
                </button>
              </div>
            </section>
          )}
        </main>
        <footer className="tv-footer">
          <span>↑ ↓ ← → 移动</span>
          <span>Enter 确认</span>
          <span>
            <ArrowLeft /> Esc 返回
          </span>
          <span className="tv-preview-label">大屏预览</span>
        </footer>
      </div>
      {computer && (
        <TVComputer
          covered={agent || controls || Boolean(media)}
          onClose={() => setComputer(false)}
          onThread={(id) => {
            selectThread(id);
            setAgent(true);
          }}
        />
      )}
      {media && (
        <TVPlayer
          media={media}
          actor={actor}
          onClose={closePlayer}
          onAgent={() => openAgent()}
          covered={agent || controls}
        />
      )}
      {controls && (
        <TVSettings
          initialSection={settingsSection}
          onClose={() => setControls(false)}
        />
      )}
      {agent && (
        <TVAgentPanel
          initialPrompt={agentPrompt}
          onClose={closeAgent}
          onSettings={() => openSettings("models")}
          initialThread={requestedThread}
          onThreadChange={selectThread}
        />
      )}
    </div>
  );
}
