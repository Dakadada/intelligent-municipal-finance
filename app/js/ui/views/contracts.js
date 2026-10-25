// Contract markup: read a contract before the council signs it. Risky clauses
// get a red pencil underline and a margin note; protective clauses get green.

import { esc, money } from "../format.js";
import { analyzeContract, SAMPLE_CONTRACTS } from "../../engine.js";

let selected = null; // contract id, or "paste"
let pasted = "";

export function contractsView(el, app, [id]) {
  const graded = SAMPLE_CONTRACTS.map((c) => ({ ...c, result: analyzeContract(c.text) }));
  selected = id ?? selected ?? graded.slice().sort((p, q) => p.result.score - q.result.score)[0]?.id;

  el.innerHTML = `
    <header class="view-head">
      <span class="eyebrow">Contracts</span>
      <h1>Read the fine print before the council signs</h1>
      <p>Small towns sign few contracts, so they rarely build up the experience to spot terms that lead to cost overruns. Red Pen marks those terms the way an experienced procurement officer would, using a clause library plus a naive Bayes model trained on labeled contract language.</p>
    </header>

    <section class="contract-list" role="group" aria-label="Choose a contract">
      ${graded.map((c) => `
        <button class="ccard" type="button" data-id="${c.id}" aria-pressed="${selected === c.id}">
          <span class="ccard-top"><b>${esc(c.title)}</b><span class="grade" style="color:${gradeColor(c.result.grade)}">${c.result.grade}</span></span>
          <span>${esc(c.vendor)} · ${money(c.annualValue)}/yr</span>
        </button>`).join("")}
      <button class="ccard" type="button" data-id="paste" aria-pressed="${selected === "paste"}">
        <b>Paste a contract</b><span>Check any agreement before it's signed</span>
      </button>
    </section>

    <section id="doc"></section>`;

  el.querySelectorAll(".ccard").forEach((b) =>
    b.addEventListener("click", () => {
      selected = b.dataset.id;
      el.querySelectorAll(".ccard").forEach((x) => x.setAttribute("aria-pressed", x === b));
      renderDoc(el.querySelector("#doc"), graded);
    }),
  );
  renderDoc(el.querySelector("#doc"), graded);
}

function renderDoc(box, graded) {
  if (selected === "paste") {
    box.innerHTML = `
      <div class="section">
        <div class="field">
          <label for="paste">Contract text</label>
          <textarea class="input" id="paste" rows="12" placeholder="Paste the terms here. Red Pen reads them in your browser; nothing is uploaded.">${esc(pasted)}</textarea>
        </div>
        <div class="toolbar"><button class="btn primary" type="button" id="analyze">Mark up this contract</button><span class="fineprint">Works best on the term, price, renewal, and termination sections.</span></div>
        <div id="pasted-result"></div>
      </div>`;
    const run = () => {
      pasted = box.querySelector("#paste").value;
      const out = box.querySelector("#pasted-result");
      if (pasted.trim().length < 40) {
        out.innerHTML = `<p class="notice">Paste at least a few sentences of contract language to analyze.</p>`;
        return;
      }
      out.innerHTML = markup({ title: "Pasted contract", vendor: "", text: pasted }, analyzeContract(pasted));
      wire(out);
    };
    box.querySelector("#analyze").addEventListener("click", run);
    if (pasted.trim()) run();
    return;
  }
  const c = graded.find((x) => x.id === selected) ?? graded[0];
  box.innerHTML = markup(c, c.result);
  wire(box);
}

function markup(c, r) {
  // Number findings in reading order so margin notes line up with the text.
  const ordered = [...r.findings].sort((p, q) => (p.sentenceIndex ?? 1e9) - (q.sentenceIndex ?? 1e9));
  const noteNo = new Map(ordered.map((f, i) => [f.id, i + 1]));
  const findingById = new Map(r.findings.map((f) => [f.id, f]));

  const body = r.sentences.map((s, i) => {
    const fs = s.tags.map((t) => findingById.get(t)).filter(Boolean);
    const bad = fs.some((f) => f.severity === "high" || f.severity === "medium" || f.severity === "low");
    const good = !bad && fs.some((f) => f.severity === "good");
    const cls = bad ? "risk" : good ? "good" : "";
    const sups = fs.map((f) => `<sup class="n ${f.severity === "good" ? "good" : ""}">${noteNo.get(f.id)}</sup>`).join("");
    return `<span class="sent ${cls}" data-s="${i}" title="${cls === "risk" ? `Model: ${(s.risk * 100).toFixed(0)}% likely risky language` : ""}">${esc(s.text)}</span>${sups} `;
  }).join("");

  const t = r.terms ?? {};
  const term = (label, v) => `<div><span>${label}</span><b>${v ?? "—"}</b></div>`;

  return `
    <div class="doc">
      <article class="paper">
        <p class="doc-title">${esc(c.title)}${c.vendor ? ` · ${esc(c.vendor)}` : ""}</p>
        <p>${body}</p>
      </article>
      <aside class="margin">
        <div class="stamp g-${r.grade}">Grade<b>${r.grade}</b>${r.score} / 100</div>
        <p style="font-size:14px">${esc(r.verdict)}</p>
        <div class="notes">
          ${ordered.map((f) => `<button type="button" class="mnote ${f.severity === "good" ? "good" : f.severity === "low" ? "low" : ""}" data-s="${f.sentenceIndex ?? ""}">${noteNo.get(f.id)}. ${esc(f.label)}<small>${esc(f.explanation)}</small></button>`).join("") || `<p class="fineprint">No risky or protective clauses found.</p>`}
        </div>
      </aside>
    </div>
    <div class="section" style="margin-top:var(--s-6)">
      <span class="eyebrow">Key terms Red Pen pulled out</span>
      <div class="terms">
        ${term("Term", t.termMonths ? `${t.termMonths} months` : null)}
        ${term("Auto-renews", t.autoRenew == null ? null : t.autoRenew ? "Yes" : "No")}
        ${term("Annual increase", t.escalatorPct != null ? `${t.escalatorPct}%` : null)}
        ${term("Increase cap", t.capPct != null ? `${t.capPct}%` : null)}
        ${term("Notice to cancel", t.noticeDays != null ? `${t.noticeDays} days` : null)}
        ${term("Competitively bid", t.competitiveBid == null ? null : t.competitiveBid ? "Yes" : "No")}
        ${term("Total value", t.totalValue != null ? money(t.totalValue) : null)}
      </div>
      <p class="fineprint">Model: ${esc(r.model.type)}, trained on ${r.model.trainingClauses} labeled clauses (${r.model.vocabSize} words).</p>
    </div>`;
}

// Hovering a margin note highlights its sentence, and the reverse.
function wire(root) {
  const light = (i, on) => root.querySelectorAll(`.sent[data-s="${i}"]`).forEach((s) => s.classList.toggle("hot", on));
  root.querySelectorAll(".mnote[data-s]").forEach((n) => {
    n.addEventListener("mouseenter", () => light(n.dataset.s, true));
    n.addEventListener("mouseleave", () => light(n.dataset.s, false));
    n.addEventListener("focus", () => light(n.dataset.s, true));
    n.addEventListener("blur", () => light(n.dataset.s, false));
    n.addEventListener("click", () => root.querySelector(`.sent[data-s="${n.dataset.s}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  });
}

const gradeColor = (g) => (g === "A" || g === "B" ? "var(--ok)" : g === "C" ? "var(--watch)" : "var(--pencil)");
