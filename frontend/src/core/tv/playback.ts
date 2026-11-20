export type PlaybackState = {
  status: "loading" | "playing" | "paused" | "buffering" | "ended" | "error";
  position: number;
  duration: number;
  error: string | null;
};

/** Native mpv and Android adapters must implement this same session contract. */
export interface PlaybackAdapter {
  readonly kind: "browser" | "mpv" | "android";
  load(url: string, position?: number): void;
  play(): Promise<void>;
  pause(): void;
  seek(position: number): void;
  subscribe(listener: (state: PlaybackState) => void): () => void;
  dispose(): void;
}

export function createBrowserPlayback(
  video: HTMLVideoElement,
): PlaybackAdapter {
  let state: PlaybackState = {
    status: "loading",
    position: 0,
    duration: 0,
    error: null,
  };
  let resumeAt = 0;
  const listeners = new Set<(state: PlaybackState) => void>();
  const update = (
    status = state.status,
    error: string | null = state.error,
  ) => {
    state = {
      status,
      error,
      position: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    };
    listeners.forEach((listener) => listener(state));
  };
  const events: Record<string, () => void> = {
    loadedmetadata: () => {
      if (
        Number.isFinite(video.duration) &&
        resumeAt > 0 &&
        resumeAt < video.duration - 1
      )
        video.currentTime = resumeAt;
      resumeAt = 0;
      update(video.paused ? "paused" : "playing", null);
    },
    playing: () => update("playing", null),
    pause: () => {
      if (state.status !== "error") update("paused");
    },
    waiting: () => update("buffering"),
    ended: () => update("ended"),
    timeupdate: () => update(),
    durationchange: () => update(),
    error: () => update("error", "无法播放此文件，请检查连接或尝试其他格式。"),
  };
  Object.entries(events).forEach(([event, handler]) =>
    video.addEventListener(event, handler),
  );
  return {
    kind: "browser",
    load(url, position = 0) {
      resumeAt = Math.max(0, position);
      video.src = url;
      video.load();
      update("loading", null);
    },
    async play() {
      try {
        await video.play();
      } catch {
        update("error", "播放未开始，请按确认重试。");
      }
    },
    pause() {
      video.pause();
    },
    seek(position) {
      if (
        !Number.isFinite(position) ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0
      )
        return;
      video.currentTime = Math.min(Math.max(0, position), video.duration);
      update();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      Object.entries(events).forEach(([event, handler]) =>
        video.removeEventListener(event, handler),
      );
      listeners.clear();
      video.pause();
      video.removeAttribute("src");
      video.load();
    },
  };
}

export type WatchProgress = {
  id: string;
  title?: string;
  position: number;
  duration: number;
  updatedAt: number;
};
export const progressKey = (actor: string) =>
  `echo:tv:progress:v1:${encodeURIComponent(actor)}`;

export const CONTINUITY_CHANGED = "echo:continuity-changed";

export function hasHistoryActor(actor: string) {
  return (
    Boolean(actor.trim()) &&
    !["anonymous", "__anonymous__", "__guest__"].includes(actor)
  );
}

export function readWatchProgress(
  actor: string,
  storage?: Pick<Storage, "getItem">,
): WatchProgress[] {
  if (!hasHistoryActor(actor)) return [];
  try {
    const data: unknown = JSON.parse(
      (storage ?? localStorage).getItem(progressKey(actor)) ?? "[]",
    );
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (row): row is WatchProgress =>
          row &&
          typeof row.id === "string" &&
          row.id.length > 0 &&
          row.id.length <= 2048 &&
          [row.position, row.duration, row.updatedAt].every(
            (value) => typeof value === "number" && Number.isFinite(value),
          ) &&
          row.position >= 0 &&
          row.duration > row.position,
      )
      .slice(0, 50);
  } catch {
    return [];
  }
}

export function forgetWatchProgress(actor: string, id: string) {
  const rows = readWatchProgress(actor);
  const remaining = rows.filter((row) => row.id !== id);
  if (remaining.length === rows.length) return;
  try {
    localStorage.setItem(progressKey(actor), JSON.stringify(remaining));
    window.dispatchEvent(new Event(CONTINUITY_CHANGED));
  } catch {
    /* Storage may be disabled. */
  }
}

export function saveWatchProgress(
  actor: string,
  entry: WatchProgress,
  storage?: Pick<Storage, "getItem" | "setItem">,
) {
  if (
    !hasHistoryActor(actor) ||
    !entry.id ||
    entry.id.length > 2048 ||
    ![entry.position, entry.duration, entry.updatedAt].every(Number.isFinite) ||
    entry.position < 0 ||
    entry.duration <= 0
  )
    return;
  const remaining = readWatchProgress(actor, storage).filter(
    (row) => row.id !== entry.id,
  );
  const complete =
    entry.position >= entry.duration - Math.min(10, entry.duration * 0.05);
  try {
    (storage ?? localStorage).setItem(
      progressKey(actor),
      JSON.stringify(
        (complete ? remaining : [entry, ...remaining]).slice(0, 50),
      ),
    );
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event(CONTINUITY_CHANGED));
  } catch {
    /* Playback still works with storage disabled. */
  }
}

/** Start an authorized video and keep its resumable position for both shells. */
export function loadTrackedVideo(
  player: PlaybackAdapter,
  actor: string,
  media: { id: string; title: string; url: string },
) {
  const resumeAt =
    readWatchProgress(actor).find((entry) => entry.id === media.id)?.position ??
    0;
  let latest: PlaybackState | null = null;
  let lastSaved = 0;
  let savedPosition = resumeAt;
  const persist = () => {
    if (!latest || latest.duration <= 0) return;
    const position =
      latest.status === "ended" ? latest.duration : latest.position;
    if (position <= 0 || position === savedPosition) return;
    saveWatchProgress(actor, {
      id: media.id,
      title: media.title.slice(0, 255),
      position,
      duration: latest.duration,
      updatedAt: Date.now(),
    });
    savedPosition = position;
  };
  const unsubscribe = player.subscribe((next) => {
    latest = next;
    if (
      Date.now() - lastSaved > 5000 ||
      next.status === "paused" ||
      next.status === "ended"
    ) {
      persist();
      lastSaved = Date.now();
    }
  });
  player.load(media.url, resumeAt);
  window.addEventListener("pagehide", persist);
  return () => {
    persist();
    window.removeEventListener("pagehide", persist);
    unsubscribe();
  };
}
