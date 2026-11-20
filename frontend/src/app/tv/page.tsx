import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Film,
  FolderOpen,
  Grid2X2,
  Home,
  Library,
  Monitor,
  Play,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { listNASFiles } from "@/core/storage/api";
import { chooseShellMode } from "@/core/router/shell-mode";
import { photoOriginalUrl, photoThumbnailUrl } from "@/appliance/photos";
import { readDesktopWallpaperUrl } from "@/appliance/use-desktop-appearance";
import { useAgentDesktopHealth } from "@/appliance/agent-health";
import { continuityActor, useContinueItems } from "@/core/tv/continuity";
import {
  loadTVLibrary,
  tvAssetContentURL,
  type TVLibraryAsset,
} from "@/core/tv/library";
import { TVComputer } from "./computer";
import { TVAgentPanel } from "./agent-panel";
import { TVPlayer, type TVMedia } from "./player";
import { bindRemoteInput } from "./remote-input";
import { useTVFocus } from "./use-tv-focus";
import { useTVCompanion } from "./use-tv-companion";
import {
  TVHome,
  type TVHomeAction,
  type TVShelfItem,
  type TVShortcutAction,
} from "./home";
import { TVSettings, type TVSettingsSection } from "./settings";
import { TVTextField } from "./text-field";
import { TVRecentPhotos, type RecentPhoto } from "./recent-photos";
import { readTVPreferences, DEFAULT_TV_WALLPAPER } from "@/core/tv/preferences";
import "./interaction.css";
import "./tv.css";
import "./atv.css";
import "./glass.css";
import "./home.css";

type TVSection = "home" | "library" | "apps" | "search";
const navigation = [
  { id: "home", title: "首页", icon: Home },
  { id: "library", title: "影视库", icon: Film },
  { id: "apps", title: "应用", icon: Grid2X2 },
  { id: "search", title: "搜索", icon: Search },
] as const;

export default function TVPage() {
  const { user } = useAuth();
  const actor = continuityActor(user);
  return <TVWorkspace key={actor} actor={actor} />;
}

