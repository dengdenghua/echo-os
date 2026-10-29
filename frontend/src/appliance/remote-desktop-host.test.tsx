import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RemoteDesktopHost } from "./remote-desktop-host";

vi.mock("./auth", () => ({
  authHeader: () => ({ Authorization: "Bearer operator" }),
}));
afterEach(() => vi.unstubAllGlobals());

it("distinguishes configured video relay from a verified external gateway", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        state: "ready",
        permissions: {},
        active: [],
        relayConfigured: true,
        inputFocusHints: true,
      }),
    }),
  );
  render(<RemoteDesktopHost deviceId="phone" online />);
  const note = await screen.findByText(
    /异地使用前，请先配置安全连接入口并完成外网测试/,
  );
  expect(note).toHaveTextContent("画面中继已配置");
  expect(note).toHaveTextContent("自动打开手机输入栏");
});

it("uses the native host service when the appliance route is absent", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 404 })
    .mockResolvedValue({
      ok: true,
      json: async () => ({ state: "ready", permissions: {}, active: [] }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(<RemoteDesktopHost deviceId="phone" online />);
  await waitFor(() =>
    expect(screen.getByLabelText("此手机的电脑远控权限")).toBeEnabled(),
  );
  expect(fetcher.mock.calls[1][0]).toBe("/api/tentacle/remote-desktop/status");
});

it("does not fall back after an appliance permission refusal", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 403 });
  vi.stubGlobal("fetch", fetcher);
  render(<RemoteDesktopHost deviceId="phone" online />);
  await screen.findByRole("alert");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("starts denied and explicitly grants the selected phone; revoke stays available offline", async () => {
  const status = {
    state: "ready",
    permissions: {},
    active: [],
    relayConfigured: false,
  };
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => status });
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(<RemoteDesktopHost deviceId="phone/a" online />);
  const select = await screen.findByLabelText("此手机的电脑远控权限");
  await waitFor(() => expect(select).toBeEnabled());
  expect(select).toHaveValue("denied");
  fireEvent.change(select, { target: { value: "control" } });
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("permissions/phone%2Fa"),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ mode: "control" }),
        credentials: "include",
      }),
    ),
  );
  rerender(<RemoteDesktopHost deviceId="phone/a" online={false} />);
  await waitFor(() => expect(select).toBeEnabled());
  expect(screen.getByRole("option", { name: "不允许" })).toBeEnabled();
  expect(screen.getByRole("option", { name: "允许观看与操作" })).toBeDisabled();
});

it("reports component failure and blocks granting new control", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        state: "component_missing",
        permissions: {},
        active: [],
      }),
    }),
  );
  render(<RemoteDesktopHost deviceId="phone" online />);
  expect(
    await screen.findByText("远控组件尚未就绪，请更新 Echo 桌面端。"),
  ).toBeVisible();
  expect(screen.getByRole("option", { name: "允许观看与操作" })).toBeDisabled();
});
