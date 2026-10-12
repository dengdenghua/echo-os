import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EchoMark, EchoWordmark } from "./echo-mark";

describe("EchoMark", () => {
  it("renders the canonical frame-and-core geometry", () => {
    const { container } = render(<EchoMark title="Echo" />);

    expect(screen.getByRole("img", { name: "Echo" })).toBeVisible();
    expect(container.querySelector("path")).toHaveAttribute(
      "d",
      "M50 17H24a7 7 0 0 0-7 7v16a7 7 0 0 0 7 7h26",
    );
    expect(container.querySelector("circle")).toHaveAttribute("cx", "38");
    expect(container.querySelector("circle")).toHaveAttribute(
      "fill",
      "var(--echo-core)",
    );
  });

  it("lets the Echo Core report a system state", () => {
    const { container } = render(<EchoMark state="warning" />);

    expect(container.querySelector("circle")).toHaveAttribute(
      "fill",
      "var(--echo-warning)",
    );
  });

  it("supports a current-color monochrome treatment", () => {
    const { container } = render(<EchoMark tone="current" />);

    expect(container.querySelector("path")).toHaveAttribute(
      "stroke",
      "currentColor",
    );
    expect(container.querySelector("circle")).toHaveAttribute(
      "fill",
      "currentColor",
    );
  });

  it("builds the wordmark's E from the mark itself", () => {
    const { container } = render(<EchoWordmark />);

    expect(screen.getByRole("img", { name: "ECHO" })).toBeVisible();
    expect(container.querySelector("path")).toHaveAttribute(
      "d",
      "M50 17H24a7 7 0 0 0-7 7v16a7 7 0 0 0 7 7h26",
    );
  });
});
