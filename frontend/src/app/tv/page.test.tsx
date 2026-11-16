import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/harness";
import TVPage from "./page";

const list = vi.hoisted(() => vi.fn());
vi.mock("@/core/storage/api", () => ({
  listNASFiles: list,
  listNASSources: async () => [],
  listNASDirectory: async () => [],
  nasResourceId: () => undefined,
  getNASFileContentURL: (id: string) => `/api/storage/v1/files/${id}/content`,
}));
vi.mock("@/appliance/agent-health", () => ({
  useAgentDesktopHealth: () => ({ state: "unavailable" }),
}));
vi.mock("@/appliance/task-space", () => ({
  useEchoTaskProjection: () => ({}),
  startEchoTask: vi.fn(),
}));
vi.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({ user: { actor_id: "tv-test" } }),
}));
vi.mock("@/core/coder/api", () => ({
  getCoderModelProfile: async () => ({ execution_available: true }),
}));
beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn();
  list.mockReset();
  list.mockResolvedValue([]);
});

it("opens the television conversation from the desktop companion", () => {
  renderWithProviders(<TVPage />);
  fireEvent(window, new CustomEvent("echo:companion-chat", {
    detail: { threadId: "" },
  }));
  expect(screen.getByRole("dialog", { name: "Echo 对话" })).toBeInTheDocument();
  expect(screen.getByTestId("tv-shell")).toBeInTheDocument();
});

it("shows real unavailable media state and a recovery route instead of fictional content", async () => {
  list.mockRejectedValue(new Error("service unavailable"));
  renderWithProviders(<TVPage />);
  fireEvent.click(screen.getByRole("button", { name: "影视库", exact: true }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "媒体库暂时不可用",
  );
  expect(
    screen.getByRole("button", { name: "管理媒体来源" }),
  ).toBeInTheDocument();
});

it("filters actual library entries by Chinese title and can clear an empty search", async () => {
  list.mockResolvedValue([
    { asset_id: "one", name: "旅行记录.mp4", extension: ".mp4" },
    { asset_id: "two", name: "家庭录像.webm", extension: ".webm" },
  ]);
  renderWithProviders(<TVPage />);
  fireEvent.click(screen.getByRole("button", { name: "影视库", exact: true }));
  expect(await screen.findByText("旅行记录.mp4")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "搜索影视库" }), {
    target: { value: "旅行" },
  });
  expect(screen.queryByText("家庭录像.webm")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "搜索影视库" }), {
    target: { value: "不存在" },
  });
  fireEvent.click(screen.getByRole("button", { name: "清除搜索" }));
  expect(screen.getByText("家庭录像.webm")).toBeInTheDocument();
});

it("closes the Agent on Back without leaving TV mode", async () => {
  renderWithProviders(<TVPage />);
  fireEvent.click(screen.getByRole("button", { name: "呼出 Echo" }));
  const dialog = screen.getByRole("dialog", { name: "Echo 对话" });
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByTestId("tv-shell")).toBeInTheDocument();
});

it("keeps settings entirely inside TV and restores the home on Back", () => {
  renderWithProviders(<TVPage />);
  expect(
    screen.queryByRole("button", { name: "桌面模式" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "设置", exact: true }));
  const dialog = screen.getByRole("dialog", { name: "大屏设置" });
  expect(
    screen.queryByRole("button", { name: /桌面模式/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "模型与账号" })).toBeVisible();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "大屏首页" })).toBeVisible();
});

it("previews the focused app and opens knowledge queries within the TV Agent", async () => {
  renderWithProviders(<TVPage />);
  const knowledge = screen.getByRole("button", { name: "知识库", exact: true });
  fireEvent.focus(knowledge);
  expect(
    screen.getByRole("heading", { name: "知识库", exact: true }),
  ).toBeVisible();
  fireEvent.click(knowledge);
  expect(screen.getByRole("textbox", { name: "给 Agent 的任务" })).toHaveValue(
    "请在我的知识库中查找：",
  );
  expect(await screen.findByRole("button", { name: "发送任务" })).toBeVisible();
  expect(screen.getByTestId("tv-shell")).toBeVisible();
});

it("returns from a settings detail to categories before leaving TV settings", () => {
  renderWithProviders(<TVPage />);
  fireEvent.click(screen.getByRole("button", { name: "设置", exact: true }));
  fireEvent.click(
    screen.getByRole("button", { name: "画面与操作", exact: true }),
  );
  expect(screen.getByRole("button", { name: "海岸日落" })).toBeVisible();
  // JSDOM has no geometric visibility; real remote Back is covered in browser tests.
  fireEvent.click(
    screen.getByRole("button", { name: "返回设置", exact: true }),
  );
  expect(screen.getByRole("navigation", { name: "设置分类" })).toBeVisible();
  expect(screen.getByRole("dialog", { name: "大屏设置" })).toBeVisible();
  fireEvent.keyDown(screen.getByRole("dialog", { name: "大屏设置" }), {
    key: "Escape",
  });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("keeps the chosen wallpaper after remounting the actual TV shell", async () => {
  const view = renderWithProviders(<TVPage />);
  fireEvent.click(screen.getByRole("button", { name: "设置", exact: true }));
  fireEvent.click(
    screen.getByRole("button", { name: "画面与操作", exact: true }),
  );
  fireEvent.click(screen.getByRole("button", { name: "地球夜弧" }));
  await vi.waitFor(() =>
    expect(screen.getByTestId("tv-shell")).toHaveAttribute(
      "data-wallpaper",
      "orbit",
    ),
  );
  view.unmount();
  renderWithProviders(<TVPage />);
  expect(screen.getByTestId("tv-shell")).toHaveAttribute(
    "data-wallpaper",
    "orbit",
  );
});
