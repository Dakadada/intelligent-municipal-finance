// Behavioral checks use independent toy data as well as the complete demo.
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
  const X = Array.from({ length: 100 }, (_, i) => [i / 100, (i % 7) / 7]);
  X.push([50, 50]);
  const a = new IsolationForest().fit(X).score(X);
  expect(a[100]).toBeGreaterThan(Math.max(...a.slice(20, 80)));
  expect(new IsolationForest().fit(X).score(X)).toEqual(a);
  expect(c(2)).toBe(1);
  expect(c(1)).toBe(0);
});
test("Huber boosted trees learn a nonlinear signal despite one outlier", () => {
  const X = Array.from({ length: 60 }, (_, i) => [i]);
  const y = X.map(([x]) => (x < 30 ? 10 : 30));
  y[10] = 1000;
  const model = fitGBM(X, y);
  expect(model.predict([15])).toBeCloseTo(10, -0);
  expect(model.predict([45])).toBeCloseTo(30, -0);
});
test("seasonal ARIMA recovers yearly drift and seeded intervals", () => {
  const y = Array.from(
    { length: 60 },
    (_, i) => 100 + (i % 12) * 10 + Math.floor(i / 12) * 12,
  );
  const model = fitARIMA(y);
  const f = forecastARIMA(model, 12);
  expect(f.median[0]).toBeCloseTo(160, 1);
  expect(f.median[11]).toBeCloseTo(270, 1);
  expect(forecastARIMA(model, 12)).toEqual(f);
});
test("naive Bayes actually learns labels", () => {
  const nb = trainNB([
    { text: "unlimited charges penalty", risky: true },
    { text: "fixed cap audit", risky: false },
  ]);
  expect(nb.predict("unlimited penalty")).toBeCloseTo(0.8, 10);
  expect(nb.predict("fixed audit")).toBeCloseTo(0.2, 10);
});
test("CSV handles quotes, invalid dates, zero dollars, budgets and empty data", () => {
  const r = parseLedgerCSV(
    'DATE,vendor,amount,category,budget_fy,budget\n2026-07-01,"Acme, Inc",0,Office,2027,500\n2026-02-30,Bad,20,Office,,',
  );
  expect(r.ledger.txns.length).toBe(1);
  expect(r.warnings.length).toBe(1);
  expect(r.ledger.budgets[2027].office).toBe(500);
  expect(
    runAnalysis(parseLedgerCSV("date,vendor,amount,category").ledger).summary
      .txnCount,
  ).toBe(0);
});
test("sample contracts contain substantial text and safety distinctions", () => {
  expect(SAMPLE_CONTRACTS.length).toBe(4);
  for (const s of SAMPLE_CONTRACTS)
    expect(s.text.split(/\s+/).length).toBeGreaterThanOrEqual(150);
  const a = SAMPLE_CONTRACTS.map((s) => analyzeContract(s.text));
  expect(a[2].score).toBeGreaterThan(a[0].score);
  expect(a[0].terms.escalatorPct).toBe(6);
  expect(a[2].terms.competitiveBid).toBe(true);
  expect(a[0].model.trainingClauses).toBeGreaterThanOrEqual(80);
});
test("end to end respects public interface, determinism, labels boundary and speed", () => {
  const ledger = loadSampleLedger();
  const before = JSON.stringify(ledger);
  const start = performance.now();
  const a = runAnalysis(ledger);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(1500);
  expect(a.txns.length).toBe(ledger.txns.length);
  expect(a.alerts.length).toBeLessThan(40);
  expect(a.evaluation.total).toBe(10);
  expect(a.evaluation.caught).toBe(10);
  expect(
    a.forecast.categories.find((c) => c.categoryId === "electric").status,
  ).toBe("over");
  expect(
    a.forecast.categories.find((c) => c.categoryId === "fire").status,
  ).toBe("over");
  expect(JSON.stringify(ledger)).toBe(before);
  const stripped = structuredClone(ledger);
  stripped.txns.forEach((t) => delete t.planted);
  const b = runAnalysis(stripped);
  expect(b.alerts).toEqual(a.alerts);
  expect(b.evaluation).toBeNull();
  expect(b.forecast).toEqual(a.forecast);
  const ids = new Set();
  for (const alert of a.alerts) {
    expect(alert.headline).toMatch(/\d/);
    for (const id of alert.txnIds) {
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
  }
  expect(a.forecast.total.months.length).toBe(12);
  expect(a.forecast.total.projectedLo).toBeLessThanOrEqual(
    a.forecast.total.projected,
  );
  expect(a.forecast.total.projectedHi).toBeGreaterThanOrEqual(
    a.forecast.total.projected,
  );
});

test("generator invoice numbers do not collide with unrelated transactions", () => {
  const ledger = loadSampleLedger(),
    matches = ledger.txns.filter((t) => t.invoice === "BP-1187");
  expect(matches.length).toBe(2);
  expect(matches.every((t) => t.amount === 1840)).toBe(true);
});
test("clause rules distinguish a capped hourly agreement from open-ended billing", () => {
  const safe = analyzeContract(
    "The term is 12 months. Time and materials payments shall not exceed $20,000. The city may terminate for convenience without penalty.",
  );
  expect(safe.findings.some((f) => f.id === "time-materials")).toBe(false);
  expect(safe.findings.some((f) => f.id === "nte")).toBe(true);
  const risk = analyzeContract(
    "The term is 60 months. The vendor may increase fees by 5% annually without a price cap.",
  );
  expect(risk.findings.some((f) => f.id === "long-term")).toBe(true);
  expect(risk.findings.some((f) => f.id === "uncapped-price")).toBe(true);
});

test("auditor rules detect independent duplicate, split, price and onboarding examples", async () => {
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
  const txns = [
    make("one", "2024-01-01", 100, "a"),
    make("two", "2025-01-01", 3000, "b"),
    make("three", "2025-01-02", 3000, "c"),
  ];
  const vendor = {
    canonical: "Test Works",
    aliases: ["Test Works"],
    recentAvg: 3000,
    priorAvg: 100,
    changePct: 2900,
    recentCutoff: "2024-12-31",
  };
  const alerts = detectRules(txns, [vendor], { ...DEFAULT_SETTINGS });
  expect(alerts.some((a) => a.type === "duplicate")).toBe(true);
  expect(alerts.some((a) => a.type === "split")).toBe(true);
  expect(alerts.some((a) => a.type === "vendor-increase")).toBe(true);
});

test("sentence offsets preserve decimal prices and every source character", () => {
  const text =
    "Annual fees increase by 2.5% each year. Total value is $1,234.50. Audit rights apply.";
  const a = analyzeContract(text);
  expect(a.sentences.length).toBe(3);
  expect(a.sentences[0].text).toBe("Annual fees increase by 2.5% each year.");
  for (const sentence of a.sentences)
    expect(text.slice(sentence.start, sentence.end)).toBe(sentence.text);
});
test("calendar fiscal years and sparse no-budget forecasts stay finite", () => {
  const ledger = parseLedgerCSV(
    "date,vendor,amount,category\n2026-02-01,Any vendor,100,Office",
  ).ledger;
  ledger.town.fyStartMonth = 1;
  const a = runAnalysis(ledger);
  expect(a.summary.currentFy).toBe(2026);
  expect(a.forecast.fy).toBe(2026);
  expect(a.forecast.monthsObserved).toBe(2);
  expect(a.forecast.total.budget).toBeNull();
  expect(Number.isFinite(a.forecast.total.projected)).toBe(true);
});

test("uncapped escalation is risky even without an explicit no-cap sentence", () => {
  const a = analyzeContract(
    "The annual fee shall increase by 7% on each anniversary. The term is 24 months.",
  );
  expect(a.findings.some((f) => f.id === "uncapped-price")).toBe(true);
  expect(a.terms.escalatorPct).toBe(7);
});
test("negated protections do not earn protective findings", () => {
  const a = analyzeContract(
    "The city has no audit rights. There are no performance metrics.",
  );
  expect(a.findings.filter((f) => f.severity === "good").length).toBe(0);
});

test("duplicate headlines report both values when an invoice number is reused for unequal payments", async () => {
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
  const a = detectRules(
    rows,
    [{ canonical: "Example", aliases: ["Example"] }],
    DEFAULT_SETTINGS,
  ).find((a) => a.type === "duplicate");
  expect(a.headline).toContain("$100 and $120");
});

test("duplicate window includes equal monthly installments even with distinct invoice numbers", async () => {
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
  expect(alerts.some((a) => a.type === "duplicate")).toBe(true);
});

test("vendor trend detects sustained higher monthly costs when invoice sizes stay flat", async () => {
  const { detectRules } = await import("../app/js/algo/rules.js");
  const monthly = Array.from({ length: 24 }, (_, i) => ({
    month: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
    total: i < 12 ? 2000 : 3000,
  }));
  const rows = monthly.map((m, i) => ({
    id: String(i),
    date: m.month + "-10",
    vendorCanonical: "Growing Supplier",
    category: "Supplies",
    categoryId: "supplies",
    description: "Materials",
    invoice: String(i),
    amount: 1000,
  }));
  const v = {
    canonical: "Growing Supplier",
    aliases: ["Growing Supplier"],
    monthly,
    recentAvg: 1000,
    priorAvg: 1000,
    changePct: 0,
    recentCutoff: "2025-01-01",
  };
  const alert = detectRules(rows, [v], DEFAULT_SETTINGS).find(
    (a) => a.type === "vendor-increase",
  );
  expect(alert).toBeDefined();
  expect(alert.headline).toContain("50%");
});
