// Renders cover.html to a 600x800 JPEG for the application form.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 600, height: 800 }, deviceScaleFactor: 1 });
await page.goto("http://localhost:8766/video/cover.html");
await page.waitForFunction(() => window.coverReady === true);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL("./out/cover.jpg", import.meta.url).pathname, type: "jpeg", quality: 92 });
await browser.close();
console.log("wrote out/cover.jpg");
