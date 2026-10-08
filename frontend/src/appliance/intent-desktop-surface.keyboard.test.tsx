import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntentDesktopSurface } from "./intent-desktop-surface";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("IntentDesktopSurface keyboard contracts", () => {
  it("leaves focus and desktop mode unchanged while a modal is open", () => {
    const onModeChange = vi.fn();
    render(
      <>
        <IntentDesktopSurface mode="workspace" onModeChange={onModeChange} />
        <div role="dialog" aria-modal="true">
          <input aria-label="弹窗输入" />
        </div>
      </>,
    );
    const field = screen.getByLabelText("弹窗输入");
    field.focus();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.keyDown(window, { key: "d", altKey: true });
    expect(field).toHaveFocus();
    expect(onModeChange).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("Cmd/Ctrl+K focuses the intent input", () => {
    render(<IntentDesktopSurface initialMode="workspace" />);
    const input = screen.getByPlaceholderText(/输入意图/i) as HTMLInputElement;

    expect(document.activeElement).not.toBe(input);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(document.activeElement).toBe(input);
  });

  it("main-keyboard '/' (code KeySlash) focuses the intent input; numpad '/' does not", () => {
    render(<IntentDesktopSurface initialMode="workspace" />);
    const input = screen.getByPlaceholderText(/输入意图/i) as HTMLInputElement;

    fireEvent.keyDown(window, { key: "/", code: "Slash" });
    expect(document.activeElement).toBe(input);

    input.blur();
    expect(document.activeElement).not.toBe(input);

    fireEvent.keyDown(window, { key: "/", code: "NumpadDivide" });
    expect(document.activeElement).not.toBe(input);
  });

  it("does not intercept '/' or Space while an input is focused", () => {
    render(<IntentDesktopSurface initialMode="workspace" />);
    const input = screen.getByPlaceholderText(/输入意图/i) as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(window, { key: "/", code: "Slash" });
    // still on input, not stolen to re-focus
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(window, { key: " ", code: "Space" });
    expect(document.activeElement).toBe(input);
    // mode unchanged (still workspace)
    expect(screen.getByText("多窗口工作台")).toBeInTheDocument();
  });

  it("does not toggle mode on Space when a button is focused", () => {
    render(<IntentDesktopSurface initialMode="workspace" />);
    const someButton = screen.getAllByRole("button")[0]!;
    someButton.focus();
    expect(document.activeElement).toBe(someButton);

    fireEvent.keyDown(window, { key: " ", code: "Space" });
    // space must let the button's default activation happen, not toggle mode
    expect(screen.getByText("多窗口工作台")).toBeInTheDocument();
  });

  it("keeps windows visible when Space or Escape is pressed after clicking text inside a window", () => {
    const onModeChange = vi.fn();
    render(
      <>
        <IntentDesktopSurface mode="workspace" onModeChange={onModeChange} />
        <div role="dialog" aria-label="工作台" data-desktop-interactive>
          <p>你好，我是 Echo</p>
        </div>
      </>,
    );
    // 点击普通文字不会移动焦点，activeElement 仍是 body。
    fireEvent.pointerDown(screen.getByText("你好，我是 Echo"));
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(window, { key: " ", code: "Space" });
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(onModeChange).not.toHaveBeenCalled();

    // 回到桌面空白处后，Space 恢复为形态切换。
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    expect(onModeChange).toHaveBeenCalledWith("pure");
  });
});
