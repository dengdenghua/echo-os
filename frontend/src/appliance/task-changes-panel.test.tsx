import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskChangesPanel } from "./task-changes-panel";
import { fetchTaskChanges, type TaskChanges } from "./task-changes";

const auth = vi.hoisted(() => ({
  actor: "local:alice",
  revision: 0,
  token: null as string | null,
}));
vi.mock("@/core/auth/api", () => ({
  currentActorId: () => auth.actor,
  getAuthSessionRevision: () => auth.revision,
  getToken: () => auth.token,
  _clearTokens: vi.fn(),
}));
function view(taskId = "task-a"): TaskChanges {
  return {
    schema: "echo.task_changes.v1",
    taskId,
    available: true,
    reason: null,
    provider: "echo-os.files",
    planId: "f".repeat(64),
    sourcePlanId: null,
    rootPath: "Invoices",
    direction: "apply",
    phase: "completed",
    generatedAt: "2026-10-13T00:00:00Z",
    previewExpiresAt: "2026-10-13T00:15:00Z",
    revision: "e".repeat(64),
    canPreviewUndo: true,
    changes: [
      {
        id: "one",
        kind: "file_move",
        before: { path: "Invoices/one.txt", sha256: "d".repeat(64) },
        plannedAfter: {
          path: "Invoices/2026/09/one.txt",
          sha256: "d".repeat(64),
        },
        after: { path: "Invoices/2026/09/one.txt", sha256: "d".repeat(64) },
        status: "moved",
        committed: true,
        evidence: "verified",
        canPreviewUndo: true,
      },
    ],
  };
}
function preview(): TaskChanges {
  const original = view();
  return {
    ...original,
    planId: "b".repeat(64),
    sourcePlanId: original.planId,
    revision: "c".repeat(64),
    direction: "undo",
    phase: "planned",
    canPreviewUndo: false,
    changes: original.changes.map((change) => ({
      ...change,
      before: change.after,
      plannedAfter: change.before,
      after: { path: null, sha256: null },
      status: "ready",
      committed: false,
      evidence: "planned",
      canPreviewUndo: false,
    })),
  };
}
function response(body: unknown, status = 200) {
  return { ok: status === 200, status, json: async () => body };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  auth.actor = "local:alice";
  auth.revision = 0;
  auth.token = null;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(view())));
});
describe("task provider changes", () => {
  it("shows verified before/after and creates only an explicit undo preview", async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .mocked(fetch)
      .mockImplementation(
        async (url) =>
          response(
            String(url).endsWith("/undo-preview") ? preview() : view(),
          ) as Response,
      );
    render(<TaskChangesPanel taskId="task-a" />);
    expect(
      await screen.findByText("已核验移动结果，内容保持一致"),
    ).toBeInTheDocument();
    await user.dblClick(screen.getByRole("button", { name: "预览撤销" }));
    expect(
      await screen.findByRole("region", { name: "撤销预演" }),
    ).toBeInTheDocument();
    const posts = fetcher.mock.calls.filter(
      ([, options]) => options?.method === "POST",
    );
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe(
      "/api/appliance/tasks/task-a/changes/undo-preview",
    );
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({
      expectedRevision: "e".repeat(64),
    });
    expect(
      fetcher.mock.calls.every(([url]) => !String(url).endsWith("/apply")),
    ).toBe(true);
    expect(screen.getByText(/尚未移动文件/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "在文件管理器查看并确认" }),
    ).toHaveAttribute(
      "href",
      "/#/desktop?desktopAction=files.open&path=Invoices",
    );
  });
  it("shows an uncertain location without a restore action", async () => {
    const uncertain = view();
    uncertain.canPreviewUndo = false;
    uncertain.changes[0] = {
      ...uncertain.changes[0],
      after: { path: null, sha256: null },
      evidence: "uncertain",
      status: "uncertain",
      canPreviewUndo: false,
    };
    vi.mocked(fetch).mockResolvedValue(response(uncertain) as Response);
    render(<TaskChangesPanel taskId="task-a" />);
    expect(await screen.findByText("执行情况待核验")).toBeInTheDocument();
    expect(screen.getByText("→ 暂无法核验")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "预览撤销" }),
    ).not.toBeInTheDocument();
  });
  it("does not call a missing provider successful", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({
        ...view(),
        available: false,
        reason: "provider_unavailable",
        changes: [],
        canPreviewUndo: false,
      }) as Response,
    );
    render(<TaskChangesPanel taskId="task-a" />);
    expect(
      await screen.findByText("当前服务无法读取此任务的操作证据。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("已核验移动结果，内容保持一致"),
    ).not.toBeInTheDocument();
  });
  it("keeps all provider rows available instead of discarding the tail", async () => {
    const many = view();
    many.changes = Array.from({ length: 10 }, (_, id) => ({
      ...many.changes[0],
      id: String(id),
      before: {
        ...many.changes[0].before,
        path: "Invoices/item" + id + ".txt",
      },
    }));
    vi.mocked(fetch).mockResolvedValue(response(many) as Response);
    const user = userEvent.setup();
    render(<TaskChangesPanel taskId="task-a" />);
    await screen.findByText("Invoices/item0.txt");
    expect(screen.queryByText("Invoices/item9.txt")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看全部 10 条" }));
    expect(screen.getByText("Invoices/item9.txt")).toBeInTheDocument();
  });
  it("rejects a request whose credential changes while its JSON is pending", async () => {
    const body = deferred<TaskChanges>();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => body.promise,
    } as Response);
    const pending = fetchTaskChanges("task-a", new AbortController().signal);
    await Promise.resolve();
    auth.revision += 1;
    body.resolve(view());
    await expect(pending).rejects.toThrow("登录状态已变化");
  });
  it("discards an old task's pending undo preview after selection changes", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).endsWith("/undo-preview")) return pending.promise;
      const next = view(String(url).includes("task-b") ? "task-b" : "task-a");
      if (next.taskId === "task-b")
        next.changes[0].before.path = "Invoices/b.txt";
      return response(next) as Response;
    });
    const user = userEvent.setup();
    const mounted = render(<TaskChangesPanel taskId="task-a" />);
    await screen.findByText("Invoices/one.txt");
    await user.click(screen.getByRole("button", { name: "预览撤销" }));
    mounted.rerender(<TaskChangesPanel taskId="task-b" />);
    await screen.findByText("Invoices/b.txt");
    await act(async () => {
      pending.resolve(response(preview()) as Response);
    });
    expect(
      screen.queryByRole("region", { name: "撤销预演" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Invoices/b.txt")).toBeInTheDocument();
  });
  it.each([
    "wrong-task",
    "traversal",
    "null-row",
    "duplicate",
    "overflow",
    "unobserved",
    "wrong-location",
    "wrong-hash",
    "wrong-reverted-location",
  ])("rejects malformed or mismatched provider data: %s", async (scenario) => {
    const invalid = view();
    if (scenario === "wrong-task") invalid.taskId = "another-task";
    if (scenario === "traversal")
      invalid.changes[0].after.path = "../outside.txt";
    if (scenario === "null-row")
      invalid.changes = [null as unknown as TaskChanges["changes"][number]];
    if (scenario === "duplicate") invalid.changes.push(invalid.changes[0]);
    if (scenario === "overflow")
      invalid.changes = Array(251).fill(invalid.changes[0]);
    if (scenario === "unobserved") invalid.changes[0].after.path = null;
    if (scenario === "wrong-location")
      invalid.changes[0].after.path = invalid.changes[0].before.path;
    if (scenario === "wrong-hash")
      invalid.changes[0].after.sha256 = "c".repeat(64);
    if (scenario === "wrong-reverted-location") {
      invalid.changes[0].evidence = "reverted";
      invalid.changes[0].canPreviewUndo = false;
      invalid.canPreviewUndo = false;
    }
    vi.mocked(fetch).mockResolvedValue(response(invalid) as Response);
    await expect(
      fetchTaskChanges("task-a", new AbortController().signal),
    ).rejects.toThrow("无法核验");
  });
  it("keeps stale preview errors visible and requires a refresh", async () => {
    vi.mocked(fetch).mockImplementation(
      async (url) =>
        response(
          String(url).endsWith("/undo-preview") ? {} : view(),
          String(url).endsWith("/undo-preview") ? 409 : 200,
        ) as Response,
    );
    const user = userEvent.setup();
    render(<TaskChangesPanel taskId="task-a" />);
    await screen.findByText("Invoices/one.txt");
    await user.click(screen.getByRole("button", { name: "预览撤销" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "变更记录已变化",
    );
    expect(
      screen.queryByRole("region", { name: "撤销预演" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新变更" })).toBeEnabled();
  });
});
