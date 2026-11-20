import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronUp,
  FolderOpen,
  Image as ImageIcon,
  Play,
} from "lucide-react";
import { isRemoteBack } from "@/core/tv/navigation";
import { TVTileArt } from "./tile-art";
import { timeLabel } from "./player";
import { useTVVideoStills } from "./video-still";

import { HomeEditor } from "./home-editor";
import { readHomeLayout, entryId, type HomeEntry } from "./home-layout";

const apps = [
  {
    id: "echo",
    label: "Echo",
    description: "和回芽聊聊，或交给它一件事。",
    action: "和 Echo 聊聊",
  },
  {
    id: "library",
    label: "影视库",
    description: "在大屏幕上播放你的影片。",
    action: "打开影视库",
  },
  {
    id: "knowledge",
    label: "知识库",
    description: "在自己的资料里查找答案。",
    action: "搜索知识库",
  },
  {
    id: "apps",
    label: "应用",
    description: "打开常用工具，管理设备与插件。",
    action: "浏览应用",
  },
  {
    id: "computer",
    label: "Echo 的电脑",
    description: "查看 Echo 的工作画面，随时接手操作。",
    action: "查看电脑",
  },
  {
    id: "settings",
    label: "设置",
    description: "调整壁纸、显示与大屏操作。",
    action: "打开设置",
  },
] as const;
export type TVHomeAction = (typeof apps)[number]["id"];

const shortcuts = [
  { id: "search", label: "影片搜索" },
  { id: "file", label: "本地播放" },
  { id: "wallpaper", label: "壁纸" },
  { id: "device", label: "声音与设备" },
  { id: "sources", label: "媒体来源" },
  { id: "plugins", label: "插件中心" },
] as const;
export type TVShortcutAction = (typeof shortcuts)[number]["id"];

export type TVShelfItem = {
  key: string;
  kind: "photo" | "video";
  name: string;
  photoURL?: string;
  originalPhotoURL?: string;
  videoURL?: string;
  position?: number;
  duration?: number;
  open: () => void;
};

function displayName(filename: string) {
  return filename.replace(/\.[^./\\\s]{1,8}$/, "") || filename;
}

function ShelfArtwork({ src, original }: { src: string; original?: string }) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [requestOriginal, setRequestOriginal] = useState(false);
  const [originalReady, setOriginalReady] = useState(false);
  useEffect(() => {
    if (!original) return;
    const timer = window.setTimeout(() => setRequestOriginal(true), 450);
    return () => window.clearTimeout(timer);
  }, [original]);
  return (
    <>
      {!originalReady && !thumbnailFailed && (
        <img
          className="tv-shelf-media"
          alt=""
          src={src}
          onError={() => setThumbnailFailed(true)}
        />
      )}
      {requestOriginal && (
        <img
          className="tv-shelf-media"
          alt=""
          src={original}
          style={{ opacity: originalReady ? 1 : 0 }}
          onLoad={() => setOriginalReady(true)}
          onError={() => setRequestOriginal(false)}
        />
      )}
    </>
  );
}

function setFocusLight(
  button: HTMLButtonElement,
  previous: EventTarget | null,
) {
  if (!(previous instanceof HTMLElement)) {
    button.style.removeProperty("--tv-light-origin");
    return;
  }
  const from = previous.getBoundingClientRect();
  const to = button.getBoundingClientRect();
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const distance = Math.max(Math.abs(dx), Math.abs(dy), 1);
  button.style.setProperty(
    "--tv-light-origin",
    `${50 + (48 * dx) / distance}% ${50 + (48 * dy) / distance}%`,
  );
}

function MotionPreview({ item }: { item: TVShelfItem }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 850);
    return () => clearTimeout(timer);
  }, []);
  return ready ? (
    <video
      className="tv-shelf-media"
      src={item.videoURL}
      muted
      playsInline
      autoPlay
      aria-hidden
      style={{ opacity: 0 }}
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        if (Number.isFinite(v.duration) && v.duration > 0)
          v.currentTime = Math.min(
            item.position ?? 0,
            Math.max(0, v.duration - 1),
          );
      }}
      onPlaying={(e) => {
        e.currentTarget.style.opacity = "1";
      }}
      onEnded={(e) => {
        e.currentTarget.style.opacity = "0";
      }}
      onError={(e) => {
        e.currentTarget.style.opacity = "0";
      }}
    />
  ) : null;
}

