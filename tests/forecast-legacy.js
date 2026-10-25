// Preserve the previous fit only as a backtest comparison, not a runtime path.
// This frozen OLS fit lets tests verify that a forecast change improves held-out
// annual totals rather than merely making the current budget screen look calmer.
import { ols, mean, stdev } from "../app/js/algo/stats.js";
export function fitLegacyARIMA(inputValues) {
  const values = [...inputValues];
  const differences = values.slice(12).map((amount, i) => amount - values[i]);
  const regressionRows = [];
  const target = [];
  for (let i = 2; i < differences.length; i++) {
    regressionRows.push([1, differences[i - 1], differences[i - 2]]);
    target.push(differences[i]);
  }
  let coefficients =
    regressionRows.length >= 6 ? ols(regressionRows, target) : [mean(differences), 0, 0];
  // Constrain explosive AR fits: sparse city ledgers can otherwise diverge.
  const norm = Math.abs(coefficients[1]) + Math.abs(coefficients[2]);
  if (norm > 0.98) {
    const lagOneCoefficient = (coefficients[1] * 0.98) / norm;
    const lagTwoCoefficient = (coefficients[2] * 0.98) / norm;
    coefficients = [
      mean(differences) * (1 - lagOneCoefficient - lagTwoCoefficient),
      lagOneCoefficient,
      lagTwoCoefficient,
    ];
  }
  const residuals = target.map(
    (amount, i) =>
      amount -
      regressionRows[i].reduce((runningTotal, x, j) => runningTotal + x * coefficients[j], 0),
  );
  return {
    y: values,
    differences,
    coefficients,
    sigma: stdev(residuals),
    fallback: mean(values),
  };
}
