import type { Page } from "@playwright/test";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  desktop,
  dock,
  expect,
  expectApiFailure,
  lockScreenPassword,
  ownerPassword,
  signIn,
  test,
} from "./fixtures";

/**
 * Full-stack golden smoke: FastAPI (booted through the appliance entrypoint)
 * plus Vite, driven like a device owner: lock screen, desktop, sign out.
 */

const backendPort = process.env.GATEWAY_PORT || "18000";
const backendBase = `http://127.0.0.1:${backendPort}`;
const frontendPort = process.env.FRONTEND_PORT || "13000";
const e2eDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(e2eDir, "../..");
const rawE2eStateRoot =
  process.env.ECHO_E2E_STATE_ROOT || "test-results/full-stack-state";
const e2eStateRoot = isAbsolute(rawE2eStateRoot)
  ? resolve(rawE2eStateRoot)
  : resolve(repoRoot, rawE2eStateRoot);
const e2eDataDir = join(e2eStateRoot, "data");
const frontendOrigins = [
  `http://127.0.0.1:${frontendPort}`,
  `http://localhost:${frontendPort}`,
];

async function fetchFromPage(page: Page, path: string) {
  return page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath);
    return {
      ok: response.ok,
      status: response.status,
      body: await response.json(),
    };
  }, path);
}

function normalizedPath(value: unknown): string {
  return String(value || "").replace(/\\/g, "/");
}

