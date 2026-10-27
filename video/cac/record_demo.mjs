// Records the app footage for the CAC video: one clip per shot, from the real app (no mockups),
// with an events file saying when things happened and where key elements were on screen, so the
// Remotion edit can zoom and pop callouts onto the right spots.
//
//   (cd app && python3 -m http.server 8765)
//   node video/cac/record_demo.mjs [shot ...]     -> video/cac/remotion/public/footage/<shot>.mp4 + .json
//
// Captured at 2880x1620 (viewport 1440x810 at 2x) so zooms up to 1.5x stay sharp in a 1080p edit.
// Event rects are in 1920x1080 frame coordinates.

import { chromium } from "../node_modules/playwright-core/index.mjs";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = "http://localhost:8765/";
const HERE = new URL(".", import.meta.url).pathname;
const OUT = `${HERE}remotion/public/footage/`;
const CSV_PATH = `${HERE}assets/willow-creek-spending-2021-2026.csv`;
const CSV_NAME = "willow-creek-spending-2021-2026.csv";
const VW = 1440, VH = 810, K = 1920 / VW;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });

async function shot(name, { upload = true, start = "#/review" }, script) {
  const dir = `${HERE}.frames/${name}/`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2, colorScheme: "light" });
  // State before the page loads: theme, intro already seen, and (for most shots) the town's file
  // already uploaded, exactly as the app stores it after a real upload.
  const text = readFileSync(CSV_PATH, "utf8");
  await context.addInitScript(([upload, name, text]) => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    localStorage.clear();
    localStorage.setItem("redpen.theme", "light");
    localStorage.setItem("redpen.welcomed", "1");
    sessionStorage.setItem("redpen.read", "1");
    if (upload) localStorage.setItem("redpen.v1", JSON.stringify({ decisions: {}, log: [], settings: null, uploaded: { name, text } }));
  }, [upload, CSV_NAME, text]);
  await context.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const c = document.createElement("div");
      c.id = "__cursor";
      c.style.cssText = "position:fixed;z-index:9999;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(21,33,42,.16);border:2px solid rgba(21,33,42,.7);pointer-events:none;transition:transform .12s;left:-50px;top:-50px";
      document.body.appendChild(c);
      addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
      addEventListener("mousedown", () => (c.style.transform = "scale(.7)"), true);
      addEventListener("mouseup", () => (c.style.transform = ""), true);
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(name, "page error:", e.message));
  await page.goto(BASE + start);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);

  const cdp = await context.newCDPSession(page);
  const frames = [];
  let t0 = null;
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = `${dir}${String(frames.length).padStart(5, "0")}.jpg`;
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp });
    if (t0 === null) t0 = metadata.timestamp;
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: VW * 2, maxHeight: VH * 2, everyNthFrame: 1 });
  // A tiny repaint loop so the screencast keeps sending frames while the page is still.
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:.01;z-index:1";
    document.body.appendChild(d);
    let k = 0;
    setInterval(() => { d.style.background = k++ % 2 ? "#000" : "#fff"; }, 33);
  });
  await page.waitForTimeout(300);

  const events = [];
  const now = () => (t0 === null ? 0 : Date.now() / 1000 - wallAtStart);
  const wallAtStart = Date.now() / 1000;
  const rect = async (sel) => {
    const b = await page.locator(sel).first().boundingBox();
    return b && { x: Math.round(b.x * K), y: Math.round(b.y * K), w: Math.round(b.width * K), h: Math.round(b.height * K) };
  };
  const mark = async (kind, sel) => events.push({ t: +now().toFixed(3), kind, rect: sel ? await rect(sel) : null });

  let mouse = { x: VW / 2, y: VH / 2 };
  // A point of interest that isn't an element (a dot in a chart): a small box around it.
  const markAt = (kind, x, y, r = 14) => events.push({ t: +now().toFixed(3), kind, rect: { x: Math.round((x - r) * K), y: Math.round((y - r) * K), w: Math.round(2 * r * K), h: Math.round(2 * r * K) } });
  const ctl = {
    page, mark, markAt,
    wait: (ms) => page.waitForTimeout(ms),
    async moveTo(x, y, ms = 700) {
      const steps = Math.max(8, Math.round(ms / 16));
      const from = { ...mouse };
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
      }
      mouse = { x, y };
    },
    async moveToEl(sel, ms, dx = 0.5, dy = 0.5) {
      const b = await page.locator(sel).first().boundingBox();
      await ctl.moveTo(b.x + b.width * dx, b.y + b.height * dy, ms);
    },
    async click(sel, ms = 650) {
      await ctl.moveToEl(sel, ms);
      await page.waitForTimeout(180);
      await page.locator(sel).first().click();
    },
    async scrollBy(dy, ms = 900) {
      await page.evaluate(([dy, ms]) => new Promise((r) => {
        const y0 = scrollY, s = performance.now();
        const step = (n) => {
          const k = Math.min(1, (n - s) / ms);
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          scrollTo(0, y0 + dy * e);
          k < 1 ? requestAnimationFrame(step) : r();
        };
        requestAnimationFrame(step);
      }), [dy, ms]);
    },
    async scrollTo(sel, offset = 120, ms = 900) {
      const y = await page.evaluate(([sel, off]) => document.querySelector(sel).getBoundingClientRect().top - off, [sel, offset]);
      await ctl.scrollBy(y, ms);
    },
    async go(hash, settle = 1100) {
      await page.evaluate((h) => { location.hash = h; }, hash);
      await page.waitForTimeout(settle);
    },
  };

  await script(ctl);
  await page.waitForTimeout(400);
  await cdp.send("Page.stopScreencast");
  await context.close();

  // Constant 30 fps from the screencast's real timestamps.
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const dur = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 0.1;
    lines.push(`file '${frames[i].file}'`, `duration ${Math.max(0.001, dur).toFixed(4)}`);
  }
  lines.push(`file '${frames.at(-1).file}'`);
  writeFileSync(`${dir}list.txt`, lines.join("\n"));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${dir}list.txt`,
    "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-movflags", "+faststart", `${OUT}${name}.mp4`]);
  // Screencast timestamps start a little after our wall clock; shift events onto the video's clock.
  const lag = t0 - wallAtStart;
  const shifted = events.map((e) => ({ ...e, t: +(e.t - lag).toFixed(3) }));
  const length = frames.at(-1).t - frames[0].t;
  writeFileSync(`${OUT}${name}.json`, JSON.stringify({ length: +length.toFixed(3), events: shifted }, null, 1));
  rmSync(dir, { recursive: true, force: true });
  console.log(`${name}: ${length.toFixed(1)} s, ${frames.length} frames, events: ${shifted.map((e) => `${e.kind}@${e.t}`).join(" ")}`);
}

const SHOTS = {
  // Line 10-11: the real upload. Start screen, the file lands on the drop zone, Red Pen reads it.
  upload: () => shot("upload", { upload: false, start: "#/start" }, async (c) => {
    await c.mark("start", "#drop");
    await c.wait(1600);
    await c.page.evaluate(() => document.getElementById("drop").classList.add("over"));
    await c.mark("hover", "#drop");
    await c.wait(700);
    await c.page.setInputFiles("#file", { name: "willow-creek-spending-2021-2026.csv", mimeType: "text/csv", buffer: Buffer.from(readFileSync(CSV_PATH)) });
    await c.mark("drop");
    await c.page.waitForSelector(".reader-inner", { timeout: 5000 }).catch(() => {});
    await c.mark("reader");
    await c.page.waitForSelector(".thesis h1", { state: "visible", timeout: 15000 });
    await c.page.waitForFunction(() => document.getElementById("reader").innerHTML === "" || getComputedStyle(document.getElementById("reader")).visibility === "hidden" || document.getElementById("reader").hidden, null, { timeout: 15000 }).catch(() => {});
    await c.wait(300);
    await c.mark("review", ".thesis h1");
    await c.mark("import", ".import-note");
    await c.mark("facts", ".facts");
    await c.wait(1800);
    await c.moveToEl(".thesis h1", 900, 0.75, 0.7);
    await c.wait(5200);
  }),

  // Line 12: the duplicate payment, a note, a decision, then the audit log.
  case: () => shot("case", {}, async (c) => {
    await c.page.evaluate(() => document.querySelector("#import-ok")?.click());
    await c.wait(700);
    await c.mark("queue", ".lrow");
    await c.moveToEl(".lrow", 900, 0.4);
    await c.wait(500);
    await c.click(".lrow", 300);
    await c.wait(1400);
    await c.mark("case", ".headline");
    await c.mark("reasons", ".reasons");
    await c.moveToEl(".reasons", 900, 0.3, 0.3);
    await c.wait(2600);
    await c.scrollTo("#note", 300, 1000);
    await c.wait(400);
    await c.click("#note", 600);
    await c.mark("note", "#note");
    await c.page.keyboard.type("Called vendor. Credit memo requested.", { delay: 45 });
    await c.wait(500);
    await c.mark("decide", '[data-kind="reviewed"]');
    await c.click('[data-kind="reviewed"]', 700);
    await c.wait(1400);
    await c.go("#/method", 900);
    await c.scrollTo(".log", 260, 1200);
    await c.wait(300);
    await c.mark("log", ".log > div");
    await c.moveToEl(".log > div", 800, 0.3);
    await c.wait(3000);
  }),

  // Line 13: three catches, each held long enough for its callout.
  vendors: () => shot("vendors", { start: "#/vendors" }, async (c) => {
    await c.wait(600);
    const row = '.kv > div:has-text("Plumbing")';
    await c.mark("merged", row);
    await c.moveToEl(row, 900, 0.35);
    await c.wait(3200);
  }),
  // Patterns and runway use the built-in sample town: it carries the adopted budgets (a plain
  // spending export has none), and its category ids are stable ("snow").
  patterns: () => shot("patterns", { upload: false, start: "#/patterns/snow" }, async (c) => {
    await c.wait(500);
    await c.scrollBy(260, 900);
    await c.wait(700);
    const dot = await c.page.evaluate(() => {
      const el = [...document.querySelectorAll("#chart circle[fill='var(--pencil)']")][0];
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await c.mark("chart", "#chart");
    if (dot) {
      await c.moveTo(dot.x + 1, dot.y + 1, 1000);
      c.markAt("snow", dot.x, dot.y);
    }
    await c.wait(3200);
  }),
  runway: () => shot("runway", { upload: false, start: "#/review" }, async (c) => {
    await c.wait(500);
    await c.scrollTo(".runway", 140, 900);
    await c.wait(300);
    await c.mark("headline", ".runway h3");
    await c.moveToEl(".runway h3 .pen", 900, 0.5, 0.9);
    await c.wait(1400);
    await c.mark("chart", "#runway-mini");
    await c.wait(2600);
  }),

  // Line 14: contract markup.
  contracts: () => shot("contracts", { start: "#/contracts" }, async (c) => {
    await c.wait(600);
    await c.scrollTo(".mnote", 220, 1000);
    await c.wait(500);
    const n = Math.min(3, await c.page.locator(".mnote").count());
    for (let i = 0; i < n; i++) {
      await c.mark(`note${i}`, `.mnote >> nth=${i}`);
      await c.moveToEl(`.mnote >> nth=${i}`, 700, 0.2);
      await c.wait(1300);
    }
    await c.wait(1200);
  }),

  // Line 18: the scorecard (sample town, where the planted problems are known).
  method: () => shot("method", { upload: false, start: "#/method" }, async (c) => {
    await c.wait(500);
    await c.scrollTo(".scorecard", 200, 1000);
    await c.mark("scorecard", ".scorecard");
    await c.wait(800);
    await c.scrollBy(260, 2600);
    await c.wait(1800);
  }),

  // Line 17: a still of the review queue for the "runs in your browser" graphic.
  still: async () => {
    const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2, colorScheme: "light" });
    const text = readFileSync(CSV_PATH, "utf8");
    await context.addInitScript(([name, text]) => {
      localStorage.setItem("redpen.theme", "light");
      localStorage.setItem("redpen.welcomed", "1");
      sessionStorage.setItem("redpen.read", "1");
      localStorage.setItem("redpen.v1", JSON.stringify({ decisions: {}, log: [], settings: null, uploaded: { name, text } }));
    }, [CSV_NAME, text]);
    const page = await context.newPage();
    await page.goto(BASE + "#/review");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.querySelector("#import-ok")?.click());
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}review-still.png` });
    await context.close();
    console.log("still: review-still.png");
  },
};

const want = process.argv.slice(2);
for (const [name, fn] of Object.entries(SHOTS)) {
  if (!want.length || want.includes(name)) await fn();
}
await browser.close();
