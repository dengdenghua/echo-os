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

  it("tighten About below 800 px so it fits at 1280x720 without scrolling", () => {
    const compact = css.slice(css.indexOf("@media (max-height: 800px)"));
    expect(compact).toMatch(
      /^@media \(max-height: 800px\) \{\s*\.macos-desktop-root \.mac-about-dialog \{\s*min-height: 0;/,
    );
    expect(compact).toMatch(
      /\.mac-about-dialog \.mac-about-mark \{\s*width: 72px;\s*height: 72px;/,
    );
  });
});

describe("desktop wallpapers", () => {
  it("draw every choice from an ECHO raster, not a violet or navy gradient", () => {
    // 极光 / 日落 / 午夜 used to hide the raster and paint mesh gradients.
    expect(css).not.toMatch(/\.mac-wallpaper-(aurora|sunset|midnight)\b/);
    expect(css).not.toMatch(/#101745|#172260|#030611|#ee6c70/i);
    expect(css).toMatch(
      /\.macos-desktop-root \.desktop-wallpaper \{[^}]*background-color: var\(--echo-ground\);/,
    );
  });
});
