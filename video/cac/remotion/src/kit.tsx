// Shared pieces: time-warped footage, camera zooms, stat pop-ups, captions, the face bubble.
import React from "react";
import { AbsoluteFill, Easing, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, F, SPEAKERS } from "./theme";
import { FPS, START, f, line, lineEnd, lines, speakerAt } from "./schedule";

export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const ease = Easing.bezier(0.65, 0, 0.35, 1);
export const ramp = (x: number, a: number, b: number, e = easeOut) =>
  interpolate(x, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });

// Absolute time in seconds for a component placed inside a Sequence that starts at `base` seconds.
export const useT = (base: number) => base + useCurrentFrame() / FPS;

/* ------------------------------------------------------------------ footage */

// Plays a recorded clip so that chosen moments in it land on chosen moments in the edit
// (usually the word that describes them). Between anchors the clip speeds up or slows down a
// little; after it runs out it holds on its last frame.
export type Anchor = [number, number]; // [edit time (abs s), footage time (s)]
export const Footage: React.FC<{ name: string; base: number; from: number; to: number; anchors: Anchor[]; length: number }> = ({ name, base, from, to, anchors, length }) => {
  const a = [...anchors].sort((p, q) => p[0] - q[0]);
  const pts: Anchor[] = [[from, Math.max(0, a[0][1] - (a[0][0] - from))], ...a, [to, a[a.length - 1][1] + (to - a[a.length - 1][0])]];
  const end = length - 0.05;
  const segs: { t0: number; t1: number; f0: number; rate: number }[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [t0, f0] = pts[i], [t1, f1] = pts[i + 1];
    if (t1 - t0 < 1 / FPS) continue;
    const rate = Math.max(0.55, Math.min(1.9, (f1 - f0) / (t1 - t0)));
    segs.push({ t0, t1, f0: Math.max(0, Math.min(f0, end)), rate });
  }
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Img src={staticFile(`still/${name}-last.png`)} style={{ width: "100%", height: "100%" }} />
      {segs.map((s, i) => {
        const playable = Math.max(0, (end - s.f0) / s.rate);
        const dur = Math.min(f(s.t1) - f(s.t0), Math.floor(playable * FPS));
        if (dur < 1) return null;
        return (
          <Sequence key={i} from={f(s.t0) - f(base)} durationInFrames={dur} layout="none">
            <AbsoluteFill>
              <OffthreadVideo src={staticFile(`footage/${name}.mp4`)} trimBefore={Math.round(s.f0 * FPS)} playbackRate={s.rate} muted style={{ width: "100%", height: "100%" }} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------- zoom */

// Camera keyframes in 1920x1080 frame coordinates: at time t (abs s), scale s centred on (x, y).
export type Key = { t: number; s: number; x?: number; y?: number };
export const Zoom: React.FC<{ base: number; keys: Key[]; children: React.ReactNode }> = ({ base, keys, children }) => {
  const t = useT(base);
  const k = keys.map((q) => ({ x: 960, y: 540, ...q }));
  let s = k[0].s, x = k[0].x, y = k[0].y;
  for (let i = 0; i + 1 < k.length; i++) {
    if (t >= k[i].t) {
      const p = ramp(t, k[i].t, k[i + 1].t, ease);
      s = k[i].s + (k[i + 1].s - k[i].s) * p;
      x = k[i].x + (k[i + 1].x - k[i].x) * p;
      y = k[i].y + (k[i + 1].y - k[i].y) * p;
    }
  }
  if (t >= k[k.length - 1].t) ({ s, x, y } = k[k.length - 1]);
  const tx = Math.min(0, Math.max(1920 - 1920 * s, 960 - x * s));
  const ty = Math.min(0, Math.max(1080 - 1080 * s, 540 - y * s));
  return <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${s})` }}>{children}</AbsoluteFill>;
};
// Zoom onto a rect from a footage events file.
export const on = (r: { x: number; y: number; w: number; h: number }, s: number, t: number): Key => ({ t, s, x: r.x + r.w / 2, y: r.y + r.h / 2 });

/* ------------------------------------------------------------------- pop-up */

// A stat card that rises in when its word is spoken. Paper card, ink text, a red-pencil rule.
export const Callout: React.FC<{ base: number; at: number; until: number; x: number; y: number; big: string; small?: string; tone?: "pencil" | "ink" | "ok"; anchor?: "left" | "right" | "center" }> = ({ base, at, until, x, y, big, small, tone = "pencil", anchor = "left" }) => {
  const t = useT(base);
  const p = ramp(t, at, at + 0.45);
  const q = 1 - ramp(t, until - 0.3, until);
  if (p <= 0 || q <= 0) return null;
  const col = tone === "pencil" ? C.pencil : tone === "ok" ? C.ok : C.ink;
  const tx = anchor === "left" ? "0" : anchor === "right" ? "-100%" : "-50%";
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(${tx}, ${(1 - p) * 26}px) scale(${0.94 + 0.06 * p})`, opacity: p * q, transformOrigin: "left center" }}>
      <div style={{ background: C.sheet, borderRadius: 14, padding: "18px 26px 20px", boxShadow: "0 1px 0 #d4e1d6, 0 30px 60px -24px rgba(21,33,42,.45)", borderLeft: `6px solid ${col}`, maxWidth: 760 }}>
        <div style={{ font: `700 46px/1.1 ${F.display}`, color: col, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>{big}</div>
        {small && <div style={{ font: `600 22px/1.35 ${F.ui}`, color: C.ink2, marginTop: 6 }}>{small}</div>}
      </div>
    </div>
  );
};

// A hand-drawn red-pencil ellipse that strokes itself around a region (frame coordinates).
export const PenLoop: React.FC<{ base: number; at: number; until: number; x: number; y: number; w: number; h: number }> = ({ base, at, until, x, y, w, h }) => {
  const t = useT(base);
  const p = ramp(t, at, at + 0.55, ease);
  const q = 1 - ramp(t, until - 0.3, until);
  if (p <= 0 || q <= 0) return null;
  const rx = w / 2 + 18, ry = h / 2 + 14, cx = x + w / 2, cy = y + h / 2;
  const d = `M ${cx - rx * 0.2} ${cy - ry * 1.05} C ${cx + rx * 0.9} ${cy - ry * 1.15}, ${cx + rx * 1.12} ${cy + ry * 0.7}, ${cx + rx * 0.1} ${cy + ry * 1.02} S ${cx - rx * 1.15} ${cy + ry * 0.4}, ${cx - rx * 0.9} ${cy - ry * 0.55} S ${cx + rx * 0.2} ${cy - ry * 1.25}, ${cx + rx * 0.55} ${cy - ry * 0.95}`;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: q }}>
      <path d={d} fill="none" stroke={C.pencil} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
    </svg>
  );
};

