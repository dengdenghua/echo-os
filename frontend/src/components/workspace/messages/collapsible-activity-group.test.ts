import { beforeEach, describe, expect, it } from "vitest";

import { enUS } from "@/core/i18n/locales/en-US";
import { zhCN } from "@/core/i18n/locales/zh-CN";

import {
  buildHeaderSummary,
  parseUnifiedDiff,
  persistActivityGroupOpenState,
  readActivityGroupOpenState,
  type ActivityItem,
} from "./collapsible-activity-group";

describe("CollapsibleActivityGroup public wording", () => {
  const items: ActivityItem[] = [
    { id: "read-1", label: "Read file" },
    { id: "search-1", label: "Search source" },
  ];

  it("describes grouped operations without exposing tool-call jargon in Chinese", () => {
    const summary = buildHeaderSummary("tool_calls", items, zhCN);

    expect(summary).toContain("操作记录");
    expect(summary).not.toContain("工具调用");
  });

  it("describes grouped operations without exposing tool-call jargon in English", () => {
    const summary = buildHeaderSummary("tool_calls", items, enUS);

    expect(summary).toContain("action record");
    expect(summary?.toLowerCase()).not.toContain("tool call");
  });
});

describe("parseUnifiedDiff", () => {
  it("classifies +/- lines and skips diff meta headers", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,3 +1,4 @@",
      " const ctx = 1;",
      "-const oldLine = 2;",
      "+const newLine = 2;",
      "+const another = 3;",
      " const tail = 4;",
    ].join("\n");

    const rows = parseUnifiedDiff(diff);
    expect(rows.map((r) => r.type)).toEqual([
      "ctx",
      "del",
      "add",
      "add",
      "ctx",
    ]);
    expect(rows.map((r) => r.text)).toEqual([
      " const ctx = 1;",
      "const oldLine = 2;",
      "const newLine = 2;",
      "const another = 3;",
      " const tail = 4;",
    ]);
  });

  it("handles empty and header-only diffs", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
    expect(
      parseUnifiedDiff("--- a/x\n+++ b/x\n@@ -0,0 +1 @@\n\\ No newline"),
    ).toEqual([]);
  });
});

describe("activity group open state storage scope", () => {
  const GROUP_ID = "activity-think-1";

  beforeEach(() => {
    localStorage.clear();
  });

  it("persists under the actor-scoped key, not the bare group id", () => {
    persistActivityGroupOpenState(GROUP_ID, true, "alice");

    expect(localStorage.getItem(`${GROUP_ID}:alice`)).toBe("true");
    expect(localStorage.getItem(GROUP_ID)).toBeNull();
  });

  it("isolates the expand/collapse choice between two accounts", () => {
    persistActivityGroupOpenState(GROUP_ID, true, "alice");
    persistActivityGroupOpenState(GROUP_ID, false, "bob");

    expect(readActivityGroupOpenState(GROUP_ID, "alice")).toBe(true);
    expect(readActivityGroupOpenState(GROUP_ID, "bob")).toBe(false);
  });

  it("migrates the legacy bare group-id key to the current actor once", () => {
    localStorage.setItem(GROUP_ID, "true");

    expect(readActivityGroupOpenState(GROUP_ID, "alice")).toBe(true);
    // 旧键归属当前账号后即删除，避免继续共享
    expect(localStorage.getItem(`${GROUP_ID}:alice`)).toBe("true");
    expect(localStorage.getItem(GROUP_ID)).toBeNull();
  });

  it("returns null when nothing was stored, so the detail level decides", () => {
    expect(readActivityGroupOpenState(GROUP_ID, "alice")).toBeNull();
    expect(readActivityGroupOpenState(null, "alice")).toBeNull();
  });
});
