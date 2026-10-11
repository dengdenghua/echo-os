import { useCallback, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import DesktopBrowserEntry from "@/components/desktop-browser-entry";
import { useDesktopBrowserRequest } from "./use-desktop-browser-request";
import { useDesktopWorkspaceRequest } from "./use-desktop-workspace-request";

vi.mock("@/core/auth/api", () => ({ currentActorId: () => "browser-user" }));

function Desktop({
  ready,
  onOpen,
}: {
  ready: boolean;
  onOpen: (query?: string) => void;
}) {
  const location = useLocation();
  const [opened, setOpened] = useState(false);
  const open = useCallback(
    (query?: string) => {
      onOpen(query);
      setOpened(true);
    },
    [onOpen],
  );
  useDesktopBrowserRequest({ ready, onOpen: open });
  return (
    <p>
      {location.pathname}
      {location.search}
      {opened ? " opened" : " pending"}
    </p>
  );
}

describe("desktop browser entry", () => {
  it("retains a search request until login is ready and consumes it once", async () => {
    const onOpen = vi.fn();
    function App({ ready }: { ready: boolean }) {
      return (
        <MemoryRouter initialEntries={["/browser?q=retained%20query"]}>
          <Routes>
            <Route path="/browser" element={<DesktopBrowserEntry />} />
            <Route
              path="/desktop"
              element={<Desktop ready={ready} onOpen={onOpen} />}
            />
          </Routes>
        </MemoryRouter>
      );
    }
    const view = render(<App ready={false} />);
    expect(
      await screen.findByText(
        "/desktop?app=browser&browserQuery=retained+query pending",
      ),
    ).toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
    view.rerender(<App ready />);
    expect(await screen.findByText("/desktop opened")).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("retained query");
    view.rerender(<App ready />);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("consumes mixed browser/workspace links in sequence without losing either request", async () => {
    const openBrowser = vi.fn();
    const openWorkspace = vi.fn();
    function Both() {
      const location = useLocation();
      useDesktopBrowserRequest({ ready: true, onOpen: openBrowser });
      useDesktopWorkspaceRequest({ ready: true, onOpen: openWorkspace });
      return (
        <p>
          {location.pathname}
          {location.search}
        </p>
      );
    }
    render(
      <MemoryRouter
        initialEntries={[
          "/desktop?app=browser&workspace=%2Fworkspace%2Fprojects",
        ]}
      >
        <Both />
      </MemoryRouter>,
    );
    await waitFor(() => expect(openWorkspace).toHaveBeenCalledOnce());
    expect(openBrowser).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(openWorkspace).toHaveBeenCalledWith("/workspace/projects", {
      state: null,
    });
    expect(screen.getByText("/desktop")).toBeInTheDocument();
  });
});
