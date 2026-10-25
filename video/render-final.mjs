// Renders the end card, then stitches opening + app walkthrough + end card
// with short crossfades into video/out/red-pen-demo.mp4.
import { chromium } from "playwright-core";
import { mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const FPS = 30;
const END = 6;
const here = (p) => new URL(p, import.meta.url).pathname;
const dir = here("./frames/end/");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto("http://localhost:8766/video/endcard.html");
await page.waitForFunction(() => window.cardReady === true);
for (let i = 0; i < FPS * END; i++) {
  await page.evaluate((t) => window.renderAt(t), i / FPS);
  await page.screenshot({ path: `${dir}${String(i).padStart(5, "0")}.png` });
}
await browser.close();
execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", `${dir}%05d.png`,
  "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", here("./out/end.mp4")], { stdio: "inherit" });

const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
const hook = here("./out/hook.mp4"), demo = here("./out/demo.mp4"), end = here("./out/end.mp4");
const X = 0.6; // crossfade seconds
const off1 = dur(hook) - X;
const off2 = off1 + dur(demo) - X;
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", hook, "-i", demo, "-i", end,
  "-filter_complex",
  `[0:v]fps=30,format=yuv420p[a];[1:v]fps=30,format=yuv420p[b];[2:v]fps=30,format=yuv420p[c];` +
  `[a][b]xfade=transition=fade:duration=${X}:offset=${off1}[ab];[ab][c]xfade=transition=fade:duration=${X}:offset=${off2}[v]`,
  "-map", "[v]", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  here("./out/red-pen-demo.mp4")], { stdio: "inherit" });
console.log("wrote out/red-pen-demo.mp4", dur(here("./out/red-pen-demo.mp4")).toFixed(1), "s");
