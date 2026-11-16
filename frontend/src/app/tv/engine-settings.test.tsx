import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/harness";
import { TVEngineSettings } from "./engine-settings";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/core/tv/api", () => ({ tvRequest: request }));
const engine = {
  id: "codebuddy",
  name: "CodeBuddy",
  state: "ready",
  installed_version: "2.181.0",
  previous_version: "2.169.0",
  can_rollback: true,
  active_tasks: 0,
  revision: 1,
};
beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ engines: [engine] });
});

it("exposes remote-focusable independent upgrade and rollback actions", async () => {
  renderWithProviders(<TVEngineSettings />);
  const update = await screen.findByRole("button", { name: "检查并升级" });
  expect(update).toHaveAttribute("data-tv-focus");
  fireEvent.click(update);
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/engines/codebuddy/update",
      "POST",
    ),
  );
  const rollback = screen.getByRole("button", { name: "回退到 v2.169.0" });
  await vi.waitFor(() => expect(rollback).not.toBeDisabled());
  fireEvent.click(rollback);
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/engines/codebuddy/rollback",
      "POST",
    ),
  );
});

it("shows deferred activation and disables competing mutations", async () => {
  request.mockResolvedValue({
    engines: [
      {
        ...engine,
        state: "pending_activation",
        active_tasks: 2,
        pending_version: "2.182.0",
      },
    ],
  });
  renderWithProviders(<TVEngineSettings />);
  expect(await screen.findByText(/等待 2 个任务结束/)).toBeVisible();
  for (const button of screen.getAllByRole("button"))
    expect(button).toBeDisabled();
});

it("keeps the current version visible after a failed update", async () => {
  request.mockResolvedValue({
    engines: [
      { ...engine, job: { state: "failed", error: "download_failed" } },
    ],
  });
  renderWithProviders(<TVEngineSettings />);
  expect(await screen.findByRole("alert")).toHaveTextContent("原版本保持可用");
  expect(screen.getByText("当前 v2.181.0")).toBeVisible();
});
