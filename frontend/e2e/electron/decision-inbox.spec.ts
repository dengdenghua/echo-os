import { test, expect, _electron as electron } from "@playwright/test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
test("approval inbox is one desktop window and binds confirmation to the reviewed request", async () => {
  // Screenshots are opt-in evidence; the profile is always a fresh temp dir.
  const evidence = process.env.ECHO_INBOX_EVIDENCE_DIR;
  if (evidence) await mkdir(evidence, { recursive: true });
  const profile = await mkdtemp(path.join(tmpdir(), "echo-decision-inbox-"));
  const app = await electron.launch({
    args: [
      path.join(repoRoot, "frontend/electron/main.cjs"),
      "--smoke-test",
      `--user-data-dir=${profile}`,
    ],
    cwd: repoRoot,
    env: { ...process.env, ECHO_PET_DISABLED: "1" },
  });
  const decisions: unknown[] = [];
  const task = {
    id: "task-inbox",
    source: "echo-agent",
    threadId: "thread-inbox",
    parentTaskId: null,
    kind: "loop",
    title: "确认启动本地媒体服务",
    summary: "隔离验收请求",
    status: "waiting_approval",
    displayStatus: "waiting_approval",
    progressPercent: null,
    mode: "agent",
    agentId: "eve",
    runtimeCapabilityGroups: [],
    capabilityDecisions: [],
    activity: [],
    approval: {
      required: true,
      version: "a".repeat(64),
      tool: "apps.start",
      action: "start",
      reason: "核对目标后再启动",
    },
    startedAt: null,
    updatedAt: null,
    completedAt: null,
    terminalReason: null,
    latestCheckpointId: null,
  };
  try {
    const win = await app.firstWindow();
    await win.route("**/api/**", (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/auth/status")
        return route.fulfill({ json: { enabled: false } });
      if (pathname === "/api/appliance/auth/status")
        return route.fulfill({
          json: { authRequired: false, authenticated: false, role: null },
        });
      if (pathname === "/api/appliance/tasks")
        return route.fulfill({
          json: {
            schema: "echo.task_projection.v1",
            available: true,
            generatedAt: "2026-10-11",
            tasks: [task],
            counts: {
              total: 1,
              active: 0,
              waitingApproval: 1,
              paused: 0,
              recoveryNeeded: 0,
              failed: 0,
              completed: 0,
            },
            auditIntegrity: { available: true, ok: true, entriesChecked: 0 },
          },
        });
      if (pathname === "/api/task-runs/task-inbox/approval-decision") {
        decisions.push(route.request().postDataJSON());
        return route.fulfill({
          json: {
            schema: "echo.task_run_approval_decision.v1",
            task_run: { task_id: task.id, status: "running" },
            lease_health: {},
          },
        });
      }
      return route.fulfill({
        status: 503,
        json: { detail: "Isolated approval inbox fixture" },
      });
    });
    await win.reload();
    await win.evaluate(() => {
      window.location.hash = "/desktop";
    });
    const dock = win.getByTitle("审批收件箱", { exact: true });
    await dock.click();
    const inbox = win.locator('[data-window-id="system:decision-inbox"]');
    await expect(inbox).toBeVisible();
    await expect(inbox.getByText(task.title)).toBeVisible();
    await dock.click();
    await expect(inbox).toHaveCount(1);
    await inbox
      .getByRole("button", { name: "最小化审批收件箱", exact: true })
      .click();
    await expect(inbox).toBeHidden();
    await dock.click();
    await expect(inbox).toBeVisible();
    await inbox
      .getByRole("button", { name: "打开原任务", exact: true })
      .click();
    await expect(
      win.locator('[data-window-id="system:task-space"]'),
    ).toBeVisible();
    await expect(
      win.getByRole("complementary", { name: "任务详情" }),
    ).toContainText(task.title);
    await dock.click();
    await inbox.getByRole("button", { name: "批准操作", exact: true }).click();
    await expect(inbox.getByRole("alertdialog")).toHaveText(/核对目标后再启动/);
    expect(decisions).toHaveLength(0);
    await win.keyboard.press("Escape");
    await expect(inbox.getByRole("alertdialog")).toHaveCount(0);
    expect(decisions).toHaveLength(0);
    await inbox.getByRole("button", { name: "批准操作", exact: true }).click();
    if (evidence)
      await win.screenshot({ path: path.join(evidence, "review.png") });
    await inbox.getByRole("button", { name: "确认", exact: true }).click();
    await expect.poll(() => decisions.length).toBe(1);
    expect(decisions[0]).toEqual({
      approved: true,
      reason: "设备管理员从审批收件箱批准任务操作",
      expected_approval_version: "a".repeat(64),
    });
    expect(await win.evaluate(() => window.location.hash)).toBe("#/desktop");
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});
