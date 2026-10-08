import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getEchoAppArtwork } from "./echo-app-artworks";

const SYSTEM_APP_IDS = [
  "system:finder",
  "system:launchpad",
  "echo:/hub",
  "echo:/browser",
  "echo:/photos",
  "echo:/device-link",
  "echo:/storage-center",
  "system:tasks",
  "system:activity-monitor",
  "system:settings",
];

describe("Echo app artworks", () => {
  it.each(SYSTEM_APP_IDS)("renders a monochrome glyph for %s", (appId) => {
    const { container } = render(<>{getEchoAppArtwork(appId)}</>);
    const svg = container.querySelector("svg.echo-app-glyph")!;
    expect(svg).toHaveClass("mac-app-icon-art");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    // 只用 currentColor：底座决定颜色，同一图形在任何底座上都成立。
    const painted = [...svg.querySelectorAll("[fill], [stroke]")]
      .filter((node) => !node.closest("mask"))
      .flatMap((node) => [
        node.getAttribute("fill"),
        node.getAttribute("stroke"),
      ])
      .filter((value): value is string => !!value && value !== "none");
    expect(painted.length).toBeGreaterThan(0);
    expect(new Set(painted)).toEqual(new Set(["currentColor"]));
  });

  it("gives every rendered mask a unique id", () => {
    const { container } = render(
      <>
        {getEchoAppArtwork("system:finder")}
        {getEchoAppArtwork("system:finder")}
        {getEchoAppArtwork("echo:/photos")}
      </>,
    );
    const ids = [...container.querySelectorAll("mask")].map((mask) => mask.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it("returns null for unknown apps so callers fall back to a line icon", () => {
    expect(getEchoAppArtwork("unknown:app")).toBeNull();
    expect(getEchoAppArtwork(undefined)).toBeNull();
  });
});
