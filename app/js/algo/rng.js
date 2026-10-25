// Seeded pseudo-random numbers so every run of the demo produces the same
// ledger and the same model results (important for reproducible evaluation).

// mulberry32: tiny, fast 32-bit generator. Returns floats in [0, 1).
export function makeRng(seed = 42) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  // Box-Muller standard normal
  rng.normal = (mean = 0, sd = 1) => {
    const u = 1 - rng();
    const v = rng();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return rng;
}
