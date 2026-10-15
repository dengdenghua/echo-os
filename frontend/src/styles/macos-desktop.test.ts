import { readdirSync, readFileSync } from "node:fs";
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

describe("system app scrims and shadows", () => {
  it("dim and lift with the graphite tokens, not navy slate", () => {
    const appliance = join(process.cwd(), "src/appliance");
    const offenders = readdirSync(appliance)
      .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
      // Approval dialogs belong to the governance surface; left as they are.
      .filter((name) => !name.endsWith("approval-dialog.tsx"))
      .flatMap((name) =>
        readFileSync(join(appliance, name), "utf8")
          .split("\n")
          .filter((line) =>
            /bg-slate-950|shadow-slate-9|rgba\(15,\s*23,\s*42/.test(line),
          )
          .map((line) => `${name}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
    expect(css).toMatch(
      /\.mac-dialog-overlay \{[^}]*background: color-mix\(in srgb, var\(--echo-scrim\) 10%, transparent\);/,
    );
  });
});

describe("window scroll containment", () => {
  it("clips window content and the desktop instead of letting script scroll them", () => {
    // overflow: hidden is still a scroll container: a scrollIntoView() on a
    // tab sliding in past the window edge shifted the content 35 px sideways.
    expect(css).toMatch(/\n\.mac-window-content \{[^}]*overflow: clip;[^}]*\}/);
    expect(css).not.toMatch(/\.mac-window-content \{[^}]*overflow: hidden;/);
    const page = readFileSync(
      join(process.cwd(), "src/app/desktop/page.tsx"),
      "utf8",
    );
    expect(page).toContain(
      '"macos-desktop-root relative h-screen overflow-clip bg-transparent"',
    );
  });
});

describe("snow menus and sliders", () => {
  it("draw text menus on an opaque film so nothing reads through them", () => {
    expect(css).toMatch(
      /:is\(\.mac-menu-dropdown, \.mac-desktop-context-menu, \.mac-spotlight\) \{\s*background-color: var\(--liquid-custom-colour\) !important;/,
    );
  });

  it("fill the Control Center level with the theme ink, not white", () => {
    expect(css).toMatch(
      /\.mac-liquid-crystal \.mac-control-slider input \{[^}]*var\(--echo-ink\) 0 var\(--mac-control-progress\)/,
    );
    expect(css).not.toMatch(
      /rgba\(255, 255, 255, 0\.94\) 0 var\(--mac-control-progress\)/,
    );
  });
});

describe("Spotlight selection", () => {
  it("marks only the selected result with core; hover just lightens", () => {
    expect(css).toMatch(
      /\.mac-spotlight-result\.is-selected \{\s*color: var\(--echo-ink\) !important;\s*background: color-mix\(in srgb, var\(--echo-core\) 22%/,
    );
    expect(css).toMatch(
      /\.mac-spotlight-result:hover:not\(\.is-selected\) \{[^}]*var\(--echo-ink\) 6%/,
    );
    expect(css).not.toMatch(
      /\.mac-spotlight-result:is\(:hover, \.is-selected\)/,
    );
  });
});
