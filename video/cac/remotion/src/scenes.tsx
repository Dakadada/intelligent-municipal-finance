// One component per scene. Each gets `base`, the scene's start in absolute seconds, and places
// everything with absolute times from schedule.ts (usually the moment a word is spoken).
import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import { C, F, SPEAKERS, Speaker } from "./theme";
import { FPS, INTRO, SCENE, START, f, line, lineEnd, wordAt } from "./schedule";
import { Anchor, Callout, Footage, Logo, Paper, PenLoop, Zoom, ease, easeOut, on, ramp, useT } from "./kit";
import upload from "../public/footage/upload.json";
import kase from "../public/footage/case.json";
import vendors from "../public/footage/vendors.json";
import patterns from "../public/footage/patterns.json";
import runway from "../public/footage/runway.json";
import contracts from "../public/footage/contracts.json";
import method from "../public/footage/method.json";
import sheet from "../public/code/sheet.json";
import tests from "../public/code/tests.json";
import code from "../public/code/isolationForest.json";

type Clip = { length: number; events: { t: number; kind: string; rect: { x: number; y: number; w: number; h: number } | null }[] };
const ev = (c: Clip, kind: string) => c.events.find((e) => e.kind === kind)!;

/* -------------------------------------------------------------- 1. intro */

// The cold open, then its last frame (the paper card) held until the cut to the team card.
export const Intro: React.FC = () => (
  <AbsoluteFill style={{ background: C.night }}>
    <Img src={staticFile("still/intro-last.png")} style={{ width: "100%", height: "100%" }} />
    <Sequence durationInFrames={Math.floor(INTRO.length * FPS) - 1} layout="none">
      <AbsoluteFill>
        <OffthreadVideo src={staticFile("footage/intro.mp4")} muted style={{ width: "100%", height: "100%" }} />
      </AbsoluteFill>
    </Sequence>
  </AbsoluteFill>
);

/* --------------------------------------------------------------- 2. team */

const Tile: React.FC<{ base: number; who: Speaker; id: number; idx: number }> = ({ base, who, id, idx }) => {
  const t = useT(base);
  const s = SPEAKERS[who];
  const enter = ramp(t, base + 0.15 + idx * 0.12, base + 0.75 + idx * 0.12);
  const lit = ramp(t, START[id] - 0.1, START[id] + 0.35);
  const name = ramp(t, START[id], START[id] + 0.5);
  const under = ramp(t, START[id] + 0.25, START[id] + 0.9, ease);
  const l = line(id);
  return (
    <div style={{ width: 420, opacity: enter, transform: `translateY(${(1 - enter) * 50}px) scale(${1 + 0.03 * lit})` }}>
      <div style={{ width: 420, height: 500, borderRadius: 20, overflow: "hidden", position: "relative", background: s.tint, boxShadow: `0 0 0 ${2 + 4 * lit}px ${lit > 0.05 ? C.pencil : C.rule}, 0 40px 80px -40px rgba(21,33,42,.6)`, filter: `saturate(${0.35 + 0.65 * lit}) brightness(${0.8 + 0.2 * lit})` }}>
        {l.face ? (
          <Sequence from={f(START[id]) - f(base)} layout="none">
            <OffthreadVideo src={staticFile(`face/${id}.mp4`)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Sequence>
        ) : (
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: `radial-gradient(circle at 50% 30%, ${s.tint}, #0d1419 130%)` }}>
            <div style={{ font: `600 150px ${F.display}`, color: "#fff", opacity: 0.9 }}>{s.initials}</div>
            <div style={{ font: `600 18px ${F.ui}`, color: "rgba(255,255,255,.7)", letterSpacing: "0.14em", marginTop: 8 }}>VIDEO TAKE HERE</div>
          </AbsoluteFill>
        )}
      </div>
      <div style={{ marginTop: 26, textAlign: "center", position: "relative", height: 70 }}>
        <div style={{ font: `600 46px ${F.display}`, color: C.ink, opacity: 0.25 + 0.75 * name }}>{s.name}</div>
        <svg width={420} height={20} style={{ position: "absolute", left: 0, top: 58 }}>
          <path d="M60 10 C 160 4, 270 16, 360 8" fill="none" stroke={C.pencil} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - under} />
        </svg>
      </div>
    </div>
  );
};

export const Team: React.FC<{ base: number }> = ({ base }) => {
  const t = useT(base);
  const logoAt = wordAt(8, "red", 0);
  const lp = ramp(t, logoAt - 0.1, logoAt + 0.5);
  return (
    <Paper>
      <div style={{ position: "absolute", top: 120, left: 0, right: 0, textAlign: "center", font: `600 26px ${F.ui}`, letterSpacing: "0.18em", color: C.ink3 }}>THE TEAM · IOWA'S 3RD DISTRICT</div>
      <div style={{ position: "absolute", top: 210, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 70 }}>
        <Tile base={base} who="david" id={6} idx={0} />
        <Tile base={base} who="srihari" id={7} idx={1} />
        <Tile base={base} who="alex" id={8} idx={2} />
      </div>
      <div style={{ position: "absolute", bottom: 150, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: lp, transform: `translateY(${(1 - lp) * 20}px)` }}>
        <Logo size={64} />
      </div>
    </Paper>
  );
};

