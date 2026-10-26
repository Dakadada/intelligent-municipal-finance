// Start: what Red Pen is, and the two ways in. Checking your own city's
// spending comes first; the sample town is there for anyone without a file.

import { esc, count } from "../format.js";
import { TICKS, circleSvg } from "../pen.js";
import { uploadBox, wireUpload } from "../upload.js";

const CHECKS = [
  ["duplicate", "Duplicate payments", "The same invoice or amount paid twice, even under two spellings of a vendor's name."],
  ["split", "Split purchases", "Several invoices just under the council approval limit, a few days apart."],
  ["vendor-increase", "Price creep", "A vendor whose average invoice keeps rising year over year."],
  ["above-similar", "Above normal", "A payment well above comparable ones from the same vendor or category."],
  ["seasonal", "Out of season", "Spending that doesn't fit the month, like a snow-removal bill in July."],
  ["new-vendor", "Large first payments", "A big first-ever payment to a vendor nobody has paid before."],
];

export function startView(el, app) {
  const s = app.analysis.summary;
  const own = app.source === "upload";
  el.innerHTML = `
    <section class="welcome">
      <div class="welcome-copy">
        <span class="eyebrow">For city clerks, finance officers, and councils</span>
        <h1><span class="h1-line">Read every line of your city's books.</span> Review only <span class="circled">what needs you.${circleSvg({ seed: 3, delay: 0.3 })}</span></h1>
        <p class="lede">Red Pen checks every payment in your spending records and marks the few a person should look at: possible duplicates, split purchases, rising vendor prices, and budgets about to run out. Each flag explains itself in plain English.</p>
        <ul class="promises">
          <li><b>Private.</b> Your file is read in this browser and never uploaded.</li>
          <li><b>Advice only.</b> Red Pen never blocks or changes a payment. People decide.</li>
          <li><b>Checkable.</b> Every flag lists numbers you can verify by hand.</li>
        </ul>
      </div>

      <div class="welcome-card sheet">
        <h2>${own ? "Check a different file" : "Check your city's spending"}</h2>
        ${own ? `<p class="fineprint">Now checking <b>${esc(app.uploadName)}</b> · ${count(s.txnCount)} payments. <a href="#/review">Back to its review queue →</a></p>` : ""}
        ${uploadBox()}
        <div class="or"><span>or</span></div>
        <button class="btn sample-btn" type="button" id="sample">
          <span><b>Explore a sample town</b><small>Willow Creek, Iowa: a made-up town with 10 problems planted in five years of books</small></span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>How it works</h2></div>
      <div class="howto">
        <div><span class="howto-n">1</span><h3>Export your spending</h3><p>Save payments from your accounting system or spreadsheet as a CSV. Several years works best, since Red Pen learns what's normal for your city.</p></div>
        <div><span class="howto-n">2</span><h3>Red Pen reads every line</h3><p>Rules drawn from Iowa State Auditor findings and four statistical models check each payment. It takes about a second.</p></div>
        <div><span class="howto-n">3</span><h3>You decide</h3><p>Mark each finding reviewed, send it to the council, or dismiss it. Every decision goes into an audit log.</p></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>What it looks for</h2><p>Patterns taken from real Iowa audit findings. <a href="#/method">How each check works →</a></p></div>
      <div class="checks">
        ${CHECKS.map(([type, title, text]) => `
          <div class="check"><span class="tick-mark" aria-hidden="true">${TICKS[type].mark}</span><div><h3>${title}</h3><p>${text}</p></div></div>`).join("")}
      </div>
      <p class="fineprint">It also forecasts which budget lines will run out before year end, and marks risky terms in contracts before they're signed.</p>
    </section>`;

  wireUpload(el, app, () => app.enter());
  el.querySelector("#sample").addEventListener("click", () => {
    if (app.source !== "sample") app.useSample();
    app.enter();
  });
}