/* ----------------------------------------------------------------- captions */

type Chunk = { words: { w: string; s: number; e: number }[]; s: number; e: number };
const chunksOf = (id: number): Chunk[] => {
  const l = line(id);
  const out: Chunk[] = [];
  let cur: Chunk["words"] = [];
  l.words.forEach((w, i) => {
    cur.push({ w: w.w, s: START[id] + w.s, e: START[id] + w.e });
    const brk = /[.?!]$/.test(w.w) || (/[,:]$/.test(w.w) && cur.length >= 3) || cur.length >= 7;
    if (brk || i === l.words.length - 1) {
      out.push({ words: cur, s: cur[0].s, e: cur[cur.length - 1].e });
      cur = [];
    }
  });
  return out;
};
const CHUNKS = lines.filter((l) => l.id >= 6).flatMap((l) => chunksOf(l.id).map((c, i, arr) => ({ ...c, until: i + 1 < arr.length ? arr[i + 1].s : lineEnd(l.id) + 0.25 })));

export const Captions: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const c = CHUNKS.find((k) => t >= k.s - 0.08 && t < k.until);
  if (!c) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 56, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ maxWidth: 1240, padding: "12px 26px 14px", borderRadius: 14, background: "rgba(13,20,25,.82)", font: `600 40px/1.25 ${F.ui}`, color: "#fff", textAlign: "center", letterSpacing: "-0.005em" }}>
        {c.words.map((w, i) => (
          <span key={i} style={{ opacity: t >= w.s - 0.04 ? 1 : 0.55 }}>{w.w}{i < c.words.length - 1 ? " " : ""}</span>
        ))}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------- face bubble */