/* ---------------------------------------------------------------- 3. who */

const Icon: React.FC<{ kind: string }> = ({ kind }) => {
  const p = { fill: "none", stroke: C.ink, strokeWidth: 3.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "clerk") return <svg width={84} height={84} viewBox="0 0 48 48"><rect x="9" y="6" width="30" height="36" rx="3" {...p} /><path d="M15 15h18M15 22h18M15 29h11" {...p} /><path d="M27 33l4 4 8-9" {...p} stroke={C.pencil} /></svg>;
  if (kind === "council") return <svg width={84} height={84} viewBox="0 0 48 48"><path d="M6 18L24 8l18 10M9 18v18M17 18v18M31 18v18M39 18v18M5 40h38" {...p} /></svg>;
  return <svg width={84} height={84} viewBox="0 0 48 48"><path d="M8 40V22l16-12 16 12v18z" {...p} /><path d="M19 40V29h10v11" {...p} /><circle cx="36" cy="12" r="5" {...p} stroke={C.pencil} /></svg>;
};

export const Who: React.FC<{ base: number }> = ({ base }) => {
  const t = useT(base);
  const head = ramp(t, base + 0.2, base + 0.8);
  const cards = [
    { at: wordAt(9, "clerks"), icon: "clerk", h: "City clerks", p: "Review every payment, not a sample." },
    { at: wordAt(9, "councils"), icon: "council", h: "Finance officers & councils", p: "See what needs a vote before it's signed." },
    { at: wordAt(9, "small"), icon: "town", h: "Small towns", p: "No auditor on staff. 3 in 4 Iowa towns have under 2,500 people." },
  ];
  const lede = ramp(t, wordAt(9, "marks") - 0.2, wordAt(9, "marks") + 0.4);
  return (
    <Paper>
      <div style={{ position: "absolute", left: 230, top: 150, opacity: head, transform: `translateY(${(1 - head) * 30}px)` }}>
        <div style={{ font: `600 26px ${F.ui}`, letterSpacing: "0.18em", color: C.pencil }}>WHO IT'S FOR</div>
        <div style={{ font: `600 84px/1.05 ${F.display}`, color: C.ink, marginTop: 18, maxWidth: 1300, letterSpacing: "-0.015em" }}>
          Reads every payment.{" "}
          <span style={{ opacity: 0.3 + 0.7 * lede, position: "relative" }}>
            Marks only what a person should review.
            <svg width={700} height={24} style={{ position: "absolute", left: 0, bottom: -18 }}><path d="M6 14 C 200 4, 480 20, 690 8" fill="none" stroke={C.pencil} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - lede} /></svg>
          </span>
        </div>
      </div>
      <div style={{ position: "absolute", left: 230, top: 540, display: "flex", gap: 40 }}>
        {cards.map((c, i) => {
          const p = ramp(t, c.at - 0.15, c.at + 0.45);
          return (
            <div key={i} style={{ width: 440, padding: "34px 34px 36px", background: C.sheet, borderRadius: 18, boxShadow: "0 1px 0 #d4e1d6, 0 30px 60px -36px rgba(21,33,42,.5)", opacity: p, transform: `translateX(${(1 - p) * 80}px)` }}>
              <Icon kind={c.icon} />
              <div style={{ font: `600 40px ${F.display}`, color: C.ink, marginTop: 18 }}>{c.h}</div>
              <div style={{ font: `400 25px/1.4 ${F.ui}`, color: C.ink2, marginTop: 10 }}>{c.p}</div>
            </div>
          );
        })}
      </div>
    </Paper>
  );
};

/* --------------------------------------------------------------- 4. demo */

