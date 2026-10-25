// Builds a realistic (but fictional) general ledger for a small Iowa city.
//
// "City of Willow Creek, Iowa" does not exist. The ledger covers five full
// fiscal years plus the first quarter of FY2027 (Iowa cities run July 1 to
// June 30). Ten real-world waste patterns are planted on purpose so we can
// measure whether the detectors actually catch them. Each planted
// transaction carries a `planted` case id; the models never look at it.

import { makeRng } from "../algo/rng.js";

export const TOWN = {
  name: "City of Willow Creek",
  state: "Iowa",
  population: 4812,
  fyStartMonth: 7, // July
  asOf: "2026-09-30",
  approvalThreshold: 5000, // purchases above this need council approval
};

// Calendar-month multipliers (index 1..12). Anything not listed is 1.
const s = (obj) => (m) => obj[m] ?? obj.other ?? 1;

const CATEGORIES = [
  {
    id: "snow", name: "Snow & Ice Removal", dept: "Public Works", base: 6200,
    season: s({ 12: 2.6, 1: 3.0, 2: 2.4, 3: 0.9, 11: 0.7, 4: 0.08, 10: 0.05, other: 0.03 }),
    vendors: [
      { name: "Hawkeye Snow & Ice LLC", share: 0.65, typical: 4200 },
      { name: "Heartland Salt Supply", share: 0.35, typical: 3600 },
    ],
  },
  {
    id: "electric", name: "Electricity", dept: "Utilities", base: 7400,
    season: s({ 6: 1.3, 7: 1.5, 8: 1.45, 9: 1.1, 12: 1.0, 1: 1.05, 2: 0.95, other: 0.85 }),
    vendors: [{ name: "Prairie Power Cooperative", share: 1, typical: 99999 }],
  },
  {
    id: "gas", name: "Natural Gas & Heating", dept: "Utilities", base: 2600,
    season: s({ 12: 2.0, 1: 2.3, 2: 1.9, 3: 1.2, 11: 1.3, 10: 0.6, 4: 0.6, other: 0.25 }),
    vendors: [{ name: "Central Iowa Gas Co.", share: 1, typical: 99999 }],
  },
  {
    id: "roads", name: "Street & Road Maintenance", dept: "Public Works", base: 10800,
    season: s({ 5: 1.6, 6: 1.9, 7: 2.0, 8: 1.8, 9: 1.4, 10: 0.9, 4: 0.9, 12: 0.15, 1: 0.15, 2: 0.15, other: 0.4 }),
    vendors: [
      { name: "Corn Belt Paving Inc", share: 0.6, typical: 7800 },
      { name: "Midwest Asphalt Partners", share: 0.4, typical: 6400 },
    ],
  },
  {
    id: "parks", name: "Parks & Grounds", dept: "Parks & Recreation", base: 3900,
    season: s({ 4: 1.3, 5: 1.6, 6: 1.6, 7: 1.6, 8: 1.5, 9: 1.3, 10: 0.9, other: 0.1 }),
    vendors: [{ name: "Green Acres Lawn & Landscape", share: 1, typical: 1900 }],
  },
  {
    id: "fuel", name: "Police Fleet Fuel", dept: "Police", base: 3900,
    season: s({ other: 1 }),
    vendors: [{ name: "Kwik Fleet Fuel Services", share: 1, typical: 950 }],
  },
  {
    id: "fire", name: "Fire Vehicle Maintenance", dept: "Fire", base: 2300,
    season: s({ other: 1 }),
    vendors: [{ name: "Iowa Fire Apparatus Service", share: 1, typical: 1150 }],
  },
  {
    id: "janitorial", name: "Janitorial Services", dept: "Facilities", base: 0,
    season: s({ other: 1 }),
    vendors: [{ name: "Midwest Janitorial Solutions", share: 1, typical: 99999 }],
  },
  {
    id: "buildings", name: "Building Repairs", dept: "Facilities", base: 2900,
    season: s({ 1: 1.2, 7: 1.15, other: 1 }),
    vendors: [
      // The same plumber shows up under several spellings, exactly like a
      // real ledger keyed in by different clerks.
      { name: "Bob's Plumbing", share: 0.2, typical: 640 },
      { name: "Bobs Plumbing", share: 0.12, typical: 640 },
      { name: "Bob's Plumbing Service", share: 0.1, typical: 640 },
      { name: "ABC Services", share: 0.58, typical: 3200 },
    ],
  },
  {
    id: "water", name: "Water Treatment Chemicals", dept: "Utilities", base: 3100,
    season: s({ 6: 1.25, 7: 1.3, 8: 1.3, 9: 1.1, 12: 0.85, 1: 0.85, 2: 0.85, other: 1 }),
    vendors: [{ name: "Midwest Water Chemicals Inc", share: 1, typical: 1600 }],
  },
  {
    id: "it", name: "Software & IT", dept: "Administration", base: 1250,
    season: s({ other: 1 }),
    vendors: [{ name: "TechServe IT", share: 1, typical: 99999 }],
  },
  {
    id: "office", name: "Office Supplies", dept: "Administration", base: 820,
    season: s({ 8: 1.4, other: 1 }),
    vendors: [{ name: "Hawkeye Office Supply", share: 1, typical: 340 }],
  },
  {
    id: "library", name: "Library Materials", dept: "Library", base: 1500,
    season: s({ 9: 1.2, 1: 1.2, other: 1 }),
    vendors: [{ name: "Prairie Book Distributors", share: 1, typical: 750 }],
  },
  {
    id: "legal", name: "Professional Services", dept: "Administration", base: 1800,
    season: s({ other: 1 }),
    vendors: [{ name: "Story & Mason Law Office", share: 1, typical: 99999 }],
  },
];