function TVWorkspace({ actor }: { actor: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const fromDesktop = location.state?.resumeFrom === "desktop";
  const [params, setParams] = useSearchParams();
  const requestedThread = params.get("conversation");
  const requestedVideo = params.get("resumeVideo");
  const root = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    localURL = useRef<string | null>(null);
  const [section, setSection] = useState<TVSection>("home"),
    [agent, setAgent] = useState(Boolean(requestedThread)),
    [media, setMedia] = useState<TVMedia | null>(null);
  const returnTile = useRef("");
  const resetHomeView = useRef(false);
  const [homeGeneration, setHomeGeneration] = useState(0);
  const searchFromHome = useRef(false);
  useLayoutEffect(() => {
    if (!searchFromHome.current) return;
    if (section === "search") {
      root.current
        ?.querySelector<HTMLInputElement>(".tv-library .tv-field input")
        ?.focus();
      return;
    }
    searchFromHome.current = false;
    if (section === "home")
      root.current
        ?.querySelector<HTMLButtonElement>('[data-action="search"]')
        ?.focus();
  }, [section]);
  const [controls, setControls] = useState(false);
  const [photoSelection, setPhotoSelection] = useState<RecentPhoto | null>(
    null,
  );
  const [resumeMessage, setResumeMessage] = useState("");
  const [returnToDesktop, setReturnToDesktop] = useState(false);
  const [computer, setComputer] = useState(false);
  const homeCovered =
    agent || controls || Boolean(media || photoSelection) || computer;
  useTVCompanion(root, section === "home" && !homeCovered);
  const [settingsSection, setSettingsSection] =
    useState<TVSettingsSection>("general");
  const [directSettings, setDirectSettings] = useState(false);
  const [preferences, setPreferences] = useState(readTVPreferences);
  const [agentPrompt, setAgentPrompt] = useState("");
  const [assets, setAssets] = useState<TVLibraryAsset[]>([]),
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
  const health = useAgentDesktopHealth(true);
  const continued = useContinueItems(actor);
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
    if (returnToDesktop) navigate(-1);
  }, [returnToDesktop, navigate]);
  const openAsset = useCallback(
    (asset: TVLibraryAsset, desktopOrigin = false) => {
      setReturnToDesktop(desktopOrigin);
      setResumeMessage("");
      setMedia({
        id: asset.asset_id,
        title: asset.name,
        url: tvAssetContentURL(asset),
      });
    },
    [],
  );
  useEffect(() => {
    if (!actor || !requestedVideo || loading) return;
    let active = true;
    const resolveRequest = async () => {
      let asset = assets.find((row) => row.asset_id === requestedVideo);
      let unavailable = Boolean(error);
      if (!asset && partial && !unavailable) {
        try {
          // A desktop handoff may reference a movie beyond the first 100 TV entries.
          const indexed = await listNASFiles("video", 500);
          asset = indexed.find((row) => row.asset_id === requestedVideo);
        } catch {
          unavailable = true;
        }
      }
      if (!active) return;
      if (asset) openAsset(asset, fromDesktop);
      else {
        setReturnToDesktop(fromDesktop);
        setSection("library");
        setResumeMessage(
          unavailable
            ? "暂时无法恢复播放，请刷新影视库。"
            : partial
              ? "当前媒体列表还没有这部视频，可在来源管理中选择更具体的目录。"
              : "这部视频已移出当前媒体库。",
        );
      }
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("resumeVideo");
          return next;
        },
        { replace: true },
      );
    };
    void resolveRequest();
    return () => {
      active = false;
    };
  }, [
    actor,
    fromDesktop,
    requestedVideo,
    loading,
    assets,
    partial,
    error,
    openAsset,
    setParams,
  ]);
  const back = useCallback(() => {
    if (agent) closeAgent();
    else if (controls) setControls(false);
    else if (media) closePlayer();
    else if (photoSelection) setPhotoSelection(null);
    else if (returnToDesktop && resumeMessage) navigate(-1);
    else {
      setSection("home");
      root.current?.querySelector<HTMLElement>("[data-tv-home]")?.focus();
    }
  }, [
    agent,
    controls,
    media,
    photoSelection,
    closePlayer,
    closeAgent,
    returnToDesktop,
    resumeMessage,
    navigate,
  ]);
  useTVFocus(root, back);
  const goHome = useRef(() => {});
  useLayoutEffect(() => {
    goHome.current = () => {
      if (media && localURL.current) {
        URL.revokeObjectURL(localURL.current);
        localURL.current = null;
      }
      setReturnToDesktop(false);
      setResumeMessage("");
      setMedia(null);
      setComputer(false);
      setControls(false);
      setPhotoSelection(null);
      setAgent(false);
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("conversation");
          next.delete("resumeVideo");
          return next;
        },
        { replace: true },
      );
      setSection("home");
      returnTile.current = "";
      searchFromHome.current = false;
      resetHomeView.current = true;
      setHomeGeneration((n) => n + 1);
    };
  });
  useEffect(() => {
    if (root.current)
      return bindRemoteInput(root.current, () => goHome.current());
  }, []);
  useLayoutEffect(() => {
    if (section !== "home" || homeCovered) return;
    const tiles = Array.from(
      root.current?.querySelectorAll<HTMLButtonElement>("[data-home-id]") ?? [],
    );
    const tile = tiles.find(
      (el) =>
        el.dataset.homeId === returnTile.current &&
        !el.closest("[hidden],[inert]"),
    );
    if (tile) {
      tile.focus();
      returnTile.current = "";
    } else if (resetHomeView.current) {
      resetHomeView.current = false;
      root.current
        ?.querySelector<HTMLElement>("[data-tv-home]")
        ?.focus({ preventScroll: true });
      root.current?.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [section, homeCovered, homeGeneration]);
  const visible = assets.filter(
    (asset) =>
      !query ||
      asset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const openSettings = (
    category: TVSettingsSection = "general",
    direct = false,
  ) => {
    closeAgent();
    setSettingsSection(category);
    setDirectSettings(direct);
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
      setResumeMessage("");
      setQuery("");
    }
  };
  const openShortcut = (shortcut: TVShortcutAction) => {
    if (shortcut === "search") {
      searchFromHome.current = true;
      setQuery("");
      setResumeMessage("");
      setReturnToDesktop(false);
      setSection("search");
    } else if (shortcut === "file") fileInput.current?.click();
    else openSettings(shortcut === "wallpaper" ? "general" : shortcut, true);
  };
  const history = useMemo<TVShelfItem[]>(
    () =>
      continued.map((item) => {
        if (item.kind === "photo") {
          return {
            key: `photo:${item.path}`,
            kind: "photo",
            name: item.title,
            photoURL: photoThumbnailUrl(item.path, 512),
            originalPhotoURL: /\.(?:jpe?g|png|webp|avif|bmp)$/i.test(item.path)
              ? photoOriginalUrl(item.path)
              : undefined,
            open: () => setPhotoSelection(item),
          };
        }
        const asset = assets.find((row) => row.asset_id === item.id);
        return {
          key: `video:${item.id}`,
          kind: "video",
          name: asset?.name ?? item.title,
          position: item.position,
          duration: item.duration,
          videoURL: asset ? tvAssetContentURL(asset) : undefined,
          open: () => {
            if (asset) openAsset(asset);
            else
              setParams(
                (current) => {
                  const next = new URLSearchParams(current);
                  next.set("resumeVideo", item.id);
                  return next;
                },
                { replace: true },
              );
          },
        };
      }),
    [continued, assets, openAsset, setParams],
  );
  const recent = useMemo(() => history.slice(0, 6), [history]);

  const movie = useMemo<TVShelfItem | undefined>(() => {
    const latest = history.find(
      (item) => item.kind === "video" && item.videoURL,
    );
    if (latest) return latest;
    const first = assets[0];
    if (first)
      return {
        key: `video:${first.asset_id}`,
        kind: "video",
        name: first.name,
        videoURL: tvAssetContentURL(first),
        open: () => openAsset(first),
      };
    return undefined;
  }, [history, assets, openAsset]);

  const mediaCard = (asset: TVLibraryAsset) => (
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
      <small>来自你的媒体库</small>
    </button>
  );
  return (
    <div
      ref={root}
      onClickCapture={(e) => {
        const tile = (e.target as Element).closest<HTMLElement>(
          "[data-home-id]",
        );
        if (tile) returnTile.current = tile.dataset.homeId ?? "";
      }}
      className="echo-tv"
      data-testid="tv-shell"
      data-large-text={preferences.largeText}
      data-reduce-motion={preferences.reduceMotion}
      data-wallpaper={preferences.wallpaper ?? DEFAULT_TV_WALLPAPER}
      style={
        preferences.wallpaper === "shared"
          ? ({
              "--tv-wallpaper": `url("${readDesktopWallpaperUrl()}")`,
            } as CSSProperties)
          : undefined
      }
    >
      <div className="tv-main" inert={homeCovered || undefined}>
        <header className="tv-header">
          <span className="tv-brand">
            Echo<span>娱乐模式</span>
          </span>
          {section !== "home" && (
            <nav aria-label="娱乐模式导航">
              {navigation.map(({ id, title, icon: Icon }) => (
                <button
                  key={id}
                  data-tv-focus
                  data-tv-home={id === "home" || undefined}
                  aria-current={section === id ? "page" : undefined}
                  onClick={() => {
                    setSection(id);
                    setQuery("");
                    setResumeMessage("");
                    setReturnToDesktop(false);
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
              className="tv-switch-mode"
              title="办公模式"
              onClick={() => navigate(chooseShellMode("desktop"))}
            >
              <Monitor />
              <span className="tv-mode-label">办公模式</span>
            </button>
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
            <TVHome
              key={homeGeneration}
              returnTile={returnTile.current}
              actor={actor}
              reduceMotion={preferences.reduceMotion}
              onOpen={openHomeApp}
              onShortcut={openShortcut}
              unavailable={health.state === "unavailable"}
              recent={recent}
              movies={assets.slice(0, 8).map((asset) => ({
                key: "video:" + asset.asset_id,
                kind: "video",
                name: asset.name,
                videoURL: tvAssetContentURL(asset),
                open: () => openAsset(asset),
              }))}
              movie={movie}
              covered={homeCovered}
            />
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
              {resumeMessage && (
                <div>
                  <p role="status" className="tv-muted">
                    {resumeMessage}
                  </p>
                  {returnToDesktop && (
                    <button data-tv-focus onClick={() => navigate(-1)}>
                      <ArrowLeft />
                      返回办公模式
                    </button>
                  )}
                </div>
              )}
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
            setReturnToDesktop(false);
            setMedia({
              id: `file:${file.name}:${file.size}:${file.lastModified}`,
              title: file.name,
              url: localURL.current,
            });
            event.target.value = "";
          }}
        />
        <footer className="tv-footer">
          <span>↑ ↓ ← → 移动</span>
          <span>Enter 确认</span>
          <span>
            <ArrowLeft /> Esc 返回
          </span>
          <span className="tv-preview-label">娱乐模式预览</span>
        </footer>
      </div>
      {computer && (
        <TVComputer
          covered={agent || controls || Boolean(media || photoSelection)}
          onClose={() => setComputer(false)}
          onThread={(id) => {
            selectThread(id);
            setAgent(true);
          }}
        />
      )}
      {photoSelection && (
        <TVRecentPhotos
          photo={photoSelection}
          covered={agent || controls}
          actor={actor}
          onClose={() => setPhotoSelection(null)}
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
          direct={directSettings}
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