// The export open in a spreadsheet, then the file lifts off toward Red Pen.
const Spreadsheet: React.FC<{ base: number; lift: number }> = ({ base, lift }) => {
  const t = useT(base);
  const rows = sheet as string[][];
  const scroll = (t - base) * 34;
  const lp = ramp(t, lift, lift + 0.9, ease);
  const widths = [150, 320, 160, 300, 170, 150, 380];
  return (
    <Paper lines={false}>
      <div style={{ position: "absolute", left: 120, top: 90, width: 1680, height: 900, background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 40px 90px -40px rgba(21,33,42,.55)", border: "1px solid #cfd8d2", transform: `scale(${1 - 0.06 * lp})`, opacity: 1 - 0.4 * lp }}>
        <div style={{ height: 58, background: "#eef1ef", display: "flex", alignItems: "center", gap: 10, padding: "0 20px", borderBottom: "1px solid #d6dcd8" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 15, height: 15, borderRadius: 8, background: c }} />)}
          <div style={{ marginLeft: 20, font: `600 22px ${F.ui}`, color: C.ink }}>willow-creek-spending-2021-2026.csv</div>
          <div style={{ marginLeft: "auto", font: `400 20px ${F.ui}`, color: C.ink3 }}>1,885 rows · exported from accounting software</div>
        </div>
        <div style={{ display: "flex", background: "#f6f8f7", borderBottom: "2px solid #c7d1cb" }}>
          {rows[0].map((h, i) => <div key={i} style={{ width: widths[i], padding: "12px 14px", font: `700 20px ${F.ui}`, color: C.ink, borderRight: "1px solid #e1e6e3" }}>{h}</div>)}
        </div>
        <div style={{ transform: `translateY(${-scroll}px)` }}>
          {rows.slice(1).map((r, k) => (
            <div key={k} style={{ display: "flex", borderBottom: "1px solid #edf0ee", background: k % 2 ? "#fbfcfb" : "#fff" }}>
              {r.map((c, i) => <div key={i} style={{ width: widths[i], padding: "10px 14px", font: `400 19px ${i === 2 ? F.mono : F.ui}`, color: C.ink2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: i === 2 ? "right" : "left", borderRight: "1px solid #f0f2f1" }}>{c}</div>)}
            </div>
          ))}
        </div>
      </div>
      {/* the file itself, dragged off toward the app */}
      <div style={{ position: "absolute", left: 960 - 150, top: 470, opacity: ramp(t, lift - 0.2, lift + 0.1), transform: `translate(${lp * 900}px, ${-lp * 120}px) scale(${1 - 0.3 * lp}) rotate(${-4 * lp}deg)` }}>
        <div style={{ width: 300, padding: "26px 24px", background: C.sheet, borderRadius: 14, boxShadow: "0 30px 60px -20px rgba(21,33,42,.6)", border: `2px solid ${C.ink}`, display: "flex", gap: 16, alignItems: "center" }}>
          <svg width={54} height={64} viewBox="0 0 54 64"><path d="M4 2h32l14 14v46H4z" fill="#fff" stroke={C.ink} strokeWidth={3} /><path d="M36 2v14h14" fill="none" stroke={C.ink} strokeWidth={3} /><text x="27" y="46" textAnchor="middle" fontSize="13" fontWeight="700" fill={C.ok} fontFamily="sans-serif">CSV</text></svg>
          <div style={{ font: `600 20px/1.3 ${F.ui}`, color: C.ink }}>willow-creek-<br />spending.csv</div>
        </div>
      </div>
    </Paper>
  );
};

