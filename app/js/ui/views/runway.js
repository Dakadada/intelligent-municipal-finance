// Budget runway: a seasonal ARIMA forecast of the rest of the fiscal year,
// compared with the budget the council adopted.

import { esc, money, moneyShort, month, monthsBetween, MIN_HISTORY_MONTHS } from "../format.js";
import { runwayChart } from "../charts.js";
import { catRow } from "./review.js";

export function runwayView(el, app) {
  const fc = app.analysis.forecast;
  const s = app.analysis.summary;
  const history = monthsBetween(s.firstDate, app.analysis.asOf);
  if (!fc || !fc.total || history < MIN_HISTORY_MONTHS) {
    el.innerHTML = `<div class="empty"><span class="pen">No forecast yet.</span><span>Forecasting needs at least two full years of monthly spending to learn the seasons. This file covers ${history} month${history === 1 ? "" : "s"}.</span></div>`;
    return;
  }
  const t = fc.total;
  const cats = [...fc.categories].sort((p, q) => (q.pctOfBudget ?? 0) - (p.pctOfBudget ?? 0));
  const over = cats.filter((c) => c.status === "over");
  const watch = cats.filter((c) => c.status === "watch");
  const gap = t.budget ? t.projected - t.budget : null;

  el.innerHTML = `
    <header class="view-head">
      <span class="eyebrow">Budget runway · FY${fc.fy}</span>
      <h1>${t.budget
        ? gap > 0
          ? `At this pace the city overspends by <span class="pen" style="font-size:1.15em">${moneyShort(gap)}</span>${t.overrunMonth ? ` and runs out in ${month(t.overrunMonth, true).split(" ")[0]}` : ""}.`
          : `At this pace the city finishes ${moneyShort(-gap)} under budget.`
        : "Projected spending for the rest of the year"}</h1>
      <p>Forecasting from ${fc.monthsObserved} months of actual spending gives administrators time to adjust before June, instead of finding out after the books close.</p>
    </header>

    <section class="section">
      <div class="section-head">
        <div class="facts" style="padding:0">
          <div class="fact"><b>${money(t.spentToDate)}</b><span>spent so far</span></div>
          <div class="fact"><b>${money(t.projected)}</b><span>projected for the year</span></div>
          ${t.budget ? `<div class="fact"><b>${money(t.budget)}</b><span>adopted budget</span></div>` : ""}
          <div class="fact"><b>${moneyShort(t.projectedLo)}–${moneyShort(t.projectedHi)}</b><span>80% range</span></div>
        </div>
        <div class="chart-legend"><span><i></i>actual</span><span><i class="dash"></i>forecast</span><span><i class="band"></i>80% range</span>${t.budget ? `<span><i class="dash ink"></i>budget</span>` : ""}</div>
      </div>
      <div class="sheet" style="padding:var(--s-5) var(--s-4) var(--s-3)"><div id="chart"></div></div>
    </section>

    <div class="grid-2">
      <section class="section">
        <div class="section-head"><h2>By category</h2>
          <p>${over.length ? `${over.length} over budget` : "None over budget"}${watch.length ? `, ${watch.length} to watch` : ""}. Light bar: projected. Dark bar: spent. Black mark: budget.</p></div>
        <div class="cats">${cats.filter((c) => c.budget).map(catRow).join("")}</div>
      </section>
      <section class="section">
        <div class="section-head"><h2>What to do about it</h2></div>
        <div class="kv" style="border-top:2px solid var(--ink)">
          ${over.length ? over.map((c) => `<div><span><b>${esc(c.name)}</b><br><span class="faint">${esc(c.headline)}</span></span><span></span></div>`).join("") : `<div><span>Nothing projects over budget. Check back after next month's books close.</span><span></span></div>`}
        </div>
        <p class="fineprint">Model: ${esc(fc.model)}. It learns each category's seasonal shape from prior years, then simulates 400 possible paths for the remaining months. The range shows where 80% of them land.</p>
      </section>
    </div>`;

  runwayChart(el.querySelector("#chart"), t, { label: "Whole-city cumulative spending for the fiscal year against the adopted budget" });
}
