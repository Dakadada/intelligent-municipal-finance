// Compare annual forecasts using only data available before the held-out year.
// FY2022-FY2025 train each category; FY2026 supplies the untouched annual target.
// Errors include unexpected projects and price changes, not just ordinary bills.
import { generateLedger, CATEGORY_LIST } from "../app/js/data/generator.js";
import { fitARIMA, forecastARIMA } from "../app/js/algo/arima.js";
import { ols, mean, median, mad, stdev, sum, quantile } from "../app/js/algo/stats.js";

import { fitLegacyARIMA } from "./forecast-legacy.js";

export function fitCandidate(inputValues, options = {}) {
  const { shrink = 1, robust = false, damping = 1, winsorize = false } = options;
  let values = [...inputValues];
  if (winsorize) {
    values = values.map((value, i) => {
      const sameSeason = values.filter((unusedValue, j) => j % 12 === i % 12);
      const center = median(sameSeason);
      const allowance = Math.max(3 * mad(sameSeason), center * 0.2, 25);
      return Math.max(center - allowance, Math.min(center + allowance, value));
    });
  }
  const differences = values.slice(12).map((value, i) => value - values[i]);
  const regressionRows = [];
  const targets = [];
  for (let i = 2; i < differences.length; i++) {
    regressionRows.push([1, differences[i - 1], differences[i - 2]]);
    targets.push(differences[i]);
  }
  let coefficients = regressionRows.length >= 6
    ? ols(regressionRows, targets) : [mean(differences), 0, 0];
  const norm = Math.abs(coefficients[1]) + Math.abs(coefficients[2]);
  const stabilityScale = norm > 0.98 ? 0.98 / norm : 1;
  const firstLag = coefficients[1] * stabilityScale * shrink;
  const secondLag = coefficients[2] * stabilityScale * shrink;
  const center = robust ? median(differences) : mean(differences);
  coefficients = [center * damping * (1 - firstLag - secondLag), firstLag, secondLag];
  const residuals = targets.map((value, i) => value - regressionRows[i].reduce(
    (total, feature, j) => total + feature * coefficients[j], 0));
  return { y: values, differences, coefficients, sigma: stdev(residuals), fallback: mean(values) };
}

export function backtest(fitFunction) {
  const ledger = generateLedger();
  const results = CATEGORY_LIST.map((category, index) => {
    const training = new Array(48).fill(0);
    let actual = 0;
    for (const transaction of ledger.txns) {
      if (transaction.categoryId !== category.id) continue;
      const year = Number(transaction.date.slice(0, 4));
      const month = Number(transaction.date.slice(5, 7));
      const offset = (year - 2021) * 12 + month - 7;
      if (offset >= 0 && offset < 48) training[offset] += transaction.amount;
      if (offset >= 48 && offset < 60) actual += transaction.amount;
    }
    const prediction = forecastARIMA(fitFunction(training), 12, { seed: 2027 + index });
    const projected = quantile(prediction.paths.map(path => sum(path)), 0.5);
    return {
      category: category.name, actual, projected,
      absolutePercentError: Math.abs(projected - actual) / actual * 100,
    };
  });
  return { mape: mean(results.map(result => result.absolutePercentError)), categories: results };
}

export function compareCandidates() {
  const candidates = [
    { name: "previous OLS", fit: values => fitLegacyARIMA(values) },
  ];
  for (const robust of [false, true]) {
    for (const winsorize of [false, true]) {
      for (const shrink of [0.25, 0.5, 0.75]) {
        const options = { robust, winsorize, shrink };
        candidates.push({ name: JSON.stringify(options), fit: values => fitCandidate(values, options) });
      }
    }
  }
  for (const damping of [0.5, 0.75]) {
    const options = { robust: true, winsorize: true, shrink: 0.5, damping };
    candidates.push({ name: JSON.stringify(options), fit: values => fitCandidate(values, options) });
  }
  return candidates.map(candidate => ({ name: candidate.name, ...backtest(candidate.fit) }));
}

if (import.meta.main) {
  const previous = backtest(fitLegacyARIMA);
  const selected = backtest(fitARIMA);
  console.log("Train through FY2025; predict FY2026 annual totals for 14 categories.");
  console.log("Previous annual-total MAPE:", previous.mape.toFixed(3) + "%");
  console.log("Selected annual-total MAPE:", selected.mape.toFixed(3) + "%");
  console.table(selected.categories.map((result, i) => ({
    category: result.category,
    actual: Math.round(result.actual),
    previous: Math.round(previous.categories[i].projected),
    selected: Math.round(result.projected),
    selectedErrorPct: Number(result.absolutePercentError.toFixed(2)),
  })));
  if (process.argv.includes("--candidates")) {
    console.table(compareCandidates().map(result => ({
      method: result.name, annualMAPE: result.mape,
    })));
  }
}
