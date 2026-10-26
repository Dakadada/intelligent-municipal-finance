// Review queue: the clerk's morning view. One sentence says how much was
// read and how much needs a person; the queue below is sorted by risk.

import { esc, money, money2, moneyShort, count, date, month, plural, monthsBetween, MIN_HISTORY_MONTHS } from "../format.js";
import { circleSvg, tallySvg, TICKS } from "../pen.js";
import { runwayChart } from "../charts.js";
import { store } from "../store.js";

let filter = { show: "open", type: "all", q: "" };

export function reviewView(el, app) {
  const a = app.analysis;
  const s = a.summary;
  const open = app.openAlerts;
  const ev = a.evaluation;
  const years = s.fyTotals.length;

  el.innerHTML = `
    ${importNote(app.lastImport)}
    <div class="hero">
    <section class="thesis">
      <span class="eyebrow">Review queue · ${date(s.firstDate)} to ${date(s.lastDate)}</span>
      <h1>${count(s.txnCount)} transactions read. ${open.length
        ? `<span class="circled">${count(open.length)} need you.${circleSvg({ seed: open.length, delay: 0.35 })}</span>`
        : `<span style="color:var(--ok)">${a.alerts.length ? "All reviewed." : "Nothing needs you."}</span>`}</h1>
      <p class="lede">A traditional audit samples a small share of transactions every year or two. Red Pen checked every one of them${years > 1 ? ` across ${years} fiscal years` : ""} using four models and a set of rules drawn from Iowa State Auditor findings. Each flag below explains itself in plain English.</p>
      <div class="facts">
        <div class="fact"><b>${moneyShort(s.totalSpend).replace(/^\$(\d)M$/, "$$$1.0M")}</b><span>spending checked</span></div>
        <div class="fact"><b>${money(s.flaggedDollars)}</b><span>in flagged payments</span></div>
        <div class="fact"><b>${count(s.vendorCount)}</b><span>vendors, from ${count(s.rawVendorNames)} spellings</span></div>
        ${ev ? `<div class="fact"><a href="#/method"><b>${ev.caught} of ${ev.total}</b><span>planted test problems caught</span></a></div>` : ""}
      </div>
    </section>
    ${tallyBlock(a)}
    </div>

    <div class="grid-2">
      <section class="section" aria-labelledby="queue-h">
        <div class="section-head">
          <h2 id="queue-h">Findings</h2>
          <div class="seg" role="group" aria-label="Show">
            ${["open", "done", "all"].map((k) => `<button type="button" data-show="${k}" aria-pressed="${filter.show === k}">${{ open: `Open · ${open.length}`, done: `Decided · ${a.alerts.length - open.length}`, all: "All" }[k]}</button>`).join("")}
          </div>
        </div>
        <div class="toolbar">
          <input class="input grow" id="q" type="search" placeholder="Search vendor, category, or finding" value="${esc(filter.q)}" aria-label="Search findings">
          <select class="input" id="type" aria-label="Finding type" style="width:auto">
            <option value="all">All finding types</option>
            ${Object.entries(TICKS).filter(([k]) => a.alerts.some((x) => x.type === k)).map(([k, v]) => `<option value="${k}" ${filter.type === k ? "selected" : ""}>${v.mark}  ${v.label}</option>`).join("")}
          </select>
        </div>
        <div id="queue"></div>
        <div class="legend" aria-label="Tick mark legend">
          ${Object.entries(TICKS).filter(([k]) => a.alerts.some((x) => x.type === k)).map(([, v]) => `<span><b>${v.mark}</b>${v.label}</span>`).join("")}
        </div>
      </section>

      <aside class="section" aria-labelledby="runway-h" id="runway-side"></aside>
    </div>`;

  el.querySelector("#import-ok")?.addEventListener("click", (e) => {
    app.lastImport = null;
    e.target.closest(".import-note").remove();
  });

  const renderQueue = () => {
    const q = filter.q.trim().toLowerCase();
    let list = a.alerts.filter((x) => {
      const d = store.decision(x);
      if (filter.show === "open" && d) return false;
      if (filter.show === "done" && !d) return false;
      if (filter.type !== "all" && x.type !== filter.type) return false;
      if (q && !`${x.vendor} ${x.category} ${x.title} ${x.headline}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const box = el.querySelector("#queue");
    if (!list.length) {
      box.innerHTML = `<div class="ledger"><div class="empty">
        <span class="pen">${!a.alerts.length ? "Nothing worth a second look." : filter.show === "open" && !q && filter.type === "all" ? "Nothing left to review." : "No findings match."}</span>
        <span>${!a.alerts.length ? "Every transaction in this file passed every check." : filter.show === "open" && !q ? "Every finding has a decision. They're all in the audit log." : "Try a different search or show all findings."}</span>
        ${filter.show !== "all" && a.alerts.length ? `<button class="btn sm" type="button" data-show="all">Show all findings</button>` : ""}
      </div></div>`;
      return;
    }
    box.innerHTML = `<div class="ledger" role="list">
      <div class="ledger-head" aria-hidden="true"><span style="padding-left:12px">Date</span><span>Finding</span><span class="r">Amount</span><span></span></div>
      ${list.map((x) => row(x, store.decision(x))).join("")}
    </div>`;
  };

  el.addEventListener("click", (e) => {
    const tl = e.target.closest("[data-tally]");
    if (tl) {
      filter.type = filter.type === tl.dataset.tally ? "all" : tl.dataset.tally;
      filter.show = "all";
      el.querySelector("#type").value = filter.type;
      el.querySelectorAll(".seg [data-show]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.show === filter.show));
      el.querySelectorAll("[data-tally]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.tally === filter.type));
      renderQueue();
      el.querySelector("#queue-h").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const b = e.target.closest("[data-show]");
    if (b) {
      filter.show = b.dataset.show;
      el.querySelectorAll(".seg [data-show]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.show === filter.show));
      renderQueue();
    }
  });
  el.querySelector("#q").addEventListener("input", (e) => { filter.q = e.target.value; renderQueue(); });
  el.querySelector("#type").addEventListener("change", (e) => { filter.type = e.target.value; renderQueue(); });
  renderQueue();
  renderRunwaySide(el.querySelector("#runway-side"), app);
}

function row(x, decision) {
  const tick = TICKS[x.type] ?? { mark: "?", label: x.type };
  const decided = decision ? { reviewed: "Reviewed", dismissed: "Not a problem", escalated: "Sent to council" }[decision.kind] : null;
  return `<a class="lrow ${decision ? "done" : x.severity}" role="listitem" href="#/case/${x.id}">
    <span class="date num">${x.date ? date(x.date, { year: false }) : "—"}<br><span style="font-size:11px">${x.date ? x.date.slice(0, 4) : ""}</span></span>
    <span class="what"><b>${esc(x.title)}</b><span>${decided ? `${decided} · ` : ""}${esc(x.headline)}</span></span>
    <span class="amt">${money2(x.amount)}${x.type === "vendor-increase" ? `<br><span class="faint" style="font-size:11px;font-weight:500">est. extra cost</span>` : ""}</span>
    <span class="tick" title="${esc(tick.label)}">${decision ? "✓" : tick.mark}</span>
  </a>`;
}

function renderRunwaySide(box, app) {
  const fc = app.analysis.forecast;
  const history = monthsBetween(app.analysis.summary.firstDate, app.analysis.asOf);
  if (!fc || !fc.total || history < MIN_HISTORY_MONTHS) { box.innerHTML = ""; return; }
  const cats = [...fc.categories].filter((c) => c.budget).sort((p, q) => q.pctOfBudget - p.pctOfBudget);
  const worst = cats.find((c) => c.status === "over");
  const over = cats.filter((c) => c.status === "over");
  const t = fc.total;
  box.innerHTML = `
    <div class="runway">
      <span class="eyebrow">Budget runway · FY${fc.fy}</span>
      ${worst
        ? `<h3>${esc(worst.name)} will run out of budget${worst.overrunMonth ? ` in <span class="pen" style="font-size:1.3em">${month(worst.overrunMonth, true).split(" ")[0]}</span>` : ""}.</h3>
           <p class="lede">${esc(worst.headline)}${over.length > 1 ? ` ${plural(over.length - 1, "other category", "other categories")} also ${over.length - 1 === 1 ? "projects" : "project"} over budget.` : ""}</p>`
        : `<h3>Every category is on track.</h3><p class="lede">Projected spending stays inside the adopted budget.</p>`}
      <div id="runway-mini"></div>
      <p class="fineprint">Whole-city spending, ${fc.monthsObserved} months actual, ${fc.monthsForecast} forecast. Shaded area is the 80% range.</p>
      <div class="cats">${cats.slice(0, 6).map(catRow).join("")}</div>
      <a class="btn sm" href="#/runway" style="justify-self:start">Open budget runway →</a>
    </div>`;
  runwayChart(box.querySelector("#runway-mini"), t, { compact: true, label: "Whole-city cumulative spending against the adopted budget" });
}

export function catRow(c) {
  const max = Math.max(c.budget * 1.25, c.projectedHi ?? 0, c.projected);
  const w = (v) => `${Math.min(100, (v / max) * 100).toFixed(1)}%`;
  const label = c.status === "over"
    ? `<span class="status over">● Over by ${Math.round(c.pctOfBudget - 100)}%</span>`
    : c.status === "watch" ? `<span class="status watch">◐ Watch</span>` : `<span class="status ok">✓ On track</span>`;
  return `<a class="cat" href="#/patterns/${c.categoryId}">
    <span class="cat-name">${esc(c.name)}</span>${label}
    <div class="bar" title="Spent ${money(c.spentToDate)} · projected ${money(c.projected)} · budget ${money(c.budget)}">
      <i class="proj ${c.status === "ok" ? "" : c.status}" style="width:${w(c.projected)}"></i>
      <i class="${c.status === "ok" ? "" : c.status}" style="width:${w(c.spentToDate)}"></i>
      <u style="left:${w(c.budget)}"></u>
    </div></a>`;
}

// The auditor's tally sheet: one line per kind of finding, counted in pencil.
function tallyBlock(a) {
  const rows = Object.entries(TICKS)
    .map(([type, t]) => {
      const list = a.alerts.filter((x) => x.type === type);
      return { type, t, n: list.length, dollars: list.reduce((sum, x) => sum + (x.amount ?? 0), 0) };
    })
    .filter((r) => r.n)
    .sort((p, q) => q.n - p.n);
  if (!rows.length) return "";
  return `<aside class="tally-sheet" aria-label="Findings by kind">
    <span class="eyebrow">Tally</span>
    ${rows.map((r, i) => `
      <button type="button" class="tally-row" data-tally="${r.type}" aria-pressed="${filter.type === r.type}">
        <span class="tick-mark">${r.t.mark}</span>
        <span class="tally-label">${esc(r.t.label[0].toUpperCase() + r.t.label.slice(1))}<small>${money(r.dollars)}</small></span>
        ${tallySvg(r.n, { seed: i + 2, delay: 0.5 + i * 0.25 })}
        <span class="tally-n num">${r.n}</span>
      </button>`).join("")}
  </aside>`;
}

// Right after an upload: what was read, which of the file's columns were
// used for what, and which rows were skipped, so the clerk can trust the import.
function importNote(imp) {
  if (!imp) return "";
  const renamed = Object.entries(imp.columns ?? {}).filter(([field, name]) => field !== name.toLowerCase());
  const skipped = imp.warnings.filter((w) => w.includes("skipped"));
  return `<div class="import-note notice ok" role="status">
    <div>
      <b>Read ${count(imp.rows)} payments from ${esc(imp.name)}.</b>
      ${renamed.length ? `<span>Columns used: ${renamed.map(([field, name]) => `${esc(name)} → ${field}`).join(", ")}.</span>` : ""}
      ${skipped.length ? `<details><summary>${count(skipped.length)} ${skipped.length === 1 ? "row was" : "rows were"} skipped</summary>${skipped.slice(0, 20).map((w) => `<div>${esc(w)}</div>`).join("")}${skipped.length > 20 ? `<div>…and ${count(skipped.length - 20)} more.</div>` : ""}</details>` : ""}
    </div>
    <button class="btn sm" type="button" id="import-ok">Got it</button>
  </div>`;
}
