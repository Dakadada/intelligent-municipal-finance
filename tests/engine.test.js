// Verify each algorithm with small known examples, then check the complete
// sample audit. Independent fixtures catch rule mistakes; label-removal and
// deterministic-output checks guard against accidental reliance on demo labels.
import { test, expect } from "bun:test";
import { jaroWinkler, clusterVendors } from "../app/js/algo/vendorMatch.js";
import { IsolationForest, c } from "../app/js/algo/isolationForest.js";
import { fitGBM } from "../app/js/algo/gbm.js";
import { fitARIMA, forecastARIMA } from "../app/js/algo/arima.js";
import { trainNB } from "../app/js/algo/contractNLP.js";
import {
  DEFAULT_SETTINGS,
  loadSampleLedger,
  runAnalysis,
  analyzeContract,
  SAMPLE_CONTRACTS,
  parseLedgerCSV,
} from "../app/js/engine.js";
test("Jaro-Winkler known example and punctuation aliases", () => {
  expect(jaroWinkler("MARTHA", "MARHTA")).toBeCloseTo(0.9611, 3);
  const groups = clusterVendors([
    "Bob's Plumbing",
    "Bobs Plumbing",
    "Bob's Plumbing Service",
    "Other Company",
  ]);
  expect(groups.length).toBe(2);
});
test("isolation forest isolates a distant point deterministically", () => {
  const featureRows = Array.from({ length: 100 }, (unusedValue, i) => [i / 100, (i % 7) / 7]);
  featureRows.push([50, 50]);
  const analysis = new IsolationForest().fit(featureRows).score(featureRows);
  expect(analysis[100]).toBeGreaterThan(Math.max(...analysis.slice(20, 80)));
  expect(new IsolationForest().fit(featureRows).score(featureRows)).toEqual(analysis);
  expect(c(2)).toBe(1);
  expect(c(1)).toBe(0);
});
test("Huber boosted trees learn a nonlinear signal despite one outlier", () => {
  const featureRows = Array.from({ length: 60 }, (unusedValue, i) => [i]);
  const y = featureRows.map(([x]) => (x < 30 ? 10 : 30));
  y[10] = 1000;
  const model = fitGBM(featureRows, y);
  expect(model.predict([15])).toBeCloseTo(10, -0);
  expect(model.predict([45])).toBeCloseTo(30, -0);
});
test("seasonal ARIMA recovers yearly drift and seeded intervals", () => {
  const y = Array.from(
    { length: 60 },
    (unusedValue, i) => 100 + (i % 12) * 10 + Math.floor(i / 12) * 12,
  );
  const model = fitARIMA(y);
  const forecast = forecastARIMA(model, 12);
  expect(forecast.median[0]).toBeCloseTo(160, 1);
  expect(forecast.median[11]).toBeCloseTo(270, 1);
  expect(forecastARIMA(model, 12)).toEqual(forecast);
});
test("naive Bayes actually learns labels", () => {
  const classifier = trainNB([
    { text: "unlimited charges penalty", risky: true },
    { text: "fixed cap audit", risky: false },
  ]);
  expect(classifier.predict("unlimited penalty")).toBeCloseTo(0.8, 10);
  expect(classifier.predict("fixed audit")).toBeCloseTo(0.2, 10);
});
test("CSV handles quotes, invalid dates, zero dollars, budgets and empty data", () => {
  const parsedCsv = parseLedgerCSV(
    'DATE,vendor,amount,category,budget_fy,budget\n2026-07-01,"Acme, ' +
      'Inc",0,Office,2027,500\n2026-02-30,Bad,20,Office,,',
  );
  expect(parsedCsv.ledger.txns.length).toBe(1);
  expect(parsedCsv.warnings.length).toBe(1);
  expect(parsedCsv.ledger.budgets[2027].office).toBe(500);
  expect(
    runAnalysis(parseLedgerCSV("date,vendor,amount,category").ledger).summary.txnCount,
  ).toBe(0);
});
test("CSV reads common accounting-export headers, dates, and negatives", () => {
  const parsedCsv = parseLedgerCSV(
    "Check Date,Payee Name,Net Amount,Account Description,Invoice #,Fiscal Year\n" +
      '7/1/2026,"Acme, Inc","$1,250.00",Office Supplies,A-1,2027\n' +
      "07/15/26 0:00,Bob's Plumbing,(40.00),Repairs,B-2,2027\n" +
      "2/30/2026,Bad Date,10,Office,,2027",
  );
  expect(parsedCsv.columns.vendor).toBe("Payee Name");
  expect(parsedCsv.ledger.txns.length).toBe(2);
  expect(parsedCsv.ledger.txns[0].date).toBe("2026-07-01");
  expect(parsedCsv.ledger.txns[0].amount).toBe(1250);
  expect(parsedCsv.ledger.txns[1].amount).toBe(-40);
  expect(parsedCsv.ledger.txns[0].invoice).toBe("A-1");
  expect(parsedCsv.warnings.length).toBe(1);
  expect(parseLedgerCSV("When,Who,How much\n2026-01-01,x,1").warnings.length).toBe(4);
});
test("sample contracts contain substantial text and safety distinctions", () => {
  expect(SAMPLE_CONTRACTS.length).toBe(4);
  for (const sampleContract of SAMPLE_CONTRACTS) {
    expect(sampleContract.text.split(/\s+/).length).toBeGreaterThanOrEqual(150);
  }
  const analysis = SAMPLE_CONTRACTS.map((sampleContract) =>
    analyzeContract(sampleContract.text),
  );
  expect(analysis[2].score).toBeGreaterThan(analysis[0].score);
  expect(analysis[0].terms.escalatorPct).toBe(6);
  expect(analysis[2].terms.competitiveBid).toBe(true);
  expect(analysis[0].model.trainingClauses).toBeGreaterThanOrEqual(80);
});
test("end to end respects public interface, determinism, labels boundary and speed", () => {
  const ledger = loadSampleLedger();
  const before = JSON.stringify(ledger);
  const start = performance.now();
  const analysis = runAnalysis(ledger);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(1500);
  expect(analysis.txns.length).toBe(ledger.txns.length);
  expect(analysis.alerts.length).toBeLessThan(40);
  expect(analysis.evaluation.total).toBe(10);
  expect(analysis.evaluation.caught).toBe(10);
  expect(
    analysis.forecast.categories.find((category) => category.categoryId === "electric").status,
  ).toBe("over");
  expect(
    analysis.forecast.categories.find((category) => category.categoryId === "fire").status,
  ).toBe("over");
  expect(JSON.stringify(ledger)).toBe(before);
  const stripped = structuredClone(ledger);
  stripped.txns.forEach((transaction) => delete transaction.planted);
  const comparisonAnalysis = runAnalysis(stripped);
  expect(comparisonAnalysis.alerts).toEqual(analysis.alerts);
  expect(comparisonAnalysis.evaluation).toBeNull();
  expect(comparisonAnalysis.forecast).toEqual(analysis.forecast);
  const paymentGroups = new Set();
  for (const alert of analysis.alerts) {
    expect(alert.headline).toMatch(/\d/);
    if (!alert.txnIds.length) continue;
    const group = [...alert.txnIds].sort().join(",");
    expect(paymentGroups.has(group)).toBe(false);
    paymentGroups.add(group);
  }
  expect(analysis.forecast.total.months.length).toBe(12);
  expect(analysis.forecast.total.projectedLo).toBeLessThanOrEqual(
    analysis.forecast.total.projected,
  );
  expect(analysis.forecast.total.projectedHi).toBeGreaterThanOrEqual(
    analysis.forecast.total.projected,
  );
});
test("generator invoice numbers do not collide with unrelated transactions", () => {
  const ledger = loadSampleLedger();
  const matches = ledger.txns.filter((transaction) => transaction.invoice === "BP-1187");
  expect(matches.length).toBe(2);
  expect(matches.every((transaction) => transaction.amount === 1840)).toBe(true);
});
test("clause rules distinguish a capped hourly agreement from open-ended billing", () => {
  const safe = analyzeContract(
    "The term is 12 months. Time and materials payments shall not " +
      "exceed $20,000. The city may terminate for convenience without " +
      "penalty.",
  );
  expect(safe.findings.some((finding) => finding.id === "time-materials")).toBe(false);
  expect(safe.findings.some((finding) => finding.id === "nte")).toBe(true);
  const risk = analyzeContract(
    "The term is 60 months. The vendor may increase fees by 5% " +
      "annually without a price cap.",
  );
  expect(risk.findings.some((finding) => finding.id === "long-term")).toBe(true);
  expect(risk.findings.some((finding) => finding.id === "uncapped-price")).toBe(true);
});
test("rules detect duplicates, splits, and price increases", async () => {
  const { detectRules } = await import("../app/js/algo/rules.js");
  const make = (id, date, amount, invoice) => ({
    id,
    date,
    amount,
    invoice,
    vendorCanonical: "Test Works",
    category: "Repairs",
    categoryId: "repairs",
    description: "Repair",
  });
  const transactions = [
    ...Array.from({ length: 5 }, (unusedValue, i) =>
      make(`prior-${i}`, `2024-0${i + 1}-01`, 100, `prior-${i}`),
    ),
    make("two", "2025-01-01", 4950, "b"),
    make("three", "2025-01-02", 4950, "c"),
  ];
  const vendor = {
    canonical: "Test Works",
    aliases: ["Test Works"],
    recentAvg: 3000,
    priorAvg: 100,
    changePct: 2900,
    recentCutoff: "2024-12-31",
  };
  const alerts = detectRules(transactions, [vendor], { ...DEFAULT_SETTINGS });
  expect(alerts.some((analysis) => analysis.type === "duplicate")).toBe(true);
  expect(alerts.some((analysis) => analysis.type === "split")).toBe(true);
  expect(alerts.some((analysis) => analysis.type === "vendor-increase")).toBe(true);
});
test("sentence offsets preserve decimal prices and every source character", () => {
  const text =
    "Annual fees increase by 2.5% each year. Total value is $1,234.50. " +
    "Audit rights apply.";
  const analysis = analyzeContract(text);
  expect(analysis.sentences.length).toBe(3);
  expect(analysis.sentences[0].text).toBe("Annual fees increase by 2.5% each year.");
  for (const sentence of analysis.sentences) {
    expect(text.slice(sentence.start, sentence.end)).toBe(sentence.text);
  }
});
test("calendar fiscal years and sparse no-budget forecasts stay finite", () => {
  const ledger = parseLedgerCSV(
    "date,vendor,amount,category\n2026-02-01,Any vendor,100,Office",
  ).ledger;
  ledger.town.fyStartMonth = 1;
  const analysis = runAnalysis(ledger);
  expect(analysis.summary.currentFy).toBe(2026);
  expect(analysis.forecast.fy).toBe(2026);
  expect(analysis.forecast.monthsObserved).toBe(2);
  expect(analysis.forecast.total.budget).toBeNull();
  expect(Number.isFinite(analysis.forecast.total.projected)).toBe(true);
});
test("uncapped escalation is risky even without an explicit no-cap sentence", () => {
  const analysis = analyzeContract(
    "The annual fee shall increase by 7% on each anniversary. The term is 24 months.",
  );
  expect(analysis.findings.some((finding) => finding.id === "uncapped-price")).toBe(true);
  expect(analysis.terms.escalatorPct).toBe(7);
});
test("negated protections do not earn protective findings", () => {
  const analysis = analyzeContract(
    "The city has no audit rights. There are no performance metrics.",
  );
  expect(analysis.findings.filter((forecast) => forecast.severity === "good").length).toBe(0);
});
test(
  "duplicate headlines report both values when an invoice number is " +
    "reused for unequal payments",
  async () => {
    const { detectRules } = await import("../app/js/algo/rules.js");
    const base = {
      vendorCanonical: "Example",
      category: "Office",
      categoryId: "office",
      description: "Paper",
      invoice: "SAME",
    };
    const rows = [
      { ...base, id: "x", date: "2026-01-01", amount: 100 },
      { ...base, id: "y", date: "2026-01-02", amount: 120 },
    ];
    const analysis = detectRules(
      rows,
      [{ canonical: "Example", aliases: ["Example"] }],
      DEFAULT_SETTINGS,
    ).find((analysis) => analysis.type === "duplicate");
    expect(analysis.headline).toContain("$100 and $120");
  },
);
test("distinct monthly invoices do not trigger duplicates", async () => {
  const { detectRules } = await import("../app/js/algo/rules.js");
  const base = {
    vendorCanonical: "Monthly Works",
    category: "Cleaning",
    categoryId: "clean",
    description: "Monthly cleaning",
    amount: 100,
  };
  const rows = ["2026-01-01", "2026-02-01", "2026-03-01"].map((date, i) => ({
    ...base,
    id: String(i),
    date,
    invoice: String(i),
  }));
  const alerts = detectRules(
    rows,
    [{ canonical: "Monthly Works", aliases: ["Monthly Works"] }],
    DEFAULT_SETTINGS,
  );
  expect(alerts.some((analysis) => analysis.type === "duplicate")).toBe(false);
});
test("vendor trend detects rising monthly costs with flat invoice sizes", async () => {
  const { detectRules } = await import("../app/js/algo/rules.js");
  const monthly = Array.from({ length: 24 }, (unusedValue, i) => ({
    month: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
    total: i < 12 ? 2000 : 3000,
  }));
  const rows = monthly.map((monthlyEntry, i) => ({
    id: String(i),
    date: monthlyEntry.month + "-10",
    vendorCanonical: "Growing Supplier",
    category: "Supplies",
    categoryId: "supplies",
    description: "Materials",
    invoice: String(i),
    amount: 1000,
  }));
  const vendor = {
    canonical: "Growing Supplier",
    aliases: ["Growing Supplier"],
    monthly,
    recentAvg: 1000,
    priorAvg: 1000,
    changePct: 0,
    recentCutoff: "2025-01-01",
  };
  const alert = detectRules(rows, [vendor], DEFAULT_SETTINGS).find(
    (analysis) => analysis.type === "vendor-increase",
  );
  expect(alert).toBeDefined();
  expect(alert.headline).toContain("50%");
});
test("quality fixes remove recurring noise and retain all planted cases", () => {
  const analysis = runAnalysis(loadSampleLedger());
  const janitorial = analysis.alerts.find(
    (alert) => alert.type === "duplicate" && alert.vendor.includes("Janitorial"),
  );
  expect(janitorial.headline).not.toContain("matching payment pairs");
  expect(janitorial.txnIds.length).toBe(2);
  expect(janitorial.headline).toContain("Feb 5, 2025");
  expect(
    analysis.alerts
      .filter((alert) => alert.type === "split")
      .every((alert) => !alert.vendor.includes("Snow")),
  ).toBe(true);
  const split = analysis.alerts.find(
    (alert) => alert.type === "split" && alert.vendor.includes("Corn Belt"),
  );
  expect(split.headline).toContain("$4,950 + $4,875 + $4,990");
  expect(split.headline).toContain("$14,815");
  expect(
    analysis.alerts
      .filter((alert) => alert.type === "new-vendor")
      .every((alert) => alert.date >= "2022-01-01"),
  ).toBe(true);
  for (const alert of analysis.alerts) {
    expect(alert.headline).not.toMatch(/\d{4}-\d{2}/);
  }
  for (const category of analysis.forecast.categories) {
    expect(category.headline).not.toMatch(/\d{4}-\d{2}/);
  }
  expect(analyzeContract(SAMPLE_CONTRACTS[0].text).score).toBeLessThanOrEqual(60);
  expect(analysis.evaluation.caught).toBe(10);
});
