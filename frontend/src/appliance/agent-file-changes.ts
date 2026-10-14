/**
 * Recorded file changes of an Agent task (Echo or Codex engine), as checked
 * by the device against the disk. Served by
 * GET /api/appliance/tasks/{id}/file-changes (appliance/task_file_changes.py).
 */

import { authHeader } from "./auth";

export type AgentFileChangeEvidence =
  | "verified"
  | "changed_since"
  | "missing"
  | "superseded"
  | "recorded";

export type AgentFileChange = {
  id: string;
  path: string;
  displayPath: string;
  inWorkspace: boolean;
  action: "create" | "update" | "delete" | "rename";
  at: string | null;
  source: "journal" | "thread";
  evidence: AgentFileChangeEvidence;
  bytesDelta: number | null;
  afterSha256: string | null;
  diff: string | null;
  diffTruncated: boolean;
};

export type AgentTaskFileChanges = {
  schema: "echo.task_file_changes.v1";
  taskId: string;
  available: boolean;
  reason: string | null;
  workspacePath: string | null;
  generatedAt: string;
  changes: AgentFileChange[];
};

const ACTIONS = new Set(["create", "update", "delete", "rename"]);
const EVIDENCE = new Set([
  "verified",
  "changed_since",
  "missing",
  "superseded",
  "recorded",
]);

function parse(value: unknown, taskId: string): AgentTaskFileChanges {
  const body = value as Partial<AgentTaskFileChanges> | null;
  if (
    !body ||
    body.schema !== "echo.task_file_changes.v1" ||
    body.taskId !== taskId ||
    typeof body.available !== "boolean" ||
    !Array.isArray(body.changes)
  ) {
    throw new Error("任务服务返回了不兼容的文件改动记录");
  }
  const changes = body.changes.filter(
    (change): change is AgentFileChange =>
      Boolean(change) &&
      typeof change.id === "string" &&
      typeof change.path === "string" &&
      typeof change.displayPath === "string" &&
      ACTIONS.has(change.action) &&
      EVIDENCE.has(change.evidence),
  );
  return {
    schema: "echo.task_file_changes.v1",
    taskId,
    available: body.available,
    reason: typeof body.reason === "string" ? body.reason : null,
    workspacePath:
      typeof body.workspacePath === "string" ? body.workspacePath : null,
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : "",
    changes,
  };
}

export async function fetchAgentTaskFileChanges(
  taskId: string,
  signal?: AbortSignal,
): Promise<AgentTaskFileChanges> {
  const response = await fetch(
    `/api/appliance/tasks/${encodeURIComponent(taskId)}/file-changes`,
    { headers: authHeader(), signal },
  );
  if (response.status === 401) throw new Error("登录已失效，请重新登录");
  if (response.status === 404)
    throw new Error("没有权限查看这个任务的文件改动");
  if (!response.ok) throw new Error("暂时无法读取这个任务的文件改动记录");
  return parse(await response.json(), taskId);
}

export const ACTION_LABELS: Record<AgentFileChange["action"], string> = {
  create: "新建",
  update: "修改",
  delete: "删除",
  rename: "重命名",
};

export const EVIDENCE_LABELS: Record<AgentFileChangeEvidence, string> = {
  verified: "已核验，文件与任务写入时一致",
  changed_since: "任务结束后文件又被改过",
  missing: "文件已不在原位置",
  superseded: "之后在本任务中再次修改",
  recorded: "已记录，没有可比对的校验值",
};
