// Case file: one finding, explained well enough that a clerk could defend
// the decision at a council meeting.

import { esc, money, money2, moneyShort, date, weekday, timestamp } from "../format.js";
import { vendorStrip } from "../charts.js";
import { store } from "../store.js";
import { TICKS } from "../pen.js";
import { quantile, median } from "../../algo/stats.js";

const DETECTORS = {
  rules: { label: "Auditor rule", tip: "A check taken from Iowa State Auditor findings, such as duplicate invoices or purchases split under the approval limit." },
  "isolation-forest": { label: "Isolation Forest", tip: "An unsupervised model that scores how easy a transaction is to separate from all the others. Unusual ones separate fast." },
  "gbm-baseline": { label: "Expected-spend model", tip: "Gradient-boosted trees learn what each category normally costs in each month of the year." },
  "vendor-trend": { label: "Vendor price trend", tip: "Compares a vendor's average invoice over the last 12 months with the 12 months before." },
  "fuzzy-match": { label: "Vendor name matching", tip: "Merges different spellings of the same vendor so duplicates can't hide behind a typo." },
};

const DECISIONS = {
  reviewed: { label: "Reviewed", done: "Marked reviewed" },
  escalated: { label: "Send to council", done: "Sent to council" },
  dismissed: { label: "Not a problem", done: "Marked not a problem" },
};

export function caseView(el, app, [id]) {
  const a = app.analysis;
  const idx = a.alerts.findIndex((x) => x.id === id);
  const al = a.alerts[idx];
  if (!al) {
    el.innerHTML = `<div class="empty"><span class="pen">That finding isn't in the current results.</span>
      <span>Changing a sensitivity setting re-numbers findings.</span><a class="btn sm" href="#/review">Back to the queue</a></div>`;
    return;
  }
  const byId = new Map(a.txns.map((t) => [t.id, t]));
  const txns = al.txnIds.map((t) => byId.get(t)).filter(Boolean);
  const main = txns[0];
  const vendor = a.vendors.find((v) => v.canonical === al.vendor || v.aliases.includes(al.vendor));
  const history = a.txns.filter((t) => t.vendorCanonical === (vendor?.canonical ?? al.vendor));
  // Normal range for this vendor, leaving out the flagged invoices themselves.
  const others = history.filter((t) => !al.txnIds.includes(t.id)).map((t) => t.amount);
  const normal = others.length >= 4
    ? { lo: quantile(others, 0.1), hi: quantile(others, 0.9), mid: median(others) }
    : null;
  const decision = store.decision(al);
  const tick = TICKS[al.type] ?? { mark: "?", label: al.type };
  const prev = a.alerts[idx - 1];
  const next = a.alerts[idx + 1];
  const alsoVendor = a.alerts.filter((x) => x.id !== al.id && x.vendor === al.vendor);

  el.innerHTML = `
    <div class="toolbar" style="justify-content:space-between">
      <a class="back" href="#/review">← Review queue</a>
      <span class="toolbar">
        ${prev ? `<a class="btn sm ghost" href="#/case/${prev.id}">← Previous</a>` : ""}
        <span class="faint num" style="font-size:12.5px">${idx + 1} of ${a.alerts.length}</span>
        ${next ? `<a class="btn sm ghost" href="#/case/${next.id}">Next →</a>` : ""}
      </span>
    </div>

    <div class="case">
      <div class="case-main">
        <div class="case-head">
          <div class="toolbar" style="gap:10px">
            <span class="sevchip ${al.severity}">${al.severity}</span>
            <span class="eyebrow">${esc(al.title)} · <span class="pen" style="font-size:18px;letter-spacing:0">${tick.mark}</span></span>
          </div>
          <span class="amount num">${money2(al.amount)}</span>
          <span class="muted">${esc(al.vendor)} · ${esc(al.category)}${al.date ? ` · ${date(al.date)}` : ""}</span>
        </div>

        <p class="headline">${esc(al.headline)}</p>

        <div class="section" style="gap:8px">
          <div class="section-head"><span class="eyebrow">Every invoice from ${esc(vendor?.canonical ?? al.vendor)}</span>
            <span class="chart-legend"><span><i class="flag"></i>this finding</span>${normal ? `<span><i class="band"></i>typical ${moneyShort(normal.lo)}–${moneyShort(normal.hi)}</span>` : ""}</span></div>
          <div id="strip"></div>
          ${vendor && vendor.aliases.length > 1 ? `<p class="fineprint">Billed under ${vendor.aliases.length} spellings: ${vendor.aliases.map((n) => `“${esc(n)}”`).join(", ")}. Red Pen treats them as one vendor.</p>` : ""}
        </div>

        <div class="section" style="gap:8px">
          <span class="eyebrow">Why it was flagged</span>
          <ul class="reasons">${al.reasons.map((r, i) => `<li><b>${i + 1}</b><span>${esc(r)}</span></li>`).join("")}</ul>
        </div>

        <div class="section" id="decide" style="gap:10px"></div>
      </div>

      <aside class="side">
        <div class="side-block">
          <h4>Which checks caught it</h4>
          <div class="chips">${al.detectors.map((d) => `<span class="chip" title="${esc(DETECTORS[d]?.tip ?? "")}">${esc(DETECTORS[d]?.label ?? d)}</span>`).join("")}</div>
          ${al.detectors.length > 1 ? `<p class="fineprint">Caught by ${al.detectors.length} separate checks. Agreement between methods makes a real problem more likely.</p>` : ""}
        </div>

        ${main && main.ifScore != null ? `
        <div class="side-block">
          <h4>Anomaly score</h4>
          <div class="score"><span class="big">${main.ifScore.toFixed(2)}</span><span class="fineprint">out of 1.00</span></div>
          <div class="meter" aria-hidden="true"><i style="background:${main.ifScore >= a.settings.ifThreshold ? "var(--pencil)" : "var(--ink-3)"};width:${(main.ifScore * 100).toFixed(1)}%"></i><u style="left:${(a.settings.ifThreshold * 100).toFixed(1)}%"></u></div>
          <p class="fineprint">Isolation Forest score. Above ${a.settings.ifThreshold.toFixed(2)} (the black mark) is flagged on its own. Ordinary bills score near 0.40.</p>
        </div>
        ${main.ifTop?.length ? `
        <div class="side-block">
          <h4>What made it unusual</h4>
          <div class="kv">${main.ifTop.map((f) => `<div><span>${esc(f.label)}</span><span>${esc(f.display ?? "")}${f.percentile != null ? ` · ${ordinal(Math.round(f.percentile * 100))} pct` : ""}</span></div>`).join("")}</div>
        </div>` : ""}` : ""}

        ${txns.length ? `
        <div class="side-block">
          <h4>${txns.length > 1 ? `The ${txns.length} transactions` : "Transaction"}</h4>
          <div class="kv">${txns.map((t) => `
            <div><span><b>${esc(t.invoice)}</b><br><span class="faint">${date(t.date)} · ${weekday(t.date)}${t.vendor !== (vendor?.canonical ?? t.vendor) ? `<br>billed as “${esc(t.vendor)}”` : ""}</span></span><span>${money2(t.amount)}<br><span class="faint">${esc(t.method ?? "")}</span></span></div>`).join("")}
          </div>
          <p class="fineprint">${esc(main.dept)} · ${esc(main.description)}</p>
        </div>` : ""}

        ${alsoVendor.length ? `
        <div class="side-block">
          <h4>Other findings for this vendor</h4>
          <div class="kv">${alsoVendor.map((x) => `<div><a href="#/case/${x.id}">${esc(x.title)}</a><span>${money(x.amount)}</span></div>`).join("")}</div>
        </div>` : ""}
      </aside>
    </div>`;

  vendorStrip(el.querySelector("#strip"), history, al.txnIds, { normal });
  renderDecision(el.querySelector("#decide"), app, al, decision, next);
}

