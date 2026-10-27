// Renders check frames at the given seconds: node stills.mjs <outdir> 50 60 ...
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
const [out, ...secs] = process.argv.slice(2);
const browserExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const serveUrl = await bundle({ entryPoint: new URL("./src/index.ts", import.meta.url).pathname });
const composition = await selectComposition({ serveUrl, id: "Main", browserExecutable });
for (const s of secs) {
  await renderStill({ serveUrl, composition, frame: Math.round(+s * 30), output: `${out}/${s}.png`, scale: 0.5, browserExecutable });
  console.log("still", s);
}
