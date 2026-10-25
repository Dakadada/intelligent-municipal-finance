// Jaro counts nearby matching letters; Winkler rewards a shared prefix.
// Vendor groups use complete linkage: every alias must meet the cutoff.
export function normalize(name) {
  return String(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\b(llc|inc|incorporated|co|company|service|services)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
export function jaroWinkler(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const radius = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false),
    bm = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (
      let j = Math.max(0, i - radius);
      j <= Math.min(b.length - 1, i + radius);
      j++
    ) {
      if (!bm[j] && a[i] === b[j]) {
        am[i] = bm[j] = true;
        matches++;
        break;
      }
    }
  }
  if (!matches) return 0;
  const ac = [...a].filter((_, i) => am[i]),
    bc = [...b].filter((_, i) => bm[i]);
  const transpositions = ac.filter((v, i) => v !== bc[i]).length / 2;
  const jaro =
    (matches / a.length +
      matches / b.length +
      (matches - transpositions) / matches) /
    3;
  let prefix = 0;
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix])
    prefix++;
  return jaro > 0.7 ? jaro + prefix * 0.1 * (1 - jaro) : jaro;
}
export function clusterVendors(names, threshold = 0.93) {
  const groups = [];
  for (const name of [...new Set(names)].sort()) {
    const group = groups.find((g) =>
      g.aliases.every(
        (alias) => jaroWinkler(normalize(alias), normalize(name)) >= threshold,
      ),
    );
    if (!group)
      groups.push({ canonical: name, aliases: [name], similarity: 1 });
    else {
      group.similarity = Math.min(
        group.similarity,
        ...group.aliases.map((a) => jaroWinkler(normalize(a), normalize(name))),
      );
      group.aliases.push(name);
    }
  }
  return groups;
}
