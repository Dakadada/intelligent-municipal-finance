// Coordinate the audit through one stable interface for the browser UI.
// Independent rules and models produce evidence, overlapping alerts are merged,
// and summaries link back to original payments so clerks can verify each finding.
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
const monthAt = (monthKey, offset) => {
  const [calendarYear, monthNumber] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(calendarYear, monthNumber - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
};
const fiscalYear = (date, start) =>
  +date.slice(0, 4) + (start !== 1 && +date.slice(5, 7) >= start ? 1 : 0);
function span(first, last) {
  const result = [];
  for (let monthKey = first; monthKey <= last; monthKey = monthAt(monthKey, 1)) {
    result.push(monthKey);
  }
  return result;
}
function buildVendors(transactions, groups, months, asOf) {
  const cutoff = monthAt(month(asOf), -11) + "-01";
  const priorCutoff = monthAt(month(asOf), -23) + "-01";
  return groups
    .map((group) => {
      const rows = transactions.filter(
        (transaction) => transaction.vendorCanonical === group.canonical,
      );
      const recent = rows.filter(
        (transaction) => transaction.date >= cutoff && transaction.date <= asOf,
      );
      const prior = rows.filter(
        (transaction) => transaction.date >= priorCutoff && transaction.date < cutoff,
      );
      const enough = recent.length >= 3 && prior.length >= 3;
      const monthly = new Map();
      for (const transaction of rows) {
        monthly.set(
          month(transaction.date),
          (monthly.get(month(transaction.date)) ?? 0) + transaction.amount,
        );
      }
      return {
        ...group,
        txnCount: rows.length,
        total: sum(rows.map((transaction) => transaction.amount)),
        firstSeen: rows[0].date,
        lastSeen: rows.at(-1).date,
        avgInvoice: mean(rows.map((transaction) => transaction.amount)),
        recentAvg: enough ? mean(recent.map((transaction) => transaction.amount)) : null,
        priorAvg: enough ? mean(prior.map((transaction) => transaction.amount)) : null,
        changePct:
          enough && mean(prior.map((transaction) => transaction.amount)) > 0
            ? (mean(recent.map((transaction) => transaction.amount)) /
                mean(prior.map((transaction) => transaction.amount)) -
                1) *
              100
            : null,
        categoryIds: [...new Set(rows.map((transaction) => transaction.categoryId))],
        alertIds: [],
        monthly: months.map((monthKey) => ({
          month: monthKey,
          total: monthly.get(monthKey) ?? 0,
        })),
        recentCutoff: cutoff,
      };
    })
    .sort((firstEntry, secondEntry) => secondEntry.total - firstEntry.total);
}
const severityRank = { critical: 0, high: 1, medium: 2 };
function compareAlerts(first, second) {
  return severityRank[first.severity] - severityRank[second.severity] ||
    second.score - first.score;
}

function addEvidence(target, source) {
  if (severityRank[source.severity] < severityRank[target.severity]) {
    target.severity = source.severity;
  }
  target.score = Math.max(target.score, source.score);
  target.detectors = [...new Set([...target.detectors, ...source.detectors])];
  target.reasons = [...new Set([
    target.reasons[0], source.reasons[0], ...target.reasons, ...source.reasons,
  ])].slice(0, 4);
}

function mergeSamePayments(candidates) {
  const merged = [];
  for (const candidate of candidates.sort(compareAlerts)) {
    const ids = new Set(candidate.txnIds);
    const samePayments = merged.find(alert => ids.size > 0 &&
      alert.txnIds.length === ids.size && alert.txnIds.every(id => ids.has(id)));
    if (samePayments) addEvidence(samePayments, candidate);
    else merged.push({ ...candidate, reasons: [...candidate.reasons] });
  }
  return merged;
}

function mergeVendorPricing(alerts) {
  const pricingByVendor = new Map();
  const combined = [];
  for (const alert of alerts) {
    const isPricing = alert.type === "above-similar" || alert.type === "vendor-increase";
    if (!isPricing) {
      combined.push(alert);
      continue;
    }
    const existing = pricingByVendor.get(alert.vendor);
    if (!existing) {
      pricingByVendor.set(alert.vendor, alert);
      combined.push(alert);
      continue;
    }
    // Combine only independently flagged pricing evidence for this supplier.
    // Monthly spending context is handled separately and cannot add payments.
    existing.txnIds = [...new Set([...existing.txnIds, ...alert.txnIds])];
    // Keep the amount that matches the headline we keep, so the dollar figure
    // a clerk sees always agrees with the sentence under it.
    addEvidence(existing, alert);
  }
  return combined;
}

function mergeAlerts(candidates) {
  const transactionFindings = candidates.filter(alert => alert.type !== "seasonal");
  const merged = mergeSamePayments(mergeVendorPricing(mergeSamePayments(transactionFindings)));
  const seasonalFindings = candidates.filter(alert => alert.type === "seasonal");
  for (const seasonal of seasonalFindings.sort(compareAlerts)) {
    const monthIds = new Set(seasonal.txnIds);
    const overlapping = merged.filter(alert => alert.txnIds.some(id => monthIds.has(id)));
    if (!overlapping.length) {
      merged.push({ ...seasonal });
      continue;
    }
    // A month's total describes context, not guilt for every invoice that month.
    for (const alert of overlapping) addEvidence(alert, seasonal);
  }
  return merged.sort(compareAlerts).map((alert, i) => ({
    ...alert, id: `A${String(i + 1).padStart(3, "0")}`,
  }));
}

function evaluate(transactions, alerts) {
  // This is the only analysis function allowed to inspect demonstration labels.
  const labeled = transactions.filter((transaction) => transaction.planted);
  if (!labeled.length) {
    return null;
  }
  const known = new Map(PLANTED_CASES.map((caseEntry) => [caseEntry.id, caseEntry]));
  const cases = [...new Set(labeled.map((transaction) => transaction.planted))].map((id) => {
    const ids = new Set(
      labeled
        .filter((transaction) => transaction.planted === id)
        .map((transaction) => transaction.id),
    );
    const alertIds = alerts
      .filter((firstEntry) => firstEntry.txnIds.some((transaction) => ids.has(transaction)))
      .map((firstEntry) => firstEntry.id);
    return {
      id,
      label: known.get(id)?.label ?? id,
      pattern: known.get(id)?.pattern ?? "Imported evaluation case",
      caught: alertIds.length > 0,
      alertIds,
    };
  });
  const ids = new Set(labeled.map((transaction) => transaction.id));
  return {
    total: cases.length,
    caught: cases.filter((caseEntry) => caseEntry.caught).length,
    cases,
    alertsOnPlanted: alerts.filter((firstEntry) => firstEntry.txnIds.some((id) => ids.has(id)))
      .length,
    alertsTotal: alerts.length,
  };
}
function buildCategories(transactions) {
  const categoryMap = new Map();
  for (const transaction of transactions) {
    if (!categoryMap.has(transaction.categoryId)) {
      categoryMap.set(transaction.categoryId, {
        id: transaction.categoryId,
        name: transaction.category,
        dept: transaction.dept,
        total: 0,
        txnCount: 0,
      });
    }
    const categoryEntry = categoryMap.get(transaction.categoryId);
    categoryEntry.total += transaction.amount;
    categoryEntry.txnCount++;
  }
  const categories = [...categoryMap.values()].sort(
    (firstEntry, secondEntry) => secondEntry.total - firstEntry.total,
  );
  return categories;
}
function attachAlertReferences(transactions, vendors, alerts, patterns) {
  const txnMap = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  for (const firstEntry of alerts) {
    for (const id of firstEntry.txnIds) {
      txnMap.get(id)?.alertIds.push(firstEntry.id);
    }
    for (const vendor of vendors) {
      if (
        firstEntry.txnIds.some((id) => txnMap.get(id)?.vendorCanonical === vendor.canonical) ||
        firstEntry.vendor === vendor.canonical
      ) {
        vendor.alertIds.push(firstEntry.id);
      }
    }
  }
  // The transaction's back-reference already identifies its merged alert.
  for (const [categoryId, pattern] of Object.entries(patterns)) {
    for (const point of pattern.months) {
      if (!point.flagged) {
        continue;
      }
      const affected = transactions.find(
        (transaction) =>
          transaction.categoryId === categoryId &&
          month(transaction.date) === point.month &&
          transaction.alertIds.length,
      );
      point.alertId = affected?.alertIds[0] ?? null;
    }
  }
}
function buildSummary(transactions, alerts, vendors, lookup, asOf, ledger) {
  const fyTotals = new Map();
  for (const transaction of transactions) {
    fyTotals.set(transaction.fy, (fyTotals.get(transaction.fy) ?? 0) + transaction.amount);
  }
  const summary = {
    txnCount: transactions.length,
    totalSpend: sum(transactions.map((transaction) => transaction.amount)),
    firstDate: transactions[0]?.date ?? null,
    lastDate: transactions.at(-1)?.date ?? null,
    currentFy: fiscalYear(asOf, ledger.town.fyStartMonth ?? 7),
    fyTotals: [...fyTotals]
      .sort((firstEntry, secondEntry) => firstEntry[0] - secondEntry[0])
      .map(([fy, total]) => ({ fy, total })),
    alertCount: alerts.length,
    criticalCount: alerts.filter((firstEntry) => firstEntry.severity === "critical").length,
    highCount: alerts.filter((firstEntry) => firstEntry.severity === "high").length,
    mediumCount: alerts.filter((firstEntry) => firstEntry.severity === "medium").length,
    flaggedDollars: sum(
      transactions
        .filter((transaction) => transaction.alertIds.length)
        .map((transaction) => transaction.amount),
    ),
    vendorCount: vendors.length,
    rawVendorNames: lookup.size,
  };
  return summary;
}
export function runAnalysis(ledger, settings = DEFAULT_SETTINGS) {
  settings = { ...DEFAULT_SETTINGS, ...settings };
  const asOf = ledger.town.asOf;
  const transactions = ledger.txns
    .map((transaction) => ({ ...transaction, alertIds: [] }))
    .sort(
      (firstEntry, secondEntry) =>
        firstEntry.date.localeCompare(secondEntry.date) ||
        firstEntry.id.localeCompare(secondEntry.id),
    );
  const groups = clusterVendors(
    transactions.map((transaction) => transaction.vendor),
    settings.vendorSimilarity,
  );
  const lookup = new Map();
  for (const vendorGroup of groups) {
    for (const alias of vendorGroup.aliases) {
      lookup.set(alias, vendorGroup.canonical);
    }
  }
  transactions.forEach((transaction) => {
    transaction.vendorCanonical = lookup.get(transaction.vendor);
  });
  const months = transactions.length
    ? span(month(transactions[0].date), month(transactions.at(-1).date))
    : [];
  const vendors = buildVendors(transactions, groups, months, asOf);
  const categories = buildCategories(transactions);
  const { patterns, alerts: seasonal } = buildPatterns(
    transactions,
    categories,
    months,
    settings,
  );
  const alerts = mergeAlerts([
    ...detectRules(transactions, vendors, settings),
    ...seasonal,
    ...isolationEvidence(transactions, vendors, settings),
  ]);
  attachAlertReferences(transactions, vendors, alerts, patterns);
  const summary = buildSummary(transactions, alerts, vendors, lookup, asOf, ledger);
  return {
    town: { ...ledger.town },
    asOf,
    settings,
    summary,
    categories,
    txns: transactions,
    alerts,
    vendors: vendors.map(({ recentCutoff, ...vendor }) => vendor),
    patterns,
    forecast: buildForecast(ledger, categories, asOf),
    evaluation: evaluate(transactions, alerts),
  };
}
