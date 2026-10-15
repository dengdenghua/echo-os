/**
 * Shared desktop wallpaper URLs.
 *
 * Every wallpaper is ECHO OS's own (no third-party licence), drawn by
 * scripts/generate-echo-wallpaper.mjs in the ECHO palette: 轨道 (orbit, the
 * default "Echo" ripples), 极光 (aurora), 日落 (sunset) and 午夜 (midnight).
 * The renderer uses the WebP variants (2560 wide, 3840 for high-DPI panels)
 * through a shared srcset; the default also has a 2560-wide JPEG for the
 * native liquid-glass addon, which loads the path directly and decodes it
 * outside the renderer.
 *
 * The 雪白 (snow) desktop uses the snow variant of the same composition; the
 * graphite and neural-glass desktops and the lock screen use the graphite one.
 *
 * Regenerate with: node scripts/generate-echo-wallpaper.mjs
 */

import { createContext, useContext } from "react";

export type DesktopWallpaperTone = "graphite" | "snow";

export type DesktopWallpaperVariant =
  | "orbit"
  | "aurora"
  | "sunset"
  | "midnight";

const WALLPAPER_STEMS: Record<
  DesktopWallpaperVariant,
  Readonly<{ graphite: string; snow: string }>
> = {
  orbit: {
    graphite: "/echo/wallpaper-echo",
    snow: "/echo/wallpaper-echo-snow",
  },
  aurora: {
    graphite: "/echo/wallpaper-aurora",
    snow: "/echo/wallpaper-aurora-snow",
  },
  sunset: {
    graphite: "/echo/wallpaper-sunset",
    snow: "/echo/wallpaper-sunset-snow",
  },
  midnight: {
    graphite: "/echo/wallpaper-midnight",
    snow: "/echo/wallpaper-midnight-snow",
  },
};

function wallpaperBase(
  tone: DesktopWallpaperTone,
  variant: DesktopWallpaperVariant,
): string {
  const stems = WALLPAPER_STEMS[variant] ?? WALLPAPER_STEMS.orbit;
  return tone === "snow" ? stems.snow : stems.graphite;
}

export type DesktopWallpaperSources = Readonly<{
  url: string;
  srcSet: string;
  sizes: string;
}>;

export function desktopWallpaperSources(
  tone: DesktopWallpaperTone,
  variant: DesktopWallpaperVariant = "orbit",
): DesktopWallpaperSources {
  const base = wallpaperBase(tone, variant);
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

/** The desktop provides the chosen wallpaper; everything else shows 轨道. */
export const DesktopWallpaperVariantContext =
  createContext<DesktopWallpaperVariant>("orbit");

export function useDesktopWallpaperSources(): DesktopWallpaperSources {
  return desktopWallpaperSources(
    useContext(DesktopWallpaperToneContext),
    useContext(DesktopWallpaperVariantContext),
  );
}
