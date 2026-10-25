// Predict ordinary monthly spending with many small regression trees. Each
// tree corrects the previous prediction using the Huber loss, which limits the
// pull of extreme bills. Month and time features fit seasonal city spending.
import { mean, median, quantile, mad } from "./stats.js";
import { dollars, monthName } from "./rules.js";
function predictTree(tree, featureRow) {
  if (tree.value !== undefined) {
    return tree.value;
  }
  let nextBranch = tree.right;
  if (featureRow[tree.feature] <= tree.cut) {
    nextBranch = tree.left;
  }
  return predictTree(nextBranch, featureRow);
}
function findBestSplit(featureRows, targets, indices, minLeaf) {
  let best = null;
  for (let featureIndex = 0; featureIndex < featureRows[0].length; featureIndex++) {
    const sorted = [...indices].sort(
      (firstIndex, secondIndex) =>
        featureRows[firstIndex][featureIndex] - featureRows[secondIndex][featureIndex],
    );
    let leftSum = 0;
    let leftSumSquares = 0;
    const total = indices.reduce((predictionTotal, i) => predictionTotal + targets[i], 0);
    const totalSumSquares = indices.reduce(
      (predictionTotal, i) => predictionTotal + targets[i] ** 2,
      0,
    );
    // Running sums evaluate every cut without rebuilding both groups.
    for (let splitIndex = 1; splitIndex < sorted.length; splitIndex++) {
      const observedValue = targets[sorted[splitIndex - 1]];
      leftSum += observedValue;
      leftSumSquares += observedValue * observedValue;
      if (
        splitIndex < minLeaf ||
        sorted.length - splitIndex < minLeaf ||
        featureRows[sorted[splitIndex - 1]][featureIndex] ===
          featureRows[sorted[splitIndex]][featureIndex]
      ) {
        continue;
      }
      const loss =
        leftSumSquares -
        leftSum ** 2 / splitIndex +
        totalSumSquares -
        leftSumSquares -
        (total - leftSum) ** 2 / (sorted.length - splitIndex);
      if (!best || loss < best.loss) {
        best = {
          loss,
          feature: featureIndex,
          cut:
            (featureRows[sorted[splitIndex - 1]][featureIndex] +
              featureRows[sorted[splitIndex]][featureIndex]) /
            2,
          sorted,
          splitIndex,
        };
      }
    }
  }
  return best;
}
function treeFit(featureRows, targets, indices, depth, minLeaf) {
  const value = mean(indices.map((i) => targets[i]));
  if (!depth || indices.length < minLeaf * 2) {
    return { value };
  }
  const best = findBestSplit(featureRows, targets, indices, minLeaf);
  if (!best) {
    return { value };
  }
  return {
    feature: best.feature,
    cut: best.cut,
    left: treeFit(
      featureRows,
      targets,
      best.sorted.slice(0, best.splitIndex),
      depth - 1,
      minLeaf,
    ),
    right: treeFit(
      featureRows,
      targets,
      best.sorted.slice(best.splitIndex),
      depth - 1,
      minLeaf,
    ),
  };
}
export function fitGBM(
  featureRows,
  targets,
  { trees = 70, learningRate = 0.08, maxDepth = 3, minLeaf = 3 } = {},
) {
  const base = median(targets);
  const fitted = targets.map(() => base);
  const forest = [];
  // A fixed clipping cutoff keeps one outlier from controlling the gradients.
  const delta = Math.max(
    1e-6,
    quantile(
      targets.map((observedValue) => Math.abs(observedValue - base)),
      0.95,
    ),
  );
  for (let treeIndex = 0; treeIndex < trees && targets.length; treeIndex++) {
    const residuals = targets.map((observedValue, i) => observedValue - fitted[i]);
    const gradient = residuals.map((residual) => Math.max(-delta, Math.min(delta, residual)));
    const tree = treeFit(
      featureRows,
      gradient,
      targets.map((unusedValue, i) => i),
      maxDepth,
      minLeaf,
    );
    forest.push(tree);
    fitted.forEach((unusedValue, i) => {
      fitted[i] += learningRate * predictTree(tree, featureRows[i]);
    });
  }
  return {
    trees: forest,
    learningRate,
    maxDepth,
    loss: "huber",
    predict: (featureRow) =>
      base +
      learningRate *
        forest.reduce(
          (predictionTotal, tree) => predictionTotal + predictTree(tree, featureRow),
          0,
        ),
  };
}
const month = (date) => date.slice(0, 7);
function fitHeldOutYears(featureRows, targets, months) {
  // Cross-fit by twelve-month block: the assessed year's observations are
  // excluded, so a large payment cannot train away its own anomaly.
  const options = { trees: 70, learningRate: 0.08, maxDepth: 3 };
  const model = fitGBM(featureRows, targets, options);
  const predictions = [];
  for (let block = 0; block < Math.ceil(months.length / 12); block++) {
    const trainIndices = targets
      .map((unusedValue, i) => i)
      .filter((i) => Math.floor(i / 12) !== block);
    const heldOut = fitGBM(
      trainIndices.map((i) => featureRows[i]),
      trainIndices.map((i) => targets[i]),
      options,
    );
    for (let i = block * 12; i < Math.min(months.length, (block + 1) * 12); i++) {
      predictions[i] = Math.max(0, heldOut.predict(featureRows[i]));
    }
  }
  return { model, predictions };
}
export function buildPatterns(transactions, categories, months, settings) {
  const patterns = {};
  const alerts = [];
  for (const category of categories) {
    const rows = transactions.filter((transaction) => transaction.categoryId === category.id);
    const totals = new Map();
    for (const transaction of rows) {
      totals.set(
        month(transaction.date),
        (totals.get(month(transaction.date)) ?? 0) + transaction.amount,
      );
    }
    const targets = months.map((monthKey) => totals.get(monthKey) ?? 0);
    const featureRows = months.map((monthKey, i) => [+monthKey.slice(5), i]);
    const { model, predictions } = fitHeldOutYears(featureRows, targets, months);
    const residuals = targets.map((observedValue, i) => observedValue - predictions[i]);
    const residualSd = Math.max(mad(residuals), median(targets) * 0.08, 25);
    const points = months.map((monthKey, i) => {
      const expected = predictions[i];
      const lower = Math.max(0, expected - settings.bandK * residualSd);
      const upper = expected + settings.bandK * residualSd;
      const flagged =
        months.length >= 36 &&
        targets[i] > upper &&
        targets[i] - upper > 2000 &&
        targets[i] > upper * 1.25;
      if (flagged) {
        const affected = rows.filter((transaction) => month(transaction.date) === monthKey);
        alerts.push({
          type: "seasonal",
          severity: "high",
          score: Math.min(
            0.96,
            0.78 + ((targets[i] - upper) / Math.max(targets[i], 1)) * 0.15,
          ),
          title: "Spending above the usual range",
          headline:
            `${category.name} spending in ${monthName(monthKey)} was ${dollars(targets[i])}; ` +
            `the usual range for that month is up to ${dollars(upper)}.`,
          reasons: [
            `In a normal ${monthName(monthKey).split(" ")[0]}, ` +
              `${category.name.toLowerCase()} spending runs about ${dollars(expected)}; ` +
              `this month it was ${dollars(targets[i])}.`,
            `This is ${dollars(targets[i] - upper)} above the usual upper limit ` +
              `of ${dollars(upper)} for that month.`,
          ],
          detectors: ["gbm-baseline"],
          txnIds: affected.map((transaction) => transaction.id),
          vendor: affected.length === 1 ? affected[0].vendorCanonical : "Multiple vendors",
          category: category.name,
          categoryId: category.id,
          amount: targets[i] - expected,
          date: affected.at(-1)?.date ?? `${monthKey}-01`,
        });
      }
      return {
        month: monthKey,
        actual: targets[i],
        expected,
        lower,
        upper,
        flagged,
        alertId: null,
      };
    });
    patterns[category.id] = {
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
