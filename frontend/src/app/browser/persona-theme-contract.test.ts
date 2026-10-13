import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const browserSource = readFileSync(
  join(process.cwd(), "src/app/browser/page.tsx"),
  "utf8",
);
const workspaceSource = readFileSync(
  join(process.cwd(), "src/app/workspace/layout.tsx"),
  "utf8",
);
const stylesSource = readFileSync(
  join(process.cwd(), "src/styles/globals.css"),
  "utf8",
);

describe("shared persona theme scope", () => {
  it("uses the same persona theme contract in workspace and AI browser shells", () => {
    // The workspace shell composes its classes through cn() rather than a
    // literal className string, so match the class pair itself. What the
    // contract cares about is that both shells carry persona-shell plus their
    // own shell class, not which syntax applies them.
    expect(workspaceSource).toContain("persona-shell workspace-shell");
    expect(workspaceSource).toContain("data-persona-theme={personaThemeId}");
    expect(browserSource).toContain("persona-shell browser-shell");
    expect(browserSource).toContain("data-persona-theme={personaThemeId}");
    expect(browserSource).toContain(
      "workspacePresetForAgent(activeAgentId).themeId",
    );
  });

  it("never lets a persona recolour the ECHO accent", () => {
    // core is the only accent: personas keep their identity in avatar and
    // name, so no persona-scoped rule may override primary, ring or sidebar.
    const personaRules =
      stylesSource.match(
        /\.persona-shell\[data-persona-theme[^{]*\{[^}]*\}/g,
      ) ?? [];
    for (const rule of personaRules) {
      expect(rule).not.toMatch(
        /--(primary|ring|sidebar-primary|sidebar-ring)\s*:/,
      );
    }
    expect(stylesSource).not.toContain("--persona-primary");
  });
});
