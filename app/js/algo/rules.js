// Audit rules check concrete invoice evidence rather than model guesses.
// Cadence checks remove regular bills; purchase controls and historical peer
// comparisons leave a small list that a clerk can investigate with invoices.
import { mean, median, mad } from "./stats.js";
export function dollars(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}
export function monthName(value) {
  return new Date(value.slice(0, 7) + "-01T00:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
function paymentDate(value) {
  return new Date(value + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
function days(firstDate, secondDate) {
  return Math.abs(Date.parse(firstDate) - Date.parse(secondDate)) / 86400000;
}
function createAlert(type, rows, headline, reasons, extra = {}) {
  const lastPayment = rows.at(-1);
  const titles = {
    duplicate: "Possible duplicate payment",
    split: "Possible split purchase",
    "above-similar": "Payment above comparable invoices",
    "vendor-increase": "Vendor price increase",
    "new-vendor": "Large first payment",
  };
  return {
    type,
    severity: "high",
    score: 0.8,
    title: titles[type],
    headline,
    reasons,
    detectors: ["rules"],
    txnIds: rows.map((payment) => payment.id),
    vendor: lastPayment.vendorCanonical,
    category: lastPayment.category,
    categoryId: lastPayment.categoryId,
    amount: lastPayment.amount,
    date: lastPayment.date,
    ...extra,
  };
}
function isRoutineEqualAmount(firstPayment, secondPayment, rows) {
  const gap = days(firstPayment.date, secondPayment.date);
  if (gap >= 28 && gap <= 32) {
    return true;
  }
  const identicalPayments = rows.filter((payment) => payment.amount === firstPayment.amount);
  // Three distinct billing months establish a recurring identical price.
  const billingMonths = new Set(identicalPayments.map((payment) => payment.date.slice(0, 7)));
  return billingMonths.size >= 3;
}
function detectDuplicates({ rows, vendor, settings, add }) {
  let mostSuspiciousPair = null;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const firstPayment = rows[i];
      const secondPayment = rows[j];
      const sameInvoice = Boolean(
        firstPayment.invoice && firstPayment.invoice === secondPayment.invoice,
      );
      const gap = days(firstPayment.date, secondPayment.date);
      const suspiciousAmount =
        firstPayment.amount === secondPayment.amount &&
        gap <= settings.dupWindowDays &&
        !isRoutineEqualAmount(firstPayment, secondPayment, rows);
      if (!sameInvoice && !suspiciousAmount) {
        continue;
      }
      const score = sameInvoice ? 0.99 : 0.7;
      if (!mostSuspiciousPair || score > mostSuspiciousPair.score) {
        mostSuspiciousPair = { firstPayment, secondPayment, sameInvoice, score, gap };
      }
    }
  }
  if (!mostSuspiciousPair) {
    return;
  }
  const { firstPayment, secondPayment, sameInvoice, score, gap } = mostSuspiciousPair;
  let paymentAmounts = dollars(firstPayment.amount);
  if (firstPayment.amount !== secondPayment.amount) {
    paymentAmounts += " and " + dollars(secondPayment.amount);
  }
  let headline = `${vendor.canonical} received two payments of ${paymentAmounts}`;
  headline += ` on ${paymentDate(firstPayment.date)} and ${paymentDate(secondPayment.date)}`;
  if (sameInvoice) {
    headline += ` for invoice ${firstPayment.invoice}`;
  }
  headline += ".";
  let detectors = ["rules"];
  if (vendor.aliases.length > 1) {
    detectors.push("fuzzy-match");
  }
  add(
    "duplicate",
    [firstPayment, secondPayment],
    headline,
    [
      `The payments are ${gap} days apart.`,
      `Review ${dollars(Math.min(firstPayment.amount, secondPayment.amount))}` +
        " for possible recovery.",
    ],
    {
      severity: sameInvoice ? "critical" : "medium",
      score,
      amount: Math.min(firstPayment.amount, secondPayment.amount),
      detectors,
    },
  );
}
function detectSplits({ rows, vendor, settings, add }) {
  const threshold = settings.approvalThreshold;
  let mostSuspiciousGroup = null;
  for (const payment of rows) {
    const priorSmallInvoices = rows.filter(
      (prior) => prior.date < payment.date && prior.amount > 0 && prior.amount < threshold,
    );
    if (priorSmallInvoices.length < 5) {
      continue;
    }
    const typicalSmallInvoice = median(priorSmallInvoices.map((prior) => prior.amount));
    // Compare possible approval avoidance with ordinary unapproved purchases.
    // Frequent bills already near the limit do not establish an unusual split.
    if (typicalSmallInvoice > threshold * 0.6) {
      continue;
    }
    const group = rows.filter(
      (piece) =>
        piece.date >= payment.date &&
        days(payment.date, piece.date) <= 3 &&
        piece.description === payment.description &&
        piece.amount >= threshold * 0.9 &&
        piece.amount < threshold,
    );
    const total = group.reduce((subtotal, piece) => subtotal + piece.amount, 0);
    if (group.length < 2 || total <= threshold) {
      continue;
    }
    if (!mostSuspiciousGroup || total > mostSuspiciousGroup.total) {
      mostSuspiciousGroup = { group, total, typicalSmallInvoice };
    }
  }
  if (!mostSuspiciousGroup) {
    return;
  }
  const { group, total, typicalSmallInvoice } = mostSuspiciousGroup;
  const pieces = group.map((payment) => dollars(payment.amount)).join(" + ");
  const headline =
    `${vendor.canonical} was paid ${pieces} within 3 days` +
    (" (total " +
      `${dollars(total)}` +
      "), each just under the " +
      `${dollars(threshold)}` +
      " approval limit.");
  add(
    "split",
    group,
    headline,
    [
      `The vendor's typical below-threshold invoice is ${dollars(typicalSmallInvoice)}.`,
      "" +
        `${group.length}` +
        " invoices describe the same work; check whether they are one " +
        "purchase.",
    ],
    { amount: total, severity: "critical", score: 0.98 },
  );
}
function detectNewVendor({ rows, vendor, settings, add, ledgerFirstDate }) {
  const firstPayment = rows[0];
  if (!firstPayment || firstPayment.amount < settings.newVendorMin) {
    return;
  }
  const historyDays = days(ledgerFirstDate, firstPayment.date);
  if (historyDays < 183) {
    return;
  }
  const headline =
    `${vendor.canonical}'s first recorded payment was ` +
    `${dollars(firstPayment.amount)} on ${paymentDate(firstPayment.date)}.`;
  add(
    "new-vendor",
    [firstPayment],
    headline,
    [
      `${historyDays} days of earlier ledger history contain no payments to this vendor.`,
      "Verify procurement and onboarding for this first payment.",
    ],
    { score: 0.91 },
  );
}
function detectAboveSimilar({ rows, vendor, settings, add }) {
  const monthMedians = Array.from({ length: 12 }, (_, monthEntry) =>
    median(
      rows
        .filter((transaction) => +transaction.date.slice(5, 7) === monthEntry + 1)
        .map((transaction) => transaction.amount),
    ),
  ).filter((amount) => amount > 0);
  const seasonal =
    monthMedians.length >= 9 && Math.max(...monthMedians) > 2 * Math.min(...monthMedians);
  for (const transaction of rows) {
    const prior = rows.filter(
      (priorPayment) =>
        priorPayment.date < transaction.date &&
        priorPayment.categoryId === transaction.categoryId &&
        days(priorPayment.date, transaction.date) <= 3 * 366,
    );
    if (prior.length < 3 || days(transaction.date, rows[0].date) < 365) {
      continue;
    }
    const matching = prior.filter(
      (priorPayment) => priorPayment.description === transaction.description,
    );
    if (matching.length < 3) {
      continue;
    }
    let peers = matching;
    if (seasonal) {
      peers = peers.filter(
        (priorPayment) => priorPayment.date.slice(5, 7) === transaction.date.slice(5, 7),
      );
    }
    if (peers.length < 3) {
      continue;
    }
    // Annual project payments must be compared with other annual projects,
    // not with the vendor's small recurring maintenance invoices.
    const large = peers.filter(
      (priorPayment) =>
        priorPayment.amount > median(prior.map((priorPayment) => priorPayment.amount)) * 3,
    );
    if (
      large.length >= 3 &&
      transaction.amount > median(prior.map((priorPayment) => priorPayment.amount)) * 3
    ) {
      peers = large;
    }
    const average = mean(peers.map((priorPayment) => priorPayment.amount));
    const residualDeviation = mad(peers.map((priorPayment) => priorPayment.amount));
    const increasePercent = average > 0 ? (transaction.amount / average - 1) * 100 : 0;
    if (
      increasePercent > settings.similarPct &&
      transaction.amount > average + Math.max(3.5 * residualDeviation, average * 0.15) &&
      transaction.amount - average >= 750
    ) {
      add(
        "above-similar",
        [transaction],
        "This " +
          `${dollars(transaction.amount)}` +
          " payment to " +
          `${vendor.canonical}` +
          " is " +
          `${Math.round(increasePercent)}` +
          "% above " +
          `${peers.length}` +
          " comparable prior invoices averaging " +
          `${dollars(average)}` +
          ".",
        [
          `Comparable invoices are from the preceding 36 months in ${transaction.category}.`,
          "The difference from the comparison average is " +
            `${dollars(transaction.amount - average)}` +
            ".",
        ],
        { score: Math.min(0.97, 0.73 + increasePercent / 1000) },
      );
    }
  }
}
function detectVendorIncrease({ rows, vendor, settings, add }) {
  if (
    vendor.changePct > settings.vendorIncreasePct &&
    vendor.recentAvg > vendor.priorAvg + 75
  ) {
    const recent = rows.filter((transaction) => transaction.date >= vendor.recentCutoff);
    add(
      "vendor-increase",
      recent,
      "" +
        `${vendor.canonical}` +
        "'s average invoice rose " +
        `${Math.round(vendor.changePct)}` +
        "%, from " +
        `${dollars(vendor.priorAvg)}` +
        " to " +
        `${dollars(vendor.recentAvg)}` +
        " in the latest 12 months.",
      [
        `Comparison uses the preceding 12 months as the baseline.`,
        "At the recent invoice count, the annual increase is approximately " +
          `${dollars((vendor.recentAvg - vendor.priorAvg) * recent.length)}` +
          ".",
      ],
      {
        txnIds: [],
        detectors: ["vendor-trend"],
        score: Math.min(0.95, 0.75 + vendor.changePct / 500),
        amount: (vendor.recentAvg - vendor.priorAvg) * recent.length,
      },
    );
  } else {
    if (vendor.monthly?.length >= 24) {
      // Stable invoice sizes can hide higher costs when bills are divided into
      // more installments. Compare matched calendar months, not raw seasons.
      const recentMonths = vendor.monthly.slice(-12);
      const priorMonths = vendor.monthly.slice(-24, -12);
      const recentTotal = recentMonths.reduce(
        (subtotal, monthEntry) => subtotal + monthEntry.total,
        0,
      );
      const priorTotal = priorMonths.reduce(
        (subtotal, monthEntry) => subtotal + monthEntry.total,
        0,
      );
      const increase = priorTotal > 0 ? (recentTotal / priorTotal - 1) * 100 : 0;
      const higherMonths = recentMonths.filter(
        (monthEntry, i) =>
          priorMonths[i].total > 0 &&
          monthEntry.total > priorMonths[i].total * (1 + settings.vendorIncreasePct / 100),
      ).length;
      if (
        increase > settings.vendorIncreasePct &&
        higherMonths >= 7 &&
        recentTotal - priorTotal >= 750
      ) {
        const recent = rows.filter((transaction) => transaction.date >= vendor.recentCutoff);
        add(
          "vendor-increase",
          recent,
          "" +
            `${vendor.canonical}` +
            "'s monthly spending rose " +
            `${Math.round(increase)}` +
            "%, from " +
            `${dollars(priorTotal / 12)}` +
            " to " +
            `${dollars(recentTotal / 12)}` +
            " on average in the latest 12 months.",
          [
            "" +
              `${higherMonths}` +
              " of 12 months exceed the matching month a year earlier by more " +
              "than " +
              `${settings.vendorIncreasePct}` +
              "%.",
            "Annual spending increased by " +
              `${dollars(recentTotal - priorTotal)}` +
              "; verify quantities and unit prices before attributing the " +
              "increase to a rate change.",
          ],
          {
            txnIds: [],
            detectors: ["vendor-trend"],
            score: Math.min(0.95, 0.75 + increase / 500),
            amount: recentTotal - priorTotal,
          },
        );
      }
    }
  }
}
export function detectRules(transactions, vendors, settings) {
  const alerts = [];
  function add(type, rows, headline, reasons, extra) {
    alerts.push(createAlert(type, rows, headline, reasons, extra));
  }
  const ledgerFirstDate = transactions[0]?.date;
  for (const vendor of vendors) {
    const rows = transactions.filter(
      (payment) => payment.vendorCanonical === vendor.canonical,
    );
    const context = { rows, vendor, settings, add, ledgerFirstDate };
    detectDuplicates(context);
    detectSplits(context);
    detectNewVendor(context);
    detectAboveSimilar(context);
    detectVendorIncrease(context);
  }
  return alerts;
}
