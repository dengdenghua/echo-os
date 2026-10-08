import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  SystemAppFrame,
  SystemAppWindowProvider,
  systemAppForWindow,
  systemAppWindowId,
  useSystemAppWindow,
} from "./system-app-window";
import { TaskSpacePanel } from "./task-space-panel";
import { useDesktopWindows } from "./use-desktop-windows";

vi.mock("@/core/auth/api", () => ({ currentActorId: () => "tester" }));

function Frame({ onClose = vi.fn() }: { onClose?: () => void }) {
  return (
    <SystemAppFrame
      label="照片"
      onClose={onClose}
      overlayClassName="fixed inset-0"
      className="rounded-[24px]"
      windowClassName="size-full"
      trailing={<p>附属对话框</p>}
    >
      <p>内容</p>
    </SystemAppFrame>
  );
}

describe("SystemAppFrame", () => {
  it("keeps the overlay presentation when rendered on its own", () => {
    const onClose = vi.fn();
    render(<Frame onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "照片" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("附属对话框")).toBeInTheDocument();

    fireEvent.mouseDown(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("drops the modal shell inside a desktop window", () => {
    render(
      <SystemAppWindowProvider>
        <Frame />
      </SystemAppWindowProvider>,
    );
    // 窗口本身提供对话框语义；面板不能再是模态，否则会屏蔽系统快捷键。
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector("[aria-modal]")).toBeNull();
    expect(screen.getByLabelText("照片")).toHaveClass("size-full");
    expect(screen.getByText("附属对话框")).toBeInTheDocument();
  });
});

describe("useSystemAppWindow", () => {
  it("opens, raises and closes a system app through the window manager", () => {
    const { result } = renderHook(() => {
      const desktop = useDesktopWindows();
      const [open, setOpen] = useSystemAppWindow(
        "photos",
        desktop.windows,
        desktop.openWindow,
        desktop.closeWindow,
      );
      return { desktop, open, setOpen };
    });
    const id = systemAppWindowId("photos");
    expect(result.current.open).toBe(false);

    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);
    const win = result.current.desktop.windows[0]!;
    expect(win).toMatchObject({ id, title: "照片", integratedChrome: true });
    // 占位内容保证窗口不会退化成 iframe。
    expect(win.content).toBeNull();
    expect(systemAppForWindow(win.id)).toBe("photos");

    act(() => result.current.desktop.minimizeWindow(id));
    act(() => result.current.setOpen(true));
    expect(result.current.desktop.minimized.has(id)).toBe(false);
    expect(result.current.desktop.windows).toHaveLength(1);

    act(() => result.current.setOpen((open) => !open));
    expect(result.current.open).toBe(false);
    expect(result.current.desktop.windows).toEqual([]);
  });

  it("ignores ids that are not system apps", () => {
    expect(systemAppForWindow("agent-window:123")).toBeNull();
    expect(systemAppForWindow("system:unknown")).toBeNull();
  });
});

describe("system apps inside a desktop window", () => {
  it("leaves closing to the window: no own traffic lights and Escape keeps it open", () => {
    const onClose = vi.fn();
    render(
      <SystemAppWindowProvider>
        <TaskSpacePanel
          open
          projection={null}
          loading={false}
          error={null}
          onClose={onClose}
          onRefresh={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onTakeover={vi.fn()}
          onResumeExecution={vi.fn()}
          onApprovalDecision={vi.fn()}
        />
      </SystemAppWindowProvider>,
    );
    expect(screen.getByLabelText("Echo 任务空间")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭任务空间" })).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
