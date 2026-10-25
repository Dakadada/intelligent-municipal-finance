// Vendors: who the city pays, after merging different spellings of the same
// vendor, with each vendor's price trend.

import { esc, money, moneyShort, pct, count, date } from "../format.js";
import { sparkline } from "../charts.js";

let sortKey = "total";

export function vendorsView(el, app) {
  const a = app.analysis;
  const merged = a.vendors.filter((v) => v.aliases.length > 1);
  const rising = a.vendors.filter((v) => v.changePct != null && v.changePct > a.settings.vendorIncreasePct);
  const catName = Object.fromEntries(a.categories.map((c) => [c.id, c.name]));

  el.innerHTML = `
    <header class="view-head">
      <span class="eyebrow">Vendors</span>
      <h1>${count(a.summary.rawVendorNames)} names on the books. <span class="pen" style="font-size:1.12em">${count(a.summary.vendorCount)} actual vendors.</span></h1>
      <p>Clerks type vendor names however they come. Red Pen reduces each name to its core words and compares them letter by letter (Jaro-Winkler similarity). That way "Bobs Plumbing" and "Bob's Plumbing Service" count as one plumber, and a duplicate bill can't hide behind a typo.</p>
    </header>

    ${merged.length ? `
    <section class="section">
      <div class="section-head"><h2>Merged spellings</h2><p>Names scoring at least ${a.settings.vendorSimilarity.toFixed(2)} similar were combined. You can change this cutoff in settings.</p></div>
      <div class="kv" style="border-top:2px solid var(--ink)">
        ${merged.map((v) => `<div><span><b>${esc(v.canonical)}</b><span class="aliases">${v.aliases.map((n) => `<span class="alias ${n === v.canonical ? "" : "merged"}">${esc(n)}</span>`).join("")}</span></span><span>${(v.similarity * 100).toFixed(0)}% similar · ${count(v.txnCount)} payments</span></div>`).join("")}
      </div>
    </section>` : ""}

    <section class="section">
      <div class="section-head">
        <h2>Every vendor</h2>
        <div class="seg" role="group" aria-label="Sort by">
          ${[["total", "Total paid"], ["change", "Price change"], ["alerts", "Findings"]].map(([k, l]) => `<button type="button" data-sort="${k}" aria-pressed="${sortKey === k}">${l}</button>`).join("")}
        </div>
      </div>
      ${rising.length ? `<p class="muted" style="font-size:14px">${rising.length === 1 ? "One vendor's" : `${rising.length} vendors'`} average invoice rose more than ${a.settings.vendorIncreasePct}% over the last 12 months: ${rising.map((v) => `<b>${esc(v.canonical)}</b> (${pct(v.changePct)})`).join(", ")}.</p>` : ""}
      <div class="table-wrap"><table class="t">
        <thead><tr><th>Vendor</th><th>Category</th><th class="r">Payments</th><th class="r">Total paid</th><th class="r">Avg. invoice</th><th class="r">12-mo change</th><th>Last 24 months</th><th class="r">Findings</th></tr></thead>
        <tbody id="rows"></tbody>
      </table></div>
    </section>`;

  const renderRows = () => {
    const list = [...a.vendors].sort((p, q) =>
      sortKey === "change" ? (q.changePct ?? -1e9) - (p.changePct ?? -1e9)
        : sortKey === "alerts" ? q.alertIds.length - p.alertIds.length || q.total - p.total
        : q.total - p.total);
    el.querySelector("#rows").innerHTML = list.map((v) => {
      const up = v.changePct != null && v.changePct > a.settings.vendorIncreasePct;
      const months = v.monthly.slice(-24).map((m) => m.total);
      const link = v.alertIds.length ? `#/case/${v.alertIds[0]}` : null;
      return `<tr class="${link ? "click" : ""}" ${link ? `data-href="${link}"` : ""}>
        <td><b>${esc(v.canonical)}</b>${v.aliases.length > 1 ? `<div class="faint" style="font-size:12px">${v.aliases.length} spellings merged</div>` : ""}<div class="faint" style="font-size:12px">since ${date(v.firstSeen)}</div></td>
        <td class="muted">${v.categoryIds.map((c) => esc(catName[c] ?? c)).join(", ")}</td>
        <td class="r">${count(v.txnCount)}</td>
        <td class="r"><b>${moneyShort(v.total)}</b></td>
        <td class="r">${money(v.avgInvoice)}</td>
        <td class="r"><span class="delta ${up ? "up" : v.changePct < 0 ? "down" : ""}">${v.changePct == null ? "—" : pct(v.changePct)}</span></td>
        <td>${sparkline(months, { flagged: up || v.alertIds.length > 0 })}</td>
        <td class="r">${v.alertIds.length ? `<span class="pen" style="font-size:20px">${v.alertIds.length}</span>` : `<span class="faint">—</span>`}</td>
      </tr>`;
    }).join("");
  };
  renderRows();

  el.addEventListener("click", (e) => {
    const s = e.target.closest("[data-sort]");
    if (s) {
      sortKey = s.dataset.sort;
      el.querySelectorAll("[data-sort]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.sort === sortKey));
      renderRows();
      return;
    }
    const tr = e.target.closest("tr[data-href]");
    if (tr) location.hash = tr.dataset.href;
  });
}
