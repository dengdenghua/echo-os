import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MacDockTrash } from "./mac-dock-trash";

describe("MacDockTrash", () => {
  it("renders empty state correctly without paper contents", () => {
    const { container } = render(<MacDockTrash isFull={false} />);
    const trashEl = screen.getByLabelText("废纸篓");
    expect(trashEl).toBeInTheDocument();
    expect(trashEl).toHaveAttribute("data-dock-trash");
    expect(trashEl).toHaveAttribute("data-state", "empty");
    expect(container.querySelector(".mac-trash-contents")).toBeNull();
  });

  it("renders full state with paper contents when isFull is true", () => {
    const { container } = render(<MacDockTrash isFull itemCount={3} />);
    const trashEl = screen.getByLabelText("废纸篓 (3 项)");
    expect(trashEl).toBeInTheDocument();
    expect(trashEl).toHaveAttribute("data-state", "full");
    expect(container.querySelector(".mac-trash-contents")).not.toBeNull();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("treats positive itemCount as full state", () => {
    const { container } = render(<MacDockTrash itemCount={5} />);
    const trashEl = screen.getByLabelText("废纸篓 (5 项)");
    expect(trashEl).toHaveAttribute("data-state", "full");
    expect(container.querySelector(".mac-trash-contents")).not.toBeNull();
  });
});
