// Find risky municipal contract terms using two transparent approaches.
// Naive Bayes learns word frequencies from labeled clauses; explicit rules
// identify obligations and protections that a clerk can locate in the text.
import { TRAINING_CLAUSES } from "../data/contracts.js";
const tokens = (text) => text.toLowerCase().match(/[a-z]+/g) ?? [];
export function trainNB(clauses) {
  const vocabulary = new Set();
  const counts = [{}, {}];
  const totals = [0, 0];
  const documentCounts = [0, 0];
  for (const clause of clauses) {
    const label = clause.risky ? 1 : 0;
    documentCounts[label]++;
    for (const word of tokens(clause.text)) {
      vocabulary.add(word);
      counts[label][word] = (counts[label][word] ?? 0) + 1;
      totals[label]++;
    }
  }
  return {
    vocabSize: vocabulary.size,
    predict(text) {
      // Add-one smoothing gives unseen word/class combinations a nonzero chance.
      // Sum logarithms because multiplying many tiny probabilities underflows.
      const logProbabilities = documentCounts.map((documentCount) =>
        Math.log((documentCount + 1) / (clauses.length + 2)),
      );
      for (const word of tokens(text)) {
        if (vocabulary.has(word)) {
          for (let classIndex = 0; classIndex < 2; classIndex++) {
            logProbabilities[classIndex] += Math.log(
              ((counts[classIndex][word] ?? 0) + 1) / (totals[classIndex] + vocabulary.size),
            );
          }
        }
      }
      return (
        1 /
        (1 +
          Math.exp(Math.max(-700, Math.min(700, logProbabilities[0] - logProbabilities[1]))))
      );
    },
  };
}
const classifier = trainNB(TRAINING_CLAUSES);
const money = (value) => Number(value.replace(/,/g, ""));
const CLAUSE_RULES = [
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
function splitSentences(text) {
  const sentences = [];
  // Decimal points within prices and percentages are not sentence boundaries.
  const sentencePattern = /(?:[^.!?]|\.(?=\d))+(?:[.!?]|$)/g;
  for (const match of text.matchAll(sentencePattern)) {
    const leading = match[0].length - match[0].trimStart().length;
    const sentence = match[0].trim();
    if (sentence) {
      sentences.push({
        text: sentence,
        start: match.index + leading,
        end: match.index + match[0].trimEnd().length,
        risk: classifier.predict(sentence),
        tags: [],
      });
    }
  }
  return sentences;
}
function extractTerms(text) {
  const hasPriceCap =
    /(?:capped at|cap (?:is|of)|increases? (?:shall not|may not) exceed)/i.test(text);
  const hasSpendingLimit =
    /(?:shall not exceed|not.to.exceed (?:amount|limit|of|\$))/i.test(text) &&
    !/no not.to.exceed/i.test(text);
  const hasCompetitiveBid =
    /(?:following a competitive bid|competitive bid (?:was|advertised)|competitively bid)/i.test(
      text,
    );
  const termMatch = text.match(/(?:initial term|the term|term) (?:is|of) (\d+) months/i);
  const terms = {
    termMonths: termMatch ? +termMatch[1] : null,
    autoRenew: /automatically renew|auto.renew/i.test(text) ? true : null,
    escalatorPct: null,
    capPct: null,
    noticeDays: null,
    totalValue: null,
    competitiveBid: hasCompetitiveBid ? true : null,
  };
  const escalator = text.match(
    /(?:increase by|increase of|escalat\w* (?:of|by))\s*(\d+(?:\.\d+)?)%/i,
  );
  if (escalator) {
    terms.escalatorPct = +escalator[1];
  }
  const capMatch = text.match(/(?:capped at|cap (?:is|of))[^.]*?(\d+(?:\.\d+)?)%/i);
  if (capMatch) {
    terms.capPct = +capMatch[1];
  }
  const noticeMatch = text.match(/(\d+) days (?:before|written notice)/i);
  if (noticeMatch) {
    terms.noticeDays = +noticeMatch[1];
  }
  const value = text.match(/annual value is \$([\d,]+(?:\.\d+)?)/i);
  if (value) {
    terms.totalValue = (money(value[1]) * (terms.termMonths ?? 12)) / 12;
  }
  return { terms, hasPriceCap, hasSpendingLimit, hasCompetitiveBid };
}
function findClauseMatches(sentences, context) {
  const { terms, hasPriceCap, hasSpendingLimit, hasCompetitiveBid } = context;
  const findings = [];
  for (const [id, label, severity, pattern, explanation] of CLAUSE_RULES) {
    if (
      (id === "time-materials" && hasSpendingLimit) ||
      (id === "long-term" && !(terms.termMonths > 36)) ||
      (id === "bid" && !hasCompetitiveBid) ||
      (id === "cap" && !hasPriceCap) ||
      (id === "nte" && !hasSpendingLimit)
    ) {
      continue;
    }
    const index = sentences.findIndex((sentence) => {
      const implicitEscalation =
        id === "uncapped-price" &&
        terms.escalatorPct !== null &&
        !hasPriceCap &&
        /increase|escalat/i.test(sentence.text);
      if (!pattern.test(sentence.text) && !implicitEscalation) {
        return false;
      }
      // A missing protection is not a protection: preserve the surrounding
      // negation instead of treating the presence of a keyword as approval.
      if (severity === "good") {
        const match = sentence.text.match(pattern);
        const prefix = sentence.text.slice(0, match?.index ?? 0);
        if (
          /\b(?:no|without|does not|shall not|not include|not retain)\b[^,;.!?]{0,45}$/i.test(
            prefix,
          )
        ) {
          return false;
        }
      }
      return true;
    });
    if (index < 0) {
      continue;
    }
    findings.push({ id, label, severity, explanation, sentenceIndex: index });
    sentences[index].tags.push(id);
  }
  return findings;
}
function suitabilityScore(findings, sentences, terms) {
  let score = 100;
  for (const finding of findings) {
    if (finding.severity === "high") {
      score -= 20;
    } else {
      if (finding.severity === "medium") {
        score -= 10;
      }
    }
  }
  // Automatic renewal compounds an uncapped annual escalator without a new decision.
  const renewsWithUncappedIncrease = terms.autoRenew && terms.escalatorPct > 0 &&
    findings.some(finding => finding.id === "uncapped-price");
  if (renewsWithUncappedIncrease) score -= 10;
  // Classifier contributes modestly; auditable rules dominate the suitability score.
  if (sentences.length) {
    score -= Math.round(
      (sentences.reduce(
        (riskTotal, sentenceEntry) => riskTotal + Math.max(0, sentenceEntry.risk - 0.65),
        0,
      ) /
        sentences.length) *
        12,
    );
  }
  score = Math.max(0, Math.min(100, score));
  return score;
}
export function suitabilityGrade(score) {
  if (score >= 85) {
    return "A";
  }
  if (score >= 70) {
    return "B";
  }
  if (score >= 55) {
    return "C";
  }
  if (score >= 40) {
    return "D";
  }
  return "F";
}
function joinTerms(phrases) {
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return phrases[0] + " and " + phrases[1];
  return phrases.slice(0, -1).join(", ") + ", and " + phrases.at(-1);
}

function contractVerdict(findings, terms) {
  let escalation = "allows price increases without a cap";
  if (terms.escalatorPct !== null) {
    escalation = `raises the price ${terms.escalatorPct}% a year with no cap`;
  }
  const risks = {
    "auto-renew": "renews automatically without a new bid",
    "uncapped-price": escalation,
    "current-rates": "lets the vendor set future renewal prices",
    "time-materials": "allows hourly billing without a spending limit",
    penalty: "charges a penalty for ending early",
    unilateral: "lets the vendor change prices or services without city approval",
    vague: "leaves the required work undefined",
    "long-term": `commits the city for ${terms.termMonths} months`,
  };
  const protections = {
    bid: "competitively bid", cap: "price-capped",
    nte: "subject to a total spending limit",
    convenience: "allows the city to end the agreement without a penalty",
    sla: "sets measurable service standards", audit: "gives the city audit rights",
  };
  const riskOrder = ["auto-renew", "uncapped-price", "time-materials", "penalty",
    "unilateral", "current-rates"];
  const highRisks = findings.filter(finding => finding.severity === "high")
    .sort((first, second) => riskOrder.indexOf(first.id) - riskOrder.indexOf(second.id));
  const otherRisks = findings.filter(finding => finding.severity === "medium");
  const riskyTerms = [...highRisks, ...otherRisks].slice(0, 3)
    .map(finding => risks[finding.id]).filter(Boolean);
  let phrases = riskyTerms;
  if (!phrases.length) {
    // Prefer the procurement, spending and exit protections in a short summary.
    phrases = ["bid", "cap", "nte", "convenience", "sla", "audit"]
      .filter(id => findings.some(finding => finding.id === id))
      .slice(0, 4).map(id => protections[id]);
  }
  if (!phrases.length) {
    return "No specific purchasing risks or protections were found in the supplied text.";
  }
  const sentence = joinTerms(phrases);
  return sentence[0].toUpperCase() + sentence.slice(1) + ".";
}

export function analyzeContract(text) {
  const sentences = splitSentences(text);
  const context = extractTerms(text);
  const { terms } = context;
  const findings = findClauseMatches(sentences, context);
  const score = suitabilityScore(findings, sentences, terms);
  const grade = suitabilityGrade(score);
  return {
    score,
    grade,
    verdict: contractVerdict(findings, terms),
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
