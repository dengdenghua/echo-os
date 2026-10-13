import { useEffect } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AppWindow } from "./app-window";
afterEach(cleanup);
it("keeps the same phone content mounted across PiP, minimize and restore", () => {
  const mount = vi.fn(),
    unmount = vi.fn();
  function Content() {
    useEffect(() => {
      mount();
      return unmount;
    }, []);
    return <div>会话</div>;
  }
  const props = {
    win: {
      id: "phone:1",
      title: "手机",
      url: "/phone-mirror",
      integratedChrome: true,
      content: <Content />,
    },
    index: 0,
    focused: true,
    onClose: vi.fn(),
    onFocus: vi.fn(),
    onMinimize: vi.fn(),
  };
  const view = render(<AppWindow {...props} />);
  fireEvent.click(screen.getByLabelText("切换为悬浮小窗"));
  expect(
    view.container.querySelector('[data-phone-pip="true"]'),
  ).not.toBeNull();
  view.rerender(<AppWindow {...props} hidden />);
  expect(view.container.querySelector(".mac-window")).toHaveStyle({
    display: "none",
  });
  view.rerender(<AppWindow {...props} />);
  fireEvent.click(screen.getByLabelText("恢复手机窗口"));
  expect(mount).toHaveBeenCalledTimes(1);
  expect(unmount).not.toHaveBeenCalled();
});
