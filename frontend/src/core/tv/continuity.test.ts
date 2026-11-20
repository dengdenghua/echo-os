import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { storageFileResourceId } from "@/core/storage/api";
import {
  continuityActor,
  forgetContinueItem,
  forgetTrashedMedia,
  readContinueItems,
  rememberPhoto,
  useContinueItems,
} from "./continuity";
import { progressKey, saveWatchProgress } from "./playback";

const actor = "owner";
const progress = {
  id: "nas-video-1",
  title: "家庭录像",
  position: 13,
  duration: 100,
  updatedAt: 1,
};
const photo = { path: "假期/海边.jpg", title: "海边.jpg" };

describe("launcher continuity", () => {
  beforeEach(() => localStorage.clear());

  it("uses the confirmed identity and keeps unsigned and guest histories empty", () => {
    expect(continuityActor({ user_id: "old", actor_id: actor })).toBe(actor);
    for (const user of [
      null,
      { user_id: "__anonymous__" },
      { user_id: actor, is_guest: true },
    ]) {
      const id = continuityActor(user);
      expect(id).toBe("");
      rememberPhoto(id, photo);
      saveWatchProgress(id, progress);
      expect(readContinueItems(id)).toEqual([]);
    }
    expect(localStorage.length).toBe(0);
  });

  it("merges genuine progress with opened photos without storing URLs or exposing another account", () => {
    saveWatchProgress(actor, progress);
    rememberPhoto(actor, photo);
    expect(readContinueItems(actor)).toMatchObject([
      { kind: "photo", ...photo },
      { kind: "video", ...progress },
    ]);
    expect(readContinueItems("other")).toEqual([]);
    saveWatchProgress(actor, { ...progress, position: 100 });
    expect(readContinueItems(actor).map((item) => item.kind)).toEqual([
      "photo",
    ]);
    rememberPhoto(actor, { path: "another.jpg", title: "another.jpg" });
    forgetContinueItem(actor, { kind: "photo", path: photo.path });
    expect(readContinueItems(actor)[0]).toMatchObject({ path: "another.jpg" });
    forgetContinueItem(actor, { kind: "photo", path: "another.jpg" });
    expect(readContinueItems(actor)).toEqual([]);
  });

  it("reads old named-account progress and excludes local-only media, unsafe paths and unopened videos", () => {
    const { title: _title, ...legacy } = progress;
    localStorage.setItem(
      progressKey(actor),
      JSON.stringify([
        legacy,
        { ...legacy, id: "file:sample:20:10" },
        { ...legacy, id: "blob:abc" },
        { ...legacy, id: "unopened", position: 0 },
      ]),
    );
    for (const path of [
      "/private/file.jpg",
      "../file.jpg",
      "\\server\\image",
      "https://server/img",
    ])
      rememberPhoto(actor, { path, title: "demo" });
    expect(readContinueItems(actor)).toEqual([
      { ...legacy, kind: "video", title: "上次观看的视频" },
    ]);
  });

  it("removes trashed folders by exact path boundary and video source", () => {
    const source = "a".repeat(64),
      otherSource = "b".repeat(64);
    const ids = [
      storageFileResourceId(source, "假期/海边.mp4")!,
      storageFileResourceId(otherSource, "假期/海边.mp4")!,
      storageFileResourceId(source, "假期2/海边.mp4")!,
    ];
    ids.forEach((id) => saveWatchProgress(actor, { ...progress, id }));
    rememberPhoto(actor, photo);
    const encodedDir = storageFileResourceId(source, "假期")!.split(":")[3]!;
    forgetTrashedMedia(actor, {
      path: "假期",
      kind: "dir",
      resource_id: `appliance-file:v1:${source}:${encodedDir}`,
    });
    expect(readContinueItems(actor)).toHaveLength(2);
    expect(readContinueItems(actor)).toEqual(
      expect.arrayContaining(
        ids.slice(1).map((id) => expect.objectContaining({ id })),
      ),
    );
  });

  it("observes same-window writes and other windows, and drops the previous account synchronously", () => {
    const { result, rerender } = renderHook(({ id }) => useContinueItems(id), {
      initialProps: { id: actor },
    });
    act(() => rememberPhoto(actor, photo));
    expect(result.current[0]).toMatchObject(photo);
    act(() => {
      localStorage.setItem(progressKey(actor), JSON.stringify([progress]));
      window.dispatchEvent(
        new StorageEvent("storage", { key: progressKey(actor) }),
      );
    });
    expect(result.current).toHaveLength(2);
    rerender({ id: "different" });
    expect(result.current).toEqual([]);
  });
});
