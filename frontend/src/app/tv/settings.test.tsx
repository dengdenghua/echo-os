import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/harness";
import { TVModelSettings } from "./model-settings";
import { parseTVPluginConfig } from "./plugin-settings";
import { TVConfirm } from "./settings-shared";
const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/core/tv/api", () => ({ tvRequest: api.request }));
vi.mock("@/core/coder/api", () => ({
  getCoderModelProfile: async () => ({
    execution_available: true,
    effective_model: "fixture",
  }),
}));
vi.mock("@/core/models/api", () => ({ loadModels: async () => [] }));
beforeEach(() => {
  api.request.mockReset();
  api.request.mockImplementation(async (url: string) =>
    url === "/api/engines"
      ? { engines: [] }
      : url === "/api/config/custom-models"
        ? {
            models: [
              {
                id: "saved",
                display_name: "已存连接",
                name: "saved",
                base_url: "https://example.test/v1",
                models: ["fixture"],
                provider: "openai",
                has_api_key: true,
              },
            ],
          }
        : { ok: true },
  );
});
it("tests a saved connection without replacing its stored secret with blank", async () => {
  renderWithProviders(<TVModelSettings />);
  fireEvent.click(await screen.findByRole("button", { name: "编辑 已存连接" }));
  expect(screen.getByLabelText("API 密钥")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "测试连接并保存" }));
  await vi.waitFor(() =>
    expect(api.request).toHaveBeenCalledWith(
      "/api/config/custom-models/saved",
      "PUT",
      expect.objectContaining({ models: ["fixture"] }),
    ),
  );
  const mutation = api.request.mock.calls.find((c) => c[1] === "PUT")!;
  expect(mutation[2]).not.toHaveProperty("api_key");
  expect(
    api.request.mock.calls.findIndex((c) => c[0].endsWith("/test")),
  ).toBeLessThan(api.request.mock.calls.indexOf(mutation));
});
it("never saves a connection after its real connection test fails", async () => {
  const original = api.request.getMockImplementation()!;
  api.request.mockImplementation(async (...args: unknown[]) =>
    args[0] === "/api/config/custom-models/test"
      ? { ok: false, error: "连接失败" }
      : original(...args),
  );
  renderWithProviders(<TVModelSettings />);
  fireEvent.click(await screen.findByRole("button", { name: "编辑 已存连接" }));
  fireEvent.click(screen.getByRole("button", { name: "测试连接并保存" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("连接失败");
  expect(api.request.mock.calls.some((c) => c[1] === "PUT")).toBe(false);
});
it("preserves plugin scalar types and supports structured settings with validation", () => {
  expect(
    parseTVPluginConfig(
      { retry: 3, list: [], enabled: true, text: "x" },
      { retry: "4", list: '["a"]', enabled: false, text: "你好" },
    ),
  ).toEqual({ retry: 4, list: ["a"], enabled: false, text: "你好" });
  expect(() => parseTVPluginConfig({ retry: 3 }, { retry: "" })).toThrow(
    "有效数字",
  );
  expect(() =>
    parseTVPluginConfig({ retry: 3 }, { retry: "Infinity" }),
  ).toThrow("有效数字");
  expect(() => parseTVPluginConfig({ list: [] }, { list: "[" })).toThrow(
    "JSON",
  );
});
it("requires explicit confirmation for data-affecting actions and disables both choices while saving", () => {
  const cancel = vi.fn(),
    confirm = vi.fn();
  const view = renderWithProviders(
    <TVConfirm title="卸载" busy={false} onCancel={cancel} onConfirm={confirm}>
      保留数据
    </TVConfirm>,
  );
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(cancel).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
  view.rerender(
    <TVConfirm title="卸载" busy onCancel={cancel} onConfirm={confirm}>
      保留数据
    </TVConfirm>,
  );
  expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
});
