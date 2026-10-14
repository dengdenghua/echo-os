import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SidebarProvider } from "@/components/ui/sidebar";
import { renderWithProviders } from "@/test/harness";

import { EchoDesktopWindowChromeContext } from "./embedded-window-bridge";
import { WorkspaceContainer } from "./workspace-container";

describe("WorkspaceContainer", () => {
  it("gives a page in an Echo OS window a phone-width sidebar trigger clear of the window controls", () => {
    renderWithProviders(
      <EchoDesktopWindowChromeContext.Provider value>
        <SidebarProvider defaultOpen={false}>
          <WorkspaceContainer>
            <h1>知识库</h1>
          </WorkspaceContainer>
        </SidebarProvider>
      </EchoDesktopWindowChromeContext.Provider>,
      { locale: "zh-CN" },
    );

    const trigger = document.querySelector('[data-slot="sidebar-trigger"]');
    expect(trigger).not.toBeNull();
    const bar = trigger!.parentElement!;
    expect(bar).toHaveClass("pl-16", "md:hidden");
    expect(bar.className).not.toMatch(/-mx-/);
    expect(screen.getByRole("heading", { name: "知识库" })).toBeInTheDocument();
  });

  it("renders without a sidebar provider or outside an Echo OS window", () => {
    renderWithProviders(
      <EchoDesktopWindowChromeContext.Provider value>
        <WorkspaceContainer>
          <p>本地数据库</p>
        </WorkspaceContainer>
      </EchoDesktopWindowChromeContext.Provider>,
      { locale: "zh-CN" },
    );
    expect(screen.getByText("本地数据库")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="sidebar-trigger"]')).toBeNull();
  });
});
