// Opt-in: real APK + production device gateway, no mocked network responses.
import { chromium } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const [state, evidence, url = "http://127.0.0.1:3090/mirror-lab.html"] =
  process.argv.slice(2);
if (!state || !evidence)
  throw new Error(
    "Usage: node scripts/phone-mirror-live.mjs STATE EVIDENCE [URL]",
  );
const { token } = JSON.parse(
  await readFile(path.join(state, "operator.json"), "utf8"),
);
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    acceptDownloads: true,
  });
  await context.addCookies([
    {
      name: "echo_session",
      value: token,
      url: new URL(url).origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  const screen = page.getByAltText("手机实时画面");
  await screen.waitFor({ state: "visible", timeout: 30_000 });
  await screen.evaluate((image) => image.decode());
  const imageSize = await screen.evaluate((image) => [
    image.naturalWidth,
    image.naturalHeight,
  ]);
  assert(imageSize[0] > 0 && imageSize[1] > 0);
  await page.screenshot({
    path: path.join(evidence, "desktop-phone-mirror.png"),
    fullPage: true,
  });
  const payload = Buffer.from(
    Array.from({ length: 20_037 }, (_, index) => index % 251),
  );
  const filename = `browser-upload-${Date.now()}.bin`;
  await page.getByLabel("发送文件到手机").setInputFiles({
    name: filename,
    mimeType: "application/octet-stream",
    buffer: payload,
  });
  await page.getByText(/校验完成/).waitFor({ timeout: 30_000 });
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: `下载 ${filename}`, exact: true })
    .click();
  const download = await downloadEvent;
  const destination = path.join(evidence, "browser-roundtrip.bin");
  await download.saveAs(destination);
  assert.deepEqual(await readFile(destination), payload);
  await page.getByText(/校验完成/).waitFor();
  await page.screenshot({
    path: path.join(evidence, "desktop-file-complete.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 760, height: 800 });
  const screenBounds = await screen.boundingBox();
  const backBounds = await page
    .getByRole("button", { name: "返回", exact: true })
    .boundingBox();
  assert(
    screenBounds &&
      backBounds &&
      backBounds.y >= screenBounds.y + screenBounds.height,
    "Narrow viewport must keep the navigation row below the phone image",
  );
  await page.screenshot({
    path: path.join(evidence, "desktop-narrow.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  const report = {
    livePhoneFrame: imageSize,
    browserUploadDownloadBytes: payload.length,
    sha256: createHash("sha256").update(payload).digest("hex"),
    pageErrors: errors,
  };
  await writeFile(
    path.join(evidence, "browser-proof.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
