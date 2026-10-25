// A Laplace-smoothed bag-of-words classifier learns from labeled clauses.
// Explicit clause rules add understandable findings and extract key terms.
import { TRAINING_CLAUSES } from "../data/contracts.js";
const tokens = (text) => text.toLowerCase().match(/[a-z]+/g) ?? [];
export function trainNB(clauses) {
  const vocab = new Set(),
    counts = [{}, {}],
    totals = [0, 0],
    docs = [0, 0];
  for (const clause of clauses) {
    const label = clause.risky ? 1 : 0;
    docs[label]++;
    for (const word of tokens(clause.text)) {
      vocab.add(word);
      counts[label][word] = (counts[label][word] ?? 0) + 1;
      totals[label]++;
    }
  }
  return {
    vocabSize: vocab.size,
    predict(text) {
      const log = docs.map((n) => Math.log((n + 1) / (clauses.length + 2)));
      for (const word of tokens(text))
        if (vocab.has(word)) {
          for (let k = 0; k < 2; k++)
            log[k] += Math.log(
              ((counts[k][word] ?? 0) + 1) / (totals[k] + vocab.size),
            );
        }
      return 1 / (1 + Math.exp(Math.max(-700, Math.min(700, log[0] - log[1]))));
    },
  };
}
const classifier = trainNB(TRAINING_CLAUSES);
const money = (value) => Number(value.replace(/,/g, ""));
export function analyzeContract(text) {
  const sentences = [];
  // Decimal points within prices and percentages are not sentence boundaries.
  const re = /(?:[^.!?]|\.(?=\d))+(?:[.!?]|$)/g;
  for (const match of text.matchAll(re)) {
    const leading = match[0].length - match[0].trimStart().length;
    const sentence = match[0].trim();
    if (sentence)
      sentences.push({
        text: sentence,
        start: match.index + leading,
        end: match.index + match[0].trimEnd().length,
        risk: classifier.predict(sentence),
        tags: [],
      });
  }
  const positiveCap =
    /(?:capped at|cap (?:is|of)|increases? (?:shall not|may not) exceed)/i.test(
      text,
    );
  const nte =
    /(?:shall not exceed|not.to.exceed (?:amount|limit|of|\$))/i.test(text) &&
    !/no not.to.exceed/i.test(text);
  const bid =
    /(?:following a competitive bid|competitive bid (?:was|advertised)|competitively bid)/i.test(
      text,
    );
  const termMatch = text.match(
    /(?:initial term|the term|term) (?:is|of) (\d+) months/i,
  );
  const terms = {
    termMonths: termMatch ? +termMatch[1] : null,
    autoRenew: /automatically renew|auto.renew/i.test(text) ? true : null,
    escalatorPct: null,
    capPct: null,
    noticeDays: null,
    totalValue: null,
    competitiveBid: bid ? true : null,
  };
  const escalator = text.match(
    /(?:increase by|increase of|escalat\w* (?:of|by))\s*(\d+(?:\.\d+)?)%/i,
  );
  if (escalator) terms.escalatorPct = +escalator[1];
  const cap = text.match(/(?:capped at|cap (?:is|of))[^.]*?(\d+(?:\.\d+)?)%/i);
  if (cap) terms.capPct = +cap[1];
  const notice = text.match(/(\d+) days (?:before|written notice)/i);
  if (notice) terms.noticeDays = +notice[1];
  const value = text.match(/annual value is \$([\d,]+(?:\.\d+)?)/i);
  if (value)
    terms.totalValue = (money(value[1]) * (terms.termMonths ?? 12)) / 12;
  const definitions = [
    [
      "auto-renew",
      "Automatic renewal",
      "high",
      /automatically renew|auto.renew/i,
      "Renewal continues without a fresh council purchasing decision.",
    ],
    [
      "uncapped-price",
      "Uncapped price increase",
      "high",
      /no price cap|no maximum cumulative|without a price cap|no price ceiling/i,
      "Price increases have no stated ceiling.",
    ],
    [
      "current-rates",
      "Then-current rates",
      "high",
      /then.current rates/i,
      "Future renewal prices are controlled by the vendor.",
    ],
    [
      "vague",
      "Vague deliverables",
      "medium",
      /as needed|including but not limited to|includes,? but is not limited to/i,
      "The scope does not define a measurable amount of completed work.",
    ],
    [
      "time-materials",
      "Open-ended hourly billing",
      "high",
      /time and materials|time.and.materials/i,
      "Hourly work has no enforceable not-to-exceed limit.",
    ],
    [
      "penalty",
      "Early termination penalty",
      "high",
      /termination penalty|termination requires payment|remaining license fees/i,
      "Leaving early may require paying for future service.",
    ],
    [
      "unilateral",
      "Unilateral vendor changes",
      "high",
      /unilaterally|vendor may change/i,
      "The vendor can change price or service without city approval.",
    ],
    [
      "long-term",
      "Long commitment",
      "medium",
      /(?:initial term|the term|term) (?:is|of) \d+ months/i,
      "A commitment longer than 36 months limits future purchasing choices.",
    ],
    [
      "bid",
      "Competitive procurement",
      "good",
      /competitive bid/i,
      "Public competition supports an independently tested price.",
    ],
    [
      "cap",
      "Price increase cap",
      "good",
      /capped at|price cap is|CPI cap/i,
      "A stated ceiling limits future price increases.",
    ],
    [
      "nte",
      "Not-to-exceed limit",
      "good",
      /shall not exceed|not.to.exceed/i,
      "A binding maximum protects the authorized budget.",
    ],
    [
      "sla",
      "Measurable service standards",
      "good",
      /performance metrics|service level agreement/i,
      "Response and completion standards make performance review possible.",
    ],
    [
      "convenience",
      "Termination for convenience",
      "good",
      /terminate for convenience/i,
      "The city can exit without paying for unperformed work.",
    ],
    [
      "audit",
      "Audit rights",
      "good",
      /audit rights/i,
      "The city can inspect records that support charges.",
    ],
  ];
  const findings = [];
  for (const [id, label, severity, pattern, explanation] of definitions) {
    if (
      (id === "time-materials" && nte) ||
      (id === "long-term" && !(terms.termMonths > 36)) ||
      (id === "bid" && !bid) ||
      (id === "cap" && !positiveCap) ||
      (id === "nte" && !nte)
    )
      continue;
    const index = sentences.findIndex((s) => {
      const implicitEscalation =
        id === "uncapped-price" &&
        terms.escalatorPct !== null &&
        !positiveCap &&
        /increase|escalat/i.test(s.text);
      if (!pattern.test(s.text) && !implicitEscalation) return false;
      // A missing protection is not a protection: preserve the surrounding
      // negation instead of treating the presence of a keyword as approval.
      if (severity === "good") {
        const match = s.text.match(pattern);
        const prefix = s.text.slice(0, match?.index ?? 0);
        if (
          /\b(?:no|without|does not|shall not|not include|not retain)\b[^,;.!?]{0,45}$/i.test(
            prefix,
          )
        )
          return false;
      }
      return true;
    });
    if (index < 0) continue;
    findings.push({ id, label, severity, explanation, sentenceIndex: index });
    sentences[index].tags.push(id);
  }
  let score = 100;
  for (const f of findings)
    score -= f.severity === "high" ? 16 : f.severity === "medium" ? 10 : 0;
  // Classifier contributes modestly; auditable rules dominate the suitability score.
  if (sentences.length)
    score -= Math.round(
      (sentences.reduce((s, v) => s + Math.max(0, v.risk - 0.65), 0) /
        sentences.length) *
        12,
    );
  score = Math.max(0, Math.min(100, score));
  const grade =
    score >= 90
      ? "A"
      : score >= 80
        ? "B"
        : score >= 70
          ? "C"
          : score >= 60
            ? "D"
            : "F";
  return {
    score,
    grade,
    verdict: `${findings.filter((f) => f.severity === "high").length} high-risk terms and ${findings.filter((f) => f.severity === "good").length} protective terms found; suitability score ${score} out of 100.`,
    terms,
    findings,
    sentences,
    model: {
      type: "multinomial naive Bayes + clause rules",
      trainingClauses: TRAINING_CLAUSES.length,
      vocabSize: classifier.vocabSize,
    },
  };
}