// Cross-fades each demo shot in over the previous one.
const Shot: React.FC<{ base: number; from: number; to: number; children: React.ReactNode }> = ({ base, from, to, children }) => (
  <Sequence from={f(from) - f(base)} durationInFrames={f(to) - f(from)} layout="none">
    <ShotIn>{children}</ShotIn>
  </Sequence>
);
const ShotIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const o = Math.min(1, useCurrentFrame() / 8);
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const Demo: React.FC<{ base: number }> = ({ base }) => {
  const end = SCENE.demo.to;
  // Line 10-11: spreadsheet, then the real upload and read.
  const lift = wordAt(10, "exported") - 0.1;
  const cutUpload = wordAt(10, "here") - 0.25;
  const U = upload as Clip, K = kase as Clip, Vd = vendors as Clip, Pt = patterns as Clip, Rw = runway as Clip, Ct = contracts as Clip;
  const uploadAnchors: Anchor[] = [[wordAt(10, "five") , ev(U, "drop").t], [wordAt(11, "finds"), ev(U, "review").t + 0.2]];
  const cutCase = START[12] - 0.9;
  const caseAnchors: Anchor[] = [[START[12] + 0.15, ev(K, "case").t], [wordAt(12, "adds"), ev(K, "note").t + 0.3], [wordAt(12, "marks"), ev(K, "decide").t + 0.4], [wordAt(12, "audit"), ev(K, "log").t]];
  const cutVend = START[13] - 0.4;
  const cutPat = wordAt(13, "snow") - 0.45;
  const cutRun = wordAt(13, "fire") - 0.45;
  const cutCon = START[14] - 0.4;
  const r = (c: Clip, k: string) => ev(c, k).rect!;
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Shot base={base} from={base} to={cutUpload + 0.3}><Spreadsheet base={base} lift={lift} /></Shot>

      <Sequence from={f(cutUpload) - f(base)} durationInFrames={f(cutCase + 0.3) - f(cutUpload)} layout="none">
        <ShotIn>
          <Zoom base={cutUpload} keys={[on(r(U, "start"), 1.22, cutUpload), on(r(U, "start"), 1.22, wordAt(10, "five") + 0.3), { t: wordAt(10, "five") + 1.1, s: 1 }, { t: wordAt(11, "finds") - 0.2, s: 1 }, on(r(U, "review"), 1.32, wordAt(11, "finds") + 0.6), on(r(U, "review"), 1.32, wordAt(11, "every") - 0.2), on(r(U, "facts"), 1.18, wordAt(11, "every") + 0.6)]}>
            <Footage name="upload" base={cutUpload} from={cutUpload} to={cutCase + 0.3} anchors={uploadAnchors} length={U.length} />
          </Zoom>
          <Callout base={cutUpload} at={wordAt(11, "1,885")} until={START[11] + line(11).dur + 0.3} x={1180} y={600} big="1,885 read · 20 flagged" small="in about one second, in the browser" />
        </ShotIn>
      </Sequence>

      <Sequence from={f(cutCase) - f(base)} durationInFrames={f(cutVend + 0.3) - f(cutCase)} layout="none">
        <ShotIn>
          <Zoom base={cutCase} keys={[{ t: cutCase, s: 1 }, { t: START[12] + 0.2, s: 1 }, on(r(K, "case"), 1.25, START[12] + 0.9), on(r(K, "reasons"), 1.3, wordAt(12, "checks")), on(r(K, "note"), 1.35, wordAt(12, "adds") + 0.2), on(r(K, "decide"), 1.35, wordAt(12, "marks") + 0.3), { t: wordAt(12, "audit") - 0.2, s: 1.0 }, on(r(K, "log"), 1.3, wordAt(12, "audit") + 0.6)]}>
            <Footage name="case" base={cutCase} from={cutCase} to={cutVend + 0.3} anchors={caseAnchors} length={K.length} />
          </Zoom>
          <Callout base={cutCase} at={wordAt(12, "twice")} until={wordAt(12, "checks") + 0.6} x={1150} y={230} big="$4,645 × 2" small="same invoice · 12 days apart" />
          <Callout base={cutCase} at={wordAt(12, "never")} until={cutVend + 0.3} x={1150} y={250} big="People decide." small="Red Pen never blocks or changes a payment" tone="ink" />
        </ShotIn>
      </Sequence>

      <Sequence from={f(cutVend) - f(base)} durationInFrames={f(cutPat + 0.3) - f(cutVend)} layout="none">
        <ShotIn>
          <Zoom base={cutVend} keys={[{ t: cutVend, s: 1.05 }, on(r(Vd, "merged"), 1.4, wordAt(13, "plumber"))]}>
            <Footage name="vendors" base={cutVend} from={cutVend} to={cutPat + 0.3} anchors={[[wordAt(13, "plumber"), ev(Vd, "merged").t + 0.3]]} length={Vd.length} />
          </Zoom>
          <Callout base={cutVend} at={wordAt(13, "two")} until={cutPat + 0.3} x={1060} y={640} big="Bobs Plumbing = Bob's Plumbing Service" small="one vendor, two spellings, merged" />
        </ShotIn>
      </Sequence>

      <Sequence from={f(cutPat) - f(base)} durationInFrames={f(cutRun + 0.3) - f(cutPat)} layout="none">
        <ShotIn>
          <Zoom base={cutPat} keys={[{ t: cutPat, s: 1.0 }, on(r(Pt, "snow"), 1.45, wordAt(13, "july"))]}>
            <Footage name="patterns" base={cutPat} from={cutPat} to={cutRun + 0.3} anchors={[[wordAt(13, "july"), ev(Pt, "snow").t + 0.4]]} length={Pt.length} />
          </Zoom>
          <Callout base={cutPat} at={wordAt(13, "july")} until={cutRun + 0.3} x={240} y={640} big="Snow removal in July" small="$14,338 spent vs. $246 expected" />
        </ShotIn>
      </Sequence>

      <Sequence from={f(cutRun) - f(base)} durationInFrames={f(cutCon + 0.3) - f(cutRun)} layout="none">
        <ShotIn>
          <Zoom base={cutRun} keys={[{ t: cutRun, s: 1.0 }, on(r(Rw, "headline"), 1.45, wordAt(13, "april"))]}>
            <Footage name="runway" base={cutRun} from={cutRun} to={cutCon + 0.3} anchors={[[wordAt(13, "fire"), ev(Rw, "headline").t], [wordAt(13, "april"), ev(Rw, "headline").t + 1.1]]} length={Rw.length} />
          </Zoom>
          <Callout base={cutRun} at={wordAt(13, "april")} until={cutCon + 0.3} x={250} y={300} big="Runs out: April" small="fire vehicle repairs, 23% over budget" />
        </ShotIn>
      </Sequence>

      <Sequence from={f(cutCon) - f(base)} durationInFrames={f(end) - f(cutCon)} layout="none">
        <ShotIn>
          <Zoom base={cutCon} keys={[{ t: cutCon, s: 1.0 }, on(r(Ct, "note1"), 1.3, wordAt(14, "automatic"))]}>
            <Footage name="contracts" base={cutCon} from={cutCon} to={end} anchors={[[wordAt(14, "underlines"), ev(Ct, "note0").t], [wordAt(14, "automatic"), ev(Ct, "note1").t]]} length={Ct.length} />
          </Zoom>
          <Callout base={cutCon} at={wordAt(14, "automatic")} until={end} x={220} y={170} big="Automatic renewal, no new bid" small="flagged before the council signs" />
        </ShotIn>
      </Sequence>
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- 5. how */

export const How: React.FC<{ base: number }> = ({ base }) => {
  const t = useT(base);
  const head = ramp(t, base + 0.2, base + 0.8);
  const models = [
    { w: "isolation", name: "Isolation Forest", what: "unusual payments" },
    { w: "gradient", name: "Gradient-boosted trees", what: "each month's normal spending" },
    { w: "seasonal", name: "Seasonal ARIMA", what: "budget forecasts" },
    { w: "naive", name: "Naive Bayes", what: "contract clauses" },
  ];
  const step = (x: number, at: number, title: string, sub: string, w = 300, accent = false) => {
    const p = ramp(t, at, at + 0.5);
    return (
      <div style={{ position: "absolute", left: x, top: 470, width: w, opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
        <div style={{ background: accent ? C.ink : C.sheet, color: accent ? "#fff" : C.ink, borderRadius: 16, padding: "26px 26px", boxShadow: "0 1px 0 #d4e1d6, 0 30px 60px -36px rgba(21,33,42,.5)", minHeight: 150 }}>
          <div style={{ font: `600 34px/1.15 ${F.display}` }}>{title}</div>
          <div style={{ font: `400 22px/1.35 ${F.ui}`, opacity: 0.75, marginTop: 8 }}>{sub}</div>
        </div>
      </div>
    );
  };
  const arrow = (x: number, at: number) => {
    const p = ramp(t, at, at + 0.5, ease);
    return <svg style={{ position: "absolute", left: x, top: 530 }} width={70} height={40}><path d="M4 20 H 58 M 46 8 L 60 20 L 46 32" fill="none" stroke={C.pencil} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} /></svg>;
  };
  const a0 = base + 0.6, js = wordAt(15, "javascript"), libs = wordAt(15, "libraries");
  return (
    <Paper>
      <div style={{ position: "absolute", left: 230, top: 140, opacity: head }}>
        <div style={{ font: `600 26px ${F.ui}`, letterSpacing: "0.18em", color: C.pencil }}>HOW IT WORKS</div>
        <div style={{ font: `600 72px/1.08 ${F.display}`, color: C.ink, marginTop: 14, letterSpacing: "-0.015em" }}>Four models, written from scratch.</div>
        <div style={{ display: "flex", gap: 14, marginTop: 22 }}>
          {[{ at: js, s: "Plain JavaScript" }, { at: libs, s: "No machine-learning libraries" }, { at: libs + 0.5, s: "Iowa State Auditor rules" }].map((c, i) => {
            const p = ramp(t, c.at - 0.1, c.at + 0.4);
            return <div key={i} style={{ opacity: p, transform: `scale(${0.9 + 0.1 * p})`, font: `700 24px ${F.ui}`, color: C.ink, padding: "9px 18px", borderRadius: 999, border: `2px solid ${C.ink}` }}>{c.s}</div>;
          })}
        </div>
      </div>
      {step(150, a0, "Spending file", "every payment, as exported", 280)}
      {arrow(445, a0 + 0.4)}
      <div style={{ position: "absolute", left: 525, top: 410, width: 760 }}>
        {models.map((m, i) => {
          const at = wordAt(15, m.w);
          const p = ramp(t, at - 0.15, at + 0.4);
          const live = ramp(t, at - 0.15, at + 0.2) * (1 - ramp(t, at + 2.4, at + 3.0));
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 16, opacity: p, transform: `translateX(${(1 - p) * 40}px)` }}>
              <div style={{ width: 340, padding: "16px 22px", borderRadius: 12, background: live > 0.5 ? C.model : C.sheet, color: live > 0.5 ? "#fff" : C.ink, font: `700 27px ${F.ui}`, boxShadow: "0 18px 40px -26px rgba(21,33,42,.6)", border: `2px solid ${C.model}` }}>{m.name}</div>
              <div style={{ font: `400 26px ${F.ui}`, color: C.ink2 }}>{m.what}</div>
            </div>
          );
        })}
      </div>
      {arrow(1300, lineEnd(15) - 2.2)}
      {step(1380, lineEnd(15) - 1.9, "Plain-English findings", "each with reasons a clerk can check", 330)}
      <div style={{ position: "absolute", left: 1380, top: 680 }}>{(() => { const p = ramp(t, lineEnd(15) - 1.0, lineEnd(15) - 0.4); return <div style={{ opacity: p, font: `700 40px ${F.pen}`, color: C.pencil, transform: `rotate(-3deg)` }}>→ a person decides</div>; })()}</div>
    </Paper>
  );
};

