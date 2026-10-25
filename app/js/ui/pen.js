// The red pencil.
//
// Hand-drawn marks (loops, underlines, check marks) are generated as SVG
// paths with a little seeded wobble, so every circle looks drawn by a person
// instead of stamped by a computer. Each mark animates in like a pencil
// stroke using stroke-dashoffset.

import { makeRng } from "../algo/rng.js";

const f = (n) => n.toFixed(1);

// A loose loop around a box of size w x h, overshooting where it closes,
// the way a hand circles a number on paper.
export function loopPath(w, h, seed = 1) {
  const rng = makeRng(seed * 7919 + 13);
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const start = -2.6 + rng() * 0.4;
  const turns = 1.12 + rng() * 0.08;
  const steps = 26;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = start + (i / steps) * turns * Math.PI * 2;
    const wob = 1 + (rng() - 0.5) * 0.07;
    const drift = (i / steps) * 0.05; // second pass lands slightly outside the first
    pts.push([cx + Math.cos(t) * rx * (wob + drift), cy + Math.sin(t) * ry * (wob + drift * 0.6) - drift * h * 0.1]);
  }
  return smooth(pts);
}

// A quick underline with a slight upward flick at the end.
export function underlinePath(w, seed = 1) {
  const rng = makeRng(seed * 104729 + 7);
  const y = 4 + rng() * 2;
  return `M2 ${f(y + 1)} C ${f(w * 0.3)} ${f(y - 1.5)}, ${f(w * 0.7)} ${f(y + 2)}, ${f(w - 2)} ${f(y - 2 - rng() * 2)}`;
}

// Catmull-Rom spline through the points, converted to cubic Beziers.
function smooth(pts) {
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])}, ${f(c2[0])} ${f(c2[1])}, ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

// SVG that sits over an inline element and circles it.
export function circleSvg({ seed = 1, delay = 0, width = 2.4 } = {}) {
  return `<svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true">
    <path class="ink-draw animate" style="--len:620;--delay:${delay}s;--dur:1s" d="${loopPath(200, 60, seed)}"
      fill="none" stroke="var(--pencil)" stroke-width="${width}" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}

// Circle a point inside a chart at (x, y).
export function chartLoop(x, y, r = 12, seed = 1, delay = 0.4) {
  const w = r * 2.4;
  const h = r * 2;
  return `<path class="ink-draw animate" style="--len:200;--delay:${delay}s;--dur:.8s" transform="translate(${f(x - w / 2)} ${f(y - h / 2)})"
    d="${loopPath(w, h, seed)}" fill="none" stroke="var(--pencil)" stroke-width="2" stroke-linecap="round"/>`;
}

// Tick marks the auditor uses next to each finding type.
export const TICKS = {
  duplicate: { mark: "⊘", label: "duplicate" },
  split: { mark: "⫶", label: "split purchase" },
  "new-vendor": { mark: "✱", label: "new vendor" },
  "vendor-increase": { mark: "↑", label: "price increase" },
  "above-similar": { mark: "△", label: "above normal" },
  seasonal: { mark: "~", label: "out of season" },
  isolation: { mark: "?", label: "unusual pattern" },
};
