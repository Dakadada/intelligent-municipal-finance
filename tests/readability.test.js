// Keep the earlier readability regression for code unchanged by the third pass.
// The new forecast, alerts and contract behavior have focused semantic tests.
// CSV parsing and the two tree algorithms must still match their original outputs.
import { test, expect } from "bun:test";
import { createHash } from "node:crypto";
import baseline from "./readability-baseline.json";
import { parseLedgerCSV, CSV_TEMPLATE } from "../app/js/engine.js";
import { IsolationForest } from "../app/js/algo/isolationForest.js";
import { fitGBM } from "../app/js/algo/gbm.js";
function sortedKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortedKeys);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const result = {};
  for (const key of Object.keys(value).sort()) {
    result[key] = sortedKeys(value[key]);
  }
  return result;
}
function fingerprint(value) {
  const serialized = JSON.stringify(sortedKeys(value));
  return createHash("sha256").update(serialized).digest("hex");
}
function captureBehavior() {
  const featureRows = Array.from({ length: 40 }, (unusedValue, i) => [i / 10, i % 3]);
  const model = fitGBM(
    featureRows,
    featureRows.map((row) => row[0] * 5),
  );
  const csv = parseLedgerCSV(CSV_TEMPLATE);
  return {
    csv,
    forest: new IsolationForest().fit(featureRows).score(featureRows),
    boosted: featureRows.map((row) => model.predict(row)),
  };
}
test("unchanged CSV parsing and tree calculations retain their results", () => {
  const actual = captureBehavior();
  for (const [name, expected] of Object.entries(baseline)) {
    expect(fingerprint(actual[name]), name).toBe(expected);
  }
});
