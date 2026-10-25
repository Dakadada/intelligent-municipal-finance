// Verification report: run the engine on the sample ledger and print key numbers.
import { runAnalysis, loadSampleLedger, analyzeContract, SAMPLE_CONTRACTS } from "../app/js/engine.js";

const ledger = loadSampleLedger();
const start = performance.now();
const result = runAnalysis(ledger);
const runtimeMs = Math.round(performance.now() - start);

console.log("txns:", result.txns.length, " runtime ms:", runtimeMs);
const counts = {};
for (const alert of result.alerts) {
  const key = `${alert.type}/${alert.severity}`;
  counts[key] = (counts[key] || 0) + 1;
}
console.log("alerts total:", result.alerts.length, counts);
console.log("summary severities:", result.summary.criticalCount, result.summary.highCount, result.summary.mediumCount);

const ev = result.evaluation;
console.log(`evaluation: caught ${ev.caught}/${ev.total}; alertsOnPlanted ${ev.alertsOnPlanted}/${ev.alertsTotal}`);
for (const c of ev.cases) console.log(c.caught ? "  caught" : "  MISSED", c.id, c.label, c.alertIds.join(","));

console.log("\ntop 15 headlines:");
result.alerts.slice(0, 15).forEach((a) => console.log(` [${a.severity}/${a.type}] ${a.headline}`));

const f = result.forecast;
console.log("\nforecast FY", f.fy, "total", f.total.projected, "budget", f.total.budget, "overrun", f.total.overrunMonth);
for (const c of f.categories) console.log(` ${c.status.padEnd(5)} ${c.name}: ${c.projected} / ${c.budget} - ${c.headline}`);

console.log("\ncontracts:");
for (const c of SAMPLE_CONTRACTS) {
  const r = analyzeContract(c.text);
  console.log(` ${c.id}: ${r.score} ${r.grade} - ${r.verdict}`);
}
