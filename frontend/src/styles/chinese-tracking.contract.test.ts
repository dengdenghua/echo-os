import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Brand rule: English eyebrows and telemetry are uppercase and tracked;
 * Chinese is never letter-spaced (BRAND.md 字体). Workbench text is
 * translated, so a tracked label renders as spaced-out Chinese in the zh UI
 * (运 营 闭 环). Tracking stays only on labels that are Latin in every locale.
 *
 * Ratchet: a new tracked label anywhere in the workbench fails here. If it
 * really is Latin-only (an ID, a code, an English eyebrow), add it below.
 */
const ROOTS = [
  "src/components/workspace",
  "src/app/workspace",
  "src/components/ui",
  "src/components/store",
  "src/components/ai-elements",
];

const TRACKING =
  /\btracking-(?:eyebrow|caps|wide|wider|widest|\[0?\.\d+em\])(?=[\s"'`\]]|$)/g;

/** Latin-only tracked labels, per file. */
const LATIN_ONLY: Record<string, number> = {
  // AGENT BLUEPRINT, CREATE AGENT, SHORT BRIEF, Ctrl/⌘ + Enter, Agent ID,
  // GENERATOR LOADOUT, ROLE, SCENE, CAPABILITY PACK, TEMPLATE REF
  "src/app/workspace/agents/new/page.tsx": 10,
  // Channel Ops
  "src/app/workspace/channels/page.tsx": 1,
  // ECHO FLOW
  "src/app/workspace/design/page.tsx": 1,
  // Story map
  "src/app/workspace/narrative/page.tsx": 1,
  // Convergence · best-so-far …
  "src/app/workspace/reflex/gepa-panel.tsx": 1,
  // variant / uses / win-rate table head
  "src/app/workspace/reflex/variant-performance-panel.tsx": 1,
  // REC, view keys, Prompt Preview, CHARACTER FILE (only while saved),
  // PERSONA, code name
  "src/components/workspace/agents/agent-role-profile-dialog.tsx": 6,
  // permission ids
  "src/components/workspace/agents/arms-editor.tsx": 1,
  // device login code
  "src/components/workspace/coder-engine-control.tsx": 1,
  // keyboard shortcuts
  "src/components/ui/dropdown-menu.tsx": 1,
  // digits
  "src/components/ui/number-ticker.tsx": 1,
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("Chinese is never letter-spaced in the workbench", () => {
  it("keeps tracking only on Latin-only labels", () => {
    const found: Record<string, number> = {};
    for (const root of ROOTS) {
      for (const file of sourceFiles(join(process.cwd(), root))) {
        const count = readFileSync(file, "utf8").match(TRACKING)?.length ?? 0;
        if (count > 0) {
          found[relative(process.cwd(), file).replaceAll("\\", "/")] = count;
        }
      }
    }
    expect(found).toEqual(LATIN_ONLY);
  });
});
