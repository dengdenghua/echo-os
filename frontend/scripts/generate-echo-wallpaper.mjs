/**
 * Generates Echo OS's original default wallpaper ("Echo").
 *
 * A call and its echo, in the ECHO family's graphite: hairline ripples rise
 * from an Echo Core in the lower left, a fainter answering set from the upper
 * right, over a graphite ground with one cool, desaturated light field. The
 * core is the only colour (the family's stable-sync cyan). Everything is drawn
 * here, so the wallpaper carries no third-party licence.
 *
 * Outputs (public/echo/):
 *   wallpaper-echo-2560.webp   renderer default
 *   wallpaper-echo-3840.webp   high-DPI panels
 *   wallpaper-echo.jpg         2560-wide JPEG for the native liquid-glass addon
 *
 * Usage: node scripts/generate-echo-wallpaper.mjs [--preview out.png]
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

export function echoWallpaperSvg(width = W, height = H) {
  const call = { cx: W * 0.27, cy: H * 0.74 };
  const answer = { cx: W * 0.82, cy: H * 0.2 };
  const fields = [
    field("steel", {
      cx: W * 0.3,
      cy: H * 0.7,
      rx: W * 0.62,
      ry: H * 0.8,
      color: "#2a3340",
      opacity: 0.85,
    }),
    field("haze", {
      cx: W * 0.86,
      cy: H * 0.12,
      rx: W * 0.42,
      ry: H * 0.5,
      color: "#1f2a33",
      opacity: 0.7,
    }),
    field("coreGlow", {
      cx: call.cx,
      cy: call.cy,
      rx: 520,
      ry: 520,
      color: "#6fe3f0",
      opacity: 0.16,
    }),
    field("answerGlow", {
      cx: answer.cx,
      cy: answer.cy,
      rx: 300,
      ry: 300,
      color: "#eef1f4",
      opacity: 0.05,
    }),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d0f13"/>
      <stop offset="0.55" stop-color="#0a0b0e"/>
      <stop offset="1" stop-color="#07080a"/>
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
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.55"/>
    </radialGradient>
    <mask id="callMask"><rect width="${W}" height="${H}" fill="url(#callFade)"/></mask>
    <mask id="answerMask"><rect width="${W}" height="${H}" fill="url(#answerFade)"/></mask>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#base)"/>
  ${fields.map((item) => item.shape).join("\n  ")}

  <g mask="url(#callMask)">
    ${rings({ ...call, count: 13, start: 150, growth: 1.28, opacity: 0.16, decay: 0.88, width: 1.6, color: "#eef1f4" })}
  </g>
  <g mask="url(#answerMask)">
    ${rings({ ...answer, count: 8, start: 110, growth: 1.3, opacity: 0.09, decay: 0.86, width: 1.4, color: "#eef1f4" })}
  </g>
  <circle cx="${call.cx}" cy="${call.cy}" r="10" fill="#6fe3f0"/>
  <circle cx="${call.cx}" cy="${call.cy}" r="26" fill="none" stroke="#6fe3f0" stroke-opacity="0.35" stroke-width="1.6"/>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
</svg>`;
}

async function main() {
  const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const previewIndex = process.argv.indexOf("--preview");
  const source = Buffer.from(echoWallpaperSvg());
  if (previewIndex !== -1) {
    const target = process.argv[previewIndex + 1];
    await sharp(source).resize(1280, 800).png().toFile(target);
    console.log(`preview -> ${target}`);
    return;
  }
  const outDir = resolve(frontendRoot, "public/echo");
  await mkdir(outDir, { recursive: true });
  const master = await sharp(source).png().toBuffer();
  await sharp(master)
    .resize(3840, 2400)
    .webp({ quality: 84 })
    .toFile(resolve(outDir, "wallpaper-echo-3840.webp"));
  await sharp(master)
    .resize(2560, 1600)
    .webp({ quality: 86 })
    .toFile(resolve(outDir, "wallpaper-echo-2560.webp"));
  await sharp(master)
    .resize(2560, 1600)
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(resolve(outDir, "wallpaper-echo.jpg"));
  console.log(`wallpaper -> ${outDir}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