test.describe("Full-stack golden smoke", () => {
  test("backend, Vite proxy and the appliance session agree on both loopback origins", async ({
    page,
    request,
  }) => {
    const health = await request.get(`${backendBase}/api/health`);
    expect(health.ok()).toBeTruthy();
    const ready = await request.get(`${backendBase}/readyz`);
    expect(ready.ok()).toBeTruthy();

    // Appliance mode: the Agent control plane is behind the device login.
    const authStatus = await request.get(`${backendBase}/api/auth/status`);
    expect(await authStatus.json()).toMatchObject({
      enabled: true,
      jwt_available: true,
      allow_registration: false,
    });
    const signedOut = await request.get(
      `${backendBase}/api/appliance/auth/status`,
    );
    expect(await signedOut.json()).toEqual({
      authRequired: true,
      authenticated: false,
      role: null,
    });
    const anonymousStatus = await request.get(`${backendBase}/api/status`);
    expect(anonymousStatus.status()).toBe(401);

    for (const origin of frontendOrigins) {
      const proxiedHealth = await request.get(`${origin}/api/health`);
      expect(proxiedHealth.ok()).toBeTruthy();
      const proxiedAuth = await request.get(`${origin}/api/auth/status`);
      expect(proxiedAuth.ok()).toBeTruthy();
      expect((await proxiedAuth.json()).enabled).toBe(true);
    }

    // Browser storage and the HttpOnly session are origin-partitioned, so the
    // SPA moves a 127.0.0.1 visit to the canonical localhost origin before
    // the lock screen renders.
    await page.goto(`${frontendOrigins[0]}/`);
    await expect(page).toHaveURL(
      new RegExp(`^http://localhost:${frontendPort}/#/desktop$`),
    );
    await signIn(page, `http://localhost:${frontendPort}/`);

    const status = await fetchFromPage(page, "/api/status");
    expect(status.ok).toBe(true);
    expect(status.body.version).toBeTruthy();
    expect(status.body.capabilities.fastapi).toBe(true);

    const session = await fetchFromPage(page, "/api/appliance/auth/status");
    expect(session.body).toMatchObject({
      authRequired: true,
      authenticated: true,
    });

    const selfCheck = await fetchFromPage(page, "/api/runtime/self-check");
    expect(selfCheck.ok).toBe(true);
    expect(selfCheck.body.frontend).toMatchObject({
      canonical_origin: `http://localhost:${frontendPort}`,
      proxy_target: backendBase,
      proxy_targets_backend: true,
    });
    expect(normalizedPath(selfCheck.body.paths?.runtime_root)).toBe(
      normalizedPath(e2eStateRoot),
    );
    expect(normalizedPath(selfCheck.body.paths?.data_dir)).toBe(
      normalizedPath(e2eDataDir),
    );

    const agents = await fetchFromPage(page, "/api/agents");
    expect(agents.ok).toBe(true);
    const agentNames = (agents.body as Array<{ name?: string }>)
      .map((agent) => agent.name)
      .filter((name): name is string => Boolean(name))
      .sort();
    expect(agentNames).toContain("general");

    // The other loopback origin proxies to the same backend once it carries
    // its own owner session.
    const otherOrigin = frontendOrigins[0];
    const login = await request.post(`${otherOrigin}/api/auth/local/login`, {
      data: { username: "admin", password: ownerPassword() },
    });
    expect(login.ok()).toBeTruthy();
    const otherStatus = await request.get(`${otherOrigin}/api/status`);
    expect(otherStatus.ok()).toBeTruthy();
    expect((await otherStatus.json()).version).toBe(status.body.version);
    const otherAgents = await request.get(`${otherOrigin}/api/agents`);
    expect(otherAgents.ok()).toBeTruthy();
    expect(
      ((await otherAgents.json()) as Array<{ name?: string }>)
        .map((agent) => agent.name)
        .filter((name): name is string => Boolean(name))
        .sort(),
    ).toEqual(agentNames);
  });

  test("the lock screen refuses a wrong password and lets the owner in", async ({
    page,
  }) => {
    expectApiFailure(page, {
      method: "POST",
      path: "/api/auth/local/login",
      status: 401,
    });
    await page.goto("/");
    await expect(page).toHaveTitle("ECHO OS");
    await expect(page).toHaveURL(/#\/desktop$/);
    await expect(lockScreenPassword(page)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "ECHO" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "用户名" })).toHaveValue(
      "admin",
    );
    await expect(dock(page)).toHaveCount(0);

    await lockScreenPassword(page).fill(`${ownerPassword()}-wrong`);
    await page.getByRole("button", { name: "进入桌面" }).click();
    await expect(page.getByText("用户名或密码错误")).toBeVisible();
    await expect(dock(page)).toHaveCount(0);

    await lockScreenPassword(page).fill(ownerPassword());
    await page.getByRole("button", { name: "进入桌面" }).click();
    await expect(desktop(page)).toBeVisible({ timeout: 30_000 });
    await expect(dock(page)).toBeVisible();
    for (const app of ["应用库", "任务空间", "审批收件箱", "系统设置"]) {
      await expect(
        dock(page).getByRole("button", { name: app, exact: true }),
      ).toBeVisible();
    }
    await expect(
      desktop(page).getByRole("textbox", { name: "输入意图" }),
    ).toBeVisible();

    // The session survives a reload: the desktop, not the lock screen.
    await page.reload();
    await expect(dock(page)).toBeVisible({ timeout: 30_000 });
    await expect(lockScreenPassword(page)).toHaveCount(0);
  });

  test("signing out from the Echo menu returns to the lock screen", async ({
    desktopPage: page,
  }) => {
    await page.getByRole("button", { name: "ECHO 菜单" }).click();
    await page.getByRole("button", { name: "退出登录…" }).click();
    const confirm = page.getByRole("alertdialog", {
      name: "退出这个浏览器里的 ECHO OS？",
    });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "取消" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(dock(page)).toBeVisible();

    await page.getByRole("button", { name: "ECHO 菜单" }).click();
    await page.getByRole("button", { name: "退出登录…" }).click();
    await confirm.getByRole("button", { name: "退出登录" }).click();
    await expect(lockScreenPassword(page)).toBeVisible({ timeout: 15_000 });
    await expect(dock(page)).toHaveCount(0);

    // The browser session is gone, not just hidden.
    const session = await fetchFromPage(page, "/api/appliance/auth/status");
    expect(session.body).toMatchObject({ authenticated: false });
    await page.reload();
    await expect(lockScreenPassword(page)).toBeVisible({ timeout: 30_000 });
    await expect(dock(page)).toHaveCount(0);
  });

  test("a workspace deep link opens the 工作台 window after sign-in", async ({
    page,
  }) => {
    await signIn(page, "/#/workspace/realtime/new");
    await expect(page).toHaveURL(/#\/desktop/);
    const workbench = page.getByRole("dialog", { name: "工作台" });
    await expect(workbench).toBeVisible({ timeout: 30_000 });
    await expect(workbench.getByTestId("chat-composer-input")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('[data-window-id^="agent-window:"]')).toHaveCount(
      1,
    );
  });
});
