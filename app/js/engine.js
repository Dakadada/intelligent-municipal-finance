// Public browser API: enrich a ledger, run independent models, combine related
// findings, and expose reviewable evidence without changing the source data.
import { generateLedger, PLANTED_CASES } from "./data/generator.js";
import { clusterVendors } from "./algo/vendorMatch.js";
import { isolationEvidence } from "./algo/isolationForest.js";
import { buildPatterns } from "./algo/gbm.js";
import { buildForecast } from "./algo/arima.js";
import { mean, sum } from "./algo/stats.js";
import { detectRules } from "./algo/rules.js";
export { analyzeContract } from "./algo/contractNLP.js";
export { SAMPLE_CONTRACTS } from "./data/contracts.js";
export { parseLedgerCSV, CSV_TEMPLATE } from "./data/csv.js";
export const DEFAULT_SETTINGS = {
  similarPct: 25,
  dupWindowDays: 90,
  vendorIncreasePct: 10,
  approvalThreshold: 5000,
  newVendorMin: 10000,
  ifThreshold: 0.62,
  bandK: 3,
  vendorSimilarity: 0.93,
};
export const loadSampleLedger = () => generateLedger();
const month = (date) => date.slice(0, 7);
const monthAt = (m, offset) => {
  const [y, n] = m.split("-").map(Number);
  return new Date(Date.UTC(y, n - 1 + offset, 1)).toISOString().slice(0, 7);
};
const fiscalYear = (date, start) =>
  +date.slice(0, 4) + (start !== 1 && +date.slice(5, 7) >= start ? 1 : 0);
