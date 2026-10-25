// Spending patterns: what each category normally costs in each month,
// learned by gradient-boosted trees, with the months that broke the pattern.

import { esc, money, moneyShort, month, MIN_HISTORY_MONTHS } from "../format.js";
import { patternChart } from "../charts.js";

export function patternsView(el, app, [catId]) {
  const a = app.analysis;
  const cats = a.categories.filter((c) => a.patterns[c.id] && a.patterns[c.id].months.length >= MIN_HISTORY_MONTHS);
  const flaggedCount = (id) => a.patterns[id].months.filter((m) => m.flagged).length;
  const current = cats.some((c) => c.id === catId) ? catId : (cats.find((c) => flaggedCount(c.id)) ?? cats[0])?.id;
  if (!current) {
    el.innerHTML = `<div class="empty"><span class="pen">Not enough history yet.</span><span>Spending patterns need at least two years of monthly data per category.</span></div>`;
    return;
  }
  const cat = a.categories.find((c) => c.id === current);
  const p = a.patterns[current];
  const flagged = p.months.filter((m) => m.flagged);
  const m = p.model;

  el.innerHTML = `
    <header class="view-head">
      <span class="eyebrow">Spending patterns</span>
      <h1>What ${esc(cat.name.toLowerCase())} should cost, month by month</h1>
      <p>Snow removal spikes in January. Electricity peaks in July. The model learns each category's normal rhythm from the city's own history, then marks the months that broke it.</p>
    </header>

    <section class="section">
      <div class="cat-picker" role="group" aria-label="Category">
        ${cats.map((c) => `<button type="button" data-cat="${c.id}" aria-pressed="${c.id === current}">${esc(c.name)}${flaggedCount(c.id) ? `<span class="dot" title="${flaggedCount(c.id)} flagged month(s)"></span>` : ""}</button>`).join("")}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div style="display:grid;gap:4px">
          <h2>${esc(cat.name)}</h2>
          <p>${flagged.length
            ? `${flagged.length === 1 ? "One month" : `${flagged.length} months`} fell outside the normal range: ${flagged.map((f) => `<b>${month(f.month)}</b> (${money(f.actual)} vs. ${money(f.expected)} expected)`).join(", ")}.`
            : `Every month stayed inside the normal range. Total ${moneyShort(cat.total)} across ${cat.txnCount} transactions.`}</p>
        </div>
        <div class="chart-legend">
          <span><i class="ink"></i>actual</span><span><i class="dash"></i>expected</span><span><i class="band"></i>normal range</span>${flagged.length ? `<span><i class="flag"></i>flagged</span>` : ""}
        </div>
      </div>
      <div class="sheet" style="padding:var(--s-5) var(--s-4) var(--s-3)"><div id="chart"></div></div>
      ${flagged.some((f) => f.alertId) ? `<p class="fineprint">Click a circled month to open its finding.</p>` : ""}
    </section>

    <section class="explain">
      <div><h4>How the expected line is made</h4><p>Gradient boosting stacks ${m.trees} small decision trees (each ${m.maxDepth} levels deep). Every new tree corrects what the earlier trees still got wrong about the month of year and the long-term trend.</p></div>
      <div><h4>Why outliers don't skew it</h4><p>Training uses Huber loss, which stops one bad month from pulling the whole model toward it. A $14,000 July snow bill doesn't teach the model that July is snowy.</p></div>
      <div><h4>How wide "normal" is</h4><p>The shaded band is the expected value ± ${a.settings.bandK} × the model's typical error (${money(p.residualSd)} for this category). You can change the band width in settings.</p></div>
    </section>`;

  patternChart(el.querySelector("#chart"), p.months, {
    onFlag: (mm) => { if (mm.alertId) app.go(`case/${mm.alertId}`); },
  });
  el.querySelectorAll("[data-cat]").forEach((b) =>
    b.addEventListener("click", () => app.go(`patterns/${b.dataset.cat}`)),
  );
}
