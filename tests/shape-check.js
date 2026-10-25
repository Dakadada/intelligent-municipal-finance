// Checks that every field in app/ENGINE_CONTRACT.md exists with the right type.
import { runAnalysis, loadSampleLedger, analyzeContract, SAMPLE_CONTRACTS, DEFAULT_SETTINGS, parseLedgerCSV, CSV_TEMPLATE } from "../app/js/engine.js";

let problems = 0;
function need(obj, path, spec, where) {
  for (const [key, type] of Object.entries(spec)) {
    const v = obj?.[key];
    const ok = type === "any" ? key in (obj || {}) :
      type === "num|null" ? (v === null || typeof v === "number") :
      type === "str|null" ? (v === null || typeof v === "string") :
      type === "array" ? Array.isArray(v) : typeof v === type;
    if (!ok) { problems++; console.log(`BAD ${where}.${key}: expected ${type}, got ${JSON.stringify(v)?.slice(0, 60)}`); }
  }
}
const ledger = loadSampleLedger();
need(ledger, "", { town: "object", txns: "array", budgets: "object" }, "ledger");
need(ledger.town, "", { name: "string", state: "string", population: "number", fyStartMonth: "number", asOf: "string", approvalThreshold: "number" }, "town");
need(ledger.txns[0], "", { id: "string", date: "string", fy: "any", vendor: "string", categoryId: "string", category: "string", dept: "string", amount: "number", invoice: "string", description: "string", method: "string", planted: "any" }, "ledger.txn");

const a = runAnalysis(ledger);
need(a, "", { town: "object", asOf: "string", settings: "object", summary: "object", categories: "array", txns: "array", alerts: "array", vendors: "array", patterns: "object", forecast: "object", evaluation: "object" }, "analysis");
need(a.summary, "", { txnCount: "number", totalSpend: "number", firstDate: "string", lastDate: "string", currentFy: "any", fyTotals: "array", alertCount: "number", criticalCount: "number", highCount: "number", mediumCount: "number", flaggedDollars: "number", vendorCount: "number", rawVendorNames: "number" }, "summary");
need(a.summary.fyTotals[0], "", { fy: "any", total: "number" }, "fyTotals[0]");
need(a.categories[0], "", { id: "string", name: "string", dept: "string", total: "number", txnCount: "number" }, "categories[0]");
need(a.txns[0], "", { vendorCanonical: "string", ifScore: "number", ifTop: "array", alertIds: "array", id: "string", amount: "number" }, "txns[0]");
const withTop = a.txns.find((t) => t.ifTop.length);
need(withTop.ifTop[0], "", { feature: "string", label: "string", value: "any", display: "string", percentile: "number" }, "ifTop[0]");
if (withTop.ifTop.length !== 3) { problems++; console.log("ifTop length", withTop.ifTop.length); }
const types = new Set(["duplicate", "split", "above-similar", "vendor-increase", "new-vendor", "seasonal", "isolation"]);
const dets = new Set(["rules", "isolation-forest", "gbm-baseline", "vendor-trend", "fuzzy-match"]);
a.alerts.forEach((al, i) => {
  need(al, "", { id: "string", type: "string", severity: "string", score: "number", title: "string", headline: "string", reasons: "array", detectors: "array", txnIds: "array", vendor: "string", category: "string", categoryId: "string", amount: "number", date: "string" }, `alerts[${i}]`);
  if (!types.has(al.type)) { problems++; console.log("bad type", al.type); }
  if (!["critical", "high", "medium"].includes(al.severity)) { problems++; console.log("bad sev", al.severity); }
  if (al.score < 0 || al.score > 1) { problems++; console.log("score range", al.id); }
  if (al.reasons.length < 1 || al.reasons.length > 4) { problems++; console.log("reasons len", al.id, al.reasons.length); }
  for (const d of al.detectors) if (!dets.has(d)) { problems++; console.log("bad detector", d); }
});
const rank = { critical: 0, high: 1, medium: 2 };
for (let i = 1; i < a.alerts.length; i++) {
  const p = a.alerts[i - 1], c = a.alerts[i];
  if (rank[p.severity] > rank[c.severity] || (rank[p.severity] === rank[c.severity] && p.score < c.score)) { problems++; console.log("sort order broken at", i); break; }
}
need(a.vendors[0], "", { canonical: "string", aliases: "array", similarity: "number", txnCount: "number", total: "number", firstSeen: "string", lastSeen: "string", avgInvoice: "number", recentAvg: "num|null", priorAvg: "num|null", changePct: "num|null", categoryIds: "array", alertIds: "array", monthly: "array" }, "vendors[0]");
need(a.vendors[0].monthly[0], "", { month: "string", total: "number" }, "vendor.monthly[0]");
const pk = Object.keys(a.patterns)[0];
const p = a.patterns[pk];
need(p, "", { model: "object", residualSd: "number", months: "array" }, "patterns[x]");
need(p.model, "", { trees: "number", learningRate: "number", maxDepth: "number", loss: "string", features: "array" }, "pattern.model");
need(p.months[0], "", { month: "string", actual: "number", expected: "number", lower: "number", upper: "number", flagged: "boolean", alertId: "any" }, "pattern.months[0]");
const f = a.forecast;
need(f, "", { fy: "any", model: "string", monthsObserved: "number", monthsForecast: "number", total: "object", categories: "array" }, "forecast");
need(f.total, "", { budget: "num|null", spentToDate: "number", projected: "number", projectedLo: "number", projectedHi: "number", overrunMonth: "str|null", months: "array" }, "forecast.total");
if (f.total.months.length !== 12) { problems++; console.log("forecast months", f.total.months.length); }
need(f.total.months[0], "", { month: "string", actual: "num|null", forecast: "num|null", lo: "any", hi: "any", cumActual: "any", cumForecast: "any", cumLo: "any", cumHi: "any" }, "forecast.months[0]");
need(f.categories[0], "", { categoryId: "string", name: "string", budget: "any", spentToDate: "number", projected: "number", projectedLo: "number", projectedHi: "number", pctOfBudget: "any", status: "string", overrunMonth: "str|null", headline: "string" }, "forecast.cat[0]");
need(a.evaluation, "", { total: "number", caught: "number", cases: "array", alertsOnPlanted: "number", alertsTotal: "number" }, "evaluation");
need(a.evaluation.cases[0], "", { id: "any", label: "string", pattern: "string", caught: "boolean", alertIds: "array" }, "evaluation.cases[0]");

