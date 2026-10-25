// Run with bun tests/engine-report.js for a reproducible judge-facing audit.
import {
  loadSampleLedger,
  runAnalysis,
  analyzeContract,
  SAMPLE_CONTRACTS,
} from "../app/js/engine.js";
const start = performance.now(),
  a = runAnalysis(loadSampleLedger()),
  runtime = performance.now() - start;
console.log("Sample transactions:", a.summary.txnCount);
console.log(
  "Counts by type/severity:",
  JSON.stringify(
    a.alerts.reduce((s, v) => {
      const key = v.type + "/" + v.severity;
      s[key] = (s[key] ?? 0) + 1;
      return s;
    }, {}),
    null,
    2,
  ),
);
console.log("Evaluation:", JSON.stringify(a.evaluation, null, 2));
console.log("Alert total:", a.alerts.length, "Runtime ms:", runtime.toFixed(1));
console.log("Top 15 headlines:");
a.alerts.slice(0, 15).forEach((v) => console.log(v.id, v.headline));
console.log(
  "Forecast total:",
  JSON.stringify({ ...a.forecast.total, months: undefined }),
);
console.table(
  a.forecast.categories.map((c) => ({
    category: c.name,
    budget: c.budget,
    projected: Math.round(c.projected),
    status: c.status,
  })),
);
console.log(
  "Contract scores:",
  SAMPLE_CONTRACTS.map((c) => ({
    id: c.id,
    score: analyzeContract(c.text).score,
    grade: analyzeContract(c.text).grade,
  })),
);
if (process.argv.includes("--all"))
  for (const v of a.alerts)
    console.log(v.id, v.type, v.txnIds.length, v.headline);
