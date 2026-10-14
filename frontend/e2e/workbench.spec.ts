import {
  dock,
  expect,
  openFromLaunchpad,
  openWorkbench,
  signIn,
  test,
} from "./fixtures";

/**
 * 工作台: the Agent workbench as a desktop window, its composer, and the
 * state a fresh device is in before any model is connected.
 */

test.describe("工作台 window", () => {
  test("opens from the Launchpad as one desktop window that minimizes to the Dock", async ({
    desktopPage: page,
  }) => {
    const workbench = await openWorkbench(page);
    const agentWindows = page.locator('[data-window-id^="agent-window:"]');
    await expect(agentWindows).toHaveCount(1);
    await expect(
      workbench.getByRole("heading", { name: /^你好，我是/ }),
    ).toBeVisible();
    await expect(workbench.getByTestId("chat-composer-input")).toHaveValue("");
    await expect(workbench.getByTestId("chat-send-button")).toBeDisabled();
    // Tool calls ask for approval unless the owner changes it.
    await expect(workbench.getByTestId("permission-mode-trigger")).toHaveText(
      /询问审批/,
    );
    await expect(
      workbench.getByRole("combobox", { name: "模型作用范围" }),
    ).toBeVisible();

    // Opening it again focuses the same window instead of stacking copies.
    await openFromLaunchpad(page, "工作台");
    await expect(agentWindows).toHaveCount(1);

    await workbench.getByRole("button", { name: "最小化工作台" }).click();
    await expect(workbench).toBeHidden();
    const restore = dock(page).getByRole("button", {
      name: "工作台 · 点击恢复窗口",
    });
    await expect(restore).toBeVisible();
    await restore.click();
    await expect(workbench).toBeVisible();
    await expect(workbench.getByTestId("chat-composer-input")).toBeVisible();

    await workbench.getByRole("button", { name: "关闭工作台" }).click();
    await expect(agentWindows).toHaveCount(0);
  });

  test("a first task on a fresh device hands off to model setup", async ({
    desktopPage: page,
  }) => {
    const workbench = await openWorkbench(page);
    const prompt = `整理个人空间里的文件 ${Date.now()}`;
    const input = workbench.getByTestId("chat-composer-input");
    await input.fill(prompt);
    await expect(workbench.getByTestId("chat-send-button")).toBeEnabled();
    await workbench.getByTestId("chat-send-button").click();

    const conversation = workbench.getByRole("log");
    await expect(conversation.getByText(prompt, { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    // No model is connected: the turn stops with a hand-off, not a raw error.
    await expect(
      conversation.getByText(
        /^还没有可用的模型。请在「系统设置 › 模型与用量」/,
      ),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      conversation.getByRole("button", { name: "重试" }),
    ).toBeVisible();
    await expect(
      workbench.getByRole("heading", { name: prompt, level: 1 }),
    ).toBeVisible();
    // The task keeps its goal as its title in the conversation list.
    await expect(
      workbench.getByRole("link", { name: new RegExp(prompt) }),
    ).toBeVisible();

    await conversation.getByRole("button", { name: "接入模型" }).click();
    const settings = page.getByRole("dialog", { name: "系统设置" });
    await expect(settings).toBeVisible();
    await expect(
      settings.getByRole("heading", { name: "模型与用量", level: 1 }),
    ).toBeVisible();
    await expect(
      settings.getByRole("button", { name: "接入 API 模型" }),
    ).toBeVisible();
    await expect(settings.getByText("还没有配置自定义模型。")).toBeVisible();
  });

  test("the composer inserts the Plan command as a prefix", async ({
    desktopPage: page,
  }) => {
    const workbench = await openWorkbench(page);
    await workbench.getByTestId("chat-tools-trigger").click();
    await page.getByTestId("chat-commands-submenu").hover();
    await expect(page.getByTestId("chat-insert-codex-plan")).toBeVisible();
    await page.getByTestId("chat-insert-codex-plan").click();
    await expect(workbench.getByTestId("composer-command-prefix")).toHaveText(
      "Plan",
    );
    await expect(workbench.getByTestId("chat-composer-input")).toHaveValue("");
    await expect(workbench.getByTestId("chat-send-button")).toBeDisabled();
  });

  test("a deep link to a missing conversation settles into an empty, usable workbench", async ({
    page,
  }) => {
    await signIn(page, "/#/workspace/realtime/does-not-exist-thread");
    const workbench = page.getByRole("dialog", { name: "工作台" });
    await expect(workbench).toBeVisible({ timeout: 30_000 });
    await expect(
      workbench.getByRole("status").filter({ hasText: "还没有消息" }),
    ).toBeVisible({ timeout: 30_000 });
    const input = workbench.getByTestId("chat-composer-input");
    await expect(input).toBeVisible();
    await input.fill("继续");
    await expect(workbench.getByTestId("chat-send-button")).toBeEnabled();
  });
});
