/**
 * Generates Echo OS's original default wallpaper ("Echo").
 *
 * A call and its echo, in the ECHO family's graphite: hairline ripples rise
 * from an Echo Core in the lower left, a fainter answering set from the upper
 * right, over a graphite ground with one cool, desaturated light field. The
 * core is the only colour (the family's stable-sync cyan). Everything is drawn
 * here, so the wallpaper carries no third-party licence.
 *
 * The snow variant is the same composition for the 雪白 desktop: a snow
 * ground, graphite hairline ripples and the snow core (#08788a).
 *
 * The other choices in 壁纸与桌面 are drawn here too, in the same palette:
 *   极光 (aurora)    a ribbon of hairlines carrying a cool core/signal light
 *   日落 (sunset)    a warm-neutral dusk: half ripples rising from a horizon
 *   午夜 (midnight)  near-black graphite, sparse snow points, one faint core
 * Each has a snow variant for the 雪白 desktop, as the default does.
 *
 * Outputs (public/echo/):
 *   wallpaper-echo-2560.webp        renderer default (graphite)
 *   wallpaper-echo-3840.webp        high-DPI panels
 *   wallpaper-echo.jpg              2560-wide JPEG for the native liquid-glass addon
 *   wallpaper-echo-snow-2560.webp   snow desktop
 *   wallpaper-echo-snow-3840.webp   snow desktop, high-DPI panels
 *   wallpaper-echo-snow.jpg         snow, 2560-wide JPEG
 *   wallpaper-{aurora,sunset,midnight}[-snow]-{2560,3840}.webp
 * (The native addon only composites the default wallpaper, so the other
 * choices need no JPEG.)
 *
 * Usage:
 *   node scripts/generate-echo-wallpaper.mjs [--only orbit,aurora,sunset,midnight]
 *   node scripts/generate-echo-wallpaper.mjs --preview out.png [--snow] [--variant aurora]
 */

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const W = 3840;
const H = 2400;

function rings({ cx, cy, count, start, growth, opacity, decay, width, color }) {
  let out = "";
  for (let index = 0; index < count; index += 1) {
    const radius = start * growth ** index;
    const alpha = (opacity * decay ** index).toFixed(4);
    const stroke = (width + index * 0.45).toFixed(2);
    out += `<circle cx="${cx}" cy="${cy}" r="${radius.toFixed(1)}" fill="none" stroke="${color}" stroke-opacity="${alpha}" stroke-width="${stroke}"/>`;
  }
  return out;
}

/** 柔和色域：径向渐变比模糊滤镜平滑，也不会在画布边缘留下硬边。 */
function field(id, { cx, cy, rx, ry, color, opacity }) {
  return {
    def: `<radialGradient id="${id}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${cx} ${cy}) scale(${rx} ${ry})">
      <stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/>
      <stop offset="0.45" stop-color="${color}" stop-opacity="${(opacity * 0.55).toFixed(3)}"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </radialGradient>`,
    shape: `<rect width="${W}" height="${H}" fill="url(#${id})"/>`,
  };
}

/** ECHO graphite and snow palettes for the same composition. */
const TONES = {
  graphite: {
    base: ["#0d0f13", "#0a0b0e", "#07080a"],
    steel: { color: "#2a3340", opacity: 0.85 },
    haze: { color: "#1f2a33", opacity: 0.7 },
    coreGlow: { color: "#6fe3f0", opacity: 0.16 },
    answerGlow: { color: "#eef1f4", opacity: 0.05 },
    ring: "#eef1f4",
    callOpacity: 0.16,
    answerOpacity: 0.09,
    core: "#6fe3f0",
    vignette: { color: "#000", opacity: 0.55 },
  },
  snow: {
    base: ["#f6f7f9", "#eef0f3", "#e6e9ed"],
    steel: { color: "#dde2e8", opacity: 0.8 },
    haze: { color: "#e4e8ed", opacity: 0.7 },
    coreGlow: { color: "#08788a", opacity: 0.09 },
    answerGlow: { color: "#ffffff", opacity: 0.6 },
    ring: "#111317",
    callOpacity: 0.11,
    answerOpacity: 0.06,
    core: "#08788a",
    vignette: { color: "#59616c", opacity: 0.12 },
  },
};

