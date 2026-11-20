import { useEffect, useState } from "react";

export type StillSource = { url: string; position: number };

/** Ask the same media decoder as the player for one paused frame. Load one
 * authorized stream at a time and release it as soon as its cover is ready. */
function readVideoStill(
  source: StillSource,
  signal: AbortSignal,
): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const finish = (frame: string | null) => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      video.onloadedmetadata =
        video.onloadeddata =
        video.onseeked =
        video.onerror =
          null;
      video.removeAttribute("src");
      video.load();
      resolve(frame);
    };
    const cancel = () => finish(null);
    const capture = () => {
      if (
        video.seeking ||
        video.readyState < 2 ||
        !video.videoWidth ||
        !video.videoHeight
      )
        return;
      const canvas = document.createElement("canvas");
      const scale = Math.min(
        1,
        1280 / video.videoWidth,
        720 / video.videoHeight,
      );
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      try {
        const context = canvas.getContext("2d");
        if (!context) return cancel();
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.85));
      } catch {
        // Protected, cross-origin or unsupported video still opens via the player.
        cancel();
      }
    };
    const timer = window.setTimeout(cancel, 12000);
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const time = Math.max(source.position, 0.2);
      video.currentTime = Number.isFinite(video.duration)
        ? Math.min(time, Math.max(0, video.duration - 0.1))
        : time;
    };
    video.onloadeddata = video.onseeked = capture;
    video.onerror = cancel;
    signal.addEventListener("abort", cancel, { once: true });
    video.src = source.url;
  });
}

export function useTVVideoStills(sources: StillSource[]) {
  const [frames, setFrames] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    const controller = new AbortController();
    setFrames(new Map());
    void (async () => {
      for (const source of sources) {
        if (controller.signal.aborted) break;
        const frame = await readVideoStill(source, controller.signal);
        if (frame && !controller.signal.aborted) {
          setFrames((previous) => new Map(previous).set(source.url, frame));
        }
      }
    })();
    return () => controller.abort();
  }, [sources]);
  return frames;
}
