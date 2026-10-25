// Hand-built SVG charts. One linear scale per axis, recessive grid,
// thin marks, and a hover layer on every chart.

import { esc, money, moneyShort, month, monthShort, date } from "./format.js";
import { chartLoop } from "./pen.js";

const f = (n) => (Number.isFinite(n) ? n.toFixed(1) : "0");

function scale(d0, d1, r0, r1) {
  const span = d1 - d0 || 1;
  const s = (v) => r0 + ((v - d0) / span) * (r1 - r0);
  return s;
}

// "Nice" axis ticks: 0, 5K, 10K ...
function niceTicks(max, count = 4) {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

const linePath = (pts) =>
  pts.filter(Boolean).map((p, i) => `${i ? "L" : "M"}${f(p[0])} ${f(p[1])}`).join(" ");

// Split a series into runs where values exist, so gaps break the line.
function runs(xs, ys) {
  const out = [];
  let cur = [];
  ys.forEach((y, i) => {
    if (y == null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push([xs[i], y]);
  });
  if (cur.length) out.push(cur);
  return out;
}

// Shared hover: a vertical crosshair snapping to the nearest x index.
function attachHover(wrap, svg, { xs, top, bottom, tip }) {
  const tipEl = document.createElement("div");
  tipEl.className = "tip";
  tipEl.hidden = true;
  wrap.appendChild(tipEl);
  const cross = svg.querySelector(".crosshair");
  const hit = svg.querySelector(".hit");
  const vb = svg.viewBox.baseVal;

  const show = (clientX) => {
    const box = svg.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * vb.width;
    let best = 0;
    xs.forEach((v, i) => { if (Math.abs(v - x) < Math.abs(xs[best] - x)) best = i; });
    const html = tip(best);
    if (!html) { tipEl.hidden = true; return; }
    cross?.setAttribute("x1", xs[best]);
    cross?.setAttribute("x2", xs[best]);
    cross?.removeAttribute("hidden");
    tipEl.innerHTML = html;
    tipEl.hidden = false;
    const px = (xs[best] / vb.width) * box.width;
    const clamped = Math.max(80, Math.min(box.width - 80, px));
    tipEl.style.left = `${clamped}px`;
    tipEl.style.top = `${(top / vb.height) * box.height + 4}px`;
  };
  const hide = () => { tipEl.hidden = true; cross?.setAttribute("hidden", ""); };
  hit.addEventListener("pointermove", (e) => show(e.clientX));
  hit.addEventListener("pointerdown", (e) => show(e.clientX));
  hit.addEventListener("pointerleave", hide);
}

/* ------------------------------------------------------------------ */
/* Spending pattern: actual monthly spend vs. the model's expected band */
/* ------------------------------------------------------------------ */
export function patternChart(el, months, { onFlag } = {}) {
  const W = 920, H = 300, L = 54, R = 14, T = 20, B = 34;
  const n = months.length;
  const max = Math.max(...months.map((m) => Math.max(m.actual ?? 0, m.upper ?? 0))) * 1.08;
  const ticks = niceTicks(max);
  const x = scale(0, n - 1, L, W - R);
  const y = scale(0, ticks[ticks.length - 1], H - B, T);
  const xs = months.map((_, i) => x(i));

  const band =
    `M${months.map((m, i) => `${f(x(i))} ${f(y(Math.max(0, m.upper)))}`).join(" L")} ` +
    `L${months.map((m, i) => i).reverse().map((i) => `${f(x(i))} ${f(y(Math.max(0, months[i].lower)))}`).join(" L")} Z`;
  const expected = linePath(months.map((m, i) => [x(i), y(m.expected)]));
  const actual = linePath(months.map((m, i) => [x(i), y(m.actual)]));

  // Fiscal year boundaries (July) as faint labels.
  const fyMarks = months
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.month.endsWith("-07"))
    .map(({ m, i }) => `<line x1="${f(x(i))}" x2="${f(x(i))}" y1="${T}" y2="${H - B}" stroke="var(--rule)" stroke-dasharray="2 3"/>
      <text x="${f(x(i) + 4)}" y="${H - B + 16}">FY${Number(m.month.slice(0, 4)) + 1}</text>`)
    .join("");

  const flags = months
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.flagged)
    .map(({ m, i }, k) => `<circle cx="${f(x(i))}" cy="${f(y(m.actual))}" r="4.5" fill="var(--pencil)" stroke="var(--sheet)" stroke-width="2"/>
      ${chartLoop(x(i), y(m.actual), 13, i + 3, 0.5 + k * 0.15)}`)
    .join("");

  el.innerHTML = `<div class="chart-wrap">
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly spending compared with the model's expected range">
      <g class="grid">${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${f(y(t))}" y2="${f(y(t))}"/>`).join("")}</g>
      ${ticks.map((t) => `<text x="${L - 8}" y="${f(y(t) + 4)}" text-anchor="end">${moneyShort(t)}</text>`).join("")}
      ${fyMarks}
      <path d="${band}" fill="var(--model-wash)"/>
      <path d="${expected}" fill="none" stroke="var(--model)" stroke-width="1.6" stroke-dasharray="5 4"/>
      <path d="${actual}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>
      ${flags}
      <line class="crosshair" y1="${T}" y2="${H - B}" stroke="var(--ink-3)" stroke-width="1" hidden/>
      <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
    </svg></div>`;

  attachHover(el.querySelector(".chart-wrap"), el.querySelector("svg"), {
    xs, top: T,
    tip: (i) => {
      const m = months[i];
      const diff = m.actual - m.expected;
      return `<b>${month(m.month, true)}</b>
        <div class="row"><span>Actual</span><span>${money(m.actual)}</span></div>
        <div class="row"><span>Expected</span><span>${money(m.expected)}</span></div>
        <div class="row"><span>Normal range</span><span>${moneyShort(Math.max(0, m.lower))}–${moneyShort(m.upper)}</span></div>
        ${m.flagged ? `<div style="margin-top:4px;color:#ff8c82;font-weight:700">Flagged: ${diff > 0 ? "+" : ""}${money(diff)} vs. expected</div>` : ""}`;
    },
  });
  if (onFlag) {
    el.querySelector(".hit").addEventListener("click", (e) => {
      const svg = el.querySelector("svg");
      const box = svg.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * W;
      let best = 0;
      xs.forEach((v, i) => { if (Math.abs(v - px) < Math.abs(xs[best] - px)) best = i; });
      if (months[best].flagged) onFlag(months[best]);
    });
  }
}

/* ------------------------------------------------------------------ */
/* Budget runway: cumulative spend vs. budget, with forecast fan        */
/* ------------------------------------------------------------------ */
export function runwayChart(el, fc, { compact = false, label = "Cumulative spending against budget" } = {}) {
  const months = fc.months;
  const W = compact ? 360 : 920, H = compact ? 200 : 320, L = compact ? 44 : 60, R = compact ? 10 : 18, T = 26, B = 30;
  const top = Math.max(fc.budget ?? 0, ...months.map((m) => m.cumHi ?? m.cumActual ?? 0)) * 1.06;
  const ticks = niceTicks(top, compact ? 3 : 4);
  const x = scale(0, 11, L, W - R);
  const y = scale(0, ticks[ticks.length - 1], H - B, T);
  const xs = months.map((_, i) => x(i));
  const lastObs = months.reduce((k, m, i) => (m.cumActual != null ? i : k), -1);

  // Forecast fan starts at the last observed month so the line is continuous.
  const fanIdx = months.map((_, i) => i).filter((i) => i >= Math.max(lastObs, 0));
  const fan = fanIdx.length > 1
    ? `M${fanIdx.map((i) => `${f(x(i))} ${f(y(i === lastObs ? months[i].cumActual : months[i].cumHi))}`).join(" L")} ` +
      `L${[...fanIdx].reverse().map((i) => `${f(x(i))} ${f(y(i === lastObs ? months[i].cumActual : months[i].cumLo))}`).join(" L")} Z`
    : "";
  const actual = linePath(months.map((m, i) => (m.cumActual != null ? [x(i), y(m.cumActual)] : null)));
  const forecast = linePath(fanIdx.map((i) => [x(i), y(i === lastObs ? months[i].cumActual : months[i].cumForecast)]));

  let crossing = "";
  if (fc.budget && fc.overrunMonth) {
    const i = months.findIndex((m) => m.month === fc.overrunMonth);
    if (i >= 0) {
      const cx = x(i);
      const cy = y(fc.budget);
      crossing = `${chartLoop(cx, cy, compact ? 10 : 13, i + 11, 0.7)}
        <text x="${f(cx > W - 90 ? cx + 8 : cx)}" y="${f(cy + (compact ? 26 : 30))}" text-anchor="${cx > W - 90 ? "end" : "middle"}" style="fill:var(--pencil);font:700 ${compact ? 15 : 17}px var(--f-pen)">runs out here</text>`;
    }
  }
  const budgetLine = fc.budget
    ? `<line x1="${L}" x2="${W - R}" y1="${f(y(fc.budget))}" y2="${f(y(fc.budget))}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="6 4"/>
       <text x="${L + 4}" y="${f(y(fc.budget) - 7)}" style="fill:var(--ink-2);font-weight:600">Budget ${moneyShort(fc.budget)}</text>`
    : "";
  const labelEvery = compact ? 3 : 1;

  el.innerHTML = `<div class="chart-wrap">
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
      <g class="grid">${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${f(y(t))}" y2="${f(y(t))}"/>`).join("")}</g>
      ${ticks.map((t) => `<text x="${L - 7}" y="${f(y(t) + 4)}" text-anchor="end">${moneyShort(t)}</text>`).join("")}
      ${months.map((m, i) => (i % labelEvery === 0 || i === 11 ? `<text x="${f(x(i))}" y="${H - B + 17}" text-anchor="middle">${monthShort(m.month)}</text>` : "")).join("")}
      ${fan ? `<path d="${fan}" fill="var(--model-wash)"/>` : ""}
      ${budgetLine}
      ${forecast ? `<path d="${forecast}" fill="none" stroke="var(--model)" stroke-width="2" stroke-dasharray="5 4"/>` : ""}
      <path d="${actual}" fill="none" stroke="var(--model)" stroke-width="2.6" stroke-linejoin="round"/>
      ${lastObs >= 0 ? `<circle cx="${f(x(lastObs))}" cy="${f(y(months[lastObs].cumActual))}" r="4.5" fill="var(--model)" stroke="var(--sheet)" stroke-width="2"/>` : ""}
      ${crossing}
      <line class="crosshair" y1="${T}" y2="${H - B}" stroke="var(--ink-3)" stroke-width="1" hidden/>
      <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
    </svg></div>`;

  attachHover(el.querySelector(".chart-wrap"), el.querySelector("svg"), {
    xs, top: T,
    tip: (i) => {
      const m = months[i];
      const past = m.cumActual != null;
      return `<b>${month(m.month, true)}</b>
        ${past
          ? `<div class="row"><span>Spent this month</span><span>${money(m.actual)}</span></div>
             <div class="row"><span>Spent so far</span><span>${money(m.cumActual)}</span></div>`
          : `<div class="row"><span>Forecast this month</span><span>${money(m.forecast)}</span></div>
             <div class="row"><span>Forecast so far</span><span>${money(m.cumForecast)}</span></div>
             <div class="row"><span>80% range</span><span>${moneyShort(m.cumLo)}–${moneyShort(m.cumHi)}</span></div>`}
        ${fc.budget ? `<div class="row"><span>Budget</span><span>${money(fc.budget)}</span></div>` : ""}`;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Vendor history: every invoice from one vendor, with this one circled */
/* ------------------------------------------------------------------ */
export function vendorStrip(el, txns, focusIds = [], { normal } = {}) {
  const W = 640, H = 190, L = 54, R = 16, T = 22, B = 30;
  if (!txns.length) { el.innerHTML = ""; return; }
  const times = txns.map((t) => Date.parse(t.date));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const max = Math.max(...txns.map((t) => t.amount)) * 1.12;
  const ticks = niceTicks(max, 3);
  const x = scale(t0, t1 === t0 ? t0 + 1 : t1, L, W - R);
  const y = scale(0, ticks[ticks.length - 1], H - B, T);
  const focus = new Set(focusIds);
  const xs = times.map((t) => x(t));

  const bandSvg = normal
    ? `<rect x="${L}" y="${f(y(normal.hi))}" width="${W - L - R}" height="${f(Math.max(2, y(normal.lo) - y(normal.hi)))}" fill="var(--model-wash)"/>
       <line x1="${L}" x2="${W - R}" y1="${f(y(normal.mid))}" y2="${f(y(normal.mid))}" stroke="var(--model)" stroke-width="1.4" stroke-dasharray="4 3"/>
`
    : "";
  let k = 0;
  const dots = txns.map((t, i) => {
    const on = focus.has(t.id);
    const cx = xs[i];
    const cy = y(t.amount);
    if (!on) return `<circle cx="${f(cx)}" cy="${f(cy)}" r="3.6" fill="var(--ink-3)" opacity=".75"/>`;
    return `<circle cx="${f(cx)}" cy="${f(cy)}" r="5.5" fill="var(--pencil)" stroke="var(--sheet)" stroke-width="2"/>${chartLoop(cx, cy, 13, i + 5, 0.45 + 0.2 * k++)}`;
  });
  const y0 = new Date(t0).getUTCFullYear();
  const y1 = new Date(t1).getUTCFullYear();
  const yearTicks = [];
  for (let yy = y0 + 1; yy <= y1; yy++) {
    const tx = Date.UTC(yy, 0, 1);
    if (tx > t0 && tx < t1) yearTicks.push(`<line x1="${f(x(tx))}" x2="${f(x(tx))}" y1="${T}" y2="${H - B}" stroke="var(--rule)" stroke-dasharray="2 3"/><text x="${f(x(tx))}" y="${H - B + 17}" text-anchor="middle">${yy}</text>`);
  }

  el.innerHTML = `<div class="chart-wrap">
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Every invoice from this vendor; flagged invoices circled in red">
      <g class="grid">${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${f(y(t))}" y2="${f(y(t))}"/>`).join("")}</g>
      ${ticks.map((t) => `<text x="${L - 7}" y="${f(y(t) + 4)}" text-anchor="end">${moneyShort(t)}</text>`).join("")}
      ${yearTicks.join("")}
      ${bandSvg}
      ${dots.join("")}
      <line class="crosshair" y1="${T}" y2="${H - B}" stroke="var(--ink-3)" stroke-width="1" hidden/>
      <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
    </svg></div>`;

  attachHover(el.querySelector(".chart-wrap"), el.querySelector("svg"), {
    xs, top: T,
    tip: (i) => {
      const t = txns[i];
      return `<b>${date(t.date)}</b>
        <div class="row"><span>${esc(t.invoice)}</span><span>${money(t.amount)}</span></div>
        <div style="opacity:.75">${esc(t.description)}</div>
        ${t.vendor !== t.vendorCanonical ? `<div style="opacity:.75">billed as “${esc(t.vendor)}”</div>` : ""}`;
    },
  });
}

/* Tiny sparkline for tables. */
export function sparkline(values, { flagged = false } = {}) {
  const W = 120, H = 28;
  if (!values.length) return "";
  const max = Math.max(...values, 1);
  const x = scale(0, values.length - 1, 1, W - 3);
  const y = scale(0, max, H - 2, 3);
  const d = linePath(values.map((v, i) => [x(i), y(v)]));
  const area = `${d} L${f(x(values.length - 1))} ${H - 1} L${f(x(0))} ${H - 1} Z`;
  const last = values.length - 1;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <path d="${area}" fill="${flagged ? "var(--pencil-wash)" : "var(--model-wash)"}"/>
    <path d="${d}" fill="none" stroke="${flagged ? "var(--pencil)" : "var(--model)"}" stroke-width="1.4"/>
    <circle cx="${f(x(last))}" cy="${f(y(values[last]))}" r="2.4" fill="${flagged ? "var(--pencil)" : "var(--model)"}"/></svg>`;
}
