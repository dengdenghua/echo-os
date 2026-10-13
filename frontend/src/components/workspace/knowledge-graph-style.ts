/*
 * Shared look for the knowledge relation map (SVG) and the 3D graph (WebGL).
 *
 * ECHO is monochrome: entity types are told apart by shape (and a matching
 * lucide line icon in the legend), drawn in an ink ramp. `core` cyan is the
 * only accent and belongs to the focused entity and its edges. Every colour
 * resolves from an --echo-* token so both views follow Snow and Graphite.
 */
import {
  CircleIcon,
  DiamondIcon,
  HexagonIcon,
  SquareIcon,
  TriangleIcon,
  type LucideIcon,
} from "lucide-react";

export type EntityShape =
  | "circle"
  | "square"
  | "diamond"
  | "triangle"
  | "hexagon";

/** The ink ramp entity types are drawn in. Never a hue. */
export type EntityTone = "ink" | "ink-muted" | "ink-faint";

export interface EntityTypeStyle {
  shape: EntityShape;
  tone: EntityTone;
  icon: LucideIcon;
}

export type GraphToken =
  | "ground"
  | "surface"
  | "surface-raised"
  | "surface-sunken"
  | "line"
  | "line-strong"
  | EntityTone
  | "core";

/** CSS reference to an ECHO token, for SVG and DOM styles. */
export function tokenVar(token: GraphToken): string {
  return `var(--echo-${token})`;
}

/** The one accent: the selected / hovered entity and its edges. */
export const FOCUS_TOKEN = "core" satisfies GraphToken;

export const ENTITY_SHAPE_ICONS: Record<EntityShape, LucideIcon> = {
  circle: CircleIcon,
  square: SquareIcon,
  diamond: DiamondIcon,
  triangle: TriangleIcon,
  hexagon: HexagonIcon,
};

const KNOWN_TYPE_STYLES: Record<
  string,
  { shape: EntityShape; tone: EntityTone }
> = {
  subject: { shape: "circle", tone: "ink" },
  object: { shape: "square", tone: "ink-muted" },
  center: { shape: "hexagon", tone: "ink" },
  neighbor: { shape: "diamond", tone: "ink-faint" },
  other: { shape: "triangle", tone: "ink-faint" },
};

const FALLBACK_SHAPES: EntityShape[] = [
  "circle",
  "square",
  "diamond",
  "triangle",
  "hexagon",
];
const FALLBACK_TONES: EntityTone[] = ["ink-muted", "ink", "ink-faint"];

export const ENTITY_TONES: readonly EntityTone[] = FALLBACK_TONES;
export const ENTITY_SHAPES: readonly EntityShape[] = FALLBACK_SHAPES;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function entityTypeStyle(entityType?: string): EntityTypeStyle {
  const key = entityType?.trim() || "other";
  const known = KNOWN_TYPE_STYLES[key];
  if (known) return { ...known, icon: ENTITY_SHAPE_ICONS[known.shape] };
  const hash = hashString(key);
  const shape = FALLBACK_SHAPES[hash % FALLBACK_SHAPES.length]!;
  const tone =
    FALLBACK_TONES[
      Math.floor(hash / FALLBACK_SHAPES.length) % FALLBACK_TONES.length
    ]!;
  return { shape, tone, icon: ENTITY_SHAPE_ICONS[shape] };
}

/**
 * Concrete colour strings for renderers that cannot use var() (WebGL,
 * canvas 2D). Read from the element's computed style so a nested theme
 * scope (.dark / [data-echo-theme]) resolves its own values.
 */
export interface GraphPalette {
  ground: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  line: string;
  lineStrong: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;
  core: string;
  fontSans: string;
}

type PaletteKey = Exclude<keyof GraphPalette, "fontSans">;

const PALETTE_TOKENS: Record<PaletteKey, GraphToken> = {
  ground: "ground",
  surface: "surface",
  surfaceRaised: "surface-raised",
  surfaceSunken: "surface-sunken",
  line: "line",
  lineStrong: "line-strong",
  ink: "ink",
  inkMuted: "ink-muted",
  inkFaint: "ink-faint",
  core: "core",
};

// Only used when the token stylesheet is absent (unit tests, a detached
// node). Named colours keep the canvas legible without inventing a palette.
const MISSING_TOKEN_FALLBACK: Record<"light" | "dark", GraphPalette> = {
  light: {
    ground: "whitesmoke",
    surface: "white",
    surfaceRaised: "white",
    surfaceSunken: "gainsboro",
    line: "rgba(0, 0, 0, 0.08)",
    lineStrong: "rgba(0, 0, 0, 0.16)",
    ink: "black",
    inkMuted: "dimgray",
    inkFaint: "gray",
    core: "darkcyan",
    fontSans: "system-ui, sans-serif",
  },
  dark: {
    ground: "black",
    surface: "black",
    surfaceRaised: "black",
    surfaceSunken: "black",
    line: "rgba(255, 255, 255, 0.08)",
    lineStrong: "rgba(255, 255, 255, 0.16)",
    ink: "white",
    inkMuted: "darkgray",
    inkFaint: "gray",
    core: "paleturquoise",
    fontSans: "system-ui, sans-serif",
  },
};

export function readGraphPalette(
  element: Element | null,
  dark: boolean,
): GraphPalette {
  const fallback = MISSING_TOKEN_FALLBACK[dark ? "dark" : "light"];
  const computed =
    element && typeof window !== "undefined"
      ? window.getComputedStyle(element)
      : null;
  const read = (name: string, fallbackValue: string) =>
    computed?.getPropertyValue(`--echo-${name}`).trim() || fallbackValue;
  const palette = { ...fallback };
  for (const [key, token] of Object.entries(PALETTE_TOKENS) as Array<
    [PaletteKey, GraphToken]
  >) {
    palette[key] = read(token, fallback[key]);
  }
  palette.fontSans = read("font-sans", fallback.fontSans);
  return palette;
}

export function paletteTone(palette: GraphPalette, tone: EntityTone): string {
  if (tone === "ink") return palette.ink;
  if (tone === "ink-muted") return palette.inkMuted;
  return palette.inkFaint;
}
