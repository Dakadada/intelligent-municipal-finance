// Seasonal differencing removes last year's monthly pattern. OLS then fits
// drift + two autoregressive lags; simulated innovations propagate uncertainty.
import { ols, mean, stdev, quantile, sum } from "./stats.js";
import { makeRng } from "./rng.js";
import { dollars } from "./rules.js";
export function fitARIMA(values) {
  const y = [...values],
    differences = y.slice(12).map((v, i) => v - y[i]);
  const X = [],
    target = [];
  for (let i = 2; i < differences.length; i++) {
    X.push([1, differences[i - 1], differences[i - 2]]);
    target.push(differences[i]);
  }
  let coefficients = X.length >= 6 ? ols(X, target) : [mean(differences), 0, 0];
  // Constrain explosive AR fits: sparse city ledgers can otherwise diverge.
  const norm = Math.abs(coefficients[1]) + Math.abs(coefficients[2]);
  if (norm > 0.98) {
    const a = (coefficients[1] * 0.98) / norm;
    const b = (coefficients[2] * 0.98) / norm;
    coefficients = [mean(differences) * (1 - a - b), a, b];
  }
  const residuals = target.map(
    (v, i) => v - X[i].reduce((s, x, j) => s + x * coefficients[j], 0),
  );
  return {
    y,
    differences,
    coefficients,
    sigma: stdev(residuals),
    fallback: mean(y),
  };
}
export function forecastARIMA(
  model,
  horizon,
  { paths = 400, seed = 2027 } = {},
) {
  const rng = makeRng(seed),
    simulations = [];
  for (let p = 0; p < paths; p++) {
    const y = [...model.y],
      d = [...model.differences],
      future = [];
    for (let h = 0; h < horizon; h++) {
      const [drift, a, b] = model.coefficients;
      const delta =
        drift +
        a * (d.at(-1) ?? 0) +
        b * (d.at(-2) ?? 0) +
        rng.normal(0, model.sigma);
      const baseline = y.length >= 12 ? y[y.length - 12] : model.fallback;
      const value = Math.max(0, baseline + delta);
      d.push(value - baseline);
      y.push(value);
      future.push(value);
    }
    simulations.push(future);
  }
  const column = (h) => simulations.map((p) => p[h]);
  return {
    median: Array.from({ length: horizon }, (_, h) => quantile(column(h), 0.5)),
    lo: Array.from({ length: horizon }, (_, h) => quantile(column(h), 0.1)),
    hi: Array.from({ length: horizon }, (_, h) => quantile(column(h), 0.9)),
    paths: simulations,
  };
}

const month = (date) => date.slice(0, 7);
const monthAt = (m, offset) => {
  const [y, n] = m.split("-").map(Number);
  return new Date(Date.UTC(y, n - 1 + offset, 1)).toISOString().slice(0, 7);
};
const fiscalYear = (date, start) =>
  +date.slice(0, 4) + (start !== 1 && +date.slice(5, 7) >= start ? 1 : 0);
const span = (first, last) => {
  const result = [];
  for (let m = first; m <= last; m = monthAt(m, 1)) result.push(m);
  return result;
};

