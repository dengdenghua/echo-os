import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { isInDarkScope, useScopedDarkMode } from "./use-scoped-dark-mode";

function Probe() {
  const [ref, isDark] = useScopedDarkMode<HTMLSpanElement>();
  return (
    <span ref={ref} data-testid="probe">
      {isDark ? "dark" : "light"}
    </span>
  );
}

describe("useScopedDarkMode", () => {
  it("follows a .dark wrapper even when <html> is light", () => {
    document.documentElement.classList.add("light");
    try {
      render(
        <div className="dark">
          <Probe />
        </div>,
      );
      expect(screen.getByTestId("probe")).toHaveTextContent("dark");
    } finally {
      document.documentElement.classList.remove("light");
    }
  });

  it("treats a snow island inside graphite as light", () => {
    render(
      <div data-echo-theme="graphite">
        <div data-echo-theme="snow">
          <Probe />
        </div>
      </div>,
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("light");
  });

  it("is light without any theme scope", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("light");
  });

  it("updates when an ancestor switches theme", async () => {
    const { container } = render(
      <div className="theme-white">
        <Probe />
      </div>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(screen.getByTestId("probe")).toHaveTextContent("light");

    await act(async () => {
      wrapper.classList.add("dark");
      // MutationObserver callbacks run as microtasks.
      await Promise.resolve();
    });
    expect(screen.getByTestId("probe")).toHaveTextContent("dark");
  });
});

describe("isInDarkScope", () => {
  it("lets data-echo-theme win over a class on the same element", () => {
    const el = document.createElement("div");
    el.className = "dark";
    el.setAttribute("data-echo-theme", "snow");
    expect(isInDarkScope(el)).toBe(false);
  });
});
