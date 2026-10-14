import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DesktopWallpaperToneContext,
  desktopWallpaperSources,
} from "./desktop-wallpaper";
import { MacDesktopWallpaperArtwork } from "./macos-shell";

describe("desktop wallpaper tone", () => {
  it("serves the snow variant of the Echo wallpaper for the snow desktop", () => {
    expect(desktopWallpaperSources("snow")).toEqual({
      url: "/echo/wallpaper-echo-snow-2560.webp",
      srcSet:
        "/echo/wallpaper-echo-snow-2560.webp 2560w, /echo/wallpaper-echo-snow-3840.webp 3840w",
      sizes: "100vw",
    });
  });

  it("keeps the graphite wallpaper outside a snow desktop", () => {
    const { container, rerender } = render(<MacDesktopWallpaperArtwork />);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/echo/wallpaper-echo-2560.webp",
    );

    rerender(
      <DesktopWallpaperToneContext.Provider value="snow">
        <MacDesktopWallpaperArtwork />
      </DesktopWallpaperToneContext.Provider>,
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/echo/wallpaper-echo-snow-2560.webp",
    );
  });
});
