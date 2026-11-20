import { useMemo, useSyncExternalStore } from "react";
import { isRelativeFilePath } from "@/appliance/desktop-actions";
import { actorScopedStorageKey } from "@/core/auth/scoped-storage";
import type { User } from "@/core/auth/types";
import {
  parseApplianceFileResourceId,
  parseStorageFileResourceId,
} from "@/core/storage/api";
import {
  CONTINUITY_CHANGED,
  forgetWatchProgress,
  hasHistoryActor,
  readWatchProgress,
} from "./playback";

type RecentPhoto = {
  kind: "photo";
  path: string;
  title: string;
  updatedAt: number;
};
type RecentVideo = {
  kind: "video";
  id: string;
  title: string;
  position: number;
  duration: number;
  updatedAt: number;
};
export type ContinueItem = RecentPhoto | RecentVideo;

/** The appliance's HttpOnly login has no identity in browser storage. */
export function continuityActor(
  user?: Pick<User, "actor_id" | "user_id" | "is_guest"> | null,
): string {
  if (!user || user.is_guest) return "";
  return (
    [user.actor_id, user.user_id].find((id) => id && hasHistoryActor(id)) ?? ""
  );
}

const photoKey = (actor: string) =>
  actorScopedStorageKey("echo:recent-photo:v1", actor);

function readPhoto(actor: string): RecentPhoto | null {
  try {
    const value = JSON.parse(localStorage.getItem(photoKey(actor)) ?? "null");
    if (!isRelativeFilePath(value?.path) || !Number.isFinite(value.updatedAt))
      return null;
    return {
      kind: "photo",
      path: value.path,
      title: value.path.split("/").pop()!,
      updatedAt: value.updatedAt,
    };
  } catch {
    return null;
  }
}

export function rememberPhoto(
  actor: string,
  photo: Pick<RecentPhoto, "path" | "title">,
) {
  if (!hasHistoryActor(actor) || !isRelativeFilePath(photo.path)) return;
  try {
    localStorage.setItem(
      photoKey(actor),
      JSON.stringify({ path: photo.path, updatedAt: Date.now() }),
    );
    window.dispatchEvent(new Event(CONTINUITY_CHANGED));
  } catch {
    /* The photo can still be viewed. */
  }
}

export function readContinueItems(actor: string): ContinueItem[] {
  if (!hasHistoryActor(actor)) return [];
  const items: ContinueItem[] = readWatchProgress(actor)
    .filter(
      (row) => row.position > 0 && !/^(?:file|blob|data|https?):/i.test(row.id),
    )
    .map(({ id, title, position, duration, updatedAt }) => ({
      kind: "video",
      id,
      position,
      duration,
      updatedAt,
      title:
        typeof title === "string" && title.trim()
          ? title.slice(0, 255)
          : "上次观看的视频",
    }));
  const photo = readPhoto(actor);
  if (photo) items.push(photo);
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

type ContinueTarget =
  | { kind: "photo"; path: string }
  | { kind: "video"; id: string };

export function forgetContinueItem(actor: string, item: ContinueTarget) {
  if (!hasHistoryActor(actor)) return;
  if (item.kind === "video") return forgetWatchProgress(actor, item.id);
  if (readPhoto(actor)?.path !== item.path) return;
  try {
    localStorage.removeItem(photoKey(actor));
    window.dispatchEvent(new Event(CONTINUITY_CHANGED));
  } catch {
    /* Storage may be disabled. */
  }
}

/** File Manager and Photos share an appliance root. Match Storage files by source as well. */
export function forgetTrashedMedia(
  actor: string,
  entry: { path: string; resource_id?: string | null; kind: "dir" | "file" },
) {
  if (!hasHistoryActor(actor)) return;
  const removed = parseApplianceFileResourceId(entry.resource_id ?? "");
  const contains = (path: string) =>
    path === entry.path ||
    (entry.kind === "dir" && path.startsWith(entry.path + "/"));
  for (const item of readContinueItems(actor)) {
    if (item.kind === "photo") {
      if (contains(item.path)) forgetContinueItem(actor, item);
    } else {
      const video =
        parseStorageFileResourceId(item.id) ??
        parseApplianceFileResourceId(item.id);
      if (
        item.id === entry.resource_id ||
        (removed &&
          video?.sourceId === removed.sourceId &&
          contains(video.path))
      ) {
        forgetContinueItem(actor, item);
      }
    }
  }
}

function subscribe(listener: () => void) {
  window.addEventListener(CONTINUITY_CHANGED, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CONTINUITY_CHANGED, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useContinueItems(actor: string): ContinueItem[] {
  // A primitive snapshot stays stable across renders and changes immediately on account switch.
  const snapshot = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(readContinueItems(actor)),
    () => "[]",
  );
  return useMemo(() => JSON.parse(snapshot) as ContinueItem[], [snapshot]);
}
