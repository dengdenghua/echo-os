import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/harness";

import {
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
  useCloseMobileSidebarOnChange,
} from "./sidebar";

function RouteProbe({ route }: { route: string }) {
  useCloseMobileSidebarOnChange(route);
  return null;
}

describe("mobile sidebar", () => {
  beforeEach(() => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it("uses the mobile open state and localized accessible copy", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SidebarProvider>
        <SidebarTrigger aria-label="打开侧栏菜单" />
        <Sidebar>侧栏内容</Sidebar>
      </SidebarProvider>,
      { locale: "zh-CN" },
    );

    const trigger = screen.getByRole("button", { name: "打开侧栏菜单" });
    // jsdom reports a non-Apple platform, so the label names Ctrl+B.
    expect(trigger).toHaveTextContent("展开侧栏 (Ctrl+B)");

    await user.click(trigger);

    expect(await screen.findByRole("dialog", { name: "导航" })).toBeVisible();
    expect(screen.getByText("打开侧栏菜单")).toBeInTheDocument();
    expect(trigger).toHaveTextContent("收起侧栏 (Ctrl+B)");
  });

  it("keeps a contained sheet inside the provider instead of on body", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <SidebarProvider containMobileSheet>
        <SidebarTrigger aria-label="打开侧栏菜单" />
        <Sidebar>侧栏内容</Sidebar>
      </SidebarProvider>,
      { locale: "zh-CN" },
    );

    await user.click(screen.getByRole("button", { name: "打开侧栏菜单" }));

    const sheet = await screen.findByRole("dialog", { name: "导航" });
    const wrapper = container.querySelector('[data-slot="sidebar-wrapper"]');
    expect(wrapper).toHaveClass("relative");
    expect(wrapper).toContainElement(sheet);
    expect(sheet).toHaveClass("absolute");
    expect(sheet).not.toHaveClass("fixed");
  });

  it("portals an uncontained sheet to body", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <SidebarProvider>
        <SidebarTrigger aria-label="打开侧栏菜单" />
        <Sidebar>侧栏内容</Sidebar>
      </SidebarProvider>,
      { locale: "zh-CN" },
    );

    await user.click(screen.getByRole("button", { name: "打开侧栏菜单" }));

    const sheet = await screen.findByRole("dialog", { name: "导航" });
    expect(container).not.toContainElement(sheet);
    expect(sheet).toHaveClass("fixed");
  });

  it("closes the sheet when the route changes", async () => {
    const user = userEvent.setup();
    const ui = (route: string) => (
      <SidebarProvider>
        <RouteProbe route={route} />
        <SidebarTrigger aria-label="打开侧栏菜单" />
        <Sidebar>侧栏内容</Sidebar>
      </SidebarProvider>
    );
    const { rerender } = renderWithProviders(ui("/workspace/hub"), {
      locale: "zh-CN",
    });

    await user.click(screen.getByRole("button", { name: "打开侧栏菜单" }));
    expect(await screen.findByRole("dialog", { name: "导航" })).toBeVisible();

    rerender(ui("/workspace/hub"));
    expect(screen.getByRole("dialog", { name: "导航" })).toBeVisible();

    rerender(ui("/workspace/knowledge"));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "导航" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("names the Cmd shortcut on Apple platforms", () => {
    const platform = vi
      .spyOn(navigator, "platform", "get")
      .mockReturnValue("MacIntel");
    renderWithProviders(
      <SidebarProvider>
        <SidebarTrigger aria-label="打开侧栏菜单" />
      </SidebarProvider>,
      { locale: "zh-CN" },
    );

    expect(
      screen.getByRole("button", { name: "打开侧栏菜单" }),
    ).toHaveTextContent("展开侧栏 (⌘B)");
    platform.mockRestore();
  });
});