function renderDecision(box, app, al, decision, next) {
  if (decision) {
    const d = DECISIONS[decision.kind];
    box.innerHTML = `
      <div class="decision ${decision.kind}"><span class="pen" style="font-size:22px;color:inherit">✓</span>
        <span>${d.done} ${timestamp(decision.at)}${decision.note ? ` · “${esc(decision.note)}”` : ""}</span></div>
      <div class="actions">
        ${next ? `<a class="btn primary" href="#/case/${next.id}">Next finding →</a>` : `<a class="btn primary" href="#/review">Back to the queue</a>`}
        <button class="btn ghost" type="button" id="reopen">Reopen</button>
      </div>`;
    box.querySelector("#reopen").addEventListener("click", () => {
      store.reopen(al);
      app.chrome();
      renderDecision(box, app, al, null, next);
    });
    return;
  }
  box.innerHTML = `
    <span class="eyebrow">Your decision</span>
    <textarea class="input note-input" id="note" placeholder="Add a note for the audit log (optional). For example: called vendor, credit memo requested."></textarea>
    <div class="actions">
      <button class="btn primary" type="button" data-kind="reviewed">Mark reviewed</button>
      <button class="btn" type="button" data-kind="escalated">Send to council</button>
      <button class="btn ghost" type="button" data-kind="dismissed">Not a problem</button>
    </div>
    <p class="fineprint">Every decision is written to the audit log with a timestamp. Red Pen recommends; people decide.</p>`;
  box.querySelectorAll("[data-kind]").forEach((b) =>
    b.addEventListener("click", () => {
      store.decide(al, b.dataset.kind, box.querySelector("#note").value.trim());
      app.chrome();
      renderDecision(box, app, al, store.decision(al), next);
    }),
  );
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