export function buildForecast(ledger, categories, asOf) {
  const start = ledger.town.fyStartMonth ?? 7,
    fy = fiscalYear(asOf, start),
    first = `${fy - (start === 1 ? 0 : 1)}-${String(start).padStart(2, "0")}`;
  const fiscalMonths = Array.from({ length: 12 }, (_, i) => monthAt(first, i));
  const observed = fiscalMonths.filter((m) => m <= month(asOf)).length,
    horizon = 12 - observed;
  const allMonths = ledger.txns.length
    ? span(month(ledger.txns[0].date), month(asOf))
    : [];
  const details = categories.map((cat, index) => {
    const monthly = new Map();
    for (const t of ledger.txns)
      if (t.categoryId === cat.id && t.date <= asOf)
        monthly.set(
          month(t.date),
          (monthly.get(month(t.date)) ?? 0) + t.amount,
        );
    const y = allMonths.map((m) => monthly.get(m) ?? 0),
      prediction = forecastARIMA(fitARIMA(y), horizon, { seed: 2027 + index });
    const actual = fiscalMonths
        .slice(0, observed)
        .map((m) => monthly.get(m) ?? 0),
      spentToDate = sum(actual);
    const paths = prediction.paths.map((p) =>
      fiscalMonths.map((_, i) => (i < observed ? actual[i] : p[i - observed])),
    );
    const cumulative = paths.map((p) => {
      let s = 0;
      return p.map((v) => (s += v));
    });
    const budget = ledger.budgets?.[fy]?.[cat.id] ?? null;
    const months = fiscalMonths.map((m, i) => {
      const future = i >= observed,
        col = paths.map((p) => p[i]),
        cum = cumulative.map((p) => p[i]);
      return {
        month: m,
        actual: future ? null : actual[i],
        forecast: future ? quantile(col, 0.5) : null,
        lo: quantile(col, 0.1),
        hi: quantile(col, 0.9),
        cumActual: future ? null : sum(actual.slice(0, i + 1)),
        cumForecast: quantile(cum, 0.5),
        cumLo: quantile(cum, 0.1),
        cumHi: quantile(cum, 0.9),
      };
    });
    const end = months.at(-1),
      projected = end.cumForecast,
      projectedLo = end.cumLo,
      projectedHi = end.cumHi;
    const status =
      budget === null
        ? "ok"
        : projected > budget
          ? "over"
          : projectedHi > budget
            ? "watch"
            : "ok";
    const overrunMonth =
      budget === null
        ? null
        : (months.find((m) => m.cumForecast > budget)?.month ?? null);
    const headline =
      budget === null
        ? `Projected annual spending is ${dollars(projected)}; no budget was supplied.`
        : status === "over"
          ? `Projected to exceed the ${dollars(budget)} budget by ${dollars(projected - budget)} (${budget ? Math.round((projected / budget - 1) * 100) : "unbudgeted"}%) by ${overrunMonth}.`
          : status === "watch"
            ? `Projected spending is ${dollars(projected)}; the 80% upper estimate of ${dollars(projectedHi)} exceeds the ${dollars(budget)} budget.`
            : `Projected spending of ${dollars(projected)} is within the ${dollars(budget)} budget.`;
    return {
      categoryId: cat.id,
      name: cat.name,
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
  });
  // Sum corresponding independent simulation paths, then take quantiles.
  // Summing marginal interval endpoints would exaggerate citywide uncertainty.
  const months = fiscalMonths.map((m, i) => {
    const monthly = Array.from({ length: 400 }, (_, p) =>
      sum(details.map((d) => d.paths[p][i])),
    );
    const cumulative = Array.from({ length: 400 }, (_, p) =>
      sum(details.map((d) => sum(d.paths[p].slice(0, i + 1)))),
    );
    const future = i >= observed;
    return {
      month: m,
      actual: future ? null : sum(details.map((d) => d.months[i].actual)),
      forecast: future ? quantile(monthly, 0.5) : null,
      lo: quantile(monthly, 0.1),
      hi: quantile(monthly, 0.9),
      cumActual: future ? null : sum(details.map((d) => d.months[i].cumActual)),
      cumForecast: quantile(cumulative, 0.5),
      cumLo: quantile(cumulative, 0.1),
      cumHi: quantile(cumulative, 0.9),
    };
  });
  const budget =
      details.length && details.every((d) => d.budget !== null)
        ? sum(details.map((d) => d.budget))
        : null,
    end = months.at(-1);
  return {
    fy,
    model: "SARIMA(2,0,0)(0,1,0)[12] + drift",
    monthsObserved: observed,
    monthsForecast: horizon,
    total: {
      budget,
      spentToDate: sum(details.map((d) => d.spentToDate)),
      projected: end.cumForecast,
      projectedLo: end.cumLo,
      projectedHi: end.cumHi,
      overrunMonth:
        budget === null
          ? null
          : (months.find((m) => m.cumForecast > budget)?.month ?? null),
      months,
    },
    categories: details.map(({ paths, months, ...d }) => d),
  };
}