for (const c of SAMPLE_CONTRACTS) {
  need(c, "", { id: "string", title: "string", vendor: "string", category: "string", annualValue: "number", text: "string" }, "contract");
  const r = analyzeContract(c.text);
  need(r, "", { score: "number", grade: "string", verdict: "string", terms: "object", findings: "array", sentences: "array", model: "object" }, "contractAnalysis");
  need(r.terms, "", { termMonths: "any", autoRenew: "any", escalatorPct: "any", capPct: "any", noticeDays: "any", totalValue: "any", competitiveBid: "any" }, "terms");
  if (r.findings[0]) need(r.findings[0], "", { id: "string", label: "string", severity: "string", explanation: "string", sentenceIndex: "number" }, "finding");
  need(r.sentences[0], "", { text: "string", start: "number", end: "number", risk: "number", tags: "array" }, "sentence");
  need(r.model, "", { type: "string", trainingClauses: "number", vocabSize: "number" }, "model");
}
const keys = Object.keys(DEFAULT_SETTINGS).join();
if (keys !== "similarPct,dupWindowDays,vendorIncreasePct,approvalThreshold,newVendorMin,ifThreshold,bandK,vendorSimilarity") { problems++; console.log("settings keys", keys); }
const csv = parseLedgerCSV(CSV_TEMPLATE);
need(csv, "", { ledger: "object", warnings: "array" }, "csv");
if (csv.ledger.txns.length !== 3) { problems++; console.log("csv template rows", csv.ledger.txns.length); }
const a2 = runAnalysis(csv.ledger);
if (a2.evaluation !== null) { problems++; console.log("csv evaluation should be null"); }
console.log(problems === 0 ? "SHAPE CHECK OK" : `SHAPE CHECK: ${problems} problems`);
