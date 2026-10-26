// The upload box, shared by the start screen and Settings. The file is read
// in this browser and never sent anywhere.

import { esc } from "./format.js";
import { CSV_TEMPLATE } from "../engine.js";

export function uploadBox() {
  return `
    <label class="drop" id="drop" for="file">
      <svg class="drop-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span class="drop-title">Drop your spending file here</span>
      <span class="muted">or <u>choose a CSV file</u> from your computer</span>
      <input id="file" type="file" accept=".csv,text/csv" class="sr">
    </label>
    <div id="upload-msg" aria-live="polite"></div>
    <p class="fineprint">Export payments from MUNIS, QuickBooks, Caselle, or a spreadsheet as a CSV. It needs a date, vendor, amount, and category (or account) for each payment. Common column names like <i>Payee</i>, <i>Check Date</i>, and <i>Net Amount</i> are recognized. <button class="linklike" type="button" id="template">Download a template</button></p>`;
}

export function wireUpload(el, app, onDone) {
  const msg = el.querySelector("#upload-msg");
  const handle = async (file) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      msg.innerHTML = `<p class="notice">That file is ${(file.size / 1048576).toFixed(1)} MB. Export one fiscal year at a time (under 15 MB).</p>`;
      return;
    }
    msg.innerHTML = `<p class="notice ok">Reading ${esc(file.name)}…</p>`;
    const text = await file.text();
    const res = app.useUpload(file.name, text);
    if (!res.ok) {
      const missing = res.warnings.filter((w) => w.startsWith("Missing"));
      msg.innerHTML = `<p class="notice"><b>Red Pen couldn't read payments from ${esc(file.name)}.</b><br>${missing.length
        ? `It looked for columns named like date, vendor, amount, and category but couldn't find ${missing.map((w) => `<b>${esc(w.replace(/^Missing required column: |\.$/g, ""))}</b>`).join(", ")}. ${missing.length === 1 ? "Rename that column" : "Rename those columns"} in your spreadsheet, or start from the template.`
        : `No rows had a valid date, vendor, amount, and category.${res.warnings.length ? `<br>${res.warnings.slice(0, 3).map(esc).join("<br>")}` : ""}`}</p>`;
      return;
    }
    onDone();
  };
  el.querySelector("#file").addEventListener("change", (e) => handle(e.target.files[0]));
  const drop = el.querySelector("#drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); handle(e.dataTransfer.files[0]); });
  el.querySelector("#template").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: "text/csv" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "red-pen-template.csv" });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
