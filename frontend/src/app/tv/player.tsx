import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import {
  createBrowserPlayback,
  readWatchProgress,
  saveWatchProgress,
  type PlaybackAdapter,
  type PlaybackState,
} from "@/core/tv/playback";
import { useTVDialogFocus } from "./use-tv-focus";

export type TVMedia = { id: string; title: string; url: string };
export function timeLabel(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export function TVPlayer({
  media,
  actor,
  onClose,
  onAgent,
  covered,
}: {
  media: TVMedia;
  actor: string;
  onClose: () => void;
  onAgent: () => void;
  covered: boolean;
}) {
  const root = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null),
    adapter = useRef<PlaybackAdapter | null>(null);
  const [state, setState] = useState<PlaybackState>({
    status: "loading",
    position: 0,
    duration: 0,
    error: null,
  });
  useTVDialogFocus(root);
  useEffect(() => {
    if (!video.current) return;
    const player = createBrowserPlayback(video.current);
    adapter.current = player;
    let latest: PlaybackState | null = null,
      lastSaved = 0;
    const persist = () => {
      if (latest)
        saveWatchProgress(actor, {
          id: media.id,
          position: latest.position,
          duration: latest.duration,
          updatedAt: Date.now(),
        });
    };
    const unsubscribe = player.subscribe((next) => {
      latest = next;
      setState(next);
      if (Date.now() - lastSaved > 5000 || next.status === "ended") {
        persist();
        lastSaved = Date.now();
      }
    });
    player.load(
      media.url,
      readWatchProgress(actor).find((item) => item.id === media.id)?.position ??
        0,
    );
    void player.play();
    window.addEventListener("pagehide", persist);
    return () => {
      persist();
      window.removeEventListener("pagehide", persist);
      unsubscribe();
      player.dispose();
      adapter.current = null;
    };
  }, [actor, media.id, media.url]);
  useEffect(() => {
    if (covered) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "MediaPlayPause" || event.code === "Space") {
        event.preventDefault();
        if (video.current?.paused) void adapter.current?.play();
        else adapter.current?.pause();
      }
    };
    const element = root.current;
    element?.addEventListener("keydown", handler);
    return () => element?.removeEventListener("keydown", handler);
  }, [covered]);
  const retry = () => {
    adapter.current?.load(media.url, state.position);
    void adapter.current?.play();
  };
  return (
    <div
      ref={root}
      className="tv-player"
      data-tv-dialog
      role="dialog"
      aria-modal="true"
      aria-label={`播放：${media.title}`}
      inert={covered || undefined}
    >
      <video
        ref={video}
        playsInline
        preload="metadata"
        aria-label={media.title}
      />
      <div className="tv-player-top">
        <button data-tv-focus onClick={onClose}>
          <ArrowLeft />
          返回
        </button>
        <h2>{media.title}</h2>
        <button data-tv-focus onClick={onAgent}>
          <Bot />
          Echo Agent
        </button>
      </div>
      <div className="tv-player-controls">
        {state.error ? (
          <div role="alert" className="tv-player-error">
            <p>{state.error}</p>
            <button data-tv-focus onClick={retry}>
              重新连接
            </button>
          </div>
        ) : (
          <p role="status">
            {state.status === "loading"
              ? "正在打开视频…"
              : state.status === "buffering"
                ? "正在缓冲…"
                : state.status === "ended"
                  ? "播放结束"
                  : state.status === "paused"
                    ? "已暂停"
                    : "正在播放"}
          </p>
        )}
        <progress
          aria-label="播放进度"
          max={state.duration || 1}
          value={state.position}
        />
        <div className="tv-playback-row">
          <span>{timeLabel(state.position)}</span>
          <div>
            <button
              data-tv-focus
              aria-label="后退 10 秒"
              onClick={() => adapter.current?.seek(state.position - 10)}
            >
              <RotateCcw />
            </button>
            <button
              data-tv-focus
              aria-label={state.status === "playing" ? "暂停" : "播放"}
              onClick={() =>
                state.status === "playing"
                  ? adapter.current?.pause()
                  : void adapter.current?.play()
              }
            >
              {state.status === "playing" ? <Pause /> : <Play />}
            </button>
            <button
              data-tv-focus
              aria-label="前进 10 秒"
              onClick={() => adapter.current?.seek(state.position + 10)}
            >
              <RotateCw />
            </button>
          </div>
          <span>{timeLabel(state.duration)}</span>
        </div>
      </div>
    </div>
  );
}
