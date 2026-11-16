import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBrowserPlayback,
  readWatchProgress,
  saveWatchProgress,
  type PlaybackState,
} from "./playback";

describe("TV playback adapter", () => {
  beforeEach(() => localStorage.clear());
  const fixture = () => {
    const video = document.createElement("video");
    video.load = vi.fn();
    video.pause = vi.fn();
    video.play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(video, "duration", {
      value: 100,
      configurable: true,
    });
    return video;
  };
  it("waits for metadata to resume and clamps seeking to the playable duration", () => {
    const video = fixture(),
      player = createBrowserPlayback(video);
    player.load("/owned-media", 42);
    expect(video.currentTime).toBe(0);
    video.dispatchEvent(new Event("loadedmetadata"));
    expect(video.currentTime).toBe(42);
    player.seek(200);
    expect(video.currentTime).toBe(100);
    player.seek(-10);
    expect(video.currentTime).toBe(0);
    player.seek(NaN);
    expect(video.currentTime).toBe(0);
    player.dispose();
  });
  it("reports buffering, recovery, errors and releases listeners and media on disposal", () => {
    const video = fixture(),
      player = createBrowserPlayback(video),
      listener = vi.fn();
    player.subscribe(listener);
    player.load("/owned-media");
    video.dispatchEvent(new Event("waiting"));
    expect(listener.mock.lastCall?.[0].status).toBe("buffering");
    video.dispatchEvent(new Event("playing"));
    expect(listener.mock.lastCall?.[0].status).toBe("playing");
    video.dispatchEvent(new Event("error"));
    expect(listener.mock.lastCall?.[0].status).toBe("error");
    player.dispose();
    const calls = listener.mock.calls.length;
    video.dispatchEvent(new Event("playing"));
    expect(listener).toHaveBeenCalledTimes(calls);
    expect(video.hasAttribute("src")).toBe(false);
    expect(video.pause).toHaveBeenCalled();
  });
  it("exposes rejected play instead of leaving a permanent loading state", async () => {
    const video = fixture();
    video.play = vi.fn().mockRejectedValue(new Error("not supported"));
    const player = createBrowserPlayback(video),
      states: PlaybackState[] = [];
    player.subscribe((value) => states.push(value));
    await player.play();
    expect(states.at(-1)?.status).toBe("error");
    player.dispose();
  });
  it("isolates watch history by account and clears completed entries", () => {
    saveWatchProgress("first", {
      id: "movie",
      position: 20,
      duration: 100,
      updatedAt: 1,
    });
    expect(readWatchProgress("second")).toEqual([]);
    expect(readWatchProgress("first")[0]?.position).toBe(20);
    saveWatchProgress("first", {
      id: "movie",
      position: 100,
      duration: 100,
      updatedAt: 2,
    });
    expect(readWatchProgress("first")).toEqual([]);
  });
  it("bounds persisted history and tolerates malformed or unavailable storage", () => {
    for (let index = 0; index < 60; index++)
      saveWatchProgress("actor", {
        id: String(index),
        position: 5,
        duration: 60,
        updatedAt: index,
      });
    expect(readWatchProgress("actor")).toHaveLength(50);
    expect(readWatchProgress("actor", { getItem: () => '{"bad"' })).toEqual([]);
    expect(
      readWatchProgress("actor", {
        getItem: () => '[{"id":"bad","position":-1}]',
      }),
    ).toEqual([]);
    expect(() =>
      saveWatchProgress(
        "actor",
        { id: "a", position: 1, duration: 10, updatedAt: 2 },
        {
          getItem: () => null,
          setItem: () => {
            throw Error("quota");
          },
        },
      ),
    ).not.toThrow();
  });
});
