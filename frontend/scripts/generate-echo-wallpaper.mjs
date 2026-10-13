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
 * Outputs (public/echo/):
 *   wallpaper-echo-2560.webp        renderer default (graphite)
 *   wallpaper-echo-3840.webp        high-DPI panels
 *   wallpaper-echo.jpg              2560-wide JPEG for the native liquid-glass addon
 *   wallpaper-echo-snow-2560.webp   snow desktop
 *   wallpaper-echo-snow-3840.webp   snow desktop, high-DPI panels
 *   wallpaper-echo-snow.jpg         snow, 2560-wide JPEG
 *
 * Usage: node scripts/generate-echo-wallpaper.mjs [--preview out.png [--snow]]
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

async function writeTone(outDir, tone) {
  const name =
    tone === "graphite" ? "wallpaper-echo" : `wallpaper-echo-${tone}`;
  const source = Buffer.from(echoWallpaperSvg(W, H, tone));
  const master = await sharp(source).png().toBuffer();
  await sharp(master)
    .resize(3840, 2400)
    .webp({ quality: 84 })
    .toFile(resolve(outDir, `${name}-3840.webp`));
  await sharp(master)
    .resize(2560, 1600)
    .webp({ quality: 86 })
    .toFile(resolve(outDir, `${name}-2560.webp`));
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
    const source = Buffer.from(echoWallpaperSvg(W, H, tone));
    await sharp(source).resize(1280, 800).png().toFile(target);
    console.log(`preview -> ${target}`);
    return;
  }
  const outDir = resolve(frontendRoot, "public/echo");
  await mkdir(outDir, { recursive: true });
  await writeTone(outDir, "graphite");
  await writeTone(outDir, "snow");
  console.log(`wallpaper -> ${outDir}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