export function TVHome({
  returnTile,
  actor,
  reduceMotion,
  movies,
  onOpen,
  onShortcut,
  unavailable,
  recent,
  movie,
  covered,
}: {
  returnTile: string;
  actor: string;
  reduceMotion: boolean;
  movies: TVShelfItem[];
  onOpen: (app: TVHomeAction) => void;
  onShortcut: (app: TVShortcutAction) => void;
  unavailable: boolean;
  recent: TVShelfItem[];
  movie?: TVShelfItem;
  covered: boolean;
}) {
  const storageKey = "echo.tv.grid." + actor;
  const [layout, setLayout] = useState(() =>
    readHomeLayout(
      storageKey,
      [...apps, ...shortcuts].map((x) => x.id),
    ),
  );
  const [folderId, setFolder] = useState(() => {
    const parent = layout.find(
      (e) => typeof e !== "string" && e.items.includes(returnTile),
    );
    return parent && typeof parent !== "string" ? parent.id : "";
  });
  const [editId, setEdit] = useState("");
  const [browseKey, setBrowse] = useState("");
  const [shelfTile, setShelfTile] = useState("echo");
  const folder = layout.find((x) => typeof x !== "string" && x.id === folderId);
  const label = (id: string) =>
    [...apps, ...shortcuts].find((x) => x.id === id)?.label ??
    layout
      .map((x) => (typeof x === "string" ? null : x))
      .find((x) => x?.id === id)?.name ??
    id;
  const focusId = useRef(returnTile);
  const [selected, setSelected] = useState<TVHomeAction>("echo");
  const [recentKey, setRecentKey] = useState("");
  const [expanded, setExpanded] = useState(false);
  const home = useRef<HTMLElement>(null);
  const launcher = useRef<HTMLDivElement>(null);
  const shortcutGrid = useRef<HTMLDivElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const origin = useRef<HTMLButtonElement | null>(null);
  const restoreOrigin = useRef(false);
  const app = apps.find((item) => item.id === selected)!;
  const currentFeature =
    recent.find((item) => item.key === recentKey) ??
    (shelfTile === "library" ? movie : undefined);
  const shelfItems = [
    currentFeature,
    ...(shelfTile === "library"
      ? [...recent.filter((x) => x.kind === "video" && x.videoURL), ...movies]
      : recent),
  ].filter(
    (item, index, all): item is TVShelfItem =>
      !!item && all.findIndex((x) => x?.key === item.key) === index,
  );
  const feature =
    (expanded && shelfItems.find((x) => x.key === browseKey)) || currentFeature;
  useEffect(() => {
    const element = home.current;
    const edit = (e: Event) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-home-id]",
      )?.dataset.homeId;
      if (id) {
        focusId.current = id;
        setEdit(id);
      }
    };
    element?.addEventListener("tv-edit-tile", edit);
    return () => element?.removeEventListener("tv-edit-tile", edit);
  }, []);
  useLayoutEffect(() => {
    if (editId || covered) return;
    const target =
      focusId.current &&
      Array.from(
        home.current?.querySelectorAll<HTMLButtonElement>("[data-home-id]") ??
          [],
      ).find(
        (b) =>
          b.dataset.homeId === focusId.current &&
          !b.closest("[hidden],[inert]"),
      );
    if (target) {
      target.focus();
      focusId.current = "";
    } else if (folderId)
      home.current
        ?.querySelector<HTMLElement>(".tv-folder-panel button")
        ?.focus();
  }, [layout, editId, folderId, covered]);
  const sources = useMemo(() => {
    if (covered) return [];
    const urls = new Map<string, number>();
    for (const item of [movie, ...recent]) {
      if (item?.videoURL) urls.set(item.videoURL, item.position ?? 0);
    }
    return Array.from(urls, ([url, position]) => ({ url, position }));
  }, [movie, recent, covered]);
  const frames = useTVVideoStills(sources);
  const art =
    feature?.photoURL ?? (feature?.videoURL && frames.get(feature.videoURL));
  const chooseApp = (id: TVHomeAction, button: HTMLButtonElement) => {
    setSelected(id);
    setShelfTile(id);
    setRecentKey("");
    origin.current = button;
  };
  const chooseRecent = (item: TVShelfItem, button: HTMLButtonElement) => {
    setRecentKey(item.key);
    origin.current = button;
  };
  const activate = () => {
    if (feature) feature.open();
    else {
      const button =
        origin.current ??
        launcher.current?.querySelector<HTMLButtonElement>("[data-tv-home]");
      closePreview();
      button?.click();
    }
  };
  const closePreview = () => {
    restoreOrigin.current = true;
    setBrowse("");
    setExpanded(false);
  };
  const title = label(shelfTile);
  const actionLabel = feature
    ? feature.kind === "photo"
      ? "打开照片"
      : feature.position
        ? `从 ${timeLabel(feature.position)} 继续`
        : "播放影片"
    : shelfTile === selected
      ? app.action
      : "打开" + title;

  useLayoutEffect(() => {
    if (expanded) action.current?.focus();
    else if (restoreOrigin.current) {
      restoreOrigin.current = false;
      const entry = origin.current?.isConnected
        ? origin.current
        : launcher.current?.querySelector<HTMLButtonElement>("[data-tv-home]");
      entry?.focus();
    }
  }, [expanded]);

  useLayoutEffect(() => {
    const card = document.activeElement;
    if (
      !(card instanceof HTMLElement) ||
      card !== origin.current ||
      !home.current?.contains(card) ||
      !card.matches(".tv-launcher-app, .tv-resume-card")
    )
      return;
    const bounds = card.getBoundingClientRect();
    const rail = card.closest(".tv-resume-list")?.getBoundingClientRect();
    if (
      bounds.bottom > window.innerHeight ||
      bounds.top < 0 ||
      (rail && (bounds.left < rail.left || bounds.right > rail.right))
    )
      card.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "instant",
      });
  }, [selected, recentKey]);

  const tile = (entry: HomeEntry, top: boolean, initial: boolean) => {
    const id = entryId(entry),
      app = apps.find((x) => x.id === id),
      shortcut = shortcuts.find((x) => x.id === id);
    const select = (button: HTMLButtonElement) => {
      if (app) chooseApp(app.id, button);
      else {
        setShelfTile(id);
        setRecentKey("");
        origin.current = button;
      }
    };
    return (
      <button
        key={id}
        data-home-id={id}
        data-tv-focus
        data-tv-initial={initial || undefined}
        data-tv-home={initial || undefined}
        data-action={shortcut?.id}
        data-label={label(id)}
        aria-label={id === "echo" ? "呼出 Echo" : label(id)}
        className={app ? "tv-launcher-app tv-tone-" + id : "tv-shortcut"}
        onFocus={(e) => {
          setFocusLight(e.currentTarget, e.relatedTarget);
          select(e.currentTarget);
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" && top) select(e.currentTarget);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          focusId.current = id;
          setEdit(id);
        }}
        onKeyDown={(e) => {
          if (
            top &&
            !folderId &&
            e.key === "ArrowUp" &&
            e.currentTarget.offsetTop ===
              (launcher.current?.firstElementChild as HTMLElement)?.offsetTop
          ) {
            e.preventDefault();
            select(e.currentTarget);
            setExpanded(true);
          }
        }}
        onClick={() => {
          if (app) onOpen(app.id);
          else if (shortcut) onShortcut(shortcut.id);
          else {
            setFolder(id);
            focusId.current = "";
          }
        }}
      >
        {app ? (
          <span className="tv-app-tile" aria-hidden>
            <TVTileArt app={app.id} />
          </span>
        ) : (
          <span className="tv-shortcut-art" aria-hidden>
            {shortcut ? <TVTileArt app={shortcut.id} /> : <FolderOpen />}
          </span>
        )}
      </button>
    );
  };
  return (
    <section
      ref={home}
      className="tv-home"
      aria-label="娱乐模式首页"
      data-selected-app={shelfTile}
      data-shelf-kind={feature?.kind ?? "app"}
      data-preview-expanded={expanded}
      data-unavailable={
        (unavailable && !feature && selected === "echo") || undefined
      }
      onKeyDown={(event) => {
        const card = event.target;
        if (
          covered ||
          editId ||
          folderId ||
          expanded ||
          event.defaultPrevented ||
          !(card instanceof HTMLButtonElement)
        )
          return;
        const primary = launcher.current,
          secondary = shortcutGrid.current;
        if (!primary || !secondary) return;
        const group = card.parentElement;
        if (group !== primary && group !== secondary) return;
        const items = Array.from(group.children);
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          const direction = event.key === "ArrowRight" ? 1 : -1;
          if (
            !items.some(
              (other) =>
                other instanceof HTMLButtonElement &&
                other.offsetTop === card.offsetTop &&
                (other.offsetLeft - card.offsetLeft) * direction > 0,
            )
          )
            event.preventDefault();
          return;
        }
        const goDown = group === primary && event.key === "ArrowDown";
        const goUp = group === secondary && event.key === "ArrowUp";
        if (!goDown && !goUp) return;
        // Wrapped grids keep the existing geometric navigation between visual rows.
        if (
          ![primary, secondary].every((grid) => {
            const first = grid.firstElementChild,
              last = grid.lastElementChild;
            return (
              first instanceof HTMLElement &&
              last instanceof HTMLElement &&
              first.offsetTop === last.offsetTop
            );
          })
        )
          return;
        const targetRow = (goDown ? secondary : primary).children;
        const next =
          targetRow[Math.min(items.indexOf(card), targetRow.length - 1)];
        if (!(next instanceof HTMLButtonElement)) return;
        event.preventDefault();
        next.focus({ preventScroll: true });
        const behavior =
          reduceMotion ||
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth";
        if (goUp)
          card.closest<HTMLElement>(".echo-tv")?.scrollTo({ top: 0, behavior });
        else
          next.scrollIntoView({
            block: "nearest",
            inline: "nearest",
            behavior,
          });
      }}
    >
      <div className="tv-home-lead">
        <div
          className="tv-top-shelf"
          role={expanded ? "dialog" : undefined}
          aria-modal={expanded || undefined}
          data-tv-dialog={(expanded && !covered) || undefined}
          inert={(expanded && covered) || undefined}
          aria-label={`${feature ? displayName(feature.name) : title}预览`}
          onKeyDown={(event) => {
            if (
              expanded &&
              feature &&
              shelfItems.length > 1 &&
              (event.key === "ArrowRight" || event.key === "ArrowLeft")
            ) {
              event.preventDefault();
              const index = shelfItems.findIndex((x) => x.key === feature.key);
              setBrowse(
                shelfItems[
                  (index +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    shelfItems.length) %
                    shelfItems.length
                ]!.key,
              );
              return;
            }
            if (
              !covered &&
              expanded &&
              (event.key === "ArrowDown" || isRemoteBack(event.key))
            ) {
              event.preventDefault();
              closePreview();
            }
          }}
        >
          {!covered && art && (
            <ShelfArtwork
              key={art}
              src={art}
              original={feature?.originalPhotoURL}
            />
          )}
          {!covered &&
            !reduceMotion &&
            !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
            !editId &&
            !folderId &&
            feature?.videoURL && (
              <MotionPreview key={feature.videoURL} item={feature} />
            )}
          <div className="tv-shelf-copy">
            {feature && (
              <span className="tv-shelf-kicker">
                {feature.kind === "photo" ? "最近照片" : "影视库"}
              </span>
            )}
            <h1 className="tv-shelf-title">
              {feature ? displayName(feature.name) : title}
            </h1>
            {feature ? (
              feature.kind === "video" &&
              !!feature.duration && (
                <p className="tv-shelf-description">
                  全片 {timeLabel(feature.duration)}
                </p>
              )
            ) : (
              <p className="tv-shelf-description">
                {shelfTile !== selected
                  ? ""
                  : app.id === "echo" && unavailable
                    ? "暂时无法连接设备服务"
                    : app.description}
              </p>
            )}
            <button
              ref={action}
              className="tv-shelf-action"
              data-tv-focus
              data-tv-initial={expanded || undefined}
              hidden={!expanded}
              onClick={activate}
            >
              {feature?.kind === "video" ? (
                <Play aria-hidden />
              ) : (
                <ArrowRight aria-hidden />
              )}
              {actionLabel}
            </button>
          </div>
          {expanded ? (
            <button
              className="tv-preview-back"
              data-tv-focus
              data-tv-back
              onClick={closePreview}
              aria-label="退出全屏预览"
            >
              <ArrowLeft aria-hidden /> 返回
            </button>
          ) : (
            <button
              className="tv-shelf-expand"
              data-tv-focus
              aria-label="全屏预览"
              aria-haspopup="dialog"
              onClick={() => setExpanded(true)}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setExpanded(true);
                }
              }}
            >
              <ChevronUp aria-hidden /> 向上全屏
            </button>
          )}
        </div>
        <div
          ref={launcher}
          className="tv-launcher"
          aria-label="常用应用"
          hidden={expanded}
          inert={expanded || undefined}
        >
          {layout.slice(0, 6).map((entry, i) => tile(entry, true, i === 0))}
        </div>
      </div>
      <div
        ref={shortcutGrid}
        className="tv-shortcuts"
        aria-label="常用功能"
        hidden={expanded}
        inert={expanded || covered || undefined}
      >
        {layout.slice(6).map((entry) => tile(entry, false, false))}
      </div>
      {folder && typeof folder !== "string" && (
        <div
          className="tv-organize"
          role="dialog"
          data-tv-dialog
          aria-label={folder.name}
          inert={!!editId || undefined}
        >
          <div className="tv-organize-panel tv-folder-panel">
            <h2>{folder.name}</h2>
            {folder.items.map((id) => tile(id, false, false))}
            <button
              data-tv-focus
              data-tv-back
              onClick={() => {
                focusId.current = folder.id;
                setFolder("");
              }}
            >
              返回
            </button>
          </div>
        </div>
      )}
      {editId && (
        <HomeEditor
          key={editId}
          id={editId}
          layout={layout}
          label={label}
          close={() => setEdit("")}
          save={(next, focus) => {
            localStorage.setItem(storageKey, JSON.stringify(next));
            focusId.current = focus;
            setLayout(next);
            setFolder("");
            setEdit("");
          }}
        />
      )}
      {recent.length > 0 && (
        <section
          className="tv-continue"
          aria-label="继续上次"
          hidden={expanded}
          inert={expanded || undefined}
        >
          <h2>继续上次</h2>
          <div className="tv-resume-list">
            {recent.map((item) => {
              const photo = item.kind === "photo";
              const thumb =
                item.photoURL ?? (item.videoURL && frames.get(item.videoURL));
              return (
                <button
                  key={item.key}
                  data-tv-focus
                  className="tv-resume-card"
                  aria-label={`${photo ? "查看照片" : "继续播放"} ${item.name}`}
                  onFocus={(event) => chooseRecent(item, event.currentTarget)}
                  onPointerMove={(event) => {
                    if (event.pointerType === "mouse")
                      chooseRecent(item, event.currentTarget);
                  }}
                  onClick={item.open}
                >
                  <span className="tv-resume-art" aria-hidden="true">
                    {photo ? <ImageIcon /> : <Play />}
                    {thumb && (
                      <img
                        loading="lazy"
                        src={thumb}
                        alt=""
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                    )}
                  </span>
                  <span>
                    <strong>{displayName(item.name)}</strong>
                    <small>
                      {photo
                        ? "照片"
                        : `继续播放 · ${timeLabel(item.position ?? 0)}`}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </section>
  );
}
