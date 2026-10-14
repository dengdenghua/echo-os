import type { APIRequestContext } from "@playwright/test";
import { desktop, dock, expect, test } from "./fixtures";
import { startOfflineModel } from "./offline-model";

/**
 * Desktop system apps a device owner relies on: the intent bar and 任务空间,
 * the 审批收件箱, and 系统设置.
 */

const SETTINGS_SECTIONS = [
  "账户与安全",
  "连接与设备",
  "显示与声音",
  "电池与能耗",
  "壁纸与桌面",
  "通知与锁屏",
  "通用与更新",
  "模型与用量",
  "AI 与 Agent",
  "存储健康",
  "共享与用户",
  "审计与证据",
];

async function removeCustomModels(
  request: APIRequestContext,
  displayName: string,
): Promise<void> {
  const listed = await request.get("/api/config/custom-models");
  if (!listed.ok()) return;
  const { models } = (await listed.json()) as {
    models: Array<{ id: string; display_name?: string | null }>;
  };
  for (const model of models) {
    if (model.display_name === displayName) {
      await request.delete(
        `/api/config/custom-models/${encodeURIComponent(model.id)}`,
      );
    }
  }
}

test.describe("Desktop system apps", () => {
  test("a desktop intent becomes a task the owner can follow in 任务空间", async ({
    desktopPage: page,
  }) => {
    const goal = `检查下载文件夹里的重复文件 ${Date.now()}`;
    const intent = desktop(page).getByRole("textbox", { name: "输入意图" });
    await expect(
      desktop(page).getByRole("button", { name: "提交意图" }),
    ).toBeDisabled();
    await intent.fill(goal);
    await desktop(page).getByRole("button", { name: "提交意图" }).click();
    await expect(intent).toHaveValue("");

    // The intent runs in the background and lands on the desktop as a card.
    // This device has no model, so the run ends as a failure the owner sees.
    const card = desktop(page).getByRole("article", { name: goal });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText("失败", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await dock(page)
      .getByRole("button", { name: "任务空间", exact: true })
      .click();
    const taskSpace = page.getByRole("dialog", { name: "任务空间" });
    await expect(taskSpace).toBeVisible();
    await expect(taskSpace).toHaveAttribute(
      "data-window-id",
      "system:task-space",
    );
    await taskSpace.getByRole("button", { name: "异常", exact: true }).click();
    const task = taskSpace.getByRole("button", { name: `查看任务：${goal}` });
    await expect(task).toBeVisible({ timeout: 15_000 });
    await task.click();

    const details = taskSpace.getByRole("complementary", { name: "任务详情" });
    await expect(details).toBeVisible();
    await expect(details.getByRole("heading", { name: goal })).toBeVisible();
    await expect(details.getByText("任务目标")).toBeVisible();
    // Every Agent task lists its recorded file changes; this one wrote none.
    await expect(
      details.getByRole("region", { name: "文件改动" }),
    ).toContainText("这个任务没有记录到文件改动。", { timeout: 15_000 });

    // The original conversation opens in its own task window.
    await details.getByRole("button", { name: "打开原任务" }).click();
    const taskWindow = page.getByRole("dialog", { name: `任务 · ${goal}` });
    await expect(taskWindow).toBeVisible({ timeout: 30_000 });
    await expect(
      taskWindow.getByRole("heading", { name: goal, level: 1 }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      taskWindow.getByRole("log").getByText(goal, { exact: true }),
    ).toBeVisible();
  });

  test("审批收件箱 is one desktop window with an honest empty state", async ({
    desktopPage: page,
  }) => {
    const tasks = await page.request.get("/api/appliance/tasks?limit=100");
    expect(tasks.ok()).toBeTruthy();
    expect((await tasks.json()).counts.waitingApproval).toBe(0);

    const dockItem = dock(page).getByRole("button", {
      name: "审批收件箱",
      exact: true,
    });
    await dockItem.click();
    const inbox = page.getByRole("dialog", { name: "审批收件箱" });
    await expect(inbox).toBeVisible();
    await expect(inbox).toHaveAttribute(
      "data-window-id",
      "system:decision-inbox",
    );
    await expect(
      inbox.getByRole("heading", { name: "审批收件箱", level: 1 }),
    ).toBeVisible();
    await expect(inbox.getByText("当前没有等待确认的操作")).toBeVisible();
    await inbox.getByRole("button", { name: "刷新审批" }).click();
    await expect(inbox.getByText("当前没有等待确认的操作")).toBeVisible();

    await dockItem.click();
    await expect(inbox).toHaveCount(1);
    await inbox.getByRole("button", { name: "最小化审批收件箱" }).click();
    await expect(inbox).toBeHidden();
    await dockItem.click();
    await expect(inbox).toBeVisible();

    // The Echo menu reaches the same window.
    await inbox.getByRole("button", { name: "关闭审批收件箱" }).click();
    await expect(inbox).toHaveCount(0);
    await page.getByRole("button", { name: "Echo 菜单" }).click();
    await page
      .getByRole("button", { name: "审批收件箱", exact: true })
      .first()
      .click();
    await expect(inbox).toBeVisible();
    await expect(inbox).toHaveCount(1);
  });

  test("系统设置 opens every section and the API model form", async ({
    desktopPage: page,
  }) => {
    await dock(page)
      .getByRole("button", { name: "系统设置", exact: true })
      .click();
    const settings = page.getByRole("dialog", { name: "系统设置" });
    await expect(settings).toBeVisible();
    const sections = settings.getByRole("complementary");
    await expect(sections.getByText("设备管理员")).toBeVisible();

    for (const section of SETTINGS_SECTIONS) {
      await sections
        .getByRole("button", { name: section, exact: true })
        .click();
      await expect(
        settings.getByRole("heading", { name: section, level: 1 }),
      ).toBeVisible();
    }

    await sections
      .getByRole("button", { name: "模型与用量", exact: true })
      .click();
    await expect(settings.getByText("还没有配置自定义模型。")).toBeVisible();
    await settings.getByRole("button", { name: "接入 API 模型" }).click();
    await expect(
      settings.getByRole("combobox", { name: "* 提供方" }),
    ).toBeVisible();
    await expect(
      settings.getByRole("textbox", { name: "* 基础 URL" }),
    ).toBeVisible();
    await expect(
      settings.getByRole("button", { name: "测试连接" }),
    ).toBeVisible();
    await settings.getByRole("button", { name: "取消" }).click();
    await expect(
      settings.getByRole("button", { name: "测试连接" }),
    ).toHaveCount(0);
  });

  test("the owner connects an OpenAI-compatible model and removes it again", async ({
    desktopPage: page,
  }) => {
    const modelId = "echo-offline-e2e";
    const displayName = `离线测试模型 ${Date.now()}`;
    const testKey = "sk-e2e-offline-test-key";
    const offline = await startOfflineModel(modelId);
    try {
      await dock(page)
        .getByRole("button", { name: "系统设置", exact: true })
        .click();
      const settings = page.getByRole("dialog", { name: "系统设置" });
      await settings
        .getByRole("complementary")
        .getByRole("button", { name: "模型与用量", exact: true })
        .click();
      await expect(settings.getByText("还没有配置自定义模型。")).toBeVisible();
      // No Codex runtime on this device: the panel says so instead of
      // failing to read an account it cannot have.
      await expect(
        settings.getByText("未找到可用的 Codex App Server"),
      ).toBeVisible();
      await expect(
        settings.getByRole("button", { name: "登录 ChatGPT" }),
      ).toBeDisabled();

      await settings.getByRole("button", { name: "接入 API 模型" }).click();
      await settings
        .getByRole("combobox", { name: "* 提供方" })
        .selectOption({ label: "Custom" });
      await settings.getByRole("textbox", { name: "模型列表 1" }).fill(modelId);
      await settings
        .getByRole("textbox", { name: "显示名称" })
        .fill(displayName);
      await settings
        .getByRole("textbox", { name: "* Custom API 密钥" })
        .fill(testKey);
      await settings
        .getByRole("textbox", { name: "* 基础 URL" })
        .fill(offline.baseUrl);

      await settings.getByRole("button", { name: "测试连接" }).click();
      await expect(
        settings.getByRole("status").filter({ hasText: /^ok/ }),
      ).toBeVisible({ timeout: 30_000 });
      // The test request went to the configured endpoint with the key.
      expect(offline.requests).toContainEqual({
        method: "POST",
        path: "/v1/chat/completions",
        authorization: `Bearer ${testKey}`,
        model: modelId,
      });

      await settings.getByRole("button", { name: "保存", exact: true }).click();
      const connection = settings
        .getByRole("listitem")
        .filter({ hasText: displayName });
      await expect(connection).toBeVisible({ timeout: 15_000 });
      await expect(connection).toContainText(modelId);
      await expect(
        settings.getByRole("button", { name: `设为默认: ${displayName}` }),
      ).toBeVisible();
      const listed = await page.request.get("/api/config/custom-models");
      expect(listed.ok()).toBeTruthy();
      const saved = (
        (await listed.json()) as {
          models: Array<{
            display_name?: string;
            base_url?: string;
            has_api_key?: boolean;
            api_key?: string;
          }>;
        }
      ).models.find((model) => model.display_name === displayName);
      expect(saved).toMatchObject({
        base_url: offline.baseUrl,
        has_api_key: true,
      });
      expect(saved?.api_key).toBeUndefined();

      await settings
        .getByRole("button", { name: `删除: ${displayName}` })
        .click();
      const confirm = page.getByRole("dialog", { name: "删除模型" });
      await expect(confirm).toContainText(displayName);
      await confirm.getByRole("button", { name: "删除", exact: true }).click();
      await expect(confirm).toHaveCount(0);
      await expect(settings.getByText("还没有配置自定义模型。")).toBeVisible();
    } finally {
      await removeCustomModels(page.request, displayName);
      await offline.close();
    }
  });
});
