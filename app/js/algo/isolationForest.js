// Rare payments tend to be separated by fewer random cuts than ordinary ones.
// An isolation forest averages that path length across 100 trees and converts
// it to an anomaly score. It needs no labeled examples, which suits city ledgers.
import { makeRng } from "./rng.js";
import { median } from "./stats.js";
import { dollars } from "./rules.js";

// Expected path length for a sample of this size, including unfinished leaves.
export function c(sampleSize) {
  if (sampleSize <= 1) return 0;
  let harmonicSum = 0;
  for (let i = 1; i < sampleSize; i++) harmonicSum += 1 / i;
  return 2 * harmonicSum - (2 * (sampleSize - 1)) / sampleSize;
}

function featureRanges(rows, featureCount) {
  const ranges = [];
  for (let featureIndex = 0; featureIndex < featureCount; featureIndex++) {
    let minimum = Infinity;
    let maximum = -Infinity;
    for (const row of rows) {
      minimum = Math.min(minimum, row[featureIndex]);
      maximum = Math.max(maximum, row[featureIndex]);
    }
    if (maximum > minimum) ranges.push({ featureIndex, minimum, maximum });
  }
  return ranges;
}

function buildIsolationTree(rows, depth, depthLimit, featureCount, random) {
  if (rows.length <= 1 || depth >= depthLimit) return { size: rows.length };
  const ranges = featureRanges(rows, featureCount);
  if (!ranges.length) return { size: rows.length };

  const { featureIndex, minimum, maximum } = random.pick(ranges);
  const cut = minimum + (maximum - minimum) * random();
  const leftRows = [];
  const rightRows = [];
  for (const row of rows) {
    if (row[featureIndex] < cut) leftRows.push(row);
    else rightRows.push(row);
  }
  return {
    f: featureIndex,
    cut,
    left: buildIsolationTree(leftRows, depth + 1, depthLimit, featureCount, random),
    right: buildIsolationTree(rightRows, depth + 1, depthLimit, featureCount, random),
  };
}

function pathLength(row, node, depth = 0) {
  if (node.size !== undefined) return depth + c(node.size);
  let nextNode = node.right;
  if (row[node.f] < node.cut) nextNode = node.left;
  return pathLength(row, nextNode, depth + 1);
}

