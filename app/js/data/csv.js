// Import a city ledger locally without a spreadsheet library. A small state
// machine keeps commas inside quoted cells, then validates each payment and
// reports skipped rows. Explicit validation prevents silent accounting changes.
export const CSV_TEMPLATE = [
  "date,vendor,amount,category,invoice,description,department,budget_fy,budget",
  "2026-07-01,Example Electric,1250,Electricity,E-001,Monthly service," +
    "Utilities,2027,20000",
  "2026-07-05,Example Cleaning,800,Janitorial,C-001,Monthly cleaning," +
    "Facilities,2027,12000",
  "2026-07-10,Example Supply,125.50,Office Supplies,S-001,Paper," + "Administration,2027,3000",
].join("\n");
function readCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  text = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else {
      if (!quoted && (character === "," || character === "\n" || character === "\r")) {
        row.push(field);
        field = "";
        if (character !== ",") {
          rows.push(row);
          row = [];
          if (character === "\r" && text[i + 1] === "\n") {
            i++;
          }
        }
      } else {
        field += character;
      }
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return { rows, quoted };
}
function emptyImportedLedger() {
  return {
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
}
function importBudget(record, i, ledger, categoryId, warnings) {
  if (record.budget || record.budget_fy) {
    const budget = Number(record.budget.replace(/[$,]/g, ""));
    const year = Number(record.budget_fy);
    if (
      !/^\d{4}$/.test(record.budget_fy) ||
      !record.budget ||
      !Number.isFinite(budget) ||
      budget < 0
    ) {
      warnings.push(`Row ${i + 2}: invalid budget or budget_fy ignored.`);
    } else {
      ledger.budgets[year] ??= {};
      if (
        ledger.budgets[year][categoryId] !== undefined &&
        ledger.budgets[year][categoryId] !== budget
      ) {
        warnings.push(
          `Row ${i + 2}: conflicting budget replaced for ${record.category}, FY${year}.`,
        );
      }
      ledger.budgets[year][categoryId] = budget;
    }
  }
}
function importPayment(record, i, ledger, warnings) {
  const date = new Date(`${record.date}T00:00:00Z`);
  const amount = Number(record.amount.replace(/[$,]/g, ""));
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(record.date) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== record.date ||
    !record.vendor ||
    !record.category ||
    !record.amount ||
    !Number.isFinite(amount)
  ) {
    warnings.push(`Row ${i + 2} skipped: invalid date, vendor, category, or amount.`);
    return;
  }
  const id = `T${String(ledger.txns.length + 1).padStart(5, "0")}`;
  const fiscalYearValue = +record.date.slice(0, 4) + (+record.date.slice(5, 7) >= 7 ? 1 : 0);
  const categoryId = record.category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  ledger.txns.push({
    id,
    date: record.date,
    fy: fiscalYearValue,
    vendor: record.vendor,
    categoryId,
    category: record.category,
    dept: record.department || "Unassigned",
    amount,
    invoice: record.invoice || `CSV-${id}`,
    description: record.description || "",
    method: "Imported",
    planted: null,
  });
  importBudget(record, i, ledger, categoryId, warnings);
}
export function parseLedgerCSV(text) {
  const { rows, quoted } = readCsvRows(text);
  const warnings = [];
  if (quoted) {
    warnings.push("Unclosed quoted field at end of CSV.");
  }
  const header = (rows.shift() ?? []).map((columnName) => columnName.trim().toLowerCase());
  const ledger = emptyImportedLedger();
  for (const key of ["date", "vendor", "amount", "category"]) {
    if (!header.includes(key)) {
      warnings.push(`Missing required column: ${key}.`);
    }
  }
  if (warnings.some((warning) => warning.startsWith("Missing"))) {
    return { ledger, warnings };
  }
  rows.forEach((cells, i) => {
    if (cells.every((cell) => !cell.trim())) {
      return;
    }
    const record = Object.fromEntries(
      header.map((columnName, j) => [columnName, (cells[j] ?? "").trim()]),
    );
    importPayment(record, i, ledger, warnings);
  });
  ledger.txns.sort((firstTransaction, secondTransaction) =>
    firstTransaction.date.localeCompare(secondTransaction.date),
  );
  if (ledger.txns.length) {
    ledger.town.asOf = ledger.txns.at(-1).date;
  }
  return { ledger, warnings };
}
