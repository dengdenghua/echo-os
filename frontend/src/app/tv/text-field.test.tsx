import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TVKeyboard } from "./text-field";

it("composes Chinese offline and commits only after selecting candidates", () => {
  const done = vi.fn(); render(<TVKeyboard label="测试" value="" onDone={done} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "中文", exact: true }));
  for (const char of "ni") fireEvent.click(screen.getByRole("button", { name: `键 ${char}`, exact: true }));
  expect(screen.getByRole("button", { name: "完成输入" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "你", exact: true }));
  for (const char of "hao") fireEvent.click(screen.getByRole("button", { name: `键 ${char}`, exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "好", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "完成输入" }));
  expect(done).toHaveBeenCalledWith("你好");
});
it("masks secret drafts and cancels without committing edits", () => {
  const done = vi.fn(), close = vi.fn(); render(<TVKeyboard label="密钥" value="original-secret" secret onDone={done} onClose={close} />);
  expect(screen.getByLabelText("键盘草稿")).not.toHaveTextContent("original-secret");
  fireEvent.click(screen.getByRole("button", { name: "键 a", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "取消输入" }));
  expect(close).toHaveBeenCalledOnce(); expect(done).not.toHaveBeenCalled();
});
it("supports symbols, bounded input and candidate pagination", () => {
  const done = vi.fn(); render(<TVKeyboard label="输入" value="123" maxLength={4} onDone={done} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "符号", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "键 /", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "键 @", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "完成输入" })); expect(done).toHaveBeenCalledWith("123/");
  fireEvent.click(screen.getByRole("button", { name: "中文", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "键 y", exact: true })); fireEvent.click(screen.getByRole("button", { name: "键 i", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "下一页" })); expect(screen.getByRole("button", { name: "上一页" })).toBeEnabled();
});
