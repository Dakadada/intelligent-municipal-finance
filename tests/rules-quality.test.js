// Exercise approval controls with small, independent payment histories.
// Each example isolates a legitimate billing pattern or a suspicious exception,
// so successful detection does not depend on the demonstration's planted labels.
import { test, expect } from "bun:test";
import { detectRules } from "../app/js/algo/rules.js";
import { DEFAULT_SETTINGS } from "../app/js/engine.js";
function payment(id, date, amount, overrides = {}) {
  return {
    id,
    date,
    amount,
    invoice: id,
    description: "Road repair",
    vendorCanonical: "Example Supplier",
    category: "Repairs",
    categoryId: "repairs",
    ...overrides,
  };
}
function auditRules(transactions) {
  const sorted = [...transactions].sort((first, second) =>
    first.date.localeCompare(second.date),
  );
  const names = [...new Set(sorted.map((transaction) => transaction.vendorCanonical))];
  const vendors = names.map((canonical) => ({ canonical, aliases: [canonical] }));
  return detectRules(sorted, vendors, DEFAULT_SETTINGS);
}
function smallInvoiceHistory() {
  return Array.from({ length: 6 }, (unusedValue, i) =>
    payment(`prior-${i}`, `2025-0${i + 1}-01`, 800),
  );
}
test("a repeated invoice number overrides an otherwise regular monthly cadence", () => {
  const alerts = auditRules([
    payment("first", "2025-01-01", 800, { invoice: "REPEAT" }),
    payment("second", "2025-02-01", 800, { invoice: "REPEAT" }),
    payment("third", "2025-03-01", 800),
  ]);
  expect(alerts.find((alert) => alert.type === "duplicate").txnIds).toEqual([
    "first",
    "second",
  ]);
});
test("an irregular equal-amount pair remains suspicious", () => {
  const alerts = auditRules([
    payment("first", "2025-01-01", 1300),
    payment("second", "2025-01-03", 1300),
  ]);
  expect(alerts.some((alert) => alert.type === "duplicate")).toBe(true);
});
test("routine identical prices across months are not duplicate payments", () => {
  const alerts = auditRules([
    payment("first", "2025-01-01", 800),
    payment("second", "2025-02-15", 800),
    payment("third", "2025-03-20", 800),
  ]);
  expect(alerts.some((alert) => alert.type === "duplicate")).toBe(false);
});
test("near-limit invoices are routine for a supplier that normally bills that amount", () => {
  const history = smallInvoiceHistory().map((transaction) => ({
    ...transaction,
    amount: 4700,
  }));
  const alerts = auditRules([
    ...history,
    payment("piece-one", "2025-07-10", 4950),
    payment("piece-two", "2025-07-11", 4875),
    payment("piece-three", "2025-07-12", 4990),
  ]);
  expect(alerts.some((alert) => alert.type === "split")).toBe(false);
});
test("one vendor gets one split alert with each amount and no above-limit invoices", () => {
  const alerts = auditRules([
    ...smallInvoiceHistory(),
    payment("piece-one", "2025-07-10", 4950),
    payment("piece-two", "2025-07-11", 4875),
    payment("piece-three", "2025-07-12", 4990),
    payment("approved", "2025-07-12", 5100),
    payment("later-one", "2025-08-10", 4600),
    payment("later-two", "2025-08-11", 4700),
  ]);
  const splits = alerts.filter((alert) => alert.type === "split");
  expect(splits.length).toBe(1);
  expect(splits[0].headline).toContain("$4,950 + $4,875 + $4,990");
  expect(splits[0].txnIds).not.toContain("approved");
});
test("large first payments need at least six months of earlier ledger history", () => {
  const alerts = auditRules([
    payment("opening", "2025-01-01", 20000),
    payment("new", "2025-07-20", 24000, { vendorCanonical: "Later Supplier" }),
  ]);
  const newVendors = alerts.filter((alert) => alert.type === "new-vendor");
  expect(newVendors.length).toBe(1);
  expect(newVendors[0].vendor).toBe("Later Supplier");
});
