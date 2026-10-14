import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentFileChangesPanel } from "./agent-file-changes-panel";

function stubChanges(body: unknown, status = 200) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const change = (overrides: Record<string, unknown>) => ({
  id: "c1",
  path: "C:/ws/hello.txt",
  displayPath: "hello.txt",
  inWorkspace: true,
  action: "create",
  at: "2026-10-14T03:00:00Z",
  source: "journal",
  evidence: "verified",
  bytesDelta: 10,
  afterSha256: "a".repeat(64),
  diff: "+hello echo",
  diffTruncated: false,
  ...overrides,
});

const body = (changes: unknown[], available = true) => ({
  schema: "echo.task_file_changes.v1",
  taskId: "task-1",
  available,
  reason: null,
  workspacePath: "C:/ws",
  generatedAt: "2026-10-14T03:01:00Z",
  changes,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Agent task file changes", () => {
  it("lists what the task changed and how each file checks out", async () => {
    const fetchMock = stubChanges(
      body([
        change({}),
        change({
          id: "c2",
          displayPath: "notes.md",
          action: "update",
          evidence: "changed_since",
        }),
        change({
          id: "c3",
          displayPath: "/elsewhere/config.toml",
          inWorkspace: false,
          source: "thread",
          evidence: "recorded",
          diff: null,
        }),
      ]),
    );
    const user = userEvent.setup();
    render(<AgentFileChangesPanel taskId="task-1" />);

    expect(await screen.findByText("hello.txt")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/appliance/tasks/task-1/file-changes",
    );
    expect(screen.getByText("文件改动 · 3 处")).toBeInTheDocument();
    expect(screen.getByText("已核验 1 处")).toBeInTheDocument();
    expect(
      screen.getByText("已核验，文件与任务写入时一致"),
    ).toBeInTheDocument();
    expect(screen.getByText("任务结束后文件又被改过")).toBeInTheDocument();
    expect(screen.getByText("位于任务工作区之外")).toBeInTheDocument();
    expect(screen.getAllByText("新建")).toHaveLength(2);

    await user.click(screen.getAllByRole("button", { name: "查看差异" })[0]!);
    expect(screen.getByText("+hello echo")).toBeInTheDocument();
  });

  it("says when a task changed no files", async () => {
    stubChanges(body([]));
    render(<AgentFileChangesPanel taskId="task-1" />);
    expect(
      await screen.findByText("这个任务没有记录到文件改动。"),
    ).toBeInTheDocument();
  });

  it("explains an unreadable record instead of failing silently", async () => {
    stubChanges({ detail: "task not found" }, 404);
    render(<AgentFileChangesPanel taskId="task-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "没有权限查看这个任务的文件改动",
    );
  });
});
