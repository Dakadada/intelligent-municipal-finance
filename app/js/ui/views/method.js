// How it works: the pipeline in plain English, proof that it catches known
// problems, the public audit log, and the limits of the system.

import { esc, money, timestamp, count } from "../format.js";
import { store } from "../store.js";

export function methodView(el, app) {
  const a = app.analysis;
  const ev = a.evaluation;
  const byDetector = (d) => a.alerts.filter((x) => x.detectors.includes(d)).length;
  const log = store.log;

  el.innerHTML = `
    <header class="view-head">
      <span class="eyebrow">How it works</span>
      <h1>Every flag can be traced to a reason a person can check</h1>
      <p>Red Pen uses several established methods, each aimed at a different kind of waste. Some learn from labeled examples and some don't, so each one covers gaps the others leave. Nothing here is a black box. Every alert lists its reasons with numbers a clerk could check by hand.</p>
    </header>

    ${ev ? `
    <section class="section">
      <div class="section-head">
        <h2>Does it work? ${ev.caught} of ${ev.total} planted problems caught</h2>
        <p>We planted ${ev.total} problems in the sample town's books, each modeled on a pattern from Iowa State Auditor reports. The models never see which transactions were planted. This scorecard checks the results afterward.</p>
      </div>
      <div class="scorecard">
        ${ev.cases.map((c) => {
          const tag = c.alertIds[0] ? "a" : "div";
          return `<${tag} class="sc-row ${c.caught ? "" : "miss"}" ${c.alertIds[0] ? `href="#/case/${c.alertIds[0]}"` : ""}>
            <span class="mark">${c.caught ? "✓" : "✗"}</span>
            <span>${esc(c.label)}<small>${esc(c.pattern)}</small></span>
            <span class="faint" style="font-size:12.5px">${c.caught ? (c.alertIds.length > 1 ? `${c.alertIds.length} findings · open →` : "open finding →") : "missed"}</span>
          </${tag}>`;
        }).join("")}
      </div>
      <p class="fineprint">${count(ev.alertsOnPlanted)} of ${count(ev.alertsTotal)} findings involve a planted problem. The rest are real patterns in the generated data that a clerk would also want to look at, such as months that ran well above normal.</p>
    </section>` : ""}

    <section class="section">
      <div class="section-head"><h2>The pipeline</h2><p>Each step runs in this browser, in order, every time the books or the settings change.</p></div>
      <div class="steps">
        <div class="step"><div><h3>Match vendor names</h3>
          <p>Names are cleaned up (punctuation, "LLC", "Inc", "Service" removed), then compared with Jaro-Winkler similarity. ${count(a.summary.rawVendorNames)} spellings became ${count(a.summary.vendorCount)} vendors.</p>
          <div class="chips"><span class="chip">Fuzzy matching</span><span class="chip neutral">${byDetector("fuzzy-match")} findings</span></div></div></div>
        <div class="step"><div><h3>Apply auditor rules</h3>
          <p>Checks drawn from Iowa State Auditor findings: duplicate invoices, purchases split under the approval limit, large first payments to new vendors, payments well above similar ones, and vendor price creep. All thresholds are adjustable.</p>
          <div class="chips"><span class="chip">Rules</span><span class="chip neutral">${byDetector("rules")} findings</span></div></div></div>
        <div class="step"><div><h3>Score every transaction for strangeness</h3>
          <p>An Isolation Forest builds 100 random trees that keep splitting the transactions apart. Unusual ones (odd amounts, odd days, odd vendors) get isolated in very few splits. No labeled examples of fraud are needed, which matters because small towns have none.</p>
          <div class="chips"><span class="chip">Isolation Forest · unsupervised</span><span class="chip neutral">${byDetector("isolation-forest")} findings</span></div></div></div>
        <div class="step"><div><h3>Learn what each category should cost</h3>
          <p>Gradient-boosted decision trees learn each category's normal spending for every month of the year, plus its long-term trend. Months far outside that range are flagged. Seasonal swings, like summer electricity or January snow, don't set off false alarms.</p>
          <div class="chips"><span class="chip">Gradient boosting · supervised</span><span class="chip neutral">${byDetector("gbm-baseline")} findings</span></div></div></div>
        <div class="step"><div><h3>Forecast the rest of the year</h3>
          <p>A seasonal ARIMA time-series model projects each category to June 30 and simulates 400 possible paths. If the likely path crosses the budget, administrators hear about it months early.</p>
          <div class="chips"><span class="chip">Seasonal ARIMA</span><a class="chip neutral" href="#/runway">See the runway →</a></div></div></div>
        <div class="step"><div><h3>Read contracts</h3>
          <p>Natural language processing splits a contract into sentences. A clause library and a naive Bayes classifier then mark terms linked to cost overruns, such as auto-renewal without rebidding or price escalators without a cap.</p>
          <div class="chips"><span class="chip">NLP · naive Bayes</span><a class="chip neutral" href="#/contracts">See contracts →</a></div></div></div>
        <div class="step"><div><h3>Explain, then let a person decide</h3>
          <p>Matching findings are merged into a single alert with reasons in plain English. A clerk marks each one reviewed, sends it to the council, or dismisses it, and every decision goes in the audit log. Red Pen never holds or changes a payment.</p></div></div>
      </div>
    </section>

    <div class="grid-2">
      <section class="section">
        <div class="section-head"><h2>Audit log</h2><p>Every human decision, newest first. This is the public record of what was flagged and what was done.</p></div>
        ${log.length ? `<div class="log">${log.map((l) => `<div><time>${timestamp(l.at)}</time><span><b>${esc({ reviewed: "Reviewed", dismissed: "Not a problem", escalated: "Sent to council", reopened: "Reopened" }[l.kind])}</b> · ${esc(l.title)}, ${esc(l.vendor)}, ${money(l.amount)}${l.note ? `<br><span class="faint">“${esc(l.note)}”</span>` : ""}</span></div>`).join("")}</div>`
          : `<div class="empty" style="padding-top:0"><span class="muted">No decisions yet. Open a finding from the <a href="#/review">review queue</a> and mark it reviewed. It will appear here with a timestamp.</span></div>`}
      </section>
      <section class="section">
        <div class="section-head"><h2>Limits we take seriously</h2></div>
        <div class="kv" style="border-top:2px solid var(--ink)">
          <div><span><b>It gives advice, not decisions.</b> A flag means "look at this," not "this is fraud." Many flags will have innocent explanations.</span><span></span></div>
          <div><span><b>The sample data is generated.</b> Willow Creek is fictional. Real accuracy has to be measured in a pilot, ideally a county with towns of different sizes, checked against traditional audits.</span><span></span></div>
          <div><span><b>Data quality matters more than the model.</b> Inconsistent categories or missing invoice numbers weaken the rules. The vendor matcher helps, but it can't fix everything.</span><span></span></div>
          <div><span><b>Privacy.</b> It only uses institutional spending records, never personal financial data. Files stay in your browser.</span><span></span></div>
        </div>
      </section>
    </div>

    <section class="section">
      <div class="section-head"><h2>Who built this</h2></div>
      <p class="muted" style="max-width:72ch">David Shi, Srihari Kumaresan, and Alex Du, Johnston, Iowa. Built for the 2026 Congressional App Challenge. We used AI coding assistants (Anthropic's Claude and OpenAI's Codex) to help write and review parts of the code and interface. That use is disclosed in full in our submission. The idea, the Iowa research behind the rules, and the original proposal are our own.</p>
    </section>`;
}
