/**
 * Shared desktop wallpaper URLs.
 *
 * "Echo" is Echo OS's own default wallpaper (no third-party licence). The
 * renderer uses the WebP variants (2560 wide, 3840 for high-DPI panels) through
 * a shared srcset; the 2560-wide JPEG is for the native liquid-glass addon,
 * which loads the path directly and decodes it outside the renderer.
 *
 * Regenerate with: node scripts/generate-echo-wallpaper.mjs
 */

const WALLPAPER_BASE = "/echo/wallpaper-echo";

/** Primary source: 2560 wide, matches the common full-screen desktop case. */
export const DESKTOP_WALLPAPER_URL = `${WALLPAPER_BASE}-2560.webp`;

/** Candidate set for <img srcSet>; browsers pick by viewport width. */
export const DESKTOP_WALLPAPER_SRCSET = [
  `${WALLPAPER_BASE}-2560.webp 2560w`,
  `${WALLPAPER_BASE}-3840.webp 3840w`,
].join(", ");

/** The wallpaper always fills the window. */
export const DESKTOP_WALLPAPER_SIZES = "100vw";
