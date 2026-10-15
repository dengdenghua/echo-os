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
  it("fits side sheets between the menu bar and the Dock on the desktop", () => {
    expect(sheet).toContain("data-side={side}");
    expect(css).toMatch(
      /body:has\(\.macos-desktop-root \.mac-menu-bar\)\s*\[data-slot="sheet-content"\]:is\(\[data-side="left"\], \[data-side="right"\]\)\s*\{\s*top:\s*25px;\s*bottom:\s*80px;\s*height:\s*auto;/,
    );
    // At phone width the Dock is 49px tall, 6px above the edge.
    expect(css).toMatch(
      /@media \(max-width: 640px\)\s*\{\s*body:has\(\.macos-desktop-root \.mac-menu-bar\)\s*\[data-slot="sheet-content"\]:is\(\[data-side="left"\], \[data-side="right"\]\)\s*\{\s*bottom:\s*61px;/,
    );
  });
});

describe("Control Center sliders", () => {
  it("fill and thumb follow the theme ink so they read on the snow panel", () => {
    expect(css).toMatch(
      /\.mac-control-slider input \{[^}]*accent-color: var\(--echo-ink\);/,
    );
    expect(css).not.toMatch(/accent-color: white;/);
  });
});

describe("desktop dialogs on short screens", () => {
  it("keep About above the Dock and scroll instead of running under it", () => {
    expect(css).toMatch(/\.mac-dialog-overlay \{[^}]*padding: 12px 12px 96px;/);
    expect(css).toMatch(
      /\.mac-about-dialog \{[^}]*max-height: 100%;\s*overflow-y: auto;/,
    );
  });
});
