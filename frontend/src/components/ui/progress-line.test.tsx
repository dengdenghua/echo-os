import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PanelLoading, ProgressLine } from "./progress-line";

describe("ProgressLine", () => {
  it("renders an indeterminate progressbar with a Chinese default label", () => {
    render(<ProgressLine />);

    const line = screen.getByRole("progressbar", { name: "加载中" });
    expect(line).not.toHaveAttribute("aria-valuenow");
    expect(line).toHaveClass("h-0.5", "bg-border-subtle");
  });

  it("accepts an overriding label", () => {
    render(<ProgressLine label="Loading..." />);

    expect(
      screen.getByRole("progressbar", { name: "Loading..." }),
    ).toBeInTheDocument();
  });

  it("uses a core segment that stops under prefers-reduced-motion", () => {
    const { container } = render(<ProgressLine />);

    const bar = container.querySelector('[data-slot="progress-line-bar"]');
    expect(bar).toHaveClass("bg-core", "motion-reduce:animate-none");
    expect(bar?.className).toMatch(/animate-\[echo-progress-line_/);
  });

  it("hides itself from assistive tech when decorative", () => {
    const { container } = render(<ProgressLine decorative />);

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(
      container.querySelector('[data-slot="progress-line"]'),
    ).toHaveAttribute("aria-hidden", "true");
  });
});

describe("PanelLoading", () => {
  it("announces the label through a status region", () => {
    render(<PanelLoading label="正在加载设置" />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("正在加载设置");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows a muted caption and extra children when given", () => {
    render(
      <PanelLoading caption="正在加载工作区">
        <button type="button">重试</button>
      </PanelLoading>,
    );

    expect(screen.getByText("正在加载工作区")).toHaveClass(
      "text-muted-foreground",
    );
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });
});
