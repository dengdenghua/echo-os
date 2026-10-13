import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/harness";

import { BrowserPreviewPanel } from "./browser-preview-panel";

vi.mock("@/core/browser/local-services", () => ({
  detectLocalServices: () => Promise.resolve([]),
}));

const BLANK_SESSION = {
  session_id: "s",
  project_id: "p",
  profile_id: "p",
  profile_dir: "",
  automation_mode: "browser_context",
  uses_system_mouse: false,
  desktop_lease_required: false,
  is_launched: true,
  created_at: 0,
  last_activity: 0,
  action_count: 0,
  headless: true,
  mode: "real",
  runtime: "chromium",
  has_page: true,
  healthy: true,
  current_url: "about:blank",
  current_title: "",
  browser_regression_enabled: false,
  browser_regression_mode: "",
  browser_regression_preview_url: "",
  browser_regression_requires_visible_cursor: false,
};

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("BrowserPreviewPanel with no page loaded", () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/browser/session/status")) {
      return json({ exists: true, session: BLANK_SESSION });
    }
    if (url.includes("/api/browser/screenshot/base64")) {
      return json({ base64: "AAAA", width: 1440, height: 900 });
    }
    if (url.includes("/api/browser/action-log")) {
      return json({ actions: [] });
    }
    if (url.includes("/api/browser/session/health")) {
      return json({ healthy: true });
    }
    return json({});
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockClear();
    vi.unstubAllGlobals();
  });

  it("shows the empty state without capturing about:blank", async () => {
    const { container } = renderWithProviders(
      <BrowserPreviewPanel threadId="thread-1" />,
      { locale: "zh-CN" },
    );

    expect(
      await screen.findByText("导航到一个 URL 以查看页面"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes("/api/browser/action-log"),
        ),
      ).toBe(true),
    );

    // A capture of about:blank is a white image and is logged as an action.
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/browser/screenshot/base64"),
      ),
    ).toBe(false);
    expect(screen.getByText("0 个操作")).toBeInTheDocument();
    expect(container.querySelector('img[src^="data:image/png"]')).toBeNull();
    // The address bar stays empty instead of showing about:blank.
    expect(screen.getByRole("textbox", { name: "输入网址..." })).toHaveValue(
      "",
    );
    // No loading veil spinning over the empty copy once settled.
    await waitFor(() =>
      expect(container.querySelector('[class~="bg-background/60"]')).toBeNull(),
    );
  });
});
