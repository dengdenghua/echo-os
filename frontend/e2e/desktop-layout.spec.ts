import type { Locator, Page } from "@playwright/test";
import {
  desktop,
  dock,
  expect,
  lockScreenPassword,
  openWorkbench,
  signIn,
  test,
} from "./fixtures";

/**
 * Desktop layout at the sizes the golden path covers (1024, 1280×720,
 * 1440×900). These are geometric assertions rather than pixel baselines: most
 * of the UI is Chinese, and CJK glyphs come from whatever system fonts the
 * host has (the CI runner image and a developer machine differ), while the
 * menu-bar clock and relative task times change on every run. A screenshot
 * baseline would either fail on font fallback or need a threshold loose
 * enough to miss real layout regressions; boxes and overlaps do not.
 */

type Box = { left: number; top: number; right: number; bottom: number };

async function box(locator: Locator): Promise<Box> {
  return locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    };
  });
}

function expectInside(inner: Box, outer: Box, label: string) {
  expect(inner.left, `${label}: left edge`).toBeGreaterThanOrEqual(
    outer.left - 1,
  );
  expect(inner.top, `${label}: top edge`).toBeGreaterThanOrEqual(outer.top - 1);
  expect(inner.right, `${label}: right edge`).toBeLessThanOrEqual(
    outer.right + 1,
  );
  expect(inner.bottom, `${label}: bottom edge`).toBeLessThanOrEqual(
    outer.bottom + 1,
  );
}

async function viewportBox(page: Page): Promise<Box> {
  const size = page.viewportSize();
  if (!size) throw new Error("viewport size is not fixed");
  return { left: 0, top: 0, right: size.width, bottom: size.height };
}

async function expectNoPageScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  expect(
    overflow.scrollWidth,
    `${label}: horizontal page scroll`,
  ).toBeLessThanOrEqual(overflow.width);
  expect(
    overflow.scrollHeight,
    `${label}: vertical page scroll`,
  ).toBeLessThanOrEqual(overflow.height);
}

for (const size of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
]) {
  test.describe(`Desktop layout at ${size.width}×${size.height}`, () => {
    test.use({ viewport: size });

    test("lock screen, desktop and 工作台 fit without clipping", async ({
      page,
    }) => {
      const viewport = await viewportBox(page);
      await page.goto("/");
      await expect(lockScreenPassword(page)).toBeVisible({ timeout: 60_000 });
      await expect(
        page.locator('main[data-echo-theme="graphite"]'),
      ).toBeVisible();
      expectInside(await box(lockScreenPassword(page)), viewport, "password");
      expectInside(
        await box(page.getByRole("button", { name: "进入桌面" })),
        viewport,
        "sign-in button",
      );
      await expectNoPageScroll(page, "lock screen");

      await signIn(page);
      const menu = await box(page.getByRole("button", { name: "ECHO 菜单" }));
      expect(menu.top).toBeGreaterThanOrEqual(0);
      expect(menu.bottom).toBeLessThanOrEqual(32);
      const dockBox = await box(dock(page));
      expectInside(dockBox, viewport, "Dock");
      // The Dock is centred along the bottom edge.
      expect(
        Math.abs((dockBox.left + dockBox.right) / 2 - size.width / 2),
      ).toBeLessThanOrEqual(8);
      expect(size.height - dockBox.bottom).toBeLessThanOrEqual(16);
      const intent = await box(
        desktop(page).getByRole("textbox", { name: "输入意图" }),
      );
      expectInside(intent, viewport, "intent bar");
      expect(intent.top).toBeGreaterThan(menu.bottom);
      expect(intent.bottom).toBeLessThan(dockBox.top);
      await expectNoPageScroll(page, "desktop");

      const workbench = await openWorkbench(page);
      const windowBox = await box(workbench);
      expectInside(windowBox, viewport, "工作台 window");
      expect(windowBox.top).toBeGreaterThan(menu.bottom);
      expectInside(
        await box(workbench.getByTestId("chat-composer")),
        windowBox,
        "composer",
      );
      expectInside(
        await box(
          workbench.getByRole("button", { name: "新建任务", exact: true }),
        ),
        windowBox,
        "sidebar",
      );
      await expectNoPageScroll(page, "desktop with 工作台");
    });

    test("任务空间, 审批收件箱 and 系统设置 windows stay on screen", async ({
      desktopPage: page,
    }) => {
      const viewport = await viewportBox(page);
      for (const app of ["任务空间", "审批收件箱", "系统设置"]) {
        await dock(page)
          .getByRole("button", { name: app, exact: true })
          .click();
        const appWindow = page.getByRole("dialog", { name: app });
        await expect(appWindow).toBeVisible();
        expectInside(await box(appWindow), viewport, `${app} window`);
        const close = appWindow.getByRole("button", { name: `关闭${app}` });
        expectInside(await box(close), viewport, `${app} close button`);
      }
      await expectNoPageScroll(page, "three system windows");
    });
  });
}

test.describe("Desktop layout at 1024×720", () => {
  test.use({ viewport: { width: 1024, height: 720 } });

  test("the 工作台 right panel opens as a drawer inside the window", async ({
    desktopPage: page,
  }) => {
    const workbench = await openWorkbench(page);
    await workbench.getByRole("button", { name: "打开右侧窗口" }).click();
    const drawer = page.getByRole("dialog", { name: "Agent 工作台" });
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute(
      "data-secondary-panel-presentation",
      "desktop-drawer",
    );
    const windowBox = await box(workbench);
    const drawerBox = await box(drawer);
    expectInside(drawerBox, windowBox, "right drawer");
    // A drawer, not a second full-width surface.
    expect(drawerBox.right - drawerBox.left).toBeLessThan(
      (windowBox.right - windowBox.left) / 2,
    );
    expectInside(windowBox, await viewportBox(page), "工作台 window");
  });
});
