/**
 * Native-only desktop paths (Playwright Electron).
 *
 * Two surfaces exist only inside the Electron shell and could not be reached
 * from a browser walk:
 *  1. the sleep / restart / shutdown confirmations, which need the native
 *     system-action capabilities;
 *  2. the desktop drawer (整理), which needs ``window.echo.desktop``.
 *
 * The renderer, preload bridge and IPC round trip are real. Two boundaries
 * are fixtures: the API answers "auth off" so the desktop mounts without a
 * backend, and the main-process ``system:*`` handlers are replaced by a
 * recorder that reports native power capabilities and never reaches
 * systemctl. The drawer reads a temporary home's Desktop folder.
 *
 * Set ECHO_E2E_SHOTS to a directory to keep screenshots of each state.
 */
import { test, expect, _electron as electron } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const shots = process.env.ECHO_E2E_SHOTS;

async function shot(win: Page, name: string) {
  if (!shots) return;
  await win.waitForTimeout(350);
  await win.screenshot({ path: path.join(shots, `${name}.png`) });
}

test("power confirmations and the desktop drawer in the native shell", async () => {
  const profile = await mkdtemp(path.join(tmpdir(), "echo-native-paths-"));
  const home = await mkdtemp(path.join(tmpdir(), "echo-native-home-"));
  const desktop = path.join(home, "Desktop");
  await mkdir(path.join(desktop, "项目资料"), { recursive: true });
  await writeFile(path.join(desktop, "季度报告.pdf"), "fixture");
  await writeFile(path.join(desktop, "会议纪要.md"), "fixture");
  await writeFile(path.join(desktop, "截图 2026-10-15.png"), "fixture");

  const app = await electron.launch({
    args: [
      path.join(repoRoot, "frontend/electron/main.cjs"),
      "--smoke-test",
      `--user-data-dir=${profile}`,
    ],
    cwd: repoRoot,
    // The drawer lists os.homedir()/Desktop: point it at the fixture home.
    env: {
      ...process.env,
      ECHO_PET_DISABLED: "1",
      HOME: home,
      USERPROFILE: home,
    },
  });
  try {
    // Replace the handlers once the shell has registered its own.
    const win = await app.firstWindow();
    await win.waitForLoadState("domcontentloaded");
    await app.evaluate(({ ipcMain }) => {
      const calls: string[] = [];
      (globalThis as { __echoPowerCalls?: string[] }).__echoPowerCalls = calls;
      ipcMain.removeHandler("system:getCapabilities");
      ipcMain.handle("system:getCapabilities", () => ({
        nativeShell: true,
        lock: false,
        logout: true,
        suspend: true,
        restart: true,
        shutdown: true,
      }));
      ipcMain.removeHandler("system:runAction");
      ipcMain.handle("system:runAction", (_event, action: string) => {
        calls.push(action);
        return { ok: true };
      });
    });
    const powerCalls = () =>
      app.evaluate(
        () =>
          (globalThis as { __echoPowerCalls?: string[] }).__echoPowerCalls ??
          [],
      );

    await win.setViewportSize({ width: 1440, height: 900 });
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
      return route.fulfill({ status: 503, json: { detail: "Isolated UI" } });
    });
    await win.reload();
    await win.evaluate(() => {
      window.location.hash = "/desktop";
    });
    await expect(win.locator(".mac-menu-bar")).toBeVisible();

    const menu = win.getByRole("button", { name: "ECHO 菜单" });
    const openPowerItem = async (label: string) => {
      await menu.click();
      await win
        .locator(".mac-menu-dropdown")
        .getByText(label, { exact: true })
        .click();
    };
    const confirmation = win.getByRole("alertdialog");

    // 睡眠: the confirmation names the action; Escape cancels it.
    await openPowerItem("睡眠…");
    await expect(confirmation).toBeVisible();
    await expect(
      confirmation.getByRole("heading", { name: "让 ECHO OS 进入睡眠？" }),
    ).toBeVisible();
    await expect(
      confirmation.getByRole("button", { name: "睡眠", exact: true }),
    ).toBeVisible();
    await shot(win, "after4-electron-power-suspend-dark");
    await win.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);

    // 重新启动: 取消 closes it.
    await openPowerItem("重新启动…");
    await expect(
      confirmation.getByRole("heading", { name: "重新启动 ECHO OS？" }),
    ).toBeVisible();
    await shot(win, "after4-electron-power-restart-dark");
    await confirmation.getByRole("button", { name: "取消" }).click();
    await expect(confirmation).toHaveCount(0);

    // 关机: confirming reaches the native boundary once, with this action.
    await openPowerItem("关机…");
    await expect(
      confirmation.getByRole("heading", { name: "关闭 ECHO OS？" }),
    ).toBeVisible();
    await shot(win, "after4-electron-power-shutdown-dark");
    expect(await powerCalls()).toEqual([]);
    await confirmation
      .getByRole("button", { name: "关机", exact: true })
      .click();
    await expect.poll(powerCalls).toEqual(["shutdown"]);

    // The desktop drawer (整理) from the desktop context menu.
    await win.keyboard.press("Escape");
    await win.mouse.click(720, 600, { button: "right" });
    await win.getByRole("button", { name: /^整理 Ctrl/ }).click();
    const drawer = win.getByRole("dialog", { name: "桌面助手" });
    await expect(drawer).toBeVisible();
    for (const name of ["项目资料", "季度报告.pdf", "会议纪要.md"]) {
      await expect(drawer.getByText(name, { exact: true })).toBeVisible();
    }
    await shot(win, "after4-electron-drawer-dark");
    await expect(drawer).toContainText("4 个桌面项目已收纳");
    await win.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});
