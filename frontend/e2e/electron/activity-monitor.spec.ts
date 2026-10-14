import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

test("system windows show native readings and preserve settings drafts", async () => {
  const profile = await mkdtemp(path.join(tmpdir(), "echo-activity-monitor-"));
  const app = await electron.launch({
    args: [
      path.join(repoRoot, "frontend/electron/main.cjs"),
      "--smoke-test",
      `--user-data-dir=${profile}`,
    ],
    cwd: repoRoot,
    env: { ...process.env, ECHO_PET_DISABLED: "1" },
  });
  try {
    const win = await app.firstWindow();
    // Only the login boundary is a fixture. System information uses the real
    // preload/main-process IPC; API interception prevents any agent execution.
    await win.route("**/api/**", (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/auth/status") {
        return route.fulfill({ json: { enabled: false } });
      }
      if (pathname === "/api/appliance/auth/status") {
        return route.fulfill({
          json: { authRequired: false, authenticated: false, role: null },
        });
      }
      return route.fulfill({
        status: 503,
        json: { detail: "Isolated UI test" },
      });
    });
    await win.reload();
    await win.evaluate(() => {
      window.location.hash = "/desktop";
    });
    const native = await win.evaluate(() =>
      window.echo?.desktop?.getSystemInfo(),
    );
    expect(native.ok).toBe(true);
    expect(native.cpu.cores).toBeGreaterThan(0);
    expect(native.memory.total).toBeGreaterThan(0);

    const dock = win.getByRole("button", { name: "活动监视器", exact: true });
    await dock.click();
    const monitor = win.locator('[data-window-id="system:activity-monitor"]');
    await expect(monitor).toBeVisible();
    await expect(
      monitor.getByText(`${native.cpu.model} · ${native.cpu.cores} 核心`),
    ).toBeVisible();
    await expect(
      monitor.getByRole("progressbar", { name: "CPU 使用率" }),
    ).toBeVisible();
    await expect(
      monitor.getByRole("progressbar", { name: "内存使用率" }),
    ).toBeVisible();

    const before = await monitor.boundingBox();
    expect(before).not.toBeNull();
    const controls = monitor.getByLabel("活动监视器窗口控制");
    const handle = await controls.boundingBox();
    expect(handle).not.toBeNull();
    if (!before || !handle) throw new Error("Missing monitor window geometry");
    await win.mouse.move(handle.x + handle.width - 25, handle.y + 20);
    await win.mouse.down();
    await win.mouse.move(handle.x + handle.width - 85, handle.y + 60, {
      steps: 5,
    });
    await win.mouse.up();
    await expect
      .poll(async () => (await monitor.boundingBox())?.x)
      .not.toBe(before.x);

    await monitor
      .getByRole("button", { name: "最小化活动监视器", exact: true })
      .click();
    await expect(monitor).toBeHidden();
    await dock.click();
    await expect(monitor).toBeVisible();
    await expect(monitor).toHaveCount(1);
    await monitor
      .getByRole("button", { name: "关闭活动监视器", exact: true })
      .click();
    await expect(monitor).toHaveCount(0);

    await win.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("echo:open-system-settings", {
          detail: { section: "models" },
        }),
      );
    });
    const settings = win.locator('[data-window-id="system:settings"]');
    await expect(settings).toBeVisible();
    await expect(
      settings.getByRole("heading", { name: "模型与用量", exact: true }),
    ).toBeVisible();
    await settings
      .getByRole("button", { name: "账户与安全", exact: true })
      .click();
    await settings
      .getByLabel("当前密码", { exact: true })
      .fill("unsent-test-draft");
    await settings
      .getByRole("button", { name: "最小化系统设置", exact: true })
      .click();
    await expect(settings).toBeHidden();
    await win
      .getByRole("button", { name: "系统设置 · 点击恢复窗口", exact: true })
      .click();
    await expect(settings).toBeVisible();
    await expect(settings.getByLabel("当前密码", { exact: true })).toHaveValue(
      "unsent-test-draft",
    );
    await settings
      .getByRole("button", { name: "全部退出…", exact: true })
      .click();
    await expect(win.getByRole("alertdialog")).toBeVisible();
    // Exercise the real window-close guard independently of the modal's
    // pointer interception. No credential mutation is submitted.
    await settings
      .getByRole("button", { name: "关闭系统设置", exact: true })
      .evaluate((button: HTMLButtonElement) => button.click());
    await expect(settings).toHaveCount(1);
    await win.keyboard.press("Escape");
    await expect(win.getByRole("alertdialog")).toHaveCount(0);
    await expect(settings).toBeVisible();
    await settings
      .getByRole("button", { name: "关闭系统设置", exact: true })
      .click();
    await expect(settings).toHaveCount(0);
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});
