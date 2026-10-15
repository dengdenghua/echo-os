import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Collapsible } from "@/components/ui/collapsible";

import { __testing } from "./workspace-sidebar";

const ProjectGroupTrigger = __testing.ProjectGroupTrigger;
const SidebarTimestamp = __testing.SidebarTimestamp;

describe("workspace sidebar visual accessibility", () => {
  it("exposes a semantic tooltip for a truncated project name", async () => {
    const user = userEvent.setup();
    const project = "echo-agent-with-a-project-name-that-does-not-fit";

    render(
      <Collapsible>
        <ProjectGroupTrigger project={project} threadCount={12} deletable />
      </Collapsible>,
    );

    const trigger = screen.getByRole("button", { name: new RegExp(project) });
    expect(screen.getByText(project)).toHaveClass("truncate");

    await user.hover(trigger);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(project);
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("draws the icon the project was created with", () => {
    const { container } = render(
      <Collapsible>
        <ProjectGroupTrigger
          project="秋季旅行"
          threadCount={1}
          deletable={false}
          hasBoundFolder={false}
          icon="plane"
        />
      </Collapsible>,
    );

    expect(
      container.querySelector('[data-project-icon="plane"]'),
    ).not.toBeNull();
    expect(container.querySelector("[data-project-kind]")).toBeNull();
  });

  it("keeps the folder or milestone kind for projects without one", () => {
    const milestone = render(
      <Collapsible>
        <ProjectGroupTrigger
          project="秋季旅行"
          threadCount={1}
          deletable={false}
          hasBoundFolder={false}
          icon={null}
        />
      </Collapsible>,
    );
    expect(
      milestone.container.querySelector('[data-project-kind="milestone"]'),
    ).not.toBeNull();
    milestone.unmount();

    const folder = render(
      <Collapsible>
        <ProjectGroupTrigger
          project="秋季旅行"
          threadCount={1}
          deletable={false}
          hasBoundFolder
        />
      </Collapsible>,
    );
    expect(
      folder.container.querySelector('[data-project-kind="folder"]'),
    ).not.toBeNull();
  });

  it("renders compact timestamps with the stronger sidebar text token", () => {
    render(<SidebarTimestamp updatedAt="2026-08-21T00:00:00Z" />);

    const timestamp = screen.getByText(/\S+/);
    expect(timestamp).toHaveClass("text-sidebar-foreground/70", "font-medium");
  });
});
