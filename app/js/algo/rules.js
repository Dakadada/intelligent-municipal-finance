// Auditor rules compare invoices with genuine peers and check purchasing
// controls. No labels or sample-specific vendor/category names are used.
import { mean, median, mad } from "./stats.js";
export const dollars = (x) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(x);
const days = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
export function detectRules(txns, vendors, settings) {
  const alerts = [];
  const add = (type, rows, headline, reasons, extra = {}) => {
    const last = rows.at(-1);
    alerts.push({
      type,
      severity: "high",
      score: 0.8,
      title: {
        duplicate: "Possible duplicate payment",
        split: "Possible split purchase",
        "above-similar": "Payment above comparable invoices",
        "vendor-increase": "Vendor price increase",
        "new-vendor": "Large first payment",
      }[type],
      headline,
      reasons,
      detectors: ["rules"],
      txnIds: rows.map((t) => t.id),
      vendor: last.vendorCanonical,
      category: last.category,
      categoryId: last.categoryId,
      amount: last.amount,
      date: last.date,
      ...extra,
    });
  };
  for (const vendor of vendors) {
    const rows = txns.filter((t) => t.vendorCanonical === vendor.canonical);
    const monthMedians = Array.from({ length: 12 }, (_, m) =>
      median(
        rows.filter((t) => +t.date.slice(5, 7) === m + 1).map((t) => t.amount),
      ),
    ).filter((v) => v > 0);
    const seasonal =
      monthMedians.length >= 9 &&
      Math.max(...monthMedians) > 2 * Math.min(...monthMedians);
    const dupPairs = [];
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i],
          b = rows[j],
          gap = days(a.date, b.date);
        const sameInvoice = a.invoice && a.invoice === b.invoice;
        if (
          sameInvoice ||
          (a.amount === b.amount && gap <= settings.dupWindowDays)
        )
          dupPairs.push([a, b]);
      }
    for (const [a, b] of dupPairs)
      add(
        "duplicate",
        [a, b],
        `${vendor.canonical} received two payments of ${a.amount === b.amount ? dollars(a.amount) : `${dollars(a.amount)} and ${dollars(b.amount)}`}, ${days(a.date, b.date)} ${days(a.date, b.date) === 1 ? "day" : "days"} apart${a.invoice === b.invoice ? ` for invoice ${a.invoice}` : ""}.`,
        [
          `Payments dated ${a.date} and ${b.date}.`,
          `Review ${dollars(Math.min(a.amount, b.amount))} for possible recovery.`,
        ],
        {
          severity: a.invoice === b.invoice ? "critical" : "medium",
          score: a.invoice === b.invoice ? 0.99 : 0.7,
          amount: Math.min(a.amount, b.amount),
          detectors:
            vendor.aliases.length > 1 ? ["rules", "fuzzy-match"] : ["rules"],
        },
      );
    const used = new Set();
    for (const a of rows) {
      if (
        a.amount <= 0 ||
        a.amount >= settings.approvalThreshold ||
        used.has(a.id)
      )
        continue;
      const group = rows.filter(
        (b) =>
          !used.has(b.id) &&
          b.date >= a.date &&
          days(a.date, b.date) <= 3 &&
          b.amount > 0 &&
          b.amount < settings.approvalThreshold,
      );
      const total = group.reduce((s, t) => s + t.amount, 0);
      if (group.length >= 2 && total > settings.approvalThreshold) {
        group.forEach((t) => used.add(t.id));
        add(
          "split",
          group,
          `${group.length} payments to ${vendor.canonical} total ${dollars(total)} within 3 days; each is below the ${dollars(settings.approvalThreshold)} approval limit.`,
          [
            `Individual invoices: ${group.map((t) => dollars(t.amount)).join(", ")}.`,
            `Check whether these invoices cover one purchase.`,
          ],
          { amount: total, severity: "critical", score: 0.98 },
        );
      }
    }
    if (rows[0]?.amount >= settings.newVendorMin)
      add(
        "new-vendor",
        [rows[0]],
        `${vendor.canonical}'s first recorded payment was ${dollars(rows[0].amount)} on ${rows[0].date}.`,
        [
          `No earlier payments appear in this ledger; verify procurement and onboarding.`,
        ],
        { score: 0.91 },
      );
    for (const t of rows) {
      const prior = rows.filter(
        (p) =>
          p.date < t.date &&
          p.categoryId === t.categoryId &&
          days(p.date, t.date) <= 3 * 366,
      );
      if (prior.length < 3 || days(t.date, rows[0].date) < 365) continue;
      const matching = prior.filter((p) => p.description === t.description);
      if (matching.length < 3) continue;
      let peers = matching;
      if (seasonal)
        peers = peers.filter((p) => p.date.slice(5, 7) === t.date.slice(5, 7));
      if (peers.length < 3) continue;
      // Annual project payments must be compared with other annual projects,
      // not with the vendor's small recurring maintenance invoices.
      const large = peers.filter(
        (p) => p.amount > median(prior.map((p) => p.amount)) * 3,
      );
      if (
        large.length >= 3 &&
        t.amount > median(prior.map((p) => p.amount)) * 3
      )
        peers = large;
      const avg = mean(peers.map((p) => p.amount)),
        sd = mad(peers.map((p) => p.amount));
      const pct = avg > 0 ? (t.amount / avg - 1) * 100 : 0;
      if (
        pct > settings.similarPct &&
        t.amount > avg + Math.max(3.5 * sd, avg * 0.15) &&
        t.amount - avg >= 750
      ) {
        add(
          "above-similar",
          [t],
          `This ${dollars(t.amount)} payment to ${vendor.canonical} is ${Math.round(pct)}% above ${peers.length} comparable prior invoices averaging ${dollars(avg)}.`,
          [
            `Comparable invoices are from the preceding 36 months in ${t.category}.`,
            `The difference from the comparison average is ${dollars(t.amount - avg)}.`,
          ],
          { score: Math.min(0.97, 0.73 + pct / 1000) },
        );
      }
    }
    if (
      vendor.changePct > settings.vendorIncreasePct &&
      vendor.recentAvg > vendor.priorAvg + 75
    ) {
      const recent = rows.filter((t) => t.date >= vendor.recentCutoff);
      add(
        "vendor-increase",
        recent,
        `${vendor.canonical}'s average invoice rose ${Math.round(vendor.changePct)}%, from ${dollars(vendor.priorAvg)} to ${dollars(vendor.recentAvg)} in the latest 12 months.`,
        [
          `Comparison uses the preceding 12 months as the baseline.`,
          `At the recent invoice count, the annual increase is approximately ${dollars((vendor.recentAvg - vendor.priorAvg) * recent.length)}.`,
        ],
        {
          txnIds: [],
          detectors: ["vendor-trend"],
          score: Math.min(0.95, 0.75 + vendor.changePct / 500),
          amount: (vendor.recentAvg - vendor.priorAvg) * recent.length,
        },
      );
    } else if (vendor.monthly?.length >= 24) {
      // Stable invoice sizes can hide higher costs when bills are divided into
      // more installments. Compare matched calendar months, not raw seasons.
      const recentMonths = vendor.monthly.slice(-12);
      const priorMonths = vendor.monthly.slice(-24, -12);
      const recentTotal = recentMonths.reduce((s, m) => s + m.total, 0);
      const priorTotal = priorMonths.reduce((s, m) => s + m.total, 0);
      const increase =
        priorTotal > 0 ? (recentTotal / priorTotal - 1) * 100 : 0;
      const higherMonths = recentMonths.filter(
        (m, i) =>
          priorMonths[i].total > 0 &&
          m.total >
            priorMonths[i].total * (1 + settings.vendorIncreasePct / 100),
      ).length;
      if (
        increase > settings.vendorIncreasePct &&
        higherMonths >= 7 &&
        recentTotal - priorTotal >= 750
      ) {
        const recent = rows.filter((t) => t.date >= vendor.recentCutoff);
        add(
          "vendor-increase",
          recent,
          `${vendor.canonical}'s monthly spending rose ${Math.round(increase)}%, from ${dollars(priorTotal / 12)} to ${dollars(recentTotal / 12)} on average in the latest 12 months.`,
          [
            `${higherMonths} of 12 months exceed the matching month a year earlier by more than ${settings.vendorIncreasePct}%.`,
            `Annual spending increased by ${dollars(recentTotal - priorTotal)}; verify quantities and unit prices before attributing the increase to a rate change.`,
          ],
          {
            txnIds: [],
            detectors: ["vendor-trend"],
            score: Math.min(0.95, 0.75 + increase / 500),
            amount: recentTotal - priorTotal,
          },
        );
      }
    }
  }
  // Equal monthly installments still satisfy the contract's duplicate rule.
  // Consolidate those review matches instead of hiding them or flooding the UI.
  const duplicateVendors = new Map();
  for (const alert of alerts.filter((a) => a.type === "duplicate")) {
    if (!duplicateVendors.has(alert.vendor))
      duplicateVendors.set(alert.vendor, []);
    duplicateVendors.get(alert.vendor).push(alert);
  }
  const byId = new Map(txns.map((t) => [t.id, t]));
  for (const group of duplicateVendors.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => b.score - a.score);
    const first = group[0];
    first.headline =
      first.headline.slice(0, -1) +
      `; ${group.length} matching payment pairs for this vendor require review.`;
    first.txnIds = [...new Set(group.flatMap((a) => a.txnIds))];
    const laterIds = new Set(group.map((a) => a.txnIds.at(-1)));
    first.amount = [...laterIds].reduce((s, id) => s + byId.get(id).amount, 0);
    first.reasons.push(
      `${first.txnIds.length} payments are linked by equal amounts within ${settings.dupWindowDays} days or repeated invoice numbers; regular monthly installments can explain equal amounts.`,
    );
    for (const other of group.slice(1)) alerts.splice(alerts.indexOf(other), 1);
  }
  // Group repeated split-control failures for one vendor into one review task.
  // Keep every underlying transaction and report the number of three-day groups.
  const splits = new Map();
  for (const alert of alerts.filter((a) => a.type === "split")) {
    if (!splits.has(alert.vendor)) splits.set(alert.vendor, []);
    splits.get(alert.vendor).push(alert);
  }
  for (const group of splits.values()) {
    if (group.length < 2) continue;
    const first = group[0],
      total = sumAmounts(group);
    first.headline = `${group.length} groups of payments to ${first.vendor} total ${dollars(total)}; each group exceeds the ${dollars(settings.approvalThreshold)} approval limit within 3 days using smaller invoices.`;
    first.txnIds = [...new Set(group.flatMap((a) => a.txnIds))];
    first.amount = total;
    first.date = group.at(-1).date;
    first.reasons = [
      `${first.txnIds.length} invoices appear in ${group.length} separate three-day groups.`,
      `Group totals: ${group.map((a) => dollars(a.amount)).join(", ")}.`,
      "Check whether each group represents one purchase requiring council approval.",
    ];
    for (const other of group.slice(1)) alerts.splice(alerts.indexOf(other), 1);
  }
  return alerts;
}

function sumAmounts(alerts) {
  return alerts.reduce((total, a) => total + a.amount, 0);
}