/* --------------------------------------------------------------- 6. code */

const KW = /\b(export|function|const|let|return|for|if|else|while|new|class|import|from|of|this|Math)\b/g;
const hl = (src: string) => {
  const out: React.ReactNode[] = [];
  const re = /(\/\/.*$)|("[^"]*"|'[^']*'|`[^`]*`)|\b(\d+(?:\.\d+)?)\b|\b(export|function|const|let|return|for|if|else|while|new|class|import|from|of|this)\b/gm;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const col = m[1] ? "#6a9955" : m[2] ? "#ce9178" : m[3] ? "#b5cea8" : "#c586c0";
    out.push(<span key={k++} style={{ color: col, fontStyle: m[1] ? "italic" : undefined }}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  out.push(src.slice(last));
  return out;
};
void KW;

// Line 16: Alex's screen recording of the real file in VS Code (menu bar cropped off), with a
// slow push-in. CodeMock below is the earlier stand-in, kept in case the recording is redone.
export const Code: React.FC<{ base: number }> = ({ base }) => {
  const t = useT(base);
  const s = 1 + 0.06 * ramp(t, base, SCENE.code.to, (x) => x);
  return (
    <AbsoluteFill style={{ background: "#1e1e1e" }}>
      <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: "40% 40%" }}>
        <OffthreadVideo src={staticFile("footage/vscode.mp4")} trimBefore={45} muted style={{ width: "100%", height: "100%" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const CodeMock: React.FC<{ base: number }> = ({ base }) => {
  const src = (code as { src: string }).src;
  const t = useT(base);
  const rows = src.split("\n");
  const scroll = ramp(t, base + 0.6, SCENE.code.to, (x) => x) * 1500;
  const files = ["arima.js", "contractNLP.js", "gbm.js", "isolationForest.js", "rng.js", "rules.js", "stats.js", "vendorMatch.js"];
  return (
    <AbsoluteFill style={{ background: "#1e1e1e", font: `400 25px/1.55 ${F.mono}`, color: "#d4d4d4" }}>
      <div style={{ height: 52, background: "#323233", display: "flex", alignItems: "center", padding: "0 20px", gap: 10, font: `400 20px ${F.ui}`, color: "#ccc" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />)}
        <div style={{ margin: "0 auto" }}>isolationForest.js — intelligent-municipal-finance</div>
      </div>
      <div style={{ position: "absolute", top: 52, bottom: 0, left: 0, width: 360, background: "#252526", padding: "18px 0", font: `400 22px/1.9 ${F.ui}`, color: "#cccccc" }}>
        <div style={{ padding: "0 22px", font: `700 17px ${F.ui}`, letterSpacing: "0.1em", color: "#999" }}>EXPLORER</div>
        <div style={{ padding: "6px 22px 0" }}>▾ app / js / algo</div>
        {files.map((x) => <div key={x} style={{ padding: "0 22px 0 52px", background: x === "isolationForest.js" ? "#37373d" : undefined, color: x === "isolationForest.js" ? "#fff" : undefined }}>{x}</div>)}
        <div style={{ padding: "6px 22px 0" }}>▸ app / js / ui</div>
        <div style={{ padding: "0 22px" }}>▸ tests</div>
      </div>
      <div style={{ position: "absolute", top: 52, left: 360, right: 0, height: 50, background: "#252526", display: "flex" }}>
        <div style={{ background: "#1e1e1e", padding: "0 26px", display: "flex", alignItems: "center", font: `400 21px ${F.ui}`, color: "#fff", borderTop: "2px solid #3794ff" }}>isolationForest.js</div>
      </div>
      <div style={{ position: "absolute", top: 102, left: 360, right: 0, bottom: 0, overflow: "hidden" }}>
        <div style={{ transform: `translateY(${-scroll}px)`, padding: "14px 0" }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "flex", whiteSpace: "pre" }}>
              <div style={{ width: 90, textAlign: "right", paddingRight: 30, color: "#858585" }}>{i + 1}</div>
              <div>{hl(r)}</div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------- 7. browser */

export const Browser: React.FC<{ base: number }> = ({ base }) => {
  const t = useT(base);
  const p = ramp(t, base + 0.1, base + 0.8);
  const lock = ramp(t, wordAt(17, "browser") - 0.2, wordAt(17, "browser") + 0.4);
  const data = wordAt(17, "data");
  return (
    <Paper lines={false}>
      <div style={{ position: "absolute", left: 210, top: 110, width: 1500, height: 880, borderRadius: 16, overflow: "hidden", background: "#fff", boxShadow: "0 50px 100px -40px rgba(21,33,42,.6)", transform: `scale(${0.96 + 0.04 * p})`, opacity: p }}>
        <div style={{ height: 66, background: "#e9eeea", display: "flex", alignItems: "center", padding: "0 22px", gap: 10 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 15, height: 15, borderRadius: 8, background: c }} />)}
          <div style={{ marginLeft: 26, flex: 1, height: 40, borderRadius: 20, background: "#fff", display: "flex", alignItems: "center", gap: 10, padding: "0 18px", font: `400 22px ${F.ui}`, color: C.ink, boxShadow: lock > 0.5 ? `0 0 0 3px ${C.ok}` : undefined }}>
            <svg width={18} height={22} viewBox="0 0 18 22"><rect x="2" y="9" width="14" height="12" rx="2" fill={C.ok} /><path d="M5 9V6a4 4 0 0 1 8 0v3" fill="none" stroke={C.ok} strokeWidth="2.4" /></svg>
            redpenapp.vercel.app
          </div>
        </div>
        <Img src={staticFile("footage/review-still.png")} style={{ width: 1500, height: 814, objectFit: "cover", objectPosition: "top" }} />
      </div>
      <Callout base={base} at={wordAt(17, "browser")} until={SCENE.browser.to} x={1120} y={420} big="No server" small="runs entirely in your browser" tone="ok" />
      <Callout base={base} at={data} until={SCENE.browser.to} x={1120} y={580} big="Data stays on your computer" small="nothing is uploaded anywhere" tone="ok" />
    </Paper>
  );
};

/* --------------------------------------------------------------- 8. proof */

const Terminal: React.FC<{ base: number; at: number }> = ({ base, at }) => {
  const t = useT(base);
  const T0 = at + 0.2;
  const cmd = "bun test";
  const typed = Math.floor(Math.max(0, Math.min(cmd.length, (t - T0) * 16)));
  const run = T0 + cmd.length / 16 + 0.25;
  const all = (tests as any).files.flatMap((x: any) => [{ file: x.file }, ...x.tests.map((n: string) => ({ test: n }))]);
  const shown = Math.floor(Math.max(0, (t - run) * 26));
  const done = run + all.length / 26 + 0.2;
  const sum = ramp(t, done, done + 0.4);
  const visible = all.slice(0, shown).slice(sum > 0 ? -8 : -14);
  return (
    <AbsoluteFill style={{ background: C.paper, alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 1500, height: 860, background: "#0f1714", borderRadius: 16, overflow: "hidden", boxShadow: "0 50px 100px -40px rgba(0,0,0,.7)", font: `400 27px/1.55 ${F.mono}`, color: "#d9e4dd" }}>
        <div style={{ height: 52, background: "#1c2622", display: "flex", alignItems: "center", gap: 10, padding: "0 20px" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />)}
          <div style={{ margin: "0 auto", font: `400 20px ${F.ui}`, color: "#9fb1a7" }}>intelligent-municipal-finance — zsh</div>
        </div>
        <div style={{ padding: "26px 34px" }}>
          <div><span style={{ color: "#5cc184" }}>~/intelligent-municipal-finance</span> $ {cmd.slice(0, typed)}<span style={{ opacity: Math.floor(t * 2) % 2 && typed < cmd.length ? 0 : 1 }}>▌</span></div>
          {t > run && <div style={{ color: "#84968c" }}>{(tests as any).version}</div>}
          {visible.map((r: any, i: number) => r.file
            ? <div key={i} style={{ color: "#a9bab0", marginTop: 6 }}>{r.file}:</div>
            : <div key={i}><span style={{ color: "#5cc184" }}>✓</span> {r.test}</div>)}
          {sum > 0 && (
            <div style={{ marginTop: 12, opacity: sum }}>
              <div style={{ color: "#5cc184", font: `700 34px ${F.mono}` }}> 35 pass</div>
              <div style={{ color: "#d9e4dd", font: `700 34px ${F.mono}` }}> 0 fail</div>
              <div style={{ color: "#84968c" }}>Ran 35 tests across 4 files.</div>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Proof: React.FC<{ base: number }> = ({ base }) => {
  const M = method as Clip;
  const cut = wordAt(18, "35") - 0.45;
  const sc = M.events.find((e) => e.kind === "scorecard")!;
  return (
    <AbsoluteFill>
      <Zoom base={base} keys={[{ t: base, s: 1.0 }, on(sc.rect!, 1.15, wordAt(18, "planted"))]}>
        <Footage name="method" base={base} from={base} to={cut + 0.4} anchors={[[wordAt(18, "planted"), sc.t + 0.4], [wordAt(18, "caught"), M.length - 1.2]]} length={M.length} />
      </Zoom>
      <Callout base={base} at={wordAt(18, "all")} until={cut + 0.3} x={1180} y={240} big="10 of 10 caught" small="planted problems, found without being told where" tone="ok" />
      <Sequence from={f(cut) - f(base)} layout="none">
        <ShotIn><Terminal base={cut} at={cut} /></ShotIn>
      </Sequence>
    </AbsoluteFill>
  );
};

/* --------------------------------------------------------------- 9. close */

const Pict: React.FC<{ kind: string }> = ({ kind }) => {
  const p = { fill: "none", stroke: C.ink, strokeWidth: 2.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "parks") return <svg width={150} height={150} viewBox="0 0 48 48"><path d="M24 6c-7 0-11 6-11 12 0 5 4 9 11 9s11-4 11-9c0-6-4-12-11-12zM24 27v15M17 42h14" {...p} stroke={C.ok} /></svg>;
  if (kind === "roads") return <svg width={150} height={150} viewBox="0 0 48 48"><path d="M16 42L21 6M32 42L27 6M24 10v5M24 21v5M24 32v6" {...p} /></svg>;
  return <svg width={150} height={150} viewBox="0 0 48 48"><path d="M6 20l18-10 18 10M10 20v20h28V20M20 40V30h8v10" {...p} stroke={C.model} /><path d="M24 4v6M24 4h6v3h-6" {...p} stroke={C.pencil} /></svg>;
};

export const Close: React.FC<{ base: number }> = ({ base }) => {
  const t = useT(base);
  const recap = ramp(t, base + 0.2, base + 0.8);
  const items = [{ k: "parks", w: "parks", l: "Parks" }, { k: "roads", w: "roads", l: "Roads" }, { k: "schools", w: "schools", l: "Schools" }];
  const tax = ramp(t, wordAt(19, "higher") - 0.1, wordAt(19, "higher") + 0.5);
  return (
    <Paper>
      <div style={{ position: "absolute", top: 120, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 26, opacity: recap }}>
        {["1,885 read", "20 flagged", "10 of 10 caught", "35 tests pass"].map((s, i) => (
          <div key={i} style={{ font: `700 30px ${F.ui}`, color: i === 1 ? C.pencil : C.ink, padding: "12px 24px", background: C.sheet, borderRadius: 999, boxShadow: "0 16px 40px -24px rgba(21,33,42,.5)" }}>{s}</div>
        ))}
      </div>
      <div style={{ position: "absolute", top: 300, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 130 }}>
        {items.map((it) => {
          const at = wordAt(19, it.w);
          const p = ramp(t, at - 0.2, at + 0.4);
          return (
            <div key={it.k} style={{ textAlign: "center", opacity: p, transform: `translateY(${(1 - p) * 40}px)` }}>
              <div style={{ width: 260, height: 260, borderRadius: "50%", background: C.sheet, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 30px 60px -36px rgba(21,33,42,.6)" }}><Pict kind={it.k} /></div>
              <div style={{ font: `600 48px ${F.display}`, color: C.ink, marginTop: 22 }}>{it.l}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", top: 760, left: 0, right: 0, textAlign: "center", opacity: tax, font: `600 40px ${F.display}`, color: C.ink2 }}>
        instead of <span style={{ position: "relative", color: C.ink }}>higher property taxes
          <svg width={460} height={60} style={{ position: "absolute", left: -10, top: -2 }}><path d="M4 30 C 140 22, 300 36, 450 24" fill="none" stroke={C.pencil} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ramp(t, wordAt(19, "taxes"), wordAt(19, "taxes") + 0.5, ease)} /></svg>
        </span>
      </div>
    </Paper>
  );
};

/* ----------------------------------------------------------------- 10. end */

export const End: React.FC<{ base: number }> = ({ base }) => {
  const t = useT(base);
  const p = ramp(t, base + 0.2, base + 0.9);
  const tag = ramp(t, wordAt(20, "every") - 0.1, wordAt(20, "every") + 0.5);
  const loop = ramp(t, wordAt(20, "read") , wordAt(20, "read") + 0.7, ease);
  const rest = ramp(t, lineEnd(20) + 0.1, lineEnd(20) + 0.7);
  return (
    <Paper>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div style={{ opacity: p, transform: `scale(${0.94 + 0.06 * p})` }}><Logo size={110} /></div>
        <div style={{ position: "relative", marginTop: 40, font: `600 92px ${F.display}`, color: C.ink, opacity: tag, letterSpacing: "-0.015em" }}>
          Every line, <span style={{ color: C.pencil }}>read.</span>
          <svg width={330} height={150} style={{ position: "absolute", right: -40, top: -14 }}><path d="M70 20 C 220 0, 330 40, 300 90 C 270 140, 60 140, 30 95 C 10 60, 60 25, 160 18" fill="none" stroke={C.pencil} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - loop} /></svg>
        </div>
        <div style={{ marginTop: 50, opacity: rest, textAlign: "center" }}>
          <div style={{ font: `700 38px ${F.ui}`, color: C.ink }}>redpenapp.vercel.app</div>
          <div style={{ font: `400 30px ${F.ui}`, color: C.ink2, marginTop: 16 }}>David Shi · Srihari Kumaresan · Alex Du</div>
          <div style={{ font: `400 18px ${F.ui}`, color: C.ink3, marginTop: 40 }}>Music: "Inspired" by Kevin MacLeod (incompetech.com), CC BY 4.0</div>
        </div>
      </AbsoluteFill>
    </Paper>
  );
};
export { INTRO, FPS };
