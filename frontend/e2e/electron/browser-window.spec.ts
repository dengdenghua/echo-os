import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
interface NativeWebview extends HTMLElement {
  getWebContentsId: () => number;
}

test("AI browser preserves its native page across desktop windows and minimization", async () => {
  const profile = await mkdtemp(path.join(tmpdir(), "echo-browser-window-"));
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(
      '<title>Local window retention</title><input id="draft" value="initial"><script>window.loadToken = Math.random().toString(36)</script>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server address");
  const url = `http://127.0.0.1:${address.port}/retained`;
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
    await win.route("**/api/**", (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/auth/status")
        return route.fulfill({ json: { enabled: false } });
      if (pathname === "/api/appliance/auth/status")
        return route.fulfill({
          json: { authRequired: false, authenticated: false, role: null },
        });
      return route.fulfill({
        status: 503,
        json: { detail: "Isolated browser test" },
      });
    });
    await win.reload();
    await win.evaluate(() => {
      window.location.hash = "/desktop";
    });
    const dock = win.getByRole("button", { name: "AI 浏览器", exact: true });
    await dock.click();
    const browser = win.locator('[data-window-id="system:browser"]');
    await expect(browser).toBeVisible();
    await expect(browser.getByTestId("browser-tab-bar")).toBeVisible();
    expect(await win.evaluate(() => window.location.hash)).toBe("#/desktop");

    await win.evaluate((target) => {
      window.dispatchEvent(
        new CustomEvent("echo:browser-open-url-request", {
          detail: { url: target, title: "Retained local page" },
        }),
      );
    }, url);
    const view = browser.locator("webview").first();
    await expect(view).toBeVisible();
    const id = await view.evaluate((element: NativeWebview) =>
      element.getWebContentsId(),
    );
    const readPage = () =>
      win.evaluate(
        async (contentsId) =>
          window.echo?.browser?.executeJS(
            contentsId,
            '({ draft: document.querySelector("#draft")?.value, token: window.loadToken })',
          ),
        id,
      );
    await expect.poll(async () => (await readPage())?.draft).toBe("initial");
    await win.evaluate(
      async (contentsId) =>
        window.echo?.browser?.executeJS(
          contentsId,
          'document.querySelector("#draft").value = "unsent-native-draft"',
        ),
      id,
    );
    const before = await readPage();

    await browser
      .getByRole("button", { name: "最小化AI 浏览器", exact: true })
      .click();
    await expect(browser).toBeHidden();
    const tabCount = await browser.getByTestId("browser-page-tab").count();
    await win.keyboard.press("Control+t");
    await expect(browser.getByTestId("browser-page-tab")).toHaveCount(tabCount);
    await dock.click();
    await expect(browser).toBeVisible();
    await expect(browser).toHaveCount(1);
    expect(
      await view.evaluate((element: NativeWebview) =>
        element.getWebContentsId(),
      ),
    ).toBe(id);
    expect(await readPage()).toEqual(before);

    await win.getByRole("button", { name: "活动监视器", exact: true }).click();
    await win.keyboard.press("Control+t");
    await expect(browser.getByTestId("browser-page-tab")).toHaveCount(tabCount);
    await dock.click();
    await win.keyboard.press("Control+t");
    await expect(browser.getByTestId("browser-page-tab")).toHaveCount(
      tabCount + 1,
    );
    await browser
      .getByRole("button", { name: "关闭AI 浏览器", exact: true })
      .click();
    await expect(browser).toHaveCount(0);
    await expect(
      win.locator('[data-window-id="system:activity-monitor"]'),
    ).toBeVisible();
  } finally {
    await app.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(profile, { recursive: true, force: true });
  }
});
