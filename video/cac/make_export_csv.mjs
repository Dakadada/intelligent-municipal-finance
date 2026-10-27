// The test town's books as a MUNIS-style export (Check Date, Payee Name, Net Amount...),
// used for the spreadsheet shot and the real upload in the demo.

import { loadSampleLedger } from "../../app/js/engine.js";
const L = loadSampleLedger();
const q = (v) => /[",]/.test(v) ? `"${String(v).replace(/"/g,'""')}"` : v;
const rows = ["Check Date,Payee Name,Net Amount,Account Description,Invoice #,Dept,Memo"];
for (const t of L.txns) { const [y,m,d] = t.date.split("-"); rows.push([`${+m}/${+d}/${y}`, t.vendor, `$${t.amount.toLocaleString("en-US",{minimumFractionDigits:2})}`, t.category, t.invoice, t.dept, t.description].map(q).join(",")); }

process.stdout.write(rows.join("\n"));
