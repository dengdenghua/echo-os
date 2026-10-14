import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AllProviders } from "@/test/harness";

import { PageLoading } from "./router";

describe("PageLoading", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("offers recovery when a lazy page takes too long", () => {
    vi.useFakeTimers();
    render(
      <AllProviders locale="zh-CN">
        <PageLoading />
      </AllProviders>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("加载中...");
    expect(screen.getByTestId("page-loading")).toContainElement(
      document.querySelector('[data-slot="progress-line"]') as HTMLElement,
    );
    expect(screen.queryByRole("button", { name: "重试" })).toBeNull();

    act(() => vi.advanceTimersByTime(8_000));

    expect(screen.getByText("正在加载工作区...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });
});
