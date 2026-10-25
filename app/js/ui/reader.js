// Opening sequence: the ledger streams past while a counter shows how much of
// the town's books have been read, and the red pencil ticks each finding as
// it goes by. About four seconds; click, press any key, or "Skip" to jump in.

import { esc, count, money2, date } from "./format.js";
import { TICKS } from "./pen.js";

const ROW_H = 33;

export function playReader(app, done) {
  const el = document.getElementById("reader");
  const a = app.analysis;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !a.txns.length) { done(); return; }

  // A readable sample of the ledger: every alerted transaction, plus enough
  // ordinary ones in between to make the stream feel like the whole book.
  const flagged = new Map();
  for (const al of a.alerts) for (const id of al.txnIds) if (!flagged.has(id)) flagged.set(id, al);
  const step = Math.max(1, Math.floor(a.txns.length / 110));
  const rows = a.txns.filter((t, i) => flagged.has(t.id) || i % step === 0);
  const total = a.summary.txnCount;
  const need = a.summary.alertCount;

  el.innerHTML = `<div class="reader-inner" role="dialog" aria-label="Reading the books">
    <div style="display:grid;gap:6px">
      <span class="eyebrow">${esc(a.town.name)}${a.town.state ? `, ${esc(a.town.state)}` : ""}</span>
      <h2 id="reader-title">Reading <span class="count" id="reader-count">0</span> transactions…</h2>
    </div>
    <div class="stream" aria-hidden="true"><div id="reader-strip">${rows
      .map((t) => {
        const al = flagged.get(t.id);
        return `<div class="stream-row${al ? " hit" : ""}"${al ? ` data-alert="${al.id}"` : ""}>
          <span class="num">${date(t.date)}</span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.vendor)} · ${esc(t.description)}</span>
          <span class="r">${money2(t.amount)}</span>
          <span class="t${al ? "" : " ok"}">${al ? TICKS[al.type]?.mark ?? "?" : "✓"}</span></div>`;
      })
      .join("")}</div></div>
    <div class="progress"><i id="reader-bar"></i></div>
    <div class="reader-foot">
      <span id="reader-found">Found 0 so far</span>
      <button class="btn sm" id="reader-skip" type="button">Skip</button>
    </div>
  </div>`;
  el.hidden = false;
  el.classList.remove("gone");

  const strip = el.querySelector("#reader-strip");
  const counter = el.querySelector("#reader-count");
  const bar = el.querySelector("#reader-bar");
  const found = el.querySelector("#reader-found");
  const title = el.querySelector("#reader-title");
  const rowEls = [...strip.children];
  const viewH = 264;
  const travel = Math.max(0, rows.length * ROW_H - viewH);
  const DURATION = 3600;
  let start = null;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    counter.textContent = count(total);
    title.innerHTML = `${count(total)} transactions read. <span class="pen" style="font-size:1.15em">${count(need)} need you.</span>`;
    found.textContent = `${count(need)} findings · every transaction checked`;
    bar.style.width = "100%";
    setTimeout(close, 1100);
  };
  const close = () => {
    el.classList.add("gone");
    removeEventListener("keydown", skip);
    setTimeout(() => { el.hidden = true; el.innerHTML = ""; }, 520);
    done();
  };
  const skip = () => { if (!finished) { finished = true; close(); } };

  const tick = (now) => {
    if (finished) return;
    start ??= now;
    const p = Math.min(1, (now - start) / DURATION);
    const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
    const offset = eased * travel;
    strip.style.transform = `translateY(${-offset}px)`;
    counter.textContent = count(Math.round(eased * total));
    bar.style.width = `${eased * 100}%`;
    // Count findings whose row has scrolled past the middle of the window.
    const line = offset + viewH / 2;
    const seenAlerts = new Set();
    rowEls.forEach((r, i) => { if (r.dataset.alert && i * ROW_H < line) seenAlerts.add(r.dataset.alert); });
    found.textContent = `Found ${seenAlerts.size} so far`;
    if (p < 1) requestAnimationFrame(tick);
    else finish();
  };
  requestAnimationFrame(tick);

  el.querySelector("#reader-skip").addEventListener("click", skip);
  addEventListener("keydown", skip);
}
