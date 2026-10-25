// Forecast seasonal spending by subtracting the same month a year earlier.
// Ordinary least squares fits drift and two recent changes. Seeded simulated
// errors give an 80% range, useful when a small city's future costs are uncertain.
import { ols, mean, stdev, quantile, sum } from "./stats.js";
import { makeRng } from "./rng.js";
import { dollars, monthName } from "./rules.js";
export function fitARIMA(inputValues) {
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
export function forecastARIMA(model, horizon, { paths = 400, seed = 2027 } = {}) {
  const random = makeRng(seed);
  const simulations = [];
  for (let pathIndex = 0; pathIndex < paths; pathIndex++) {
    const values = [...model.y];
    const seasonalDifferences = [...model.differences];
    const future = [];
    for (let monthOffset = 0; monthOffset < horizon; monthOffset++) {
      const [drift, lagOneCoefficient, lagTwoCoefficient] = model.coefficients;
      const delta =
        drift +
        lagOneCoefficient * (seasonalDifferences.at(-1) ?? 0) +
        lagTwoCoefficient * (seasonalDifferences.at(-2) ?? 0) +
        random.normal(0, model.sigma);
      const baseline = values.length >= 12 ? values[values.length - 12] : model.fallback;
      const value = Math.max(0, baseline + delta);
      seasonalDifferences.push(value - baseline);
      values.push(value);
      future.push(value);
    }
    simulations.push(future);
  }
  const column = (monthOffset) =>
    simulations.map((simulatedPath) => simulatedPath[monthOffset]);
  return {
    median: Array.from({ length: horizon }, (unusedValue, monthOffset) =>
      quantile(column(monthOffset), 0.5),
    ),
    lo: Array.from({ length: horizon }, (unusedValue, monthOffset) =>
      quantile(column(monthOffset), 0.1),
    ),
    hi: Array.from({ length: horizon }, (unusedValue, monthOffset) =>
      quantile(column(monthOffset), 0.9),
    ),
    paths: simulations,
  };
}
const month = (date) => date.slice(0, 7);
const monthAt = (monthEntry, offset) => {
  const [calendarYear, monthNumber] = monthEntry.split("-").map(Number);
  return new Date(Date.UTC(calendarYear, monthNumber - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
};
const fiscalYear = (date, start) =>
  +date.slice(0, 4) + (start !== 1 && +date.slice(5, 7) >= start ? 1 : 0);
const span = (first, last) => {
  const result = [];
  for (let monthKey = first; monthKey <= last; monthKey = monthAt(monthKey, 1)) {
    result.push(monthKey);
  }
  return result;
};
function forecastStatus(budget, projected, projectedHi) {
  if (budget === null) return "ok";
  if (projected > budget) return "over";
  if (projectedHi > budget) return "watch";
  return "ok";
}

function findOverrunMonth(months, budget) {
  if (budget === null) return null;
  return months.find((monthEntry) => monthEntry.cumForecast > budget)?.month ?? null;
}

function forecastHeadline(budget, projected, projectedHi, status, overrunMonth) {
  if (budget === null) {
    return `Projected annual spending is ${dollars(projected)}; no budget was supplied.`;
  }
  if (status === "over") {
    let percent = "unbudgeted";
    if (budget) percent = Math.round((projected / budget - 1) * 100);
    return (
      `Projected to exceed the ${dollars(budget)} budget by ` +
      `${dollars(projected - budget)} (${percent}%) by ${monthName(overrunMonth)}.`
    );
  }
  if (status === "watch") {
    return (
      `Projected to land at ${dollars(projected)}, but could reach ` +
      `${dollars(projectedHi)} (above the ${dollars(budget)} budget).`
    );
  }
  return `Projected spending of ${dollars(projected)} is within the ${dollars(budget)} budget.`;
}

function cumulativePath(simulatedPath) {
  let runningTotal = 0;
  return simulatedPath.map((amount) => {
    runningTotal += amount;
    return runningTotal;
  });
}

function forecastCategory(
  ledger,
  category,
  index,
  asOf,
  allMonths,
  fiscalMonths,
  observed,
  horizon,
  fy,
) {
  const monthly = new Map();
  for (const transaction of ledger.txns) {
    if (transaction.categoryId === category.id && transaction.date <= asOf) {
      monthly.set(
        month(transaction.date),
        (monthly.get(month(transaction.date)) ?? 0) + transaction.amount,
      );
    }
  }
  const values = allMonths.map((monthEntry) => monthly.get(monthEntry) ?? 0);
  const prediction = forecastARIMA(fitARIMA(values), horizon, { seed: 2027 + index });
  const actual = fiscalMonths
    .slice(0, observed)
    .map((monthEntry) => monthly.get(monthEntry) ?? 0);
  const spentToDate = sum(actual);
  const paths = prediction.paths.map((simulatedPath) =>
    fiscalMonths.map((unusedValue, i) =>
      i < observed ? actual[i] : simulatedPath[i - observed],
    ),
  );
  const cumulative = paths.map(cumulativePath);
  const budget = ledger.budgets?.[fy]?.[category.id] ?? null;
  const months = fiscalMonths.map((monthEntry, i) => {
    const future = i >= observed;
    const monthlyValues = paths.map((simulatedPath) => simulatedPath[i]);
    const cumulativeValues = cumulative.map((simulatedPath) => simulatedPath[i]);
    return {
      month: monthEntry,
      actual: future ? null : actual[i],
      forecast: future ? quantile(monthlyValues, 0.5) : null,
      lo: quantile(monthlyValues, 0.1),
      hi: quantile(monthlyValues, 0.9),
      cumActual: future ? null : sum(actual.slice(0, i + 1)),
      cumForecast: quantile(cumulativeValues, 0.5),
      cumLo: quantile(cumulativeValues, 0.1),
      cumHi: quantile(cumulativeValues, 0.9),
    };
  });
  const end = months.at(-1);
  const projected = end.cumForecast;
  const projectedLo = end.cumLo;
  const projectedHi = end.cumHi;
  const status = forecastStatus(budget, projected, projectedHi);
  const overrunMonth = findOverrunMonth(months, budget);
  const headline = forecastHeadline(budget, projected, projectedHi, status, overrunMonth);
  return {
    categoryId: category.id,
    name: category.name,
    budget,
    spentToDate,
    projected,
    projectedLo,
    projectedHi,
    pctOfBudget: budget > 0 ? (projected / budget) * 100 : null,
    status,
    overrunMonth,
    headline,
    months,
    paths,
  };
}

export function buildForecast(ledger, categories, asOf) {
  const start = ledger.town.fyStartMonth ?? 7;
  const fy = fiscalYear(asOf, start);
  const first = `${fy - (start === 1 ? 0 : 1)}-${String(start).padStart(2, "0")}`;
  const fiscalMonths = Array.from({ length: 12 }, (unusedValue, i) => monthAt(first, i));
  const observed = fiscalMonths.filter((monthEntry) => monthEntry <= month(asOf)).length;
  const horizon = 12 - observed;
  const allMonths = ledger.txns.length ? span(month(ledger.txns[0].date), month(asOf)) : [];
  const details = categories.map((category, index) =>
    forecastCategory(
      ledger,
      category,
      index,
      asOf,
      allMonths,
      fiscalMonths,
      observed,
      horizon,
      fy,
    ),
  );
  // Sum corresponding independent simulation paths, then take quantiles.
  // Summing marginal interval endpoints would exaggerate citywide uncertainty.
  const months = fiscalMonths.map((monthEntry, i) => {
    const monthly = Array.from({ length: 400 }, (unusedValue, simulatedPath) =>
      sum(details.map((categoryDetail) => categoryDetail.paths[simulatedPath][i])),
    );
    const cumulative = Array.from({ length: 400 }, (unusedValue, simulatedPath) =>
      sum(
        details.map((categoryDetail) =>
          sum(categoryDetail.paths[simulatedPath].slice(0, i + 1)),
        ),
      ),
    );
    const future = i >= observed;
    return {
      month: monthEntry,
      actual: future
        ? null
        : sum(details.map((categoryDetail) => categoryDetail.months[i].actual)),
      forecast: future ? quantile(monthly, 0.5) : null,
      lo: quantile(monthly, 0.1),
      hi: quantile(monthly, 0.9),
      cumActual: future
        ? null
        : sum(details.map((categoryDetail) => categoryDetail.months[i].cumActual)),
      cumForecast: quantile(cumulative, 0.5),
      cumLo: quantile(cumulative, 0.1),
      cumHi: quantile(cumulative, 0.9),
    };
  });
  const budget =
    details.length && details.every((categoryDetail) => categoryDetail.budget !== null)
      ? sum(details.map((categoryDetail) => categoryDetail.budget))
      : null;
  const end = months.at(-1);
  return {
    fy,
    model: "SARIMA(2,0,0)(0,1,0)[12] + drift",
    monthsObserved: observed,
    monthsForecast: horizon,
    total: {
      budget,
      spentToDate: sum(details.map((categoryDetail) => categoryDetail.spentToDate)),
      projected: end.cumForecast,
      projectedLo: end.cumLo,
      projectedHi: end.cumHi,
      overrunMonth:
        budget === null
          ? null
          : (months.find((monthEntry) => monthEntry.cumForecast > budget)?.month ?? null),
      months,
    },
    categories: details.map(({ paths, months, ...categoryDetail }) => categoryDetail),
  };
}
