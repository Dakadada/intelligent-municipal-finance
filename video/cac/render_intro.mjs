// Renders the three.js cold open (intro.html) frame by frame, timed to the voice lines 1-5 in
// remotion/public/timeline.json, then encodes it for the Remotion edit.
//
//   python3 -m http.server 8766          (from the repo root)
//   node video/cac/render_intro.mjs       -> remotion/public/footage/intro.mp4 + intro.json
//
// intro.json holds the cue for each line (seconds into the opening) and the clip length; the
// edit places the voices at those cues, so picture and sound always agree.

import { chromium } from "../node_modules/playwright-core/index.mjs";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const FPS = 30;
const HERE = new URL(".", import.meta.url).pathname;
const PUB = `${HERE}remotion/public/`;
const dir = `${HERE}.frames/intro/`;
const preview = process.argv.includes("--preview"); // every 10th frame only, for a quick look

const timeline = JSON.parse(readFileSync(`${PUB}timeline.json`, "utf8"));
const dur = Object.fromEntries(timeline.map((l) => [l.id, l.dur]));
// Line 1 starts after a beat of darkness; a short breath between lines; a longer pause
// before "Red Pen does." so the answer lands.
const GAPS = { 1: 0.6, 2: 0.45, 3: 0.45, 4: 0.5, 5: 0.6 };
const cues = {};
let t = 0;
for (let id = 1; id <= 5; id++) {
  t += GAPS[id];
  cues[`l${id}`] = [+t.toFixed(3), +(t + dur[id]).toFixed(3)];
  t += dur[id];
}
// Mirrors the constants in intro.html; trimmed to just after the card's pen loop finishes.
const S1 = cues.l5[0] - 0.5 + 5.6;
const length = +(S1 + 3.3 + 2.6).toFixed(3);

rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(`http://localhost:8766/video/cac/intro.html?cues=${encodeURIComponent(JSON.stringify(cues))}`);
await page.waitForFunction(() => window.hookReady === true, null, { timeout: 90000 });
await page.evaluate(() => document.fonts.ready);

const total = Math.round(FPS * length);
const step = preview ? 10 : 1;
let n = 0;
for (let i = 0; i < total; i += step) {
  await page.evaluate((t) => window.renderAt(t), i / FPS);
  await page.screenshot({ path: `${dir}${String(n++).padStart(5, "0")}.png` });
  if (i % 150 === 0) console.log(`frame ${i}/${total}`);
}
await browser.close();

const out = `${PUB}footage/intro${preview ? "-preview" : ""}.mp4`;
execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS / step), "-i", `${dir}%05d.png`,
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: "inherit" });
if (!preview) writeFileSync(`${PUB}footage/intro.json`, JSON.stringify({ cues, length }, null, 1));
rmSync(dir, { recursive: true, force: true });
console.log(`wrote ${out}`, JSON.stringify({ cues, length }));
