import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MacDockDownloadsStack } from "./mac-dock-stack";

describe("MacDockDownloadsStack", () => {
  it("renders downloads stack icon with accessibility label", () => {
    render(<MacDockDownloadsStack />);
    const stack = screen.getByLabelText("下载");
    expect(stack).toBeInTheDocument();
    expect(stack).toHaveAttribute("data-dock-stack");
  });
});