export const CATEGORY_LIST = CATEGORIES.map(({ id, name, dept }) => ({ id, name, dept }));

const DESCRIPTIONS = {
  snow: ["Plowing services", "Road salt delivery", "Ice control - storm event", "Sanding, main corridors"],
  electric: ["Monthly electric service - all city accounts"],
  gas: ["Natural gas service - city buildings"],
  roads: ["Pothole patching", "Crack sealing", "Asphalt overlay", "Curb repair", "Street striping"],
  parks: ["Mowing - city parks", "Trimming and edging", "Mulch and plantings", "Ballfield prep"],
  fuel: ["Fleet fuel - weekly", "Fleet fuel card settlement"],
  fire: ["Engine 2 service", "Pump test and repair", "Brake service - Ladder 1", "Preventive maintenance"],
  janitorial: ["Monthly janitorial - City Hall, Library, Police"],
  buildings: ["HVAC service call", "Plumbing repair", "Water heater replacement", "Roof leak repair", "Drain cleaning"],
  water: ["Chlorine and fluoride", "Water treatment chemicals"],
  it: ["Managed IT services - monthly"],
  office: ["Paper and toner", "Office supplies"],
  library: ["New books and media", "Periodical subscriptions"],
  legal: ["City attorney retainer"],
};

const iso = (d) => d.toISOString().slice(0, 10);
const round2 = (x) => Math.round(x * 100) / 100;
export const fiscalYear = (dateStr) => {
  const [y, m] = dateStr.split("-").map(Number);
  return m >= 7 ? y + 1 : y;
};