export function echoWallpaperSvg(width = W, height = H, tone = "graphite") {
  const palette = TONES[tone];
  const call = { cx: W * 0.27, cy: H * 0.74 };
  const answer = { cx: W * 0.82, cy: H * 0.2 };
  const fields = [
    field("steel", {
      cx: W * 0.3,
      cy: H * 0.7,
      rx: W * 0.62,
      ry: H * 0.8,
      ...palette.steel,
    }),
    field("haze", {
      cx: W * 0.86,
      cy: H * 0.12,
      rx: W * 0.42,
      ry: H * 0.5,
      ...palette.haze,
    }),
    field("coreGlow", {
      cx: call.cx,
      cy: call.cy,
      rx: 520,
      ry: 520,
      ...palette.coreGlow,
    }),
    field("answerGlow", {
      cx: answer.cx,
      cy: answer.cy,
      rx: 300,
      ry: 300,
      ...palette.answerGlow,
    }),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${palette.base[0]}"/>
      <stop offset="0.55" stop-color="${palette.base[1]}"/>
      <stop offset="1" stop-color="${palette.base[2]}"/>
    </linearGradient>
    ${fields.map((item) => item.def).join("\n    ")}
    <radialGradient id="callFade" cx="${call.cx}" cy="${call.cy}" r="${W * 0.85}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity="1"/>
      <stop offset="0.55" stop-color="#fff" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="answerFade" cx="${answer.cx}" cy="${answer.cy}" r="${W * 0.45}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vignette" cx="${W / 2}" cy="${H / 2}" r="${W * 0.62}" gradientUnits="userSpaceOnUse">
      <stop offset="0.55" stop-color="${palette.vignette.color}" stop-opacity="0"/>
      <stop offset="1" stop-color="${palette.vignette.color}" stop-opacity="${palette.vignette.opacity}"/>
    </radialGradient>
    <mask id="callMask"><rect width="${W}" height="${H}" fill="url(#callFade)"/></mask>
    <mask id="answerMask"><rect width="${W}" height="${H}" fill="url(#answerFade)"/></mask>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#base)"/>
  ${fields.map((item) => item.shape).join("\n  ")}

  <g mask="url(#callMask)">
    ${rings({ ...call, count: 13, start: 150, growth: 1.28, opacity: palette.callOpacity, decay: 0.88, width: 1.6, color: palette.ring })}
  </g>
  <g mask="url(#answerMask)">
    ${rings({ ...answer, count: 8, start: 110, growth: 1.3, opacity: palette.answerOpacity, decay: 0.86, width: 1.4, color: palette.ring })}
  </g>
  <circle cx="${call.cx}" cy="${call.cy}" r="10" fill="${palette.core}"/>
  <circle cx="${call.cx}" cy="${call.cy}" r="26" fill="none" stroke="${palette.core}" stroke-opacity="0.35" stroke-width="1.6"/>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
</svg>`;
}

/** Deterministic PRNG so every run draws the same points. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function polyline(points) {
  return points
    .map(
      ([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`,
    )
    .join("");
}

function vignette(color, opacity, from = 0.55) {
  return `<radialGradient id="vignette" cx="${W / 2}" cy="${H / 2}" r="${W * 0.62}" gradientUnits="userSpaceOnUse">
      <stop offset="${from}" stop-color="${color}" stop-opacity="0"/>
      <stop offset="1" stop-color="${color}" stop-opacity="${opacity}"/>
    </radialGradient>`;
}

const AURORA_TONES = {
  graphite: {
    base: ["#0c0e12", "#090a0d", "#060709"],
    steel: { color: "#1d2630", opacity: 0.8 },
    line: "#6fe3f0",
    fringe: "#a9c7ff",
    lineOpacity: 0.4,
    fringeOpacity: 0.16,
    rayOpacity: 0.07,
    glow: { color: "#6fe3f0", opacity: 0.15 },
    fringeGlow: { color: "#a9c7ff", opacity: 0.08 },
    vignette: { color: "#000", opacity: 0.55 },
  },
  snow: {
    base: ["#f5f6f8", "#eef0f3", "#e7eaee"],
    steel: { color: "#dde3ea", opacity: 0.75 },
    line: "#08788a",
    fringe: "#2f5db8",
    lineOpacity: 0.24,
    fringeOpacity: 0.1,
    rayOpacity: 0.05,
    glow: { color: "#08788a", opacity: 0.08 },
    fringeGlow: { color: "#2f5db8", opacity: 0.05 },
    vignette: { color: "#59616c", opacity: 0.12 },
  },
};

