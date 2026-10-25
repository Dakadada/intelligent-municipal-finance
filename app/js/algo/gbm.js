// Boost shallow regression trees along the negative Huber-loss gradient.
// Huber clips large residuals so one unusual bill cannot drag the baseline up.
import { mean, median, quantile, mad } from "./stats.js";
import { dollars } from "./rules.js";
function predictTree(tree, x) {
  return tree.value !== undefined
    ? tree.value
    : predictTree(x[tree.feature] <= tree.cut ? tree.left : tree.right, x);
}
function treeFit(X, y, indices, depth, minLeaf) {
  const value = mean(indices.map((i) => y[i]));
  if (!depth || indices.length < minLeaf * 2) return { value };
  let best = null;
  for (let f = 0; f < X[0].length; f++) {
    const sorted = [...indices].sort((a, b) => X[a][f] - X[b][f]);
    let leftSum = 0,
      leftSq = 0;
    const total = indices.reduce((s, i) => s + y[i], 0),
      totalSq = indices.reduce((s, i) => s + y[i] ** 2, 0);
    for (let k = 1; k < sorted.length; k++) {
      const v = y[sorted[k - 1]];
      leftSum += v;
      leftSq += v * v;
      if (
        k < minLeaf ||
        sorted.length - k < minLeaf ||
        X[sorted[k - 1]][f] === X[sorted[k]][f]
      )
        continue;
      const loss =
        leftSq -
        leftSum ** 2 / k +
        totalSq -
        leftSq -
        (total - leftSum) ** 2 / (sorted.length - k);
      if (!best || loss < best.loss)
        best = {
          loss,
          feature: f,
          cut: (X[sorted[k - 1]][f] + X[sorted[k]][f]) / 2,
          sorted,
          k,
        };
    }
  }
  if (!best) return { value };
  return {
    feature: best.feature,
    cut: best.cut,
    left: treeFit(X, y, best.sorted.slice(0, best.k), depth - 1, minLeaf),
    right: treeFit(X, y, best.sorted.slice(best.k), depth - 1, minLeaf),
  };
}
export function fitGBM(
  X,
  y,
  { trees = 70, learningRate = 0.08, maxDepth = 3, minLeaf = 3 } = {},
) {
  const base = median(y),
    fitted = y.map(() => base),
    forest = [];
  const delta = Math.max(
    1e-6,
    quantile(
      y.map((v) => Math.abs(v - base)),
      0.95,
    ),
  );
  for (let t = 0; t < trees && y.length; t++) {
    const residuals = y.map((v, i) => v - fitted[i]);
    const gradient = residuals.map((r) => Math.max(-delta, Math.min(delta, r)));
    const tree = treeFit(
      X,
      gradient,
      y.map((_, i) => i),
      maxDepth,
      minLeaf,
    );
    forest.push(tree);
    fitted.forEach((_, i) => {
      fitted[i] += learningRate * predictTree(tree, X[i]);
    });
  }
  return {
    trees: forest,
    learningRate,
    maxDepth,
    loss: "huber",
    predict: (x) =>
      base + learningRate * forest.reduce((s, t) => s + predictTree(t, x), 0),
  };
}

const month = (date) => date.slice(0, 7);

export function buildPatterns(txns, categories, months, settings) {
  const patterns = {},
    alerts = [];
  for (const cat of categories) {
    const rows = txns.filter((t) => t.categoryId === cat.id),
      totals = new Map();
    for (const t of rows)
      totals.set(month(t.date), (totals.get(month(t.date)) ?? 0) + t.amount);
    const y = months.map((m) => totals.get(m) ?? 0),
      X = months.map((m, i) => [+m.slice(5), i]);
    // Cross-fit by twelve-month block: the assessed year's observations are
    // excluded, so a large payment cannot train away its own anomaly.
    const options = { trees: 70, learningRate: 0.08, maxDepth: 3 };
    const model = fitGBM(X, y, options),
      predictions = [];
    for (let block = 0; block < Math.ceil(months.length / 12); block++) {
      const trainIndices = y
        .map((_, i) => i)
        .filter((i) => Math.floor(i / 12) !== block);
      const heldOut = fitGBM(
        trainIndices.map((i) => X[i]),
        trainIndices.map((i) => y[i]),
        options,
      );
      for (
        let i = block * 12;
        i < Math.min(months.length, (block + 1) * 12);
        i++
      )
        predictions[i] = Math.max(0, heldOut.predict(X[i]));
    }
    const residuals = y.map((v, i) => v - predictions[i]);
    const residualSd = Math.max(mad(residuals), median(y) * 0.08, 25);
    const points = months.map((m, i) => {
      const expected = predictions[i];
      const lower = Math.max(0, expected - settings.bandK * residualSd),
        upper = expected + settings.bandK * residualSd;
      const flagged =
        months.length >= 36 &&
        y[i] > upper &&
        y[i] - expected > Math.max(1500, expected * 0.35);
      if (flagged) {
        const affected = rows.filter((t) => month(t.date) === m);
        alerts.push({
          type: "seasonal",
          severity: "high",
          score: Math.min(
            0.96,
            0.78 + ((y[i] - upper) / Math.max(y[i], 1)) * 0.15,
          ),
          title: "Spending above seasonal pattern",
          headline: `${cat.name} spending was ${dollars(y[i])} in ${m}, above the seasonal upper band of ${dollars(upper)}.`,
          reasons: [
            `The Huber boosted-tree model expects ${dollars(expected)} for this month; the assessed year was excluded from training.`,
            `The robust spending band uses a ${settings.bandK}-standard-deviation allowance of ${dollars(settings.bandK * residualSd)}.`,
          ],
          detectors: ["gbm-baseline"],
          txnIds: affected.map((t) => t.id),
          vendor:
            affected.length === 1
              ? affected[0].vendorCanonical
              : "Multiple vendors",
          category: cat.name,
          categoryId: cat.id,
          amount: y[i] - expected,
          date: affected.at(-1)?.date ?? `${m}-01`,
        });
      }
      return {
        month: m,
        actual: y[i],
        expected,
        lower,
        upper,
        flagged,
        alertId: null,
      };
    });
    patterns[cat.id] = {
      model: {
        trees: model.trees.length,
        learningRate: model.learningRate,
        maxDepth: model.maxDepth,
        loss: "huber",
        features: ["monthOfYear", "t"],
      },
      residualSd,
      months: points,
    };
  }
  return { patterns, alerts };
}
