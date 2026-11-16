import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { WorkspaceAppMenu } from "./workspace-app-menu";

vi.mock("@/core/i18n/hooks", () => ({
  useI18n: () => ({ locale: "en-US", t: { sidebar: {} } }),
}));
vi.mock("@/core/agents/active", () => ({ useActiveAgentId: () => "general" }));
vi.mock("@/core/modules/enabled-modules", () => ({
  useEnabledModuleIds: () => [],
  useModuleAvailabilitySnapshot: () => new Map(),
  setModuleEnabled: vi.fn(),
}));

describe("workspace application menu keyboard dismissal", () => {
  it("returns focus to More apps after Escape and leaves the route unchanged", async () => {
    render(
      <MemoryRouter
        initialEntries={["/workspace/realtime/new?presentation=workbench"]}
      >
        <SidebarProvider>
          <WorkspaceAppMenu onManage={vi.fn()} />
        </SidebarProvider>
      </MemoryRouter>,
    );
    const trigger = screen.getByRole("button", { name: "More apps" });
    fireEvent.click(trigger);
    const menu = await screen.findByRole("dialog", { name: "More apps" });
    expect(
      menu.querySelector('[data-shortcut-row="assistant"] a'),
    ).toHaveAttribute(
      "href",
      "/workspace/realtime/echo-assistant?agent=echo&presentation=workbench",
    );
    const pin = menu.querySelector<HTMLButtonElement>(
      "[data-shortcut-row] button",
    )!;
    pin.focus();
    fireEvent.keyDown(pin, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