export function generateLedger(seed = 2026) {
  const rng = makeRng(seed);
  const txns = [];
  const seq = {};
  const prefix = (vendor) =>
    vendor.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  const add = (date, cat, vendor, amount, extra = {}) => {
    const p = extra.invoicePrefix ?? prefix(vendor);
    seq[p] = (seq[p] ?? 1000) + rng.int(1, 3);
    txns.push({
      date,
      vendor,
      categoryId: cat.id,
      category: cat.name,
      dept: cat.dept,
      amount: round2(amount),
      // Keep routine invoice IDs separate from hand-entered demonstration IDs.
      invoice: extra.invoice ?? `GEN-${p}-${seq[p]}`,
      description: extra.description ?? rng.pick(DESCRIPTIONS[cat.id]),
      method: amount > 2500 ? "ACH" : rng() < 0.6 ? "Check" : "ACH",
      planted: extra.planted ?? null,
    });
  };

  const byId = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  const start = new Date(Date.UTC(2021, 6, 1)); // July 2021
  const end = new Date(Date.UTC(2026, 8, 1)); // September 2026

  for (let d = new Date(start); d <= end; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const yearsIn = (y - 2021) + (m - 7) / 12;
    const inflation = Math.pow(1.034, yearsIn);
    const day = (n) => iso(new Date(Date.UTC(y, m - 1, Math.min(n, 28))));

    for (const cat of CATEGORIES) {
      // Fixed-price contracts are posted once a month.
      if (cat.id === "janitorial") {
        const fy = m >= 7 ? y + 1 : y;
        const price = 3900 * Math.pow(1.06, fy - 2022); // 6% contract escalator
        add(day(5), cat, cat.vendors[0].name, price, { invoice: `MJS-${y}${String(m).padStart(2, "0")}` });
        continue;
      }
      if (cat.id === "electric" || cat.id === "gas" || cat.id === "legal" || cat.id === "it") {
        let amt = cat.base * cat.season(m) * inflation * (1 + rng.normal(0, 0.05));
        // FY2027: utility filed a 19% rate increase, the city budget did not account for it.
        if (cat.id === "electric" && (y > 2026 || (y === 2026 && m >= 7))) amt *= 1.19;
        if (cat.id === "legal" || cat.id === "it") amt = cat.base * Math.pow(1.03, Math.floor(yearsIn));
        add(day(cat.id === "legal" ? 1 : 12), cat, cat.vendors[0].name, amt);
        continue;
      }

      let target = cat.base * cat.season(m) * inflation * (1 + rng.normal(0, 0.12));
      // FY2027: aging fire engine is costing much more to keep running.
      if (cat.id === "fire" && y === 2026 && m >= 7) target *= 1.75;
      // Water chemical supplier quietly raised prices 24% in FY2026.
      if (cat.id === "water" && (y > 2025 || (y === 2025 && m >= 7))) target *= 1.24;
      if (target < 150) continue;

      for (const v of cat.vendors) {
        let budget = target * v.share;
        if (budget < 120) continue;
        const n = Math.max(1, Math.round(budget / v.typical));
        for (let i = 0; i < n; i++) {
          const amt = (budget / n) * (1 + rng.normal(0, 0.15));
          add(day(rng.int(2, 27)), cat, v.name, Math.max(85, amt),
            cat.id === "water" && (y > 2025 || (y === 2025 && m >= 7)) ? { planted: "price-creep" } : {});
        }
      }
    }

    // Spring landscaping project, competitively quoted every April.
    if (m === 4) add(day(18), byId.parks, "Green Acres Lawn & Landscape",
      y === 2025 ? 30140 : 21300 * inflation * (1 + rng.normal(0, 0.03)),
      { description: "Spring landscaping project - downtown & parks", planted: y === 2025 ? "landscape-overcharge" : null });

    // Annual software license renewal each July.
    if (m === 7) {
      const renewal = { 2021: 17400, 2022: 17950, 2023: 18500, 2024: 19050, 2025: 19600, 2026: 27050 }[y];
      add(day(3), byId.it, "CivicSoft Systems", renewal, {
        description: "Annual ERP / utility billing license renewal",
        planted: y === 2026 ? "software-escalation" : null,
      });
    }

    // Annual financial audit each November.
    if (m === 11) add(day(20), byId.legal, "Brooks CPA Group", 14200 * inflation, { description: "Annual financial audit" });
  }

  // ---- Planted cases (each one mirrors a pattern from Iowa State Auditor reports) ----
  const c = byId;
  // 1. Same janitorial invoice paid twice, 12 days apart.
  add("2025-02-17", c.janitorial, "Midwest Janitorial Solutions", round2(3900 * Math.pow(1.06, 3)),
    { invoice: "MJS-202502", description: "Monthly janitorial - City Hall, Library, Police", planted: "dup-janitorial" });
  // 2. Duplicate plumbing invoice hidden behind two spellings of the vendor name.
  add("2025-11-04", c.buildings, "Bobs Plumbing", 1840, { invoice: "BP-1187", description: "Water heater replacement", planted: "dup-plumbing" });
  add("2025-11-13", c.buildings, "Bob's Plumbing Service", 1840, { invoice: "BP-1187", description: "Water heater replacement", planted: "dup-plumbing" });
  // 3. Large first-ever payment to an unknown consulting firm.
  add("2025-08-21", c.legal, "Summit Strategy Partners LLC", 48750, { description: "Strategic planning consulting", planted: "new-vendor" });
  // 4. Snow removal billed in July.
  add("2024-07-16", c.snow, "Hawkeye Snow & Ice LLC", 14200, { description: "Ice control - storm event", planted: "offseason-snow" });
  // 5. (landscaping +40%, planted above)  6. (software +38%, planted above)
  // 7. One HVAC call billed at nearly 3x the vendor's normal invoice.
  add("2026-03-09", c.buildings, "ABC Services", 8500, { description: "HVAC service call", planted: "abc-spike" });
  // 8. One road job split into three invoices just under the $5,000 approval limit.
  for (const [amt, inv] of [[4950, "CBP-9120"], [4875, "CBP-9121"], [4990, "CBP-9122"]])
    add("2026-06-11", c.roads, "Corn Belt Paving Inc", amt, { invoice: inv, description: "Asphalt overlay", planted: "split-purchase" });
  // 9. Round-dollar Sunday payment to the IT vendor, outside its normal monthly bill.
  add("2026-01-11", c.it, "TechServe IT", 25000, { description: "Consulting services", planted: "weekend-round" });
  // 10. (water chemical price creep, planted above)

  txns.sort((a, b) => a.date.localeCompare(b.date));
  txns.forEach((t, i) => {
    t.id = `T${String(i + 1).padStart(5, "0")}`;
    t.fy = fiscalYear(t.date);
  });
  return { town: TOWN, txns, budgets: makeBudgets(txns), contracts: null };
}