function sampleRows(featureRows, sampleSize, random) {
  const indices = featureRows.map((row, i) => i);
  // Partial Fisher-Yates shuffle samples without replacement.
  for (let i = 0; i < sampleSize; i++) {
    const j = random.int(i, featureRows.length - 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, sampleSize).map((index) => featureRows[index]);
}

export class IsolationForest {
  constructor({ trees = 100, subsample = 256, seed = 42 } = {}) {
    this.treeCount = trees;
    this.subsample = subsample;
    this.seed = seed;
  }

  fit(featureRows) {
    this.size = Math.min(this.subsample, featureRows.length);
    this.trees = [];
    if (!this.size) return this;
    const random = makeRng(this.seed);
    const depthLimit = Math.ceil(Math.log2(this.size));
    for (let treeIndex = 0; treeIndex < this.treeCount; treeIndex++) {
      const rows = sampleRows(featureRows, this.size, random);
      const tree = buildIsolationTree(rows, 0, depthLimit, featureRows[0].length, random);
      this.trees.push(tree);
    }
    return this;
  }

  score(featureRows) {
    return featureRows.map((row) => {
      if (this.size <= 1) return 0.5;
      const totalLength = this.trees.reduce((total, tree) => total + pathLength(row, tree), 0);
      return 2 ** (-totalLength / this.trees.length / c(this.size));
    });
  }
}

function paymentFeatures(transaction, vendor, typicalAmount) {
  const weekday = new Date(`${transaction.date}T00:00:00Z`).getUTCDay();
  return [
    Math.log1p(Math.max(0, transaction.amount)),
    Math.log1p(Math.max(0, transaction.amount) / Math.max(1, typicalAmount)),
    weekday === 0 || weekday === 6 ? 1 : 0,
    transaction.amount % 100 === 0 ? 1 : 0,
    1 / Math.sqrt(vendor.txnCount),
  ];
}

function featureDisplay(featureIndex, value, transaction, vendor) {
  if (featureIndex === 0) return dollars(transaction.amount);
  if (featureIndex === 1) return `${Math.expm1(value).toFixed(1)} times vendor median`;
  if (featureIndex === 2 || featureIndex === 3) {
    if (value) return "Yes";
    return "No";
  }
  return `${vendor.txnCount} recorded payments`;
}

function originalFeatureValue(featureIndex, value, transaction) {
  if (featureIndex === 0) return transaction.amount;
  if (featureIndex === 1) return Math.expm1(value);
  return value;
}

function percentileBelow(sortedValues, value) {
  // Binary search avoids rescanning the ledger for every explanation.
  let lowerIndex = 0;
  let upperIndex = sortedValues.length;
  while (lowerIndex < upperIndex) {
    const middleIndex = (lowerIndex + upperIndex) >> 1;
    if (sortedValues[middleIndex] < value) lowerIndex = middleIndex + 1;
    else upperIndex = middleIndex;
  }
  return lowerIndex / sortedValues.length;
}

function explainFeatures(features, sortedFeatures, transaction, vendor) {
  const labels = [
    "Payment amount",
    "Amount relative to vendor median",
    "Weekend payment",
    "Round hundred-dollar amount",
    "Vendor rarity",
  ];
  const names = ["amount", "vendorRatio", "weekend", "roundAmount", "vendorRarity"];
  const explanations = features.map((value, featureIndex) => ({
    feature: names[featureIndex],
    label: labels[featureIndex],
    value: originalFeatureValue(featureIndex, value, transaction),
    display: featureDisplay(featureIndex, value, transaction, vendor),
    percentile: percentileBelow(sortedFeatures[featureIndex], value),
  }));
  explanations.sort((first, second) => second.percentile - first.percentile);
  return explanations.slice(0, 3);
}

function isolationAlert(transaction, typicalAmount) {
  const relativeAmount = (transaction.amount / Math.max(1, typicalAmount)).toFixed(1);
  const headline =
    `This ${dollars(transaction.amount)} payment to ` +
    `${transaction.vendorCanonical} is ${relativeAmount} times its median invoice of ` +
    `${dollars(typicalAmount)}, with an anomaly score of ${transaction.ifScore.toFixed(2)}.`;
  return {
    type: "isolation",
    severity: "medium",
    score: transaction.ifScore,
    title: "Unusual payment pattern",
    headline,
    reasons: transaction.ifTop.map((feature) => `${feature.label}: ${feature.display}.`),
    detectors: ["isolation-forest"],
    txnIds: [transaction.id],
    vendor: transaction.vendorCanonical,
    category: transaction.category,
    categoryId: transaction.categoryId,
    amount: transaction.amount,
    date: transaction.date,
  };
}

export function isolationEvidence(transactions, vendors, settings) {
  const vendorsByName = new Map(vendors.map((vendor) => [vendor.canonical, vendor]));
  const amountsByVendor = new Map(
    vendors.map((vendor) => [
      vendor.canonical,
      transactions
        .filter((transaction) => transaction.vendorCanonical === vendor.canonical)
        .map((transaction) => transaction.amount),
    ]),
  );
  const features = transactions.map((transaction) =>
    paymentFeatures(
      transaction,
      vendorsByName.get(transaction.vendorCanonical),
      median(amountsByVendor.get(transaction.vendorCanonical)),
    ),
  );
  const forest = new IsolationForest().fit(features);
  const scores = forest.score(features);
  const sortedFeatures =
    features[0]?.map((feature, j) =>
      features.map((row) => row[j]).sort((first, second) => first - second),
    ) ?? [];
  const alerts = [];
  transactions.forEach((transaction, i) => {
    transaction.ifScore = scores[i];
    transaction.ifTop = explainFeatures(
      features[i],
      sortedFeatures,
      transaction,
      vendorsByName.get(transaction.vendorCanonical),
    );
    const typicalAmount = median(amountsByVendor.get(transaction.vendorCanonical));
    // A statistical outlier alone is not proof of waste. Also require a large bill.
    if (
      transaction.ifScore >= settings.ifThreshold &&
      transaction.amount > Math.max(5000, typicalAmount * 2)
    ) {
      alerts.push(isolationAlert(transaction, typicalAmount));
    }
  });
  return alerts;
}
