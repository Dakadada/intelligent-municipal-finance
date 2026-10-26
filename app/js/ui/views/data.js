// Settings: which books are loaded, and how sensitive each check is.
// Uploading a file lives on the start screen. Everything runs in this browser.

import { esc, count, money, date } from "../format.js";
import { DEFAULT_SETTINGS } from "../../engine.js";
import { store } from "../store.js";

const SLIDERS = [
  { key: "similarPct", label: "Above similar transactions", min: 10, max: 100, step: 5, fmt: (v) => `${v}%`,
    help: "Flag a payment this much higher than comparable ones from the same vendor or category." },
  { key: "dupWindowDays", label: "Duplicate window", min: 7, max: 365, step: 1, fmt: (v) => `${v} days`,
    help: "Two payments of the same amount to the same vendor within this window count as a possible duplicate." },
  { key: "vendorIncreasePct", label: "Vendor price increase", min: 3, max: 50, step: 1, fmt: (v) => `${v}% / yr`,
    help: "Flag a vendor whose average invoice rose more than this over the last 12 months." },
  { key: "approvalThreshold", label: "Council approval limit", min: 1000, max: 25000, step: 500, fmt: (v) => money(v),
    help: "Purchases above this need approval. Several invoices just under it in a few days look like a split purchase." },
  { key: "newVendorMin", label: "New vendor, large first payment", min: 2000, max: 50000, step: 1000, fmt: (v) => money(v),
    help: "A first-ever payment to a vendor above this amount gets a second look." },
  { key: "ifThreshold", label: "Anomaly score cutoff", min: 0.5, max: 0.8, step: 0.01, fmt: (v) => v.toFixed(2),
    help: "Isolation Forest scores above this are flagged on their own. Lower finds more; higher finds fewer." },
  { key: "bandK", label: "Normal range width", min: 1.5, max: 5, step: 0.25, fmt: (v) => `± ${v} × error`,
    help: "How far a month can stray from the expected-spend model before it's flagged." },
  { key: "vendorSimilarity", label: "Vendor name matching", min: 0.8, max: 0.99, step: 0.01, fmt: (v) => `${Math.round(v * 100)}% similar`,
    help: "How alike two vendor names must be before they're treated as the same vendor." },
];

export function dataView(el, app) {
  const s = app.analysis.summary;
  el.innerHTML = `
    <header class="view-head">
      <span class="eyebrow">Settings</span>
      <h1>Data and sensitivity</h1>
      <p>Choose which books Red Pen checks, and how sensitive each check is. Changes re-run the whole analysis in your browser.</p>
    </header>

    <div class="grid-2">
      <section class="section">
        <div class="section-head"><h2>Data source</h2></div>
        <div class="source sheet">
          <span class="eyebrow">${app.source === "sample" ? "Sample data" : "Your file"}</span>
          <b>${app.source === "sample" ? "Willow Creek, Iowa (made-up town)" : esc(app.uploadName)}</b>
          <p class="fineprint">${count(s.txnCount)} payments, ${date(s.firstDate)} to ${date(s.lastDate)} · analyzed in ${Math.round(app.runtimeMs)} ms.${app.source === "sample" ? " Ten problems were planted in its books to test Red Pen." : " Stored only in this browser."}</p>
          <div class="toolbar">
            <a class="btn primary" href="#/start">${app.source === "sample" ? "Upload your city's spending" : "Upload a different file"}</a>
            ${app.source === "upload" ? `<button class="btn" type="button" id="sample">Switch to the sample town</button>` : ""}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Sensitivity</h2><p id="live">${count(s.alertCount)} findings at these settings.</p></div>
        <div class="sliders" style="grid-template-columns:1fr">
          ${SLIDERS.map((x) => `
            <div class="slider">
              <div class="top"><label for="s-${x.key}">${x.label}</label><output id="o-${x.key}">${x.fmt(app.settings[x.key])}</output></div>
              <input type="range" id="s-${x.key}" data-key="${x.key}" min="${x.min}" max="${x.max}" step="${x.step}" value="${app.settings[x.key]}">
              <p>${x.help}</p>
            </div>`).join("")}
        </div>
        <div class="toolbar">
          <button class="btn" type="button" id="reset">Restore defaults</button>
          <button class="btn ghost" type="button" id="clear">Clear my review decisions</button>
        </div>
        <p class="fineprint">Defaults follow Iowa State Auditor guidance: 25% above similar, a 90-day duplicate window, and a 10% yearly vendor increase.</p>
      </section>
    </div>`;

  // Sliders re-run the whole analysis live (debounced so dragging stays smooth).
  let timer;
  el.querySelectorAll('input[type="range"]').forEach((inp) => {
    inp.addEventListener("input", () => {
      const def = SLIDERS.find((x) => x.key === inp.dataset.key);
      const v = Number(inp.value);
      el.querySelector(`#o-${def.key}`).textContent = def.fmt(v);
      clearTimeout(timer);
      timer = setTimeout(() => {
        app.setSettings({ [def.key]: v });
        el.querySelector("#live").textContent = `${count(app.analysis.summary.alertCount)} findings at these settings.`;
      }, 160);
    });
  });
  el.querySelector("#reset").addEventListener("click", () => {
    app.setSettings({ ...DEFAULT_SETTINGS });
    dataView(replace(el), app);
  });
  el.querySelector("#clear").addEventListener("click", (e) => {
    store.clearReviews();
    app.chrome();
    e.target.textContent = "Decisions cleared";
    e.target.disabled = true;
  });
  el.querySelector("#sample")?.addEventListener("click", () => {
    app.useSample();
    dataView(replace(el), app);
  });
}

function replace(el) {
  const fresh = el.cloneNode(false);
  el.replaceWith(fresh);
  return fresh;
}
