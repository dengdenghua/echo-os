/**
 * Shared desktop wallpaper URLs.
 *
 * "Echo" is Echo OS's own default wallpaper (no third-party licence). The
 * renderer uses the WebP variants (2560 wide, 3840 for high-DPI panels) through
 * a shared srcset; the 2560-wide JPEG is for the native liquid-glass addon,
 * which loads the path directly and decodes it outside the renderer.
 *
 * The 雪白 (snow) desktop uses the snow variant of the same composition; the
 * graphite and neural-glass desktops and the lock screen use the graphite one.
 *
 * Regenerate with: node scripts/generate-echo-wallpaper.mjs
 */

import { createContext, useContext } from "react";

export type DesktopWallpaperTone = "graphite" | "snow";

function wallpaperBase(tone: DesktopWallpaperTone): string {
  return tone === "snow" ? "/echo/wallpaper-echo-snow" : "/echo/wallpaper-echo";
}

export type DesktopWallpaperSources = Readonly<{
  url: string;
  srcSet: string;
  sizes: string;
}>;

export function desktopWallpaperSources(
  tone: DesktopWallpaperTone,
): DesktopWallpaperSources {
  const base = wallpaperBase(tone);
  return {
    // Primary source: 2560 wide, matches the common full-screen desktop case.
    url: `${base}-2560.webp`,
    // Candidate set for <img srcSet>; browsers pick by viewport width.
    srcSet: [`${base}-2560.webp 2560w`, `${base}-3840.webp 3840w`].join(", "),
    // The wallpaper always fills the window.
    sizes: "100vw",
  };
}

const GRAPHITE = desktopWallpaperSources("graphite");

/** Primary source: 2560 wide, matches the common full-screen desktop case. */
export const DESKTOP_WALLPAPER_URL = GRAPHITE.url;

/** Candidate set for <img srcSet>; browsers pick by viewport width. */
export const DESKTOP_WALLPAPER_SRCSET = GRAPHITE.srcSet;

/** The wallpaper always fills the window. */
export const DESKTOP_WALLPAPER_SIZES = GRAPHITE.sizes;

/** The desktop provides its theme's tone; everything else stays graphite. */
export const DesktopWallpaperToneContext =
  createContext<DesktopWallpaperTone>("graphite");

export function useDesktopWallpaperSources(): DesktopWallpaperSources {
  return desktopWallpaperSources(useContext(DesktopWallpaperToneContext));
}
