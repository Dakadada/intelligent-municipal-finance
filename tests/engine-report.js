// Print the complete sample audit for a judge or a developer to inspect.
// Counts, concrete headlines, forecasts, and contract scores make unexpected
// changes visible without needing to understand the browser UI.
import {
  loadSampleLedger,
  runAnalysis,
  analyzeContract,
  SAMPLE_CONTRACTS,
} from "../app/js/engine.js";
const start = performance.now();
const analysis = runAnalysis(loadSampleLedger());
const runtime = performance.now() - start;
console.log("Sample transactions:", analysis.summary.txnCount);
console.log(
  "Counts by type/severity:",
  JSON.stringify(
    analysis.alerts.reduce((counts, alert) => {
      const key = alert.type + "/" + alert.severity;
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
    null,
    2,
  ),
);
console.log("Evaluation:", JSON.stringify(analysis.evaluation, null, 2));
console.log("Alert total:", analysis.alerts.length, "Runtime ms:", runtime.toFixed(1));
console.log("Top 15 headlines:");
analysis.alerts.slice(0, 15).forEach((alert) => console.log(alert.id, alert.headline));
console.log(
  "Forecast total:",
  JSON.stringify({ ...analysis.forecast.total, months: undefined }),
);
console.table(
  analysis.forecast.categories.map((category) => ({
    category: category.name,
    budget: category.budget,
    projected: Math.round(category.projected),
    status: category.status,
  })),
);
console.log(
  "Contract scores:",
  SAMPLE_CONTRACTS.map((contract) => ({
    id: contract.id,
    score: analyzeContract(contract.text).score,
    grade: analyzeContract(contract.text).grade,
  })),
);
if (process.argv.includes("--all")) {
  for (const alert of analysis.alerts) {
    console.log(alert.id, alert.type, alert.txnIds.length, alert.headline);
  }
}
