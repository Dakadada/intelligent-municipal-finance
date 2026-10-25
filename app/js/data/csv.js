// Read quoted CSV without dependencies. Invalid ledger rows are reported,
// never silently coerced into dates or dollar amounts.
export const CSV_TEMPLATE =
  "date,vendor,amount,category,invoice,description,department,budget_fy,budget\n2026-07-01,Example Electric,1250,Electricity,E-001,Monthly service,Utilities,2027,20000\n2026-07-05,Example Cleaning,800,Janitorial,C-001,Monthly cleaning,Facilities,2027,12000\n2026-07-10,Example Supply,125.50,Office Supplies,S-001,Paper,Administration,2027,3000";
export function parseLedgerCSV(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  text = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n" || c === "\r")) {
      row.push(field);
      field = "";
      if (c !== ",") {
        rows.push(row);
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
      }
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const warnings = [];
  if (quoted) warnings.push("Unclosed quoted field at end of CSV.");
  const header = (rows.shift() ?? []).map((s) => s.trim().toLowerCase());
  const ledger = {
    town: {
      name: "Imported city ledger",
      state: "Iowa",
      population: null,
      fyStartMonth: 7,
      asOf: "2026-09-30",
      approvalThreshold: 5000,
    },
    txns: [],
    budgets: {},
  };
  for (const key of ["date", "vendor", "amount", "category"])
    if (!header.includes(key))
      warnings.push(`Missing required column: ${key}.`);
  if (warnings.some((w) => w.startsWith("Missing")))
    return { ledger, warnings };
  rows.forEach((r, i) => {
    if (r.every((v) => !v.trim())) return;
    const v = Object.fromEntries(
      header.map((h, j) => [h, (r[j] ?? "").trim()]),
    );
    const date = new Date(`${v.date}T00:00:00Z`),
      amount = Number(v.amount.replace(/[$,]/g, ""));
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(v.date) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== v.date ||
      !v.vendor ||
      !v.category ||
      !v.amount ||
      !Number.isFinite(amount)
    ) {
      warnings.push(
        `Row ${i + 2} skipped: invalid date, vendor, category, or amount.`,
      );
      return;
    }
    const id = `T${String(ledger.txns.length + 1).padStart(5, "0")}`,
      fy = +v.date.slice(0, 4) + (+v.date.slice(5, 7) >= 7 ? 1 : 0);
    const categoryId = v.category
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    ledger.txns.push({
      id,
      date: v.date,
      fy,
      vendor: v.vendor,
      categoryId,
      category: v.category,
      dept: v.department || "Unassigned",
      amount,
      invoice: v.invoice || `CSV-${id}`,
      description: v.description || "",
      method: "Imported",
      planted: null,
    });
    if (v.budget || v.budget_fy) {
      const budget = Number(v.budget.replace(/[$,]/g, "")),
        year = Number(v.budget_fy);
      if (
        !/^\d{4}$/.test(v.budget_fy) ||
        !v.budget ||
        !Number.isFinite(budget) ||
        budget < 0
      )
        warnings.push(`Row ${i + 2}: invalid budget or budget_fy ignored.`);
      else {
        ledger.budgets[year] ??= {};
        if (
          ledger.budgets[year][categoryId] !== undefined &&
          ledger.budgets[year][categoryId] !== budget
        )
          warnings.push(
            `Row ${i + 2}: conflicting budget replaced for ${v.category}, FY${year}.`,
          );
        ledger.budgets[year][categoryId] = budget;
      }
    }
  });
  ledger.txns.sort((a, b) => a.date.localeCompare(b.date));
  if (ledger.txns.length) ledger.town.asOf = ledger.txns.at(-1).date;
  return { ledger, warnings };
}
