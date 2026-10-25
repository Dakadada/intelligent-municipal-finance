// Check the issues seen in the real UI against complete output and small fixtures.
// Forecast accuracy uses an untouched fiscal year; text and merge checks exercise
// what a city clerk sees rather than accepting correct-looking summary counts.
import { beforeAll, test, expect } from "bun:test";
import {
  loadSampleLedger, runAnalysis, SAMPLE_CONTRACTS, analyzeContract,
} from "../app/js/engine.js";
import { clusterVendors, jaroWinkler } from "../app/js/algo/vendorMatch.js";
import { fitARIMA } from "../app/js/algo/arima.js";
import { backtest } from "./backtest.js";
import { fitLegacyARIMA } from "./forecast-legacy.js";

let analysis;
beforeAll(() => { analysis = runAnalysis(loadSampleLedger()); });

test("forecast improves held-out annual totals and applies exact materiality rules", () => {
  const previous = backtest(fitLegacyARIMA);
  const revised = backtest(fitARIMA);
  expect(revised.mape).toBeLessThan(previous.mape);
  for (const category of analysis.forecast.categories) {
    let expected = "ok";
    if (category.projected > category.budget * 1.05 ||
      category.projectedLo > category.budget) expected = "over";
    else if (category.projected > category.budget ||
      category.projectedHi > category.budget) expected = "watch";
    expect(category.status).toBe(expected);
  }
});

test("seasonal context never expands the three paving invoices", () => {
  const split = analysis.alerts.find(alert => alert.type === "split");
  const invoices = split.txnIds.map(id => analysis.txns.find(row => row.id === id).invoice);
  expect(invoices.sort()).toEqual(["CBP-9120", "CBP-9121", "CBP-9122"]);
});

test("review queue stays focused without losing any demonstration cases", () => {
  expect(analysis.alerts.length).toBeGreaterThanOrEqual(20);
  expect(analysis.alerts.length).toBeLessThanOrEqual(28);
  expect(analysis.evaluation.caught).toBe(10);
  for (const pattern of Object.values(analysis.patterns)) {
    for (const point of pattern.months.filter(month => month.flagged)) {
      expect(point.actual - point.upper).toBeGreaterThan(2000);
      expect(point.actual).toBeGreaterThan(point.upper * 1.25);
    }
  }
});

test("all clerk-facing alerts use ordinary words and readable dates", () => {
  const jargon = /Huber|boosted.tree|isolation forest|percentile|\bmodel\b|z.score|residual/i;
  for (const alert of analysis.alerts) {
    expect(alert.date.length).toBeGreaterThan(0);
    expect(alert.headline.length).toBeGreaterThan(0);
    for (const sentence of [alert.title, alert.headline, ...alert.reasons]) {
      expect(sentence).not.toMatch(jargon);
      expect(sentence).not.toMatch(/\d{4}-\d{2}/);
    }
  }
  for (const category of analysis.forecast.categories) {
    expect(category.headline).not.toMatch(/\d{4}-\d{2}/);
  }
  const duplicate = analysis.alerts.find(alert => alert.vendor.includes("Janitorial"));
  expect(duplicate.headline).toContain("Feb 5, 2025");
});

test("alias similarity records the worst pair of actual spellings", () => {
  const names = ["Bob's Plumbing", "Bob's Plumbing Service", "Bobs Plumbing"];
  const groups = clusterVendors(names);
  expect(groups.length).toBe(1);
  const similarities = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      similarities.push(jaroWinkler(names[i].toLowerCase(), names[j].toLowerCase()));
    }
  }
  expect(groups[0].similarity).toBeCloseTo(Math.min(...similarities), 12);
  expect(groups[0].similarity).toBeLessThan(1);
  expect(clusterVendors(["Only Supplier"])[0].similarity).toBe(1);
});

test("contract grades follow the requested bands and verdicts explain terms", () => {
  for (const sample of SAMPLE_CONTRACTS) {
    const result = analyzeContract(sample.text);
    let grade = "F";
    if (result.score >= 85) grade = "A";
    else if (result.score >= 70) grade = "B";
    else if (result.score >= 55) grade = "C";
    else if (result.score >= 40) grade = "D";
    expect(result.grade).toBe(grade);
    expect(result.verdict).not.toMatch(/suitability score|out of 100/i);
  }
  expect(analyzeContract(SAMPLE_CONTRACTS[0].text).verdict).toContain("6%");
});

test("generator still contains every intended fiscal year and payment", () => {
  const ledger = loadSampleLedger();
  expect(ledger.txns.length).toBe(1885);
  expect([...new Set(ledger.txns.map(row => row.fy))]).toEqual(
    [2022, 2023, 2024, 2025, 2026, 2027]);
  const total = ledger.txns.reduce((subtotal, row) => subtotal + row.amount, 0);
  expect(total).toBeGreaterThan(3900000);
  expect(total).toBeLessThan(4100000);
});

test("three consecutive large cost increases do not wait for a full year", async () => {
  const { detectRules } = await import("../app/js/algo/rules.js");
  const { DEFAULT_SETTINGS } = await import("../app/js/engine.js");
  const monthly = Array.from({ length: 24 }, (unusedValue, i) => ({
    month: `${2024 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, "0")}`,
    total: i >= 21 ? 5000 : 2000,
  }));
  const rows = monthly.map((entry, i) => ({
    id: String(i), date: entry.month + "-10", amount: 1000, invoice: String(i),
    vendorCanonical: "Example Repair", category: "Repairs", categoryId: "repairs",
    description: "Repair work",
  }));
  const vendor = {
    canonical: "Example Repair", aliases: ["Example Repair"], monthly,
    recentAvg: 1000, priorAvg: 1000, changePct: 0, recentCutoff: "2025-01-01",
  };
  const alerts = detectRules(rows, [vendor], DEFAULT_SETTINGS);
  const trend = alerts.find(alert => alert.type === "vendor-increase");
  expect(trend).toBeDefined();
  expect(trend.headline).toContain("latest 3 months");
});
