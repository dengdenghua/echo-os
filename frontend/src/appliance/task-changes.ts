import {
  currentActorId,
  getAuthSessionRevision,
  getToken,
} from "@/core/auth/api";
import { authHeader } from "./auth";
import { parseDesktopAction } from "./desktop-actions";

export type FileChangeLocation = { path: string | null; sha256: string | null };
export type TaskFileChange = {
  id: string;
  kind: "file_move";
  before: FileChangeLocation;
  plannedAfter: FileChangeLocation;
  after: FileChangeLocation;
  status: string;
  committed: boolean | null;
  evidence: "planned" | "verified" | "uncertain" | "unchanged" | "reverted";
  canPreviewUndo: boolean;
};
export type TaskChanges = {
  schema: "echo.task_changes.v1";
  taskId: string;
  available: boolean;
  reason: string | null;
  provider: "echo-os.files" | null;
  planId: string | null;
  sourcePlanId: string | null;
  rootPath: string | null;
  direction: "apply" | "undo" | null;
  phase: string;
  generatedAt: string;
  previewExpiresAt: string | null;
  changes: TaskFileChange[];
  canPreviewUndo: boolean;
  revision: string | null;
};

const HASH = /^[0-9a-f]{64}$/;
export const CHANGES_SESSION_CHANGED = "登录状态已变化，请重新查看任务变更。";
export function captureChangesSession() {
  const actor = currentActorId();
  const revision = getAuthSessionRevision();
  const token = getToken();
  return {
    current: () =>
      actor === currentActorId() &&
      revision === getAuthSessionRevision() &&
      token === getToken(),
  };
}

function relativePath(value: unknown, empty = false): value is string {
  return (
    typeof value === "string" &&
    (empty || Boolean(value)) &&
    value.length <= 4096 &&
    !/[\\:\x00-\x1f]/.test(value) &&
    !value.startsWith("/") &&
    !value.split("/").some((part) => part === "." || part === "..")
  );
}
function location(value: FileChangeLocation) {
  return (
    value &&
    (value.path === null || relativePath(value.path)) &&
    (value.sha256 === null ||
      (typeof value.sha256 === "string" && HASH.test(value.sha256))) &&
    (value.path !== null || value.sha256 === null)
  );
}
function parse(value: TaskChanges, taskId: string): TaskChanges {
  if (
    !value ||
    value.schema !== "echo.task_changes.v1" ||
    value.taskId !== taskId ||
    typeof value.available !== "boolean" ||
    !Array.isArray(value.changes) ||
    value.changes.length > 250 ||
    typeof value.canPreviewUndo !== "boolean" ||
    typeof value.generatedAt !== "string" ||
    typeof value.phase !== "string"
  )
    throw new Error("无法核验任务变更记录。");
  if (!value.available) {
    if (value.changes.length || value.canPreviewUndo)
      throw new Error("无法核验任务变更记录。");
    return value;
  }
  if (
    value.provider !== "echo-os.files" ||
    !value.planId ||
    !HASH.test(value.planId) ||
    !value.revision ||
    !HASH.test(value.revision) ||
    !relativePath(value.rootPath, true) ||
    !["apply", "undo"].includes(value.direction ?? "") ||
    new Set(value.changes.map((change) => change?.id)).size !==
      value.changes.length ||
    value.changes.some(
      (change) =>
        !change ||
        typeof change.id !== "string" ||
        change.kind !== "file_move" ||
        !location(change.before) ||
        !relativePath(change.before.path) ||
        !location(change.plannedAfter) ||
        !location(change.after) ||
        typeof change.status !== "string" ||
        ![true, false, null].includes(change.committed) ||
        !["planned", "verified", "uncertain", "unchanged", "reverted"].includes(
          change.evidence,
        ) ||
        typeof change.canPreviewUndo !== "boolean" ||
        (["verified", "reverted"].includes(change.evidence) &&
          (change.committed !== true ||
            !change.before.sha256 ||
            change.after.sha256 !== change.before.sha256 ||
            change.after.path !==
              (change.evidence === "verified"
                ? change.plannedAfter.path
                : change.before.path) ||
            (change.evidence === "verified" &&
              change.plannedAfter.sha256 !== change.before.sha256))) ||
        (change.canPreviewUndo &&
          (change.evidence !== "verified" || change.committed !== true)),
    ) ||
    value.canPreviewUndo !==
      value.changes.some((change) => change.canPreviewUndo)
  )
    throw new Error("无法核验任务变更记录。");
  return value;
}

async function request(
  taskId: string,
  signal: AbortSignal,
  original?: TaskChanges,
): Promise<TaskChanges> {
  const session = captureChangesSession();
  const response = await fetch(
    "/api/appliance/tasks/" +
      encodeURIComponent(taskId) +
      "/changes" +
      (original ? "/undo-preview" : ""),
    {
      method: original ? "POST" : "GET",
      headers: original
        ? { ...authHeader(), "Content-Type": "application/json" }
        : authHeader(),
      body: original
        ? JSON.stringify({ expectedRevision: original.revision })
        : undefined,
      signal,
      cache: "no-store",
    },
  );
  if (!session.current()) throw new Error(CHANGES_SESSION_CHANGED);
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? "变更记录已变化，请刷新后重新核对。"
        : response.status === 401 ||
            response.status === 403 ||
            response.status === 404
          ? "当前账号无法读取这项任务的变更记录。"
          : "暂时无法核验变更证据，请稍后刷新。",
    );
  const payload = await response.json();
  if (!session.current()) throw new Error(CHANGES_SESSION_CHANGED);
  return parse(payload, taskId);
}
export function fetchTaskChanges(taskId: string, signal: AbortSignal) {
  return request(taskId, signal);
}
export function previewTaskUndo(original: TaskChanges, signal: AbortSignal) {
  if (!original.available || !original.canPreviewUndo || !original.revision)
    return Promise.reject(new Error("没有已核验且可生成撤销预览的变更。"));
  return request(original.taskId, signal, original);
}
export function changesFileAction(view: TaskChanges) {
  if (!view.available || !relativePath(view.rootPath, true)) return null;
  return parseDesktopAction(
    new URLSearchParams({
      desktopAction: "files.open",
      path: view.rootPath,
    }).toString(),
  );
}
