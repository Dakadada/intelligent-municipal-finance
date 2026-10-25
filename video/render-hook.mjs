// Renders the three.js opening frame by frame (exact timing, no dropped
// frames), then encodes it with ffmpeg.
//
//   python3 -m http.server 8766        (from the repo root)
//   node video/render-hook.mjs         -> video/out/hook.mp4

import { chromium } from "playwright-core";
import { mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const FPS = 30;
const DURATION = 27;
const dir = new URL("./frames/hook/", import.meta.url).pathname;
const out = new URL("./out/", import.meta.url).pathname;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto("http://localhost:8766/video/hook.html");
await page.waitForFunction(() => window.hookReady === true, null, { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);

const total = FPS * DURATION;
for (let i = 0; i < total; i++) {
  await page.evaluate((t) => window.renderAt(t), i / FPS);
  await page.screenshot({ path: `${dir}${String(i).padStart(5, "0")}.png` });
  if (i % 90 === 0) console.log(`frame ${i}/${total}`);
}
await browser.close();

execFileSync("ffmpeg", [
  "-y", "-framerate", String(FPS), "-i", `${dir}%05d.png`,
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  `${out}hook.mp4`,
], { stdio: "inherit" });
console.log(`wrote ${out}hook.mp4`);