// The speaker's face in a corner circle (lines 9 onward). Until the takes arrive it shows the
// speaker's initials with a ring that pulses on each spoken word.
export const FaceBubble: React.FC<{ fromLine: number }> = ({ fromLine }) => {
  const t = useCurrentFrame() / FPS;
  // Hold the last speaker through pauses so the bubble doesn't flicker between lines.
  let cur: { id: number; speaker: keyof typeof SPEAKERS } | null = null;
  for (const l of lines) if (l.id >= fromLine && t >= START[l.id] - 0.15) cur = { id: l.id, speaker: l.speaker };
  if (!cur) return null;
  const first = START[fromLine] - 0.15;
  const appear = ramp(t, first, first + 0.4);
  const swap = ramp(t, START[cur.id] - 0.15, START[cur.id] + 0.2);
  const who = SPEAKERS[cur.speaker];
  const l = line(cur.id);
  const speaking = speakerAt(t)?.id === cur.id && l.words.some((w) => t >= START[cur!.id] + w.s && t <= START[cur!.id] + w.e);
  const D = 236;
  return (
    <div style={{ position: "absolute", right: 46, bottom: 44, width: D, opacity: appear, transform: `scale(${0.9 + 0.1 * appear})`, transformOrigin: "bottom right" }}>
      <div style={{ width: D, height: D, borderRadius: "50%", overflow: "hidden", position: "relative", background: who.tint, boxShadow: `0 0 0 6px ${C.sheet}, 0 0 0 ${speaking ? 10 : 7}px ${C.pencil}, 0 24px 50px -16px rgba(0,0,0,.55)`, transform: `scale(${0.92 + 0.08 * swap})` }}>
        {l.face ? (
          <Sequence from={f(START[cur.id] - 0.0)} layout="none">
            <OffthreadVideo src={staticFile(`face/${cur.id}.mp4`)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Sequence>
        ) : (
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: `radial-gradient(circle at 50% 35%, ${who.tint}, #0d1419 120%)` }}>
            <div style={{ font: `600 78px ${F.display}`, color: "#fff", opacity: 0.92 }}>{who.initials}</div>
            <div style={{ font: `600 15px ${F.ui}`, color: "rgba(255,255,255,.7)", letterSpacing: "0.12em", marginTop: 4 }}>VIDEO TAKE HERE</div>
          </AbsoluteFill>
        )}
      </div>
      <div style={{ marginTop: 14, textAlign: "center", font: `700 22px ${F.ui}`, color: C.ink, background: C.sheet, borderRadius: 999, padding: "6px 14px", boxShadow: "0 8px 20px -10px rgba(0,0,0,.4)" }}>{who.name}</div>
    </div>
  );
};

/* ------------------------------------------------------------ backgrounds */

// Red Pen's ledger paper: pale green-grey with faint ruled lines, as on the app's empty states.
export const Paper: React.FC<{ children?: React.ReactNode; lines?: boolean }> = ({ children, lines: ruled = true }) => (
  <AbsoluteFill style={{ background: C.paper }}>
    {ruled && <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(0deg, transparent 0 47px, rgba(169,194,174,.35) 47px 48px)` }} />}
    <AbsoluteFill style={{ left: 150, width: 2, background: "rgba(200,49,43,.22)" }} />
    {children}
  </AbsoluteFill>
);

// Scene-level enter/exit: a soft fade with a slight push, matched to the T overlap.
export const SceneFade: React.FC<{ dur: number; children: React.ReactNode; push?: number }> = ({ dur, children, push = 40 }) => {
  const fr = useCurrentFrame();
  const n = f(0.5);
  const i = interpolate(fr, [0, n], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  const o = interpolate(fr, [dur - n, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: Math.min(i, o), transform: `translateY(${(1 - i) * push}px)` }}>{children}</AbsoluteFill>;
};

export const Logo: React.FC<{ size?: number; dark?: boolean }> = ({ size = 64, dark }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.3 }}>
    <svg width={size} height={size} viewBox="0 0 64 64">
      <rect width="64" height="64" rx="12" fill={C.ink} />
      <path d="M14 22h36M14 32h36M14 42h36" stroke="#a9c2ae" strokeWidth="2" />
      <path d="M12 36c2-14 34-18 40-8 5 9-14 18-30 15-9-2-11-8-6-14" fill="none" stroke="#ff6a5c" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
    <div style={{ font: `700 ${size * 0.78}px ${F.display}`, color: dark ? "#fff" : C.ink, letterSpacing: "-0.01em" }}>Red Pen</div>
  </div>
);
