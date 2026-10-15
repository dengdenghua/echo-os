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

async function expectNoHorizontalOverflow(
  page: Page,
  locator: Locator,
  label: string,
) {
  const overflow = await locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      viewportWidth: window.innerWidth,
      bodyScrollWidth: document.documentElement.scrollWidth,
    };
  });

  expect(
    overflow.left,
    `${label} should not overflow left`,
  ).toBeGreaterThanOrEqual(-1);
  expect(
    overflow.right,
    `${label} should not overflow right`,
  ).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(
    overflow.scrollWidth,
    `${label} should not scroll sideways inside`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
  expect(
    overflow.bodyScrollWidth,
    `${label} should not create page-level horizontal scroll`,
  ).toBeLessThanOrEqual(overflow.viewportWidth + 1);
}

test.describe("Mobile desktop smoke", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the lock screen and desktop fit a phone", async ({ page }) => {
    await page.goto("/");
    await expect(lockScreenPassword(page)).toBeVisible({ timeout: 60_000 });
    await expectNoHorizontalOverflow(
      page,
      lockScreenPassword(page),
      "lock screen password",
    );
    await expectNoHorizontalOverflow(
      page,
      page.getByRole("button", { name: "进入桌面" }),
      "sign-in button",
    );

    await signIn(page);
    await expect(page.getByRole("button", { name: "ECHO 菜单" })).toBeVisible();
    await expectNoHorizontalOverflow(
      page,
      desktop(page).getByRole("textbox", { name: "输入意图" }),
      "intent bar",
    );
    // The first Dock items stay reachable at phone width.
    for (const app of ["文件", "应用库", "任务空间", "审批收件箱"]) {
      const item = dock(page).getByRole("button", { name: app, exact: true });
      await expect(item).toBeInViewport({ ratio: 1 });
    }
  });

  test("工作台 window and its composer fit a phone", async ({
    desktopPage: page,
  }) => {
    const workbench = await openWorkbench(page);
    await expectNoHorizontalOverflow(page, workbench, "工作台 window");
    const composer = workbench.getByTestId("chat-composer");
    await expect(composer).toBeVisible();
    await expectNoHorizontalOverflow(page, composer, "composer");
    await workbench.getByTestId("chat-composer-input").fill("看看今天的任务");
    await expect(workbench.getByTestId("chat-send-button")).toBeEnabled();
    await expect(workbench.getByTestId("chat-send-button")).toBeInViewport({
      ratio: 1,
    });
  });

  test("系统设置 switches every section from its phone picker", async ({
    desktopPage: page,
  }) => {
    await page.getByRole("button", { name: "ECHO 菜单" }).click();
    await page.getByRole("button", { name: "系统设置…" }).click();
    const settings = page.getByRole("dialog", { name: "系统设置" });
    await expect(settings).toBeVisible();
    await expectNoHorizontalOverflow(page, settings, "settings window");

    const picker = settings.getByRole("combobox", { name: "设置分类" });
    await expect(picker).toBeVisible();
    const sections = await picker.locator("option").allTextContents();
    expect(sections.length).toBeGreaterThanOrEqual(10);
    for (const section of sections) {
      await picker.selectOption({ label: section });
      await expect(
        settings.getByRole("heading", { name: section, level: 1 }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(
        page,
        settings,
        `settings section ${section}`,
      );
    }
  });

  test("任务空间 and 审批收件箱 open as phone-width windows", async ({
    desktopPage: page,
  }) => {
    for (const app of ["任务空间", "审批收件箱"]) {
      await dock(page).getByRole("button", { name: app, exact: true }).click();
      const appWindow = page.getByRole("dialog", { name: app });
      await expect(appWindow).toBeVisible();
      await expectNoHorizontalOverflow(page, appWindow, `${app} window`);
      await expect(
        appWindow.getByRole("button", { name: `关闭${app}` }),
      ).toBeInViewport({ ratio: 1 });
      await appWindow.getByRole("button", { name: `关闭${app}` }).click();
      await expect(appWindow).toHaveCount(0);
    }
  });
});
