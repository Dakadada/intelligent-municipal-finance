// Records a scripted walkthrough of the real app (no mockups) using Chrome's
// screencast, then encodes it at a constant 30 fps.
//
//   python3 -m http.server 8765        (from app/)
//   node video/render-demo.mjs         -> video/out/demo.mp4

import { chromium } from "playwright-core";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = "http://localhost:8765/";
const dir = new URL("./frames/demo/", import.meta.url).pathname;
const out = new URL("./out/", import.meta.url).pathname;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 810 },
  deviceScaleFactor: 4 / 3, // 1920x1080 output with desktop-sized type
  colorScheme: "light",
});
// A soft visible cursor, since screen recordings don't include the real one.
await context.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.style.cssText = "position:fixed;z-index:9999;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(21,33,42,.18);border:2px solid rgba(21,33,42,.75);pointer-events:none;transition:transform .12s;left:-50px;top:-50px";
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => (c.style.transform = "scale(.7)"), true);
    addEventListener("mouseup", () => (c.style.transform = ""), true);
  });
});
const page = await context.newPage();
page.on("pageerror", (e) => console.error("page error:", e.message));

// ---- capture ----
const cdp = await context.newCDPSession(page);
const frames = [];
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const file = `${dir}${String(frames.length).padStart(5, "0")}.jpg`;
  writeFileSync(file, Buffer.from(data, "base64"));
  frames.push({ file, t: metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});

// Holds are stretched so the voiceover has room to breathe.
const HOLD = 1.55;
const wait = (ms) => page.waitForTimeout(ms * HOLD);
let mouse = { x: 720, y: 405 };
async function moveTo(x, y, ms = 700) {
  const steps = Math.max(8, Math.round(ms / 16));
  const from = { ...mouse };
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
  }
  mouse = { x, y };
}
async function moveToEl(sel, ms) {
  const b = await page.locator(sel).first().boundingBox();
  await moveTo(b.x + b.width / 2, b.y + b.height / 2, ms);
}
async function click(sel, ms = 650) {
  await moveToEl(sel, ms);
  await wait(150);
  await page.locator(sel).first().click();
}
async function scrollBy(dy, ms = 900) {
  await page.evaluate(([dy, ms]) => new Promise((r) => {
    const y0 = scrollY, t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      scrollTo(0, y0 + dy * e);
      k < 1 ? requestAnimationFrame(step) : r();
    };
    requestAnimationFrame(step);
  }), [dy, ms]);
}
async function go(hash, settle = 900) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await wait(settle);
}

// Fresh state: no saved decisions, intro plays.
await page.goto(BASE);
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("redpen.theme", "light"); });
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
await page.goto(BASE + "#/review");

// 1. The opening read-through, landing on the review queue.
await wait(6200);
await wait(2600);
await moveTo(700, 420, 900);
await scrollBy(430, 1400);
await wait(1500);

// 2. Open the top finding: a duplicate payment.
await click(".lrow >> nth=0");
await wait(2600);
await moveToEl("#strip", 900);
await wait(1200);
await scrollBy(420, 1200);
await wait(1800);
await click("#note", 600);
await page.keyboard.type("Called vendor. Credit memo requested.", { delay: 38 });
await wait(400);
await click('[data-kind="reviewed"]', 700);
await wait(1800);

// 3. Duplicate hidden behind two spellings of a vendor's name.
await go("#/vendors", 1200);
await moveTo(520, 360, 800);
await wait(2200);

// 4. Spending patterns: snow removal billed in July.
await go("#/patterns/snow", 1400);
await scrollBy(300, 900);
await wait(800);
const flagged = await page.evaluate(() => {
  const c = [...document.querySelectorAll("#chart circle[fill='var(--pencil)']")][0];
  if (!c) return null;
  const b = c.getBoundingClientRect();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
});
if (flagged) { await moveTo(flagged.x, flagged.y, 1100); await wait(2400); }

// 5. Budget runway.
await go("#/runway", 1500);
await moveTo(900, 560, 900);
await moveTo(1250, 520, 1600);
await wait(1800);

// 6. Contract markup.
await go("#/contracts", 1400);
await scrollBy(330, 900);
await wait(600);
const notes = await page.locator(".mnote").count();
for (let i = 0; i < Math.min(3, notes); i++) { await moveToEl(`.mnote >> nth=${i}`, 700); await wait(1100); }
await scrollBy(-330, 700);
const snowCard = page.locator(".ccard", { hasText: "Snow" });
if (await snowCard.count()) { await click('.ccard:has-text("Snow")', 700); await wait(1800); }

// 7. Sensitivity: thresholds are the clerk's to set.
await go("#/data", 1200);
const slider = await page.locator("#s-similarPct").boundingBox();
await moveTo(slider.x + slider.width * 0.17, slider.y + slider.height / 2, 800);
await page.mouse.down();
await moveTo(slider.x + slider.width * 0.6, slider.y + slider.height / 2, 1400);
await wait(500);
await moveTo(slider.x + slider.width * 0.17, slider.y + slider.height / 2, 1200);
await page.mouse.up();
await wait(1200);

// 8. Proof: the scorecard.
await go("#/method", 1400);
await scrollBy(120, 700);
await wait(2600);

await cdp.send("Page.stopScreencast");
await browser.close();

// Constant-frame-rate encode from the screencast's real timestamps.
const lines = [];
for (let i = 0; i < frames.length; i++) {
  const dur = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 0.5;
  lines.push(`file '${frames[i].file}'`, `duration ${Math.max(0.001, dur).toFixed(4)}`);
}
lines.push(`file '${frames.at(-1).file}'`);
writeFileSync(`${dir}list.txt`, lines.join("\n"));
execFileSync("ffmpeg", [
  "-y", "-f", "concat", "-safe", "0", "-i", `${dir}list.txt`,
  "-vf", "scale=1920:1080:flags=lanczos,fps=30", "-c:v", "libx264", "-preset", "slow", "-crf", "17",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${out}demo.mp4`,
], { stdio: "inherit" });
console.log(`wrote ${out}demo.mp4 from ${frames.length} frames, ${(frames.at(-1).t - frames[0].t).toFixed(1)} s`);
