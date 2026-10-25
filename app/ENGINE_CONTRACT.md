# Engine contract (backend ↔ frontend)

The app is a static site: plain ES modules, no build step, no npm dependencies
at runtime. Everything runs in the browser. The frontend imports exactly one
module: `app/js/engine.js`. Everything in this file is the agreed interface;
the UI is written against it in parallel, so shapes and names must match
exactly.

## Files the backend owns

```
app/js/engine.js                 public API (below)
app/js/algo/rng.js               EXISTS - seeded RNG (makeRng)
app/js/algo/stats.js             EXISTS - median, mad, quantile, ols, ...
app/js/algo/vendorMatch.js       normalize + Jaro-Winkler clustering of vendor names
app/js/algo/isolationForest.js   real Isolation Forest (Liu et al. 2008)
app/js/algo/gbm.js               gradient-boosted regression trees, Huber loss
app/js/algo/arima.js             seasonal ARIMA: (2,0,0)(0,1,0)[12] with drift, OLS fit,
                                 prediction intervals via seeded Monte Carlo paths
app/js/algo/rules.js             auditor rules: duplicates, split purchases, vendor price
                                 increase, above-similar, new vendor large payment
app/js/algo/contractNLP.js       clause analysis: sentence split + regex clause library +
                                 multinomial naive Bayes trained on a labeled clause corpus
app/js/data/generator.js         EXISTS - fictional ledger with 10 planted cases (read it)
app/js/data/contracts.js         4 sample contracts + labeled training clauses
app/js/data/csv.js               CSV import
tests/*.test.js                  bun tests (`bun test`)
```

No algorithm may be faked or hard-coded to the planted cases. Detectors must
never read `txn.planted`; only `evaluate` may.

## Public API: `app/js/engine.js`

```js
export const DEFAULT_SETTINGS = {
  similarPct: 25,          // flag if amount > X% above similar transactions
  dupWindowDays: 90,       // duplicate = same canonical vendor + same amount within N days (or same invoice #)
  vendorIncreasePct: 10,   // flag vendor whose avg invoice rose > X% vs prior 12 months
  approvalThreshold: 5000, // split-purchase rule: 2+ invoices same vendor within 3 days, each under, sum over
  newVendorMin: 10000,     // first-ever payment to a vendor above this
  ifThreshold: 0.62,       // isolation forest anomaly score cutoff (0..1)
  bandK: 3,                // spending-pattern band = expected ± bandK * robust residual sd
  vendorSimilarity: 0.93,  // Jaro-Winkler cutoff for merging vendor names
};

export function loadSampleLedger(): Ledger
export function runAnalysis(ledger: Ledger, settings = DEFAULT_SETTINGS): Analysis
export function analyzeContract(text: string): ContractAnalysis
export const SAMPLE_CONTRACTS: { id, title, vendor, category, annualValue, text }[]
export function parseLedgerCSV(text: string): { ledger: Ledger, warnings: string[] }
export const CSV_TEMPLATE: string   // header + 3 example rows
```

`runAnalysis` must finish in < 1.5 s for the sample ledger (~3–4k rows) in a
browser. Deterministic: same input + settings ⇒ same output (seeded RNG).

### Ledger (what `loadSampleLedger` / `parseLedgerCSV` return)

```js
{
  town: { name, state, population, fyStartMonth: 7, asOf: "YYYY-MM-DD", approvalThreshold },
  txns: [{ id, date: "YYYY-MM-DD", fy, vendor, categoryId, category, dept, amount,
           invoice, description, method, planted /* null for CSV */ }],
  budgets: { [fy]: { [categoryId]: number } },   // may be {} for CSV uploads
}
```

CSV columns (case-insensitive, extra columns ignored): `date, vendor, amount,
category` required; `invoice, description, department, budget_fy, budget`
optional. Missing invoice ⇒ generated. categoryId = slug of category. Bad rows
skipped with a warning string.

### Analysis

