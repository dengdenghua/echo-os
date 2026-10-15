import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/harness";

import { BrowserDesktopReplayReviewCard } from "./replay-panel";

function renderCard() {
  return renderWithProviders(
    <BrowserDesktopReplayReviewCard
      items={[]}
      total={0}
      quality={{
        schema: "echo.browser_desktop_quality.v1",
        score: 1,
        passed: 0,
        total: 0,
        ready: true,
        checks: [],
        replay_trends: {
          schema: "echo.browser_desktop_replay_trends.v1",
          total: 0,
          pending_count: 0,
          reviewed_count: 0,
          promoted_count: 0,
          rejected_count: 0,
          review_rate: 0,
          stale_source_artifact_count: 0,
          by_status: {},
          by_candidate_kind: {},
          latest: [],
          next_actions: [],
        },
        next_actions: [],
      }}
      repairRecipes={{
        schema: "echo.browser_desktop_repair_recipes.v1",
        total_pending_cases: 0,
        recipe_count: 0,
        recipes: [],
        ready: true,
        next_actions: [],
      }}
      repairVerifications={{
        schema: "echo.browser_desktop_repair_recipe_verifications.v1",
        total: 0,
        verified_count: 0,
        blocked_count: 0,
        ready: true,
        verifications: [],
      }}
      browserBusy={false}
      desktopBusy={false}
      recipeBusy={false}
      rerunBusy={false}
      staleBusy={false}
      onQueueBrowser={vi.fn()}
      onQueueDesktop={vi.fn()}
      onQueueRepairRecipes={vi.fn()}
      onRerunBlocked={vi.fn()}
      onRejectStale={vi.fn()}
    />,
    { locale: "zh-CN" },
  );
}

describe("BrowserDesktopReplayReviewCard", () => {
  it("speaks Chinese in the Chinese UI", () => {
    // Golden path 2026-10: 可观测性 › 总览 showed this whole card in English
    // ("Browser/Desktop replay review", "Queue browser", "PENDING", …).
    const { container } = renderCard();

    expect(screen.getByText("浏览器 / 桌面回放审核")).toBeInTheDocument();
    expect(screen.getByText("0 待审")).toBeInTheDocument();
    expect(screen.getByText("无待审")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /加入浏览器案例/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("没有等待审核的浏览器或桌面回放案例。"),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /replay review|Queue browser|pending|review rate/,
    );
  });
});
