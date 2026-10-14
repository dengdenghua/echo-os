import type { APIRequestContext, Page, Response } from "@playwright/test";
import {
  desktop,
  dock,
  expect,
  lockScreenPassword,
  openWorkbench,
  ownerPassword,
  signIn,
  test,
} from "./fixtures";

/**
 * E2E regression lockdown. Every test here pins a bug that was found in a
 * manual browser pass and fixed. If one goes red, a past bug came back.
 *
 *   #1 · Intelligence subscriptions use the real router and clean up test data
 *   #5 · /about rendered an "async Client Component" warning
 *   #6 · the team join page leaked hard-coded Chinese in the en-US locale
 *   0bfc745c · the lock screen made requests that answered 401
 *   766d47ce, 132a0ecf, fcc26656 · opening the 工作台 fired 404/403 bursts
 */

async function signInApi(request: APIRequestContext): Promise<void> {
  const login = await request.post("/api/auth/local/login", {
    data: { username: "admin", password: ownerPassword() },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
}

async function deleteSubscriptionsByTopic(
  request: APIRequestContext,
  topic: string,
): Promise<void> {
  const listed = await request.get("/api/intelligence/subscriptions");
  if (!listed.ok()) return;
  const body = await listed.json();
  const subscriptions = body.subscriptions ?? [];
  await Promise.all(
    subscriptions
      .filter((item: { topic?: string }) => item.topic === topic)
      .map((item: { id: string }) =>
        request.delete(
          `/api/intelligence/subscriptions/${encodeURIComponent(item.id)}`,
        ),
      ),
  );
}

/** Record every API response that is not a success while `run` executes. */
async function collectFailedApiResponses(
  page: Page,
  run: () => Promise<void>,
): Promise<string[]> {
  const failures: string[] = [];
  const onResponse = (response: Response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/") && response.status() >= 400) {
      failures.push(
        `${response.request().method()} ${url.pathname}${url.search} ${response.status()}`,
      );
    }
  };
  page.on("response", onResponse);
  try {
    await run();
  } finally {
    page.off("response", onResponse);
  }
  return failures;
}

test.describe("Bug#1 regression · Intelligence subscriptions", () => {
  test("POST creates a real subscription and deletes the E2E record", async ({
    request,
  }) => {
    await signInApi(request);
    const topic = `e2e-api-${Date.now()}`;
    try {
      const resp = await request.post("/api/intelligence/subscriptions", {
        data: {
          topic,
          display_name: topic,
          keywords: ["e2e", "cleanup"],
          cadence: "daily",
          sources: ["web", "news"],
        },
      });
      expect(resp.ok(), await resp.text()).toBeTruthy();
      const body = await resp.json();
      expect(body._stub).not.toBe(true);
      expect(body.topic).toBe(topic);
      expect(body.id).toMatch(/^sub_/);

      const listed = await request.get("/api/intelligence/subscriptions");
      expect(listed.ok()).toBeTruthy();
      const listedBody = await listed.json();
      expect(
        (listedBody.subscriptions ?? []).some(
          (item: { topic?: string }) => item.topic === topic,
        ),
      ).toBe(true);
    } finally {
      await deleteSubscriptionsByTopic(request, topic);
    }
    const after = await request.get("/api/intelligence/subscriptions");
    expect(
      ((await after.json()).subscriptions ?? []).some(
        (item: { topic?: string }) => item.topic === topic,
      ),
    ).toBe(false);
  });
});

test.describe("Bug#6 regression · Team join page i18n", () => {
  test("en-US invite error state does not leak hard-coded Chinese", async ({
    page,
  }) => {
    await page.context().addCookies([
      {
        name: "locale",
        value: "en-US",
        domain: "localhost",
        path: "/",
      },
    ]);

    await signIn(page, "/#/workspace/team/join");
    const workbench = page.getByRole("dialog", { name: "工作台" });
    const heading = workbench.getByRole("heading", {
      name: "Join collaborative task",
    });
    await expect(heading).toBeVisible({ timeout: 30_000 });
    const error = workbench
      .getByRole("alert")
      .filter({ hasText: "The invite link is missing a token." });
    await expect(error).toBeVisible();

    const visibleText = await heading
      .locator("xpath=ancestor::div[contains(@class, 'max-w-md')][1]")
      .innerText();
    expect(visibleText).toContain("The invite link is missing a token.");
    expect(visibleText).not.toMatch(/[一-鿿]/);
  });
});

test.describe("Bug#5 regression · /about free of async-RSC warnings", () => {
  test("console has no 'async Client Component' warning", async ({ page }) => {
    const warnings: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning" || msg.type() === "error") {
        warnings.push(msg.text());
      }
    });
    page.on("pageerror", (err) => warnings.push(err.message));

    await page.goto("/#/about");
    await expect(page.getByRole("banner")).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    // Give React warnings a beat to surface during hydration
    await page.waitForTimeout(1500);

    const asyncWarnings = warnings.filter((w) =>
      /async Client Component|is an async Client/.test(w),
    );
    expect(asyncWarnings, asyncWarnings.join("\n\n")).toEqual([]);
  });
});

test.describe("Golden-path regression · no failing requests on first use", () => {
  test("the lock screen and a fresh 工作台 make no failing API requests", async ({
    page,
  }) => {
    const onLockScreen = await collectFailedApiResponses(page, async () => {
      await page.goto("/");
      await expect(lockScreenPassword(page)).toBeVisible({ timeout: 60_000 });
      await page.waitForLoadState("networkidle");
    });
    expect(onLockScreen, onLockScreen.join("\n")).toEqual([]);

    await lockScreenPassword(page).fill(ownerPassword());
    const onDesktop = await collectFailedApiResponses(page, async () => {
      await page.getByRole("button", { name: "进入桌面" }).click();
      await expect(dock(page)).toBeVisible({ timeout: 30_000 });
      await expect(
        desktop(page).getByRole("textbox", { name: "输入意图" }),
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2_000);
    });
    expect(onDesktop, onDesktop.join("\n")).toEqual([]);

    const onWorkbench = await collectFailedApiResponses(page, async () => {
      await openWorkbench(page);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2_000);
    });
    expect(onWorkbench, onWorkbench.join("\n")).toEqual([]);
  });
});
