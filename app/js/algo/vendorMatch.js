// Ledger clerks can spell one supplier's name several ways. Jaro-Winkler
// measures matching letters and shared prefixes, then groups names only when
// every alias meets the cutoff. This avoids joining unrelated suppliers by a chain.
export function normalize(name) {
  return String(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\b(llc|inc|incorporated|co|company|service|services)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function jaroWinkler(firstName, secondName) {
  if (firstName === secondName) return 1;
  if (!firstName.length || !secondName.length) return 0;

  const radius = Math.max(
    0,
    Math.floor(Math.max(firstName.length, secondName.length) / 2) - 1,
  );
  const firstMatches = new Array(firstName.length).fill(false);
  const secondMatches = new Array(secondName.length).fill(false);
  let matches = 0;

  // A letter can match only once, and only within the search window.
  for (let i = 0; i < firstName.length; i++) {
    const firstPosition = Math.max(0, i - radius);
    const lastPosition = Math.min(secondName.length - 1, i + radius);
    for (let j = firstPosition; j <= lastPosition; j++) {
      if (!secondMatches[j] && firstName[i] === secondName[j]) {
        firstMatches[i] = true;
        secondMatches[j] = true;
        matches++;
        break;
      }
    }
  }
  if (!matches) return 0;

  const firstLetters = [...firstName].filter((letter, i) => firstMatches[i]);
  const secondLetters = [...secondName].filter((letter, i) => secondMatches[i]);
  const transpositions =
    firstLetters.filter((letter, i) => letter !== secondLetters[i]).length / 2;
  const jaro =
    (matches / firstName.length +
      matches / secondName.length +
      (matches - transpositions) / matches) /
    3;

  let prefixLength = 0;
  while (
    prefixLength < Math.min(4, firstName.length, secondName.length) &&
    firstName[prefixLength] === secondName[prefixLength]
  ) {
    prefixLength++;
  }
  if (jaro > 0.7) return jaro + prefixLength * 0.1 * (1 - jaro);
  return jaro;
}

export function clusterVendors(names, threshold = 0.93) {
  const groups = [];
  const uniqueNames = [...new Set(names)].sort();
  for (const name of uniqueNames) {
    const group = groups.find((candidate) =>
      candidate.aliases.every(
        (alias) => jaroWinkler(normalize(alias), normalize(name)) >= threshold,
      ),
    );
    if (!group) {
      groups.push({ canonical: name, aliases: [name], similarity: 1 });
      continue;
    }
    const similarities = group.aliases.map((alias) =>
      jaroWinkler(normalize(alias), normalize(name)),
    );
    group.similarity = Math.min(group.similarity, ...similarities);
    group.aliases.push(name);
  }
  return groups;
}