/**
 * 极光: a ribbon of hairlines sweeping across the upper sky. Its width
 * breathes along the curve so the lines fold like a curtain; a soft glow sits
 * behind it and a fainter signal fringe runs above. Core and signal are the
 * only colours, both at low opacity.
 */
export function auroraWallpaperSvg(width = W, height = H, tone = "graphite") {
  const palette = AURORA_TONES[tone];
  const centre = (x) =>
    H * 0.36 +
    H * 0.085 * Math.sin((x / W) * Math.PI * 1.55 + 0.35) +
    H * 0.03 * Math.sin((x / W) * Math.PI * 3.6 + 1.2);
  const thickness = (x) =>
    H *
    0.17 *
    (0.38 + 0.62 * Math.abs(Math.sin((x / W) * Math.PI * 1.25 + 0.5)));
  const lines = 48;
  let ribbon = "";
  for (let index = 0; index < lines; index += 1) {
    const position = index / (lines - 1) - 0.5;
    const weight = (1 - Math.abs(position * 2)) ** 1.4;
    const points = [];
    for (let x = -120; x <= W + 120; x += 24) {
      points.push([x, centre(x) + position * thickness(x)]);
    }
    const fringe = position < -0.32;
    const alpha =
      (fringe ? palette.fringeOpacity : palette.lineOpacity) *
      (0.25 + 0.75 * weight);
    ribbon += `<path d="${polyline(points)}" fill="none" stroke="${fringe ? palette.fringe : palette.line}" stroke-opacity="${alpha.toFixed(4)}" stroke-width="1.6"/>`;
  }
  const glowPoints = [];
  for (let x = -200; x <= W + 200; x += 48) glowPoints.push([x, centre(x)]);
  const fringePoints = glowPoints.map(([x, y]) => [x, y - thickness(x) * 0.55]);
  // Curtain rays: vertical hairlines that only show inside a soft band
  // around the ribbon, brightest just above it, like an aurora's folds.
  let rays = "";
  for (let x = 0; x <= W; x += 22) {
    const top = centre(x) - thickness(x) * 0.5;
    const length =
      H *
      (0.07 + 0.09 * (0.5 + 0.5 * Math.sin(x / 173 + Math.sin(x / 611) * 2)));
    const alpha =
      palette.rayOpacity * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(x / 97 + 1.3)));
    rays += `<line x1="${x}" y1="${(top - length).toFixed(1)}" x2="${x}" y2="${(top + thickness(x) * 0.6).toFixed(1)}" stroke="${palette.line}" stroke-opacity="${alpha.toFixed(4)}" stroke-width="1.6"/>`;
  }
  const steel = field("auroraSteel", {
    cx: W * 0.42,
    cy: H * 0.32,
    rx: W * 0.7,
    ry: H * 0.62,
    ...palette.steel,
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${palette.base[0]}"/>
      <stop offset="0.55" stop-color="${palette.base[1]}"/>
      <stop offset="1" stop-color="${palette.base[2]}"/>
    </linearGradient>
    ${steel.def}
    <filter id="glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><feGaussianBlur stdDeviation="90"/></filter>
    <filter id="fringeGlow" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><feGaussianBlur stdDeviation="120"/></filter>
    <filter id="rayBand" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><feGaussianBlur stdDeviation="110"/></filter>
    <mask id="rayMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><path d="${polyline(fringePoints)}" fill="none" stroke="#fff" stroke-width="520" filter="url(#rayBand)"/></mask>
    <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset="0.18" stop-color="#fff" stop-opacity="0.55"/>
      <stop offset="0.45" stop-color="#fff" stop-opacity="1"/>
      <stop offset="0.78" stop-color="#fff" stop-opacity="0.7"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0.1"/>
    </linearGradient>
    <mask id="sweepMask"><rect width="${W}" height="${H}" fill="url(#sweep)"/></mask>
    ${vignette(palette.vignette.color, palette.vignette.opacity)}
  </defs>

  <rect width="${W}" height="${H}" fill="url(#base)"/>
  ${steel.shape}
  <g mask="url(#sweepMask)">
    <path d="${polyline(fringePoints)}" fill="none" stroke="${palette.fringeGlow.color}" stroke-opacity="${palette.fringeGlow.opacity}" stroke-width="260" filter="url(#fringeGlow)"/>
    <path d="${polyline(glowPoints)}" fill="none" stroke="${palette.glow.color}" stroke-opacity="${palette.glow.opacity}" stroke-width="320" filter="url(#glow)"/>
    <g mask="url(#rayMask)">${rays}</g>
    ${ribbon}
  </g>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
</svg>`;
}

const SUNSET_TONES = {
  graphite: {
    sky: ["#0a0b0e", "#131418", "#221f1c"],
    ground: ["#16130f", "#0b0a09"],
    zenith: { color: "#a9c7ff", opacity: 0.045 },
    horizonGlow: { color: "#e6d6c2", opacity: 0.19 },
    column: { color: "#e6d6c2", opacity: 0.06 },
    ring: "#efe6da",
    ringOpacity: 0.15,
    contour: "#efe6da",
    contourOpacity: 0.085,
    sun: "#f2eadf",
    vignette: { color: "#000", opacity: 0.55 },
  },
  snow: {
    sky: ["#f4f5f7", "#eef0f2", "#e9e4dd"],
    ground: ["#e6e1da", "#eceae7"],
    zenith: { color: "#2f5db8", opacity: 0.035 },
    horizonGlow: { color: "#fffaf3", opacity: 0.7 },
    column: { color: "#fffaf3", opacity: 0.4 },
    ring: "#3b342c",
    ringOpacity: 0.1,
    contour: "#3b342c",
    contourOpacity: 0.06,
    sun: "#8a7d70",
    vignette: { color: "#59616c", opacity: 0.12 },
  },
};

/**
 * 日落: a warm-neutral dusk. The sky runs from graphite at the zenith (a
 * faint signal haze) to a warm grey horizon; half ripples rise from the
 * setting point, and hairline contours below the horizon widen toward the
 * viewer. No orange: the warmth is in the neutrals.
 */
export function sunsetWallpaperSvg(width = W, height = H, tone = "graphite") {
  const palette = SUNSET_TONES[tone];
  const horizon = H * 0.64;
  const sun = { cx: W * 0.63, cy: horizon };
  const zenith = field("zenith", {
    cx: W * 0.16,
    cy: H * 0.04,
    rx: W * 0.62,
    ry: H * 0.6,
    ...palette.zenith,
  });
  const glow = field("horizonGlow", {
    cx: sun.cx,
    cy: horizon,
    rx: W * 0.6,
    ry: H * 0.26,
    ...palette.horizonGlow,
  });
  const column = field("column", {
    cx: sun.cx,
    cy: horizon + H * 0.12,
    rx: W * 0.07,
    ry: H * 0.24,
    ...palette.column,
  });
  let contours = "";
  for (let index = 0; index < 18; index += 1) {
    const y = horizon + 10 * 1.24 ** index;
    if (y > H + 10) break;
    const alpha = palette.contourOpacity * (1 - index / 22);
    const stroke = (1.2 + index * 0.12).toFixed(2);
    contours += `<line x1="0" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}" stroke="${palette.contour}" stroke-opacity="${alpha.toFixed(4)}" stroke-width="${stroke}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="${horizon}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${palette.sky[0]}"/>
      <stop offset="0.6" stop-color="${palette.sky[1]}"/>
      <stop offset="1" stop-color="${palette.sky[2]}"/>
    </linearGradient>
    <linearGradient id="ground" x1="0" y1="${horizon}" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${palette.ground[0]}"/>
      <stop offset="1" stop-color="${palette.ground[1]}"/>
    </linearGradient>
    ${zenith.def}
    ${glow.def}
    ${column.def}
    <radialGradient id="ringFade" cx="${sun.cx}" cy="${sun.cy}" r="${W * 0.62}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity="1"/>
      <stop offset="0.6" stop-color="#fff" stop-opacity="0.4"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="contourFade" cx="${sun.cx}" cy="${horizon}" r="${W * 0.6}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0.15"/>
    </radialGradient>
    <clipPath id="above"><rect width="${W}" height="${horizon}"/></clipPath>
    <mask id="ringMask"><rect width="${W}" height="${H}" fill="url(#ringFade)"/></mask>
    <mask id="contourMask"><rect width="${W}" height="${H}" fill="url(#contourFade)"/></mask>
    ${vignette(palette.vignette.color, palette.vignette.opacity)}
  </defs>

  <rect width="${W}" height="${horizon}" fill="url(#sky)"/>
  <rect y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#ground)"/>
  ${zenith.shape}
  ${glow.shape}
  ${column.shape}
  <g clip-path="url(#above)" mask="url(#ringMask)">
    ${rings({ ...sun, count: 12, start: 120, growth: 1.27, opacity: palette.ringOpacity, decay: 0.87, width: 1.5, color: palette.ring })}
  </g>
  <g mask="url(#contourMask)">${contours}</g>
  <line x1="0" y1="${horizon}" x2="${W}" y2="${horizon}" stroke="${palette.ring}" stroke-opacity="${(palette.ringOpacity * 0.9).toFixed(3)}" stroke-width="1.4"/>
  <g clip-path="url(#above)">
    <circle cx="${sun.cx}" cy="${sun.cy}" r="16" fill="${palette.sun}"/>
  </g>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
</svg>`;
}

const MIDNIGHT_TONES = {
  graphite: {
    base: ["#08090b", "#060708", "#040405"],
    point: "#eef1f4",
    pointOpacity: [0.1, 0.3],
    brightOpacity: [0.5, 0.2],
    haze: { color: "#a9c7ff", opacity: 0.035 },
    steel: { color: "#161b22", opacity: 0.85 },
    core: "#6fe3f0",
    coreGlow: 0.07,
    ring: "#eef1f4",
    ringOpacity: 0.07,
    vignette: { color: "#000", opacity: 0.6 },
  },
  snow: {
    base: ["#e9ecf0", "#e3e7ec", "#dde1e7"],
    point: "#111317",
    pointOpacity: [0.08, 0.22],
    brightOpacity: [0.4, 0.15],
    haze: { color: "#2f5db8", opacity: 0.04 },
    steel: { color: "#cfd5dd", opacity: 0.8 },
    core: "#08788a",
    coreGlow: 0.06,
    ring: "#111317",
    ringOpacity: 0.06,
    vignette: { color: "#59616c", opacity: 0.16 },
  },
};

/**
 * 午夜: near-black graphite with sparse snow points, a faint signal haze and
 * one distant core point with a quiet echo. The snow desktop gets the same
 * night sky inverted onto a deeper snow, so its ink labels stay readable.
 */
export function midnightWallpaperSvg(width = W, height = H, tone = "graphite") {
  const palette = MIDNIGHT_TONES[tone];
  const random = mulberry32(2147);
  let stars = "";
  for (let index = 0; index < 240; index += 1) {
    const x = random() * W;
    const y = random() * H * 0.92;
    const bright = random() > 0.96;
    const radius = bright ? 2.4 + random() * 0.8 : 0.9 + random() * 1.3;
    const [low, span] = bright ? palette.brightOpacity : palette.pointOpacity;
    const alpha = low + random() * span;
    stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(2)}" fill="${palette.point}" fill-opacity="${alpha.toFixed(3)}"/>`;
  }
  const core = { cx: W * 0.74, cy: H * 0.3 };
  const haze = field("haze", {
    cx: W * 0.8,
    cy: H * 0.16,
    rx: W * 0.5,
    ry: H * 0.55,
    ...palette.haze,
  });
  const steel = field("steel", {
    cx: W * 0.18,
    cy: H * 0.9,
    rx: W * 0.6,
    ry: H * 0.6,
    ...palette.steel,
  });
  const coreGlow = field("coreGlow", {
    cx: core.cx,
    cy: core.cy,
    rx: 260,
    ry: 260,
    color: palette.core,
    opacity: palette.coreGlow,
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="${palette.base[0]}"/>
      <stop offset="0.6" stop-color="${palette.base[1]}"/>
      <stop offset="1" stop-color="${palette.base[2]}"/>
    </linearGradient>
    ${haze.def}
    ${steel.def}
    ${coreGlow.def}
    <radialGradient id="echoFade" cx="${core.cx}" cy="${core.cy}" r="${W * 0.4}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <mask id="echoMask"><rect width="${W}" height="${H}" fill="url(#echoFade)"/></mask>
    ${vignette(palette.vignette.color, palette.vignette.opacity, 0.5)}
  </defs>

  <rect width="${W}" height="${H}" fill="url(#base)"/>
  ${steel.shape}
  ${haze.shape}
  ${stars}
  ${coreGlow.shape}
  <g mask="url(#echoMask)">
    ${rings({ ...core, count: 6, start: 70, growth: 1.36, opacity: palette.ringOpacity, decay: 0.84, width: 1.3, color: palette.ring })}
  </g>
  <circle cx="${core.cx}" cy="${core.cy}" r="5" fill="${palette.core}" fill-opacity="0.85"/>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
</svg>`;
}

/** Every wallpaper choice: its file stem per tone and its drawing. */
const VARIANTS = {
  orbit: {
    tones: { graphite: "wallpaper-echo", snow: "wallpaper-echo-snow" },
    draw: echoWallpaperSvg,
    jpeg: true,
  },
  aurora: {
    tones: { graphite: "wallpaper-aurora", snow: "wallpaper-aurora-snow" },
    draw: auroraWallpaperSvg,
  },
  sunset: {
    tones: { graphite: "wallpaper-sunset", snow: "wallpaper-sunset-snow" },
    draw: sunsetWallpaperSvg,
  },
  midnight: {
    tones: { graphite: "wallpaper-midnight", snow: "wallpaper-midnight-snow" },
    draw: midnightWallpaperSvg,
  },
};

async function writeTone(outDir, variant, tone) {
  const spec = VARIANTS[variant];
  const name = spec.tones[tone];
  const source = Buffer.from(spec.draw(W, H, tone));
  const master = await sharp(source).png().toBuffer();
  await sharp(master)
    .resize(3840, 2400)
    .webp({ quality: 84 })
    .toFile(resolve(outDir, `${name}-3840.webp`));
  await sharp(master)
    .resize(2560, 1600)
    .webp({ quality: 86 })
    .toFile(resolve(outDir, `${name}-2560.webp`));
  if (!spec.jpeg) return;
  await sharp(master)
    .resize(2560, 1600)
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(resolve(outDir, `${name}.jpg`));
}

async function main() {
  const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const previewIndex = process.argv.indexOf("--preview");
  if (previewIndex !== -1) {
    const target = process.argv[previewIndex + 1];
    const tone = process.argv.includes("--snow") ? "snow" : "graphite";
    const variantIndex = process.argv.indexOf("--variant");
    const variant =
      variantIndex === -1 ? "orbit" : process.argv[variantIndex + 1];
    const spec = VARIANTS[variant];
    if (!spec) throw new Error(`unknown wallpaper variant: ${variant}`);
    const source = Buffer.from(spec.draw(W, H, tone));
    await sharp(source).resize(1280, 800).png().toFile(target);
    console.log(`preview -> ${target}`);
    return;
  }
  const outDir = resolve(frontendRoot, "public/echo");
  await mkdir(outDir, { recursive: true });
  const onlyIndex = process.argv.indexOf("--only");
  const variants =
    onlyIndex === -1
      ? Object.keys(VARIANTS)
      : process.argv[onlyIndex + 1].split(",").map((name) => name.trim());
  for (const variant of variants) {
    if (!VARIANTS[variant])
      throw new Error(`unknown wallpaper variant: ${variant}`);
    for (const tone of Object.keys(VARIANTS[variant].tones)) {
      await writeTone(outDir, variant, tone);
    }
  }
  console.log(`wallpaper (${variants.join(", ")}) -> ${outDir}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
