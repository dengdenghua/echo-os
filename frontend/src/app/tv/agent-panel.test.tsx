import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/harness";
import { TVAgentPanel } from "./agent-panel";

const api = vi.hoisted(() => ({
  profile: vi.fn(),
  start: vi.fn(),
  tv: vi.fn(),
}));
vi.mock("@/core/tv/api", () => ({ tvRequest: api.tv }));
vi.mock("@/core/coder/api", () => ({ getCoderModelProfile: api.profile }));
vi.mock("@/appliance/task-space", () => ({
  startEchoTask: api.start,
  useEchoTaskProjection: () => ({ refresh: vi.fn() }),
}));
vi.mock("./thread", () => ({
  TVThread: ({ threadId }: { threadId: string }) => (
    <output>电视对话 {threadId}</output>
  ),
  tvStatus: (value: string) => value,
}));

vi.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({ user: { actor_id: "tv-test" } }),
}));
beforeEach(() => {
  api.profile.mockReset();
  api.start.mockReset();
  api.tv.mockReset();
  api.tv.mockImplementation(async (url: string) =>
    url.endsWith("/models")
      ? { models: ["hy4std", "hy4free"] }
      : { available: true },
  );
});

it("blocks an unconfigured model, then admits a task after readiness recovers", async () => {
  api.profile
    .mockResolvedValueOnce({
      execution_available: false,
      execution_unavailable_reason: "model_incompatible",
    })
    .mockResolvedValue({ execution_available: true });
  api.start.mockResolvedValue({ thread_id: "tv-task" });
  renderWithProviders(<TVAgentPanel onClose={() => {}} />);
  expect(
    await screen.findByText(/请先在娱乐模式的模型设置中接入可用模型/),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "检索中文资料" },
  });
  expect(screen.getByRole("button", { name: "发送任务" })).toBeDisabled();
  expect(api.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "重新检查" }));
  await vi.waitFor(() =>
    expect(screen.getByRole("button", { name: "发送任务" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "发送任务" }));
  expect(await screen.findByText("电视对话 tv-task")).toBeInTheDocument();
  expect(api.start).toHaveBeenCalledExactlyOnceWith(
    "检索中文资料",
    undefined,
    false,
    "codex",
    undefined,
  );
});

it("reports service failure without accepting a task", async () => {
  api.profile.mockRejectedValue(new Error("offline"));
  renderWithProviders(<TVAgentPanel onClose={() => {}} />);
  expect(
    await screen.findByText("暂时无法检查助手状态，请重试。"),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "发送任务" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "打开模型设置" })).toBeVisible();
});

it("opens a selected work-computer task after the panel was already mounted", async () => {
  api.profile.mockResolvedValue({ execution_available: true });
  const view = renderWithProviders(<TVAgentPanel onClose={() => {}} />);
  view.rerender(
    <TVAgentPanel onClose={() => {}} initialThread="computer-task" />,
  );
  expect(await screen.findByText("电视对话 computer-task")).toBeInTheDocument();
  expect(api.start).not.toHaveBeenCalled();
});

it("starts the explicitly selected CodeBuddy engine", async () => {
  api.profile.mockResolvedValue({ execution_available: true });
  api.start.mockResolvedValue({ thread_id: "buddy-task" });
  renderWithProviders(<TVAgentPanel initialPrompt="你好" onClose={() => {}} />);
  await screen.findByRole("button", { name: "CodeBuddy" });
  fireEvent.click(screen.getByRole("button", { name: "CodeBuddy" }));
  await vi.waitFor(() =>
    expect(screen.getByRole("button", { name: "发送任务" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "发送任务" }));
  await vi.waitFor(() =>
    expect(api.start).toHaveBeenCalledWith(
      "你好",
      undefined,
      false,
      "codebuddy",
      undefined,
    ),
  );
});

it("offers the official models and submits the selected CodeBuddy model", async () => {
  api.profile.mockResolvedValue({ execution_available: true });
  api.start.mockResolvedValue({ thread_id: "buddy-model" });
  renderWithProviders(<TVAgentPanel initialPrompt="你好" onClose={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: "CodeBuddy" }));
  const models = await screen.findByRole("combobox", {
    name: "CodeBuddy 模型",
  });
  fireEvent.change(models, { target: { value: "hy4std" } });
  await vi.waitFor(() =>
    expect(screen.getByRole("button", { name: "发送任务" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "发送任务" }));
  await vi.waitFor(() =>
    expect(api.start).toHaveBeenCalledWith(
      "你好",
      undefined,
      false,
      "codebuddy",
      "codebuddy/hy4std",
    ),
  );
});
