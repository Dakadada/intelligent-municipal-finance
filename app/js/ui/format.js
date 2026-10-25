// Formatting helpers shared by every view.

// Escape text before putting it into HTML (vendor names come from uploaded CSVs).
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const int = new Intl.NumberFormat("en-US");

export const money = (n) => (n == null || Number.isNaN(n) ? "—" : usd0.format(n));
export const money2 = (n) => (n == null || Number.isNaN(n) ? "—" : usd2.format(n));
export const count = (n) => int.format(n ?? 0);

// $11.8M, $162K, $940
export function moneyShort(n) {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.0+$/, "")}M`;
  if (a >= 1e4) return `$${Math.round(n / 1e3)}K`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return `$${Math.round(n)}`;
}

export function pct(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-03-09" -> "Mar 9, 2026"
export function date(iso, { year = true } = {}) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return year ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${d}`;
}
// "2026-03" -> "Mar 2026" / "March 2026"
export function month(ym, long = false) {
  if (!ym) return "—";
  const [y, m] = ym.split("-").map(Number);
  return `${(long ? MONTHS_LONG : MONTHS)[m - 1]} ${y}`;
}
export const monthShort = (ym) => MONTHS[Number(ym.split("-")[1]) - 1];

export function weekday(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function timestamp(ms) {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() < 12 ? "AM" : "PM"}`;
}

export const plural = (n, word, many = `${word}s`) => `${count(n)} ${n === 1 ? word : many}`;
