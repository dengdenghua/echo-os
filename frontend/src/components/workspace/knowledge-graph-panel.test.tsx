import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// One stable i18n value, like the real hook: the panel reloads its data
// whenever `t` changes identity.
const i18n = vi.hoisted(() => ({
  t: {
    knowledgeGraph: { refresh: "刷新", loadFailed: "加载失败" },
    knowledgePanel: {
      graphView: "图谱视图",
      listView: "列表视图",
      entityTypes: {
        center: "中心",
        subject: "主体",
        object: "对象",
        neighbor: "邻居",
      },
    },
    observabilityPage: { crossTenantAdminRequired: "需要管理员" },
  },
  locale: "zh-CN",
}));

vi.mock("@/core/i18n/hooks", () => ({
  useI18n: () => i18n,
}));

vi.mock("./knowledge-graph-view", () => ({
  KnowledgeGraphView: () => <div data-testid="graph-3d" />,
}));

import { KnowledgeGraphPanel } from "./knowledge-graph-panel";

const GRAPH = {
  entities: [
    { id: "a", name: "Echo", entity_type: "subject", description: "" },
    { id: "b", name: "记忆", entity_type: "object", description: "" },
    { id: "c", name: "白港", entity_type: "neighbor", description: "" },
  ],
  relationships: [
    {
      id: "r1",
      source_name: "Echo",
      target_name: "记忆",
      relationship_type: "keeps",
    },
    {
      id: "r2",
      source_name: "Echo",
      target_name: "白港",
      relationship_type: "near",
    },
  ],
};

const STATS = {
  total_entities: 3,
  total_relationships: 2,
  entity_types: { subject: 1, object: 1, neighbor: 1 },
};

const INK_RAMP = [
  "var(--echo-ink)",
  "var(--echo-ink-muted)",
  "var(--echo-ink-faint)",
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/api/knowledge/stats") ? STATS : GRAPH;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function nodeMark(group: Element): SVGElement {
  const mark = group.querySelector<SVGElement>("[data-entity-mark]");
  if (!mark) throw new Error("node mark missing");
  return mark;
}

describe("KnowledgeRelationMap", () => {
  it("paints the map from ECHO tokens with core only on the focused entity", async () => {
    render(
      <MemoryRouter>
        <KnowledgeGraphPanel />
      </MemoryRouter>,
    );
    const map = await screen.findByRole("img", { name: "知识关系图" });
    const frame = map.closest("[data-knowledge-relation-map]");
    expect(frame?.className).toContain("bg-[var(--echo-surface-sunken)]");

    const nodes = [...map.querySelectorAll("[data-entity-type]")];
    expect(nodes).toHaveLength(3);
    const byType = new Map(
      nodes.map((node) => [node.getAttribute("data-entity-type"), node]),
    );

    // The top-ranked entity is selected by default: the one core mark.
    const subject = byType.get("subject")!;
    expect(subject.getAttribute("data-focus")).toBe("true");
    expect(subject.getAttribute("data-entity-shape")).toBe("circle");
    expect(nodeMark(subject).style.fill).toBe("var(--echo-core)");

    for (const type of ["object", "neighbor"]) {
      const node = byType.get(type)!;
      expect(node.getAttribute("data-focus")).toBeNull();
      expect(INK_RAMP).toContain(nodeMark(node).style.fill);
    }
    expect(byType.get("object")!.getAttribute("data-entity-shape")).toBe(
      "square",
    );
    expect(byType.get("neighbor")!.getAttribute("data-entity-shape")).toBe(
      "diamond",
    );

    // Edges of the focused entity are core; nothing else carries a hue.
    const edges = [...map.querySelectorAll("path[d*=' Q ']")];
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(["var(--echo-core)", "var(--echo-ink-faint)"]).toContain(
        (edge as SVGElement).style.stroke,
      );
    }

    const legend = screen.getByRole("list", { name: "实体类型图例" });
    expect(within(legend).getByText("主体")).toBeInTheDocument();
    expect(within(legend).getByText("对象")).toBeInTheDocument();
    expect(within(legend).getByText("邻居")).toBeInTheDocument();
  });

  it("moves the core accent to the hovered entity", async () => {
    render(
      <MemoryRouter>
        <KnowledgeGraphPanel />
      </MemoryRouter>,
    );
    // Re-query after each step: the map may re-render while its data settles,
    // replacing the node elements.
    const findNode = (type: string) =>
      screen
        .getByRole("img", { name: "知识关系图" })
        .querySelector<SVGElement>(`[data-entity-type='${type}']`);
    await screen.findByRole("img", { name: "知识关系图" });
    await waitFor(() => expect(findNode("object")).not.toBeNull());
    fireEvent.mouseEnter(findNode("object")!);
    await waitFor(() =>
      expect(findNode("object")?.getAttribute("data-focus")).toBe("true"),
    );
    expect(nodeMark(findNode("object")!).style.fill).toBe("var(--echo-core)");
    expect(INK_RAMP).toContain(nodeMark(findNode("neighbor")!).style.fill);
  });
});
