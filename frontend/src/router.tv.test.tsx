import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { AppRouter } from "./router";
import { renderWithProviders } from "@/test/harness";
import { useDesktopWorkspaceRequest } from "@/appliance/use-desktop-workspace-request";

const auth = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: true,
  authStatus: { enabled: true },
  user: { actor_id: "tv-actor" },
}));
const opened = vi.hoisted(() => vi.fn());
vi.mock("@/providers/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/components/electron-title-bar", () => ({
  ElectronTitleBar: () => null,
  ElectronTitleBarProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("@/app/workspace/workspace-routes", () => ({
  createWorkspaceRoute: () => null,
}));
vi.mock("./app/tv/page", () => ({ default: () => <div>TV 独立界面</div> }));
vi.mock("./app/desktop/page", () => ({
  default: function Desktop() {
    const [ready, setReady] = useState(auth.isAuthenticated);
    const location = useLocation();
    useDesktopWorkspaceRequest({ ready, onOpen: opened });
    return (
      <>
        <output>
          {location.pathname}
          {location.search}
        </output>
        <button
          onClick={() => {
            auth.isAuthenticated = true;
            setReady(true);
          }}
        >
          登录桌面
        </button>
      </>
    );
  },
}));
beforeEach(() => {
  auth.isAuthenticated = true;
  opened.mockClear();
});

it("opens authenticated TV directly without the conversation/desktop host", async () => {
  renderWithProviders(<AppRouter />, { initialRoute: "/tv" });
  expect(await screen.findByText("TV 独立界面")).toBeInTheDocument();
  expect(opened).not.toHaveBeenCalled();
});

it("preserves TV entry through the existing Linux login boundary", async () => {
  auth.isAuthenticated = false;
  renderWithProviders(<AppRouter />, { initialRoute: "/tv" });
  expect(
    await screen.findByText("/desktop?returnTo=%2Ftv"),
  ).toBeInTheDocument();
  expect(screen.queryByText("TV 独立界面")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "登录桌面" }));
  expect(await screen.findByText("TV 独立界面")).toBeInTheDocument();
  expect(opened).not.toHaveBeenCalled();
});
