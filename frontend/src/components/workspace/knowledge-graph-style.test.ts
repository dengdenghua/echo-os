import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ENTITY_SHAPES,
  ENTITY_TONES,
  entityTypeStyle,
  readGraphPalette,
  tokenVar,
} from "./knowledge-graph-style";

const KNOWN_TYPES = ["subject", "object", "center", "neighbor", "other"];

describe("knowledge graph entity styles", () => {
  it("draws every type in the ink ramp, never a hue", () => {
    const samples = [
      ...KNOWN_TYPES,
      "person",
      "organization",
      "concept",
      "技能",
      "",
      undefined,
    ];
    for (const type of samples) {
      const style = entityTypeStyle(type);
      expect(ENTITY_TONES).toContain(style.tone);
      expect(ENTITY_SHAPES).toContain(style.shape);
      expect(style.tone).not.toBe("core");
    }
  });

  it("tells the known types apart by shape", () => {
    const shapes = KNOWN_TYPES.map((type) => entityTypeStyle(type).shape);
    expect(new Set(shapes).size).toBe(KNOWN_TYPES.length);
    expect(entityTypeStyle("subject").shape).toBe("circle");
    expect(entityTypeStyle("object").shape).toBe("square");
  });

  it("is stable for unknown types", () => {
    expect(entityTypeStyle("organization")).toEqual(
      entityTypeStyle("organization"),
    );
    expect(entityTypeStyle("")).toEqual(entityTypeStyle("other"));
  });

  it("references tokens, not literals", () => {
    expect(tokenVar("ink-muted")).toBe("var(--echo-ink-muted)");
    expect(tokenVar("core")).toBe("var(--echo-core)");
  });
});

describe("readGraphPalette", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reads the computed --echo-* tokens of the graph's own scope", () => {
    const scope = document.createElement("div");
    scope.style.setProperty("--echo-surface-sunken", "rgb(1, 2, 3)");
    scope.style.setProperty("--echo-ink", "rgb(4, 5, 6)");
    scope.style.setProperty("--echo-core", "rgb(7, 8, 9)");
    const graph = document.createElement("div");
    scope.appendChild(graph);
    document.body.appendChild(scope);

    const snow = readGraphPalette(graph, false);
    expect(snow.surfaceSunken).toBe("rgb(1, 2, 3)");
    expect(snow.ink).toBe("rgb(4, 5, 6)");
    expect(snow.core).toBe("rgb(7, 8, 9)");

    // A theme switch rewrites the tokens; the next read follows them.
    scope.style.setProperty("--echo-surface-sunken", "rgb(9, 9, 9)");
    expect(readGraphPalette(graph, true).surfaceSunken).toBe("rgb(9, 9, 9)");
  });

  it("falls back per theme when the token stylesheet is missing", () => {
    const light = readGraphPalette(null, false);
    const dark = readGraphPalette(null, true);
    expect(light.ink).not.toBe(dark.ink);
    expect(light.surfaceSunken).not.toBe(dark.surfaceSunken);
  });
});

describe("knowledge graph sources", () => {
  const files = [
    "src/components/workspace/knowledge-graph-panel.tsx",
    "src/components/workspace/knowledge-graph-view.tsx",
    "src/components/workspace/knowledge-graph-style.ts",
  ];

  it.each(files)("%s has no hand-picked colours", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\bbg-\[#/);
    expect(source).not.toMatch(
      /\b(?:sky|cyan|teal|emerald|green|lime|yellow|amber|orange|pink|rose|fuchsia|violet|purple|indigo)-\d{2,3}\b/,
    );
    expect(source).not.toMatch(/\b(?:text|bg|border)-(?:white|black)\//);
    expect(source).not.toMatch(/AdditiveBlending/);
  });
});