// Budgets: each year's council-adopted budget is last year's actual + 3%.
// FY2027 was adopted before the electric rate hike and the fire engine trouble.
function makeBudgets(txns) {
  const actual = {};
  for (const t of txns) {
    actual[t.fy] ??= {};
    actual[t.fy][t.categoryId] = (actual[t.fy][t.categoryId] ?? 0) + t.amount;
  }
  const budgets = {};
  for (const fy of [2022, 2023, 2024, 2025, 2026, 2027]) {
    budgets[fy] = {};
    const basis = actual[fy - 1] ?? actual[fy];
    for (const cat of CATEGORY_LIST) {
      const b = (basis[cat.id] ?? 0) * (actual[fy - 1] ? 1.03 : 1.04);
      budgets[fy][cat.id] = Math.round(b / 500) * 500;
    }
  }
  return budgets;
}

export const PLANTED_CASES = [
  { id: "dup-janitorial", label: "Janitorial invoice paid twice", pattern: "Duplicate payment" },
  { id: "dup-plumbing", label: "Duplicate plumbing invoice under two vendor spellings", pattern: "Duplicate payment" },
  { id: "new-vendor", label: "$48,750 first payment to unknown consultant", pattern: "New vendor, large payment" },
  { id: "offseason-snow", label: "$14,200 snow removal billed in July", pattern: "Seasonal anomaly" },
  { id: "landscape-overcharge", label: "Landscaping project 40% above prior years", pattern: "Above similar transactions" },
  { id: "software-escalation", label: "Software renewal up 38%", pattern: "Price escalation" },
  { id: "abc-spike", label: "$8,500 HVAC call vs. $3,200 average", pattern: "Above vendor average" },
  { id: "split-purchase", label: "Road job split under $5,000 approval limit", pattern: "Split purchase" },
  { id: "weekend-round", label: "$25,000 round-dollar Sunday payment", pattern: "Unusual timing & amount" },
  { id: "price-creep", label: "Water chemical supplier raised prices 24%", pattern: "Vendor price creep" },
];
