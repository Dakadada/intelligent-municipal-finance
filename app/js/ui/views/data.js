// Your data & settings: load a city's own spending export, and tune how
// sensitive each check is. Everything runs in this browser.

import { esc, count, money } from "../format.js";
import { CSV_TEMPLATE, DEFAULT_SETTINGS } from "../../engine.js";
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
      <span class="eyebrow">Your data &amp; settings</span>
      <h1>Run it on your own city's books</h1>
      <p>Export spending from your accounting system (MUNIS, QuickBooks, Caselle, or a spreadsheet) as a CSV and drop it here. The file is read in your browser and never uploaded.</p>
    </header>

    <div class="grid-2">
      <section class="section">
        <label class="drop" id="drop" for="file">
          <span class="pen" style="font-size:26px">Drop a CSV file here</span>
          <span class="muted">or <u>choose a file</u>. Needed columns: <b>date, vendor, amount, category</b>. Optional: invoice, description, department, budget.</span>
          <input id="file" type="file" accept=".csv,text/csv" class="sr">
        </label>
        <div id="upload-msg"></div>
        <div class="toolbar">
          <button class="btn" type="button" id="template">Download template</button>
          ${app.source === "upload" ? `<button class="btn" type="button" id="sample">Switch back to the sample town</button>` : ""}
        </div>
        <pre class="code">${esc(CSV_TEMPLATE)}</pre>
        <p class="fineprint">Now showing: ${app.source === "sample" ? "Willow Creek, a fictional town with ten known problems planted in its books" : esc(app.uploadName)} · ${count(s.txnCount)} transactions · analyzed in ${Math.round(app.runtimeMs)} ms.</p>
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
  el.querySelector("#template").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: "text/csv" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "red-pen-template.csv" });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  el.querySelector("#sample")?.addEventListener("click", () => {
    app.useSample();
    dataView(replace(el), app);
  });

  const msg = el.querySelector("#upload-msg");
  const handle = async (file) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      msg.innerHTML = `<p class="notice">That file is ${(file.size / 1048576).toFixed(1)} MB. Export one fiscal year at a time (under 15 MB).</p>`;
      return;
    }
    const text = await file.text();
    const res = app.useUpload(file.name, text);
    if (!res.ok) {
      msg.innerHTML = `<p class="notice">Couldn't find any usable rows in ${esc(file.name)}. Check that it has date, vendor, amount, and category columns.${res.warnings.length ? `<br>${res.warnings.slice(0, 3).map(esc).join("<br>")}` : ""}</p>`;
      return;
    }
    location.hash = "#/review";
  };
  el.querySelector("#file").addEventListener("change", (e) => handle(e.target.files[0]));
  const drop = el.querySelector("#drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); handle(e.dataTransfer.files[0]); });
}

function replace(el) {
  const fresh = el.cloneNode(false);
  el.replaceWith(fresh);
  return fresh;
}