function span(first, last) {
  const result = [];
  for (let m = first; m <= last; m = monthAt(m, 1)) result.push(m);
  return result;
}
function buildVendors(txns, groups, months, asOf) {
  const cutoff = monthAt(month(asOf), -11) + "-01",
    priorCutoff = monthAt(month(asOf), -23) + "-01";
  return groups
    .map((group) => {
      const rows = txns.filter((t) => t.vendorCanonical === group.canonical);
      const recent = rows.filter((t) => t.date >= cutoff && t.date <= asOf),
        prior = rows.filter((t) => t.date >= priorCutoff && t.date < cutoff);
      const enough = recent.length >= 3 && prior.length >= 3;
      const monthly = new Map();
      for (const t of rows)
        monthly.set(
          month(t.date),
          (monthly.get(month(t.date)) ?? 0) + t.amount,
        );
      return {
        ...group,
        txnCount: rows.length,
        total: sum(rows.map((t) => t.amount)),
        firstSeen: rows[0].date,
        lastSeen: rows.at(-1).date,
        avgInvoice: mean(rows.map((t) => t.amount)),
        recentAvg: enough ? mean(recent.map((t) => t.amount)) : null,
        priorAvg: enough ? mean(prior.map((t) => t.amount)) : null,
        changePct:
          enough && mean(prior.map((t) => t.amount)) > 0
            ? (mean(recent.map((t) => t.amount)) /
                mean(prior.map((t) => t.amount)) -
                1) *
              100
            : null,
        categoryIds: [...new Set(rows.map((t) => t.categoryId))],
        alertIds: [],
        monthly: months.map((m) => ({ month: m, total: monthly.get(m) ?? 0 })),
        recentCutoff: cutoff,
      };
    })
    .sort((a, b) => b.total - a.total);
}
const severityRank = { critical: 0, high: 1, medium: 2 };
function mergeAlerts(candidates) {
  const merged = [];
  for (const candidate of candidates.sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] || b.score - a.score,
  )) {
    const ids = new Set(candidate.txnIds),
      overlap = merged.filter((a) => a.txnIds.some((id) => ids.has(id)));
    if (!overlap.length) {
      merged.push({ ...candidate });
      continue;
    }
    const keep = overlap[0],
      all = [keep, ...overlap.slice(1), candidate];
    keep.txnIds = [...new Set(all.flatMap((a) => a.txnIds))];
    keep.detectors = [...new Set(all.flatMap((a) => a.detectors))];
    keep.reasons = [...new Set(all.flatMap((a) => a.reasons))];
    // Keep at most four readable evidence statements, with each detector's
    // first explanation preferred to repeated details from the same rule.
    keep.reasons = [
      ...new Set(all.map((a) => a.reasons[0]).concat(keep.reasons)),
    ].slice(0, 4);
    keep.score = Math.max(...all.map((a) => a.score));
    for (const drop of overlap.slice(1)) merged.splice(merged.indexOf(drop), 1);
  }
  return merged
    .sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        b.score - a.score,
    )
    .map((a, i) => ({ ...a, id: `A${String(i + 1).padStart(3, "0")}` }));
}
function evaluate(txns, alerts) {
  // This is the only analysis function allowed to inspect demonstration labels.
  const labeled = txns.filter((t) => t.planted);
  if (!labeled.length) return null;
  const known = new Map(PLANTED_CASES.map((c) => [c.id, c]));
  const cases = [...new Set(labeled.map((t) => t.planted))].map((id) => {
    const ids = new Set(
      labeled.filter((t) => t.planted === id).map((t) => t.id),
    );
    const alertIds = alerts
      .filter((a) => a.txnIds.some((t) => ids.has(t)))
      .map((a) => a.id);
    return {
      id,
      label: known.get(id)?.label ?? id,
      pattern: known.get(id)?.pattern ?? "Imported evaluation case",
      caught: alertIds.length > 0,
      alertIds,
    };
  });
  const ids = new Set(labeled.map((t) => t.id));
  return {
    total: cases.length,
    caught: cases.filter((c) => c.caught).length,
    cases,
    alertsOnPlanted: alerts.filter((a) => a.txnIds.some((id) => ids.has(id)))
      .length,
    alertsTotal: alerts.length,
  };
}
export function runAnalysis(ledger, settings = DEFAULT_SETTINGS) {
  settings = { ...DEFAULT_SETTINGS, ...settings };
  const asOf = ledger.town.asOf,
    txns = ledger.txns
      .map((t) => ({ ...t, alertIds: [] }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const groups = clusterVendors(
      txns.map((t) => t.vendor),
      settings.vendorSimilarity,
    ),
    lookup = new Map();
  for (const g of groups) for (const a of g.aliases) lookup.set(a, g.canonical);
  txns.forEach((t) => {
    t.vendorCanonical = lookup.get(t.vendor);
  });
  const months = txns.length
    ? span(month(txns[0].date), month(txns.at(-1).date))
    : [];
  const vendors = buildVendors(txns, groups, months, asOf),
    categoryMap = new Map();
  for (const t of txns) {
    if (!categoryMap.has(t.categoryId))
      categoryMap.set(t.categoryId, {
        id: t.categoryId,
        name: t.category,
        dept: t.dept,
        total: 0,
        txnCount: 0,
      });
    const c = categoryMap.get(t.categoryId);
    c.total += t.amount;
    c.txnCount++;
  }
  const categories = [...categoryMap.values()].sort(
    (a, b) => b.total - a.total,
  );
  const { patterns, alerts: seasonal } = buildPatterns(
    txns,
    categories,
    months,
    settings,
  );
  const alerts = mergeAlerts([
    ...detectRules(txns, vendors, settings),
    ...seasonal,
    ...isolationEvidence(txns, vendors, settings),
  ]);
  const txnMap = new Map(txns.map((t) => [t.id, t]));
  for (const a of alerts) {
    for (const id of a.txnIds) txnMap.get(id)?.alertIds.push(a.id);
    for (const v of vendors)
      if (
        a.txnIds.some(
          (id) => txnMap.get(id)?.vendorCanonical === v.canonical,
        ) ||
        a.vendor === v.canonical
      )
        v.alertIds.push(a.id);
  }
  // The transaction's back-reference already identifies its merged alert.
  for (const [categoryId, pattern] of Object.entries(patterns)) {
    for (const point of pattern.months) {
      if (!point.flagged) continue;
      const affected = txns.find(
        (t) =>
          t.categoryId === categoryId &&
          month(t.date) === point.month &&
          t.alertIds.length,
      );
      point.alertId = affected?.alertIds[0] ?? null;
    }
  }
  const fyTotals = new Map();
  for (const t of txns)
    fyTotals.set(t.fy, (fyTotals.get(t.fy) ?? 0) + t.amount);
  const summary = {
    txnCount: txns.length,
    totalSpend: sum(txns.map((t) => t.amount)),
    firstDate: txns[0]?.date ?? null,
    lastDate: txns.at(-1)?.date ?? null,
    currentFy: fiscalYear(asOf, ledger.town.fyStartMonth ?? 7),
    fyTotals: [...fyTotals]
      .sort((a, b) => a[0] - b[0])
      .map(([fy, total]) => ({ fy, total })),
    alertCount: alerts.length,
    criticalCount: alerts.filter((a) => a.severity === "critical").length,
    highCount: alerts.filter((a) => a.severity === "high").length,
    mediumCount: alerts.filter((a) => a.severity === "medium").length,
    flaggedDollars: sum(
      txns.filter((t) => t.alertIds.length).map((t) => t.amount),
    ),
    vendorCount: vendors.length,
    rawVendorNames: lookup.size,
  };
  return {
    town: { ...ledger.town },
    asOf,
    settings,
    summary,
    categories,
    txns,
    alerts,
    vendors: vendors.map(({ recentCutoff, ...v }) => v),
    patterns,
    forecast: buildForecast(ledger, categories, asOf),
    evaluation: evaluate(txns, alerts),
  };
}
