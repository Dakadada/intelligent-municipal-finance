// Where every voice line and scene sits in the video. Everything is derived from
// public/timeline.json (line lengths and word times, from placeholder voices or the real takes)
// and public/footage/intro.json (the cold open's cues), so swapping in new takes re-times the
// whole edit with no hand edits.
import timeline from "../public/timeline.json";
import intro from "../public/footage/intro.json";
import type { Speaker } from "./theme";

export const FPS = 30;
export const T = 0.5; // scene transition, seconds (scenes overlap by this much)

export type Word = { w: string; s: number; e: number };
export type Line = { id: number; speaker: Speaker; dur: number; words: Word[]; cue?: Word[]; face: boolean; placeholder: boolean };
const LINES = timeline as Line[];
export const line = (id: number) => LINES.find((l) => l.id === id)!;

// Scenes after the cold open, with the lines spoken over each.
const SCENES: { id: string; lines: number[] }[] = [
  { id: "team", lines: [6, 7, 8] },
  { id: "who", lines: [9] },
  { id: "demo", lines: [10, 11, 12, 13, 14] },
  { id: "how", lines: [15] },
  { id: "code", lines: [16] },
  { id: "browser", lines: [17] },
  { id: "proof", lines: [18] },
  { id: "close", lines: [19] },
  { id: "end", lines: [20] },
];

// Spacing. The rules cap the video at 3:00, so if the takes run long these shrink a little
// (never below a natural breath) before anything else has to be cut.
const LIMIT = 178;
const plan = (k: number) => {
  const inGap = 0.32 * k, lead = 0.5 * k, tail = 0.42 * k, hold = 2.2;
  // The cold open's paper card ("1,885 transactions read. 20 need you.") appears 2.6 s before the
  // end of intro.mp4 (see render_intro.mjs); hold its last frame so the card stays up about 3 s.
  const introUse = intro.length + 1.4;
  const start: Record<number, number> = {};
  for (let i = 1; i <= 5; i++) start[i] = (intro.cues as any)[`l${i}`][0];
  const scenes: { id: string; from: number; to: number; lines: number[] }[] = [{ id: "intro", from: 0, to: introUse, lines: [1, 2, 3, 4, 5] }];
  let t = introUse - T;
  for (const sc of SCENES) {
    const from = t;
    let u = from + (sc.id === "team" ? 0.7 : lead);
    sc.lines.forEach((id, i) => {
      if (i) u += inGap;
      start[id] = u;
      u += line(id).dur;
    });
    const to = u + (sc.id === "end" ? hold : tail + T);
    scenes.push({ id: sc.id, from, to, lines: sc.lines });
    t = to - T;
  }
  return { start, scenes, total: scenes[scenes.length - 1].to };
};
let P = plan(1);
for (let k = 0.95; P.total > LIMIT && k >= 0.6; k -= 0.05) P = plan(k);

export const START = P.start; // seconds, per line id
export const SCENE = Object.fromEntries(P.scenes.map((s) => [s.id, s]));
export const TOTAL_S = P.total;
export const TOTAL = Math.ceil(P.total * FPS);
export const INTRO = intro;
export const LINE_IDS = LINES.map((l) => l.id);

export const f = (sec: number) => Math.round(sec * FPS);
export const sceneFrames = (id: string) => ({ from: f(SCENE[id].from), dur: f(SCENE[id].to) - f(SCENE[id].from) });
export const lineEnd = (id: number) => START[id] + line(id).dur;

// Time (seconds, absolute) when a word of a line is spoken. `match` is the start of the word,
// compared without punctuation or case; `nth` picks a later repeat.
const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9$]/g, "");
export const wordAt = (id: number, match: string, nth = 0, edge: "s" | "e" = "s") => {
  const l = line(id);
  // `cue` is the script's wording timed to the take (captions may show a paraphrase instead).
  const hits = (l.cue ?? l.words).filter((w) => norm(w.w).startsWith(norm(match)));
  const w = hits[Math.min(nth, hits.length - 1)];
  if (!w) throw new Error(`word "${match}" not in line ${id}`);
  return START[id] + w[edge];
};

export const speakerAt = (sec: number): { id: number; speaker: Speaker } | null => {
  for (const l of LINES) if (sec >= START[l.id] - 0.15 && sec <= lineEnd(l.id) + 0.3) return { id: l.id, speaker: l.speaker };
  return null;
};
export const lines = LINES;
