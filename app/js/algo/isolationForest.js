// Random cuts isolate rare observations in fewer steps. The expected search
// length c(n) corrects unfinished leaves and makes scores comparable in size.
import { makeRng } from "./rng.js";
import { median } from "./stats.js";
import { dollars } from "./rules.js";
export function c(n) {
  if (n <= 1) return 0;
  let harmonic = 0;
  for (let i = 1; i < n; i++) harmonic += 1 / i;
  return 2 * harmonic - (2 * (n - 1)) / n;
}
export class IsolationForest {
  constructor({ trees = 100, subsample = 256, seed = 42 } = {}) {
    this.treeCount = trees;
    this.subsample = subsample;
    this.seed = seed;
  }
  fit(X) {
    this.size = Math.min(this.subsample, X.length);
    this.trees = [];
    if (!this.size) return this;
    const rng = makeRng(this.seed),
      limit = Math.ceil(Math.log2(this.size));
    const build = (rows, depth) => {
      if (rows.length <= 1 || depth >= limit) return { size: rows.length };
      const ranges = X[0]
        .map((_, f) => {
          let lo = Infinity,
            hi = -Infinity;
          for (const row of rows) {
            lo = Math.min(lo, row[f]);
            hi = Math.max(hi, row[f]);
          }
          return { f, lo, hi };
        })
        .filter((r) => r.hi > r.lo);
      if (!ranges.length) return { size: rows.length };
      const { f, lo, hi } = rng.pick(ranges),
        cut = lo + (hi - lo) * rng();
      const left = [],
        right = [];
      for (const row of rows) (row[f] < cut ? left : right).push(row);
      return {
        f,
        cut,
        left: build(left, depth + 1),
        right: build(right, depth + 1),
      };
    };
    for (let t = 0; t < this.treeCount; t++) {
      const indices = X.map((_, i) => i);
      for (let i = 0; i < this.size; i++) {
        const j = rng.int(i, X.length - 1);
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      this.trees.push(
        build(
          indices.slice(0, this.size).map((i) => X[i]),
          0,
        ),
      );
    }
    return this;
  }
  score(X) {
    const path = (row, node, depth = 0) =>
      node.size !== undefined
        ? depth + c(node.size)
        : path(row, row[node.f] < node.cut ? node.left : node.right, depth + 1);
    return X.map((row) =>
      this.size <= 1
        ? 0.5
        : 2 **
          (-this.trees.reduce((s, tree) => s + path(row, tree), 0) /
            this.trees.length /
            c(this.size)),
    );
  }
}

export function isolationEvidence(txns, vendors, settings) {
  const byVendor = new Map(vendors.map((v) => [v.canonical, v]));
  const amounts = new Map(
    vendors.map((v) => [
      v.canonical,
      txns
        .filter((t) => t.vendorCanonical === v.canonical)
        .map((t) => t.amount),
    ]),
  );
  const features = txns.map((t) => {
    const values = amounts.get(t.vendorCanonical),
      typical = median(values),
      vendor = byVendor.get(t.vendorCanonical);
    const weekday = new Date(`${t.date}T00:00:00Z`).getUTCDay();
    return [
      Math.log1p(Math.max(0, t.amount)),
      Math.log1p(Math.max(0, t.amount) / Math.max(1, typical)),
      weekday === 0 || weekday === 6 ? 1 : 0,
      t.amount % 100 === 0 ? 1 : 0,
      1 / Math.sqrt(vendor.txnCount),
    ];
  });
  const scores = new IsolationForest().fit(features).score(features);
  const sorted =
    features[0]?.map((_, j) =>
      features.map((f) => f[j]).sort((a, b) => a - b),
    ) ?? [];
  const labels = [
    "Payment amount",
    "Amount relative to vendor median",
    "Weekend payment",
    "Round hundred-dollar amount",
    "Vendor rarity",
  ];
  const names = [
    "amount",
    "vendorRatio",
    "weekend",
    "roundAmount",
    "vendorRarity",
  ];
  const alerts = [];
  txns.forEach((t, i) => {
    t.ifScore = scores[i];
    t.ifTop = features[i]
      .map((value, j) => {
        const arr = sorted[j];
        let low = 0,
          high = arr.length;
        while (low < high) {
          const mid = (low + high) >> 1;
          if (arr[mid] < value) low = mid + 1;
          else high = mid;
        }
        const percentile = low / arr.length;
        const display =
          j === 0
            ? dollars(t.amount)
            : j === 1
              ? `${Math.expm1(value).toFixed(1)} times vendor median`
              : j === 2 || j === 3
                ? value
                  ? "Yes"
                  : "No"
                : `${byVendor.get(t.vendorCanonical).txnCount} recorded payments`;
        return {
          feature: names[j],
          label: labels[j],
          value: j === 0 ? t.amount : j === 1 ? Math.expm1(value) : value,
          display,
          percentile,
        };
      })
      .sort((a, b) => b.percentile - a.percentile)
      .slice(0, 3);
    // Isolation is a review signal, not proof of waste. Require a substantial
    // amount deviation as well to avoid flooding clerks with ordinary invoices.
    const typical = median(amounts.get(t.vendorCanonical));
    if (
      t.ifScore >= settings.ifThreshold &&
      t.amount > Math.max(5000, typical * 2)
    )
      alerts.push({
        type: "isolation",
        severity: "medium",
        score: t.ifScore,
        title: "Unusual payment pattern",
        headline: `This ${dollars(t.amount)} payment to ${t.vendorCanonical} is ${(t.amount / Math.max(1, typical)).toFixed(1)} times its median invoice of ${dollars(typical)}, with an anomaly score of ${t.ifScore.toFixed(2)}.`,
        reasons: t.ifTop.map((f) => `${f.label}: ${f.display}.`),
        detectors: ["isolation-forest"],
        txnIds: [t.id],
        vendor: t.vendorCanonical,
        category: t.category,
        categoryId: t.categoryId,
        amount: t.amount,
        date: t.date,
      });
  });
  return alerts;
}
