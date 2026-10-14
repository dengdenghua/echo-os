import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@/providers/AuthProvider", () => ({
  useOptionalAuth: () => authMock(),
}));
vi.mock("@/core/i18n/hooks", () => ({
  useI18n: () => ({
    t: {
      knowledgeGraph: { graph: "图谱" },
      evolutionDashboard: { memories: "记忆" },
    },
  }),
}));
vi.mock("@/components/workspace/knowledge-graph-panel", () => ({
  KnowledgeGraphPanel: () => <div>graph-panel</div>,
}));
vi.mock("@/components/workspace/memory-assets-panel", () => ({
  MemoryAssetsPanel: () => <div>memory-panel</div>,
}));
vi.mock("@/components/workspace/wiki-panel", () => ({
  WikiPanel: () => <div>wiki-panel</div>,
}));
vi.mock("@/components/workspace/workspace-container", () => ({
  WorkspaceContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  WorkspaceBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import KnowledgePage from "./page";

const owner = {
  authStatus: { enabled: true },
  user: { roles: ["user", "local", "admin"], permissions: [] },
};

describe("KnowledgePage", () => {
  beforeEach(() => authMock.mockReset());

  it("starts the appliance owner on memories without probing the global graph", () => {
    authMock.mockReturnValue(owner);
    render(<KnowledgePage />);

    expect(screen.queryByRole("tab", { name: /图谱/ })).not.toBeInTheDocument();
    expect(screen.queryByText("graph-panel")).not.toBeInTheDocument();
    expect(screen.getByText("memory-panel")).toBeInTheDocument();
  });

  it("keeps the graph for an admin with the cross-tenant scope", () => {
    authMock.mockReturnValue({
      ...owner,
      user: { roles: ["admin"], permissions: ["tenant:cross_tenant"] },
    });
    render(<KnowledgePage />);

    expect(screen.getByRole("tab", { name: /图谱/ })).toBeInTheDocument();
    expect(screen.getByText("graph-panel")).toBeInTheDocument();
  });

  it("keeps the graph in local auth-off mode", () => {
    authMock.mockReturnValue({ authStatus: { enabled: false }, user: null });
    render(<KnowledgePage />);

    expect(screen.getByText("graph-panel")).toBeInTheDocument();
  });
});
