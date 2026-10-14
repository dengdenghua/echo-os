import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(process.cwd(), "src/styles/macos-desktop.css"),
  "utf8",
);
const sheet = readFileSync(
  join(process.cwd(), "src/components/ui/sheet.tsx"),
  "utf8",
);

describe("desktop chrome around portalled sheets", () => {
  it("starts side sheets below the menu bar on the desktop", () => {
    expect(sheet).toContain("data-side={side}");
    expect(css).toMatch(
      /body:has\(\.macos-desktop-root \.mac-menu-bar\)\s*\[data-slot="sheet-content"\]:is\(\[data-side="left"\], \[data-side="right"\]\)\s*\{\s*top:\s*25px;\s*height:\s*auto;/,
    );
  });
});