```js
{
  town, asOf,
  settings,                       // the settings used
  summary: {
    txnCount, totalSpend,
    firstDate, lastDate,
    currentFy,                    // fiscal year containing asOf
    fyTotals: [{ fy, total }],
    alertCount, criticalCount, highCount, mediumCount,
    flaggedDollars,               // sum of amounts of txns in any alert (dedup by txn)
    vendorCount, rawVendorNames,  // canonical count vs raw spelling count
  },

  categories: [{ id, name, dept, total, txnCount }],   // sorted by total desc

  txns: [ ...ledger.txns each plus {
      vendorCanonical,
      ifScore,                     // 0..1 isolation forest score
      ifTop: [{ feature, label, value, display, percentile }],  // top 3 most unusual features
      alertIds: [],
  }],

  alerts: [{                       // sorted: severity, then score desc
    id: "A001",
    type: "duplicate" | "split" | "above-similar" | "vendor-increase" | "new-vendor"
        | "seasonal" | "isolation",
    severity: "critical" | "high" | "medium",
    score,                         // 0..1, for ordering
    title,                         // short: "Possible duplicate payment"
    headline,                      // one sentence with numbers, e.g.
                                   // "This $8,500 payment exceeds ABC Services' 18-month average of $3,200 by 166%."
    reasons: [string],             // 1-4 plain-English supporting facts with numbers
    detectors: ["rules" | "isolation-forest" | "gbm-baseline" | "vendor-trend" | "fuzzy-match"],
    txnIds: [],                    // may be empty for vendor-level alerts
    vendor, category, categoryId,
    amount,                        // $ at issue (txn amount, duplicate amount, or est. annual overpay)
    date,                          // most relevant date
  }],
  // Merge rule: one txn hit by several detectors ⇒ ONE alert with all detectors
  // listed and all reasons combined (highest severity wins).

  vendors: [{
    canonical, aliases: [], similarity,      // min JW similarity within group
    txnCount, total, firstSeen, lastSeen,
    avgInvoice, recentAvg, priorAvg, changePct,   // trailing 12 mo vs prior 12 mo avg invoice (null if insufficient)
    categoryIds: [], alertIds: [],
    monthly: [{ month: "YYYY-MM", total }],  // full span, zero-filled
  }],                                        // sorted by total desc

  patterns: {                                // GBM expected-spend model per category
    [categoryId]: {
      model: { trees, learningRate, maxDepth, loss: "huber", features: ["monthOfYear","t"] },
      residualSd,
      months: [{ month: "YYYY-MM", actual, expected, lower, upper, flagged, alertId }],
    }
  },

  forecast: {                                // seasonal ARIMA, current FY
    fy, model: "SARIMA(2,0,0)(0,1,0)[12] + drift",
    monthsObserved, monthsForecast,
    total: {
      budget,                                // null if no budgets
      spentToDate, projected, projectedLo, projectedHi,   // 80% interval
      overrunMonth,                          // "YYYY-MM" when cumulative median path crosses budget, else null
      months: [{ month, actual /*null if future*/, forecast /*null if past*/, lo, hi,
                 cumActual, cumForecast, cumLo, cumHi }],  // 12 fiscal months
    },
    categories: [{ categoryId, name, budget, spentToDate, projected, projectedLo, projectedHi,
                   pctOfBudget, status: "ok" | "watch" | "over", overrunMonth, headline }],
                   // status: over if projected > budget, watch if projectedHi > budget
                   // headline e.g. "Projected to exceed budget by $14,200 (16%) by March 2027."
  },

  evaluation: {                              // null for CSV ledgers without planted cases
    total, caught,
    cases: [{ id, label, pattern, caught, alertIds }],
    alertsOnPlanted, alertsTotal,            // how many alerts touch planted cases vs all
  },
}
```

### ContractAnalysis

```js
{
  score,                 // 0..100 suitability, higher = safer for the city
  grade: "A"|"B"|"C"|"D"|"F",
  verdict,               // one sentence
  terms: { termMonths, autoRenew, escalatorPct, capPct, noticeDays, totalValue, competitiveBid },
                         // null when not found
  findings: [{ id, label, severity: "high"|"medium"|"low"|"good", explanation, sentenceIndex }],
  sentences: [{ text, start, end, risk /*0..1 naive Bayes P(risky)*/, tags: [findingId] }],
  model: { type: "multinomial naive Bayes + clause rules", trainingClauses, vocabSize },
}
```

Clause library must cover at least: auto-renewal without rebid, price
escalation without cap, "then-current rates", vague deliverables ("as needed",
"including but not limited to" scope), time-and-materials without
not-to-exceed, early termination penalty, unilateral vendor change rights,
long term (> 36 mo); and mitigations: competitive bid, price cap/CPI cap,
not-to-exceed, performance metrics/SLA, termination for convenience, audit
rights.
