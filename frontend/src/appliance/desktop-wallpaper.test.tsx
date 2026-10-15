import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DesktopWallpaperToneContext,
  DesktopWallpaperVariantContext,
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

describe("desktop wallpaper choices", () => {
  it("serves each choice's own ECHO raster in the desktop's tone", () => {
    expect(desktopWallpaperSources("graphite", "aurora").url).toBe(
      "/echo/wallpaper-aurora-2560.webp",
    );
    expect(desktopWallpaperSources("snow", "aurora").srcSet).toBe(
      "/echo/wallpaper-aurora-snow-2560.webp 2560w, /echo/wallpaper-aurora-snow-3840.webp 3840w",
    );
    expect(desktopWallpaperSources("snow", "sunset").url).toBe(
      "/echo/wallpaper-sunset-snow-2560.webp",
    );
    expect(desktopWallpaperSources("graphite", "midnight").url).toBe(
      "/echo/wallpaper-midnight-2560.webp",
    );
    expect(desktopWallpaperSources("snow", "midnight").url).toBe(
      "/echo/wallpaper-midnight-snow-2560.webp",
    );
  });

  it("draws the chosen wallpaper, not 轨道, behind the desktop", () => {
    const { container } = render(
      <DesktopWallpaperToneContext.Provider value="snow">
        <DesktopWallpaperVariantContext.Provider value="sunset">
          <MacDesktopWallpaperArtwork />
        </DesktopWallpaperVariantContext.Provider>
      </DesktopWallpaperToneContext.Provider>,
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/echo/wallpaper-sunset-snow-2560.webp",
    );
  });
});
