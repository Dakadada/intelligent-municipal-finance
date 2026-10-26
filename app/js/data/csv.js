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
// Accounting exports name the same column many ways ("Payee", "Check Date",
// "Net Amount"). Each field lists the names it answers to, best match first,
// so a MUNIS, QuickBooks, or Caselle export works without editing headers.
const COLUMN_NAMES = {
  date: ["date", "check date", "payment date", "paid date", "transaction date", "trans date",
    "posting date", "post date", "posted date", "warrant date", "invoice date"],
  vendor: ["vendor", "vendor name", "payee", "payee name", "paid to", "supplier",
    "supplier name", "vendor payee", "name"],
  amount: ["amount", "net amount", "payment amount", "check amount", "amount paid",
    "paid amount", "invoice amount", "transaction amount", "total", "debit"],
  category: ["category", "expense category", "account", "account name", "account description",
    "gl account", "gl account name", "gl description", "object", "object description", "line item"],
  invoice: ["invoice", "invoice number", "invoice no", "invoice num", "invoice id", "inv"],
  description: ["description", "memo", "line description", "purpose", "notes"],
  department: ["department", "dept", "department name", "division", "function", "program"],
  budget_fy: ["budget fy", "fiscal year", "fy"],
  budget: ["budget", "budget amount", "annual budget"],
};
const REQUIRED_COLUMNS = ["date", "vendor", "amount", "category"];
const headerKey = (name) => name.toLowerCase().replace(/#/g, " number ").replace(/[^a-z0-9]+/g, " ").trim();
// Returns { field: column index } for every field the header can supply.
function matchColumns(header) {
  const keys = header.map(headerKey);
  const used = new Set();
  const columns = {};
  for (const [field, names] of Object.entries(COLUMN_NAMES)) {
    for (const name of names) {
      const index = keys.findIndex((key, j) => key === name && !used.has(j));
      if (index !== -1) {
        columns[field] = index;
        used.add(index);
        break;
      }
    }
  }
  return columns;
}
// Dates arrive as 2026-07-01, 2026/07/01, 7/1/2026, or 7/1/26, sometimes with
// a time attached. Anything else is left as is and fails validation below.
function isoDate(value) {
  const text = value.split(/[ T]/)[0];
  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }
  match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }
  return value;
}
// "$1,250.00" and "(1,250.00)", the accounting way to write a negative.
function parseMoney(value) {
  const negative = /^\(.*\)$/.test(value);
  const number = Number(value.replace(/[$,\s()]/g, ""));
  return negative ? -number : number;
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
    const budget = parseMoney(record.budget);
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
  record.date = isoDate(record.date);
  const date = new Date(`${record.date}T00:00:00Z`);
  const amount = parseMoney(record.amount);
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
  const header = (rows.shift() ?? []).map((columnName) => columnName.trim());
  const ledger = emptyImportedLedger();
  const matched = matchColumns(header);
  // A fiscal-year column only means something next to a budget column.
  if (matched.budget === undefined) {
    delete matched.budget_fy;
  }
  // { field: the file's own column name }, so the app can show what it used.
  const columns = Object.fromEntries(
    Object.entries(matched).map(([field, index]) => [field, header[index]]),
  );
  for (const key of REQUIRED_COLUMNS) {
    if (matched[key] === undefined) {
      warnings.push(`Missing required column: ${key}.`);
    }
  }
  if (warnings.some((warning) => warning.startsWith("Missing"))) {
    return { ledger, warnings, columns };
  }
  rows.forEach((cells, i) => {
    if (cells.every((cell) => !cell.trim())) {
      return;
    }
    const record = Object.fromEntries(
      Object.keys(COLUMN_NAMES).map((field) => [
        field,
        matched[field] === undefined ? "" : (cells[matched[field]] ?? "").trim(),
      ]),
    );
    importPayment(record, i, ledger, warnings);
  });
  ledger.txns.sort((firstTransaction, secondTransaction) =>
    firstTransaction.date.localeCompare(secondTransaction.date),
  );
  if (ledger.txns.length) {
    ledger.town.asOf = ledger.txns.at(-1).date;
  }
  return { ledger, warnings, columns };
}
