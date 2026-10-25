# Congressional App Challenge 2026: Full Application (IA-03, Rep. Zachary Nunn)

Deadline: **12:00 pm EDT, Monday, Oct 26, 2026.** Every answer below is under the
400-word limit. Rewrite them in your own voice. Judges can ask you to explain
anything here. Re-check the numbers against the live app before you paste
(right now: 1,885 transactions, 20 findings, 10 of 10 planted problems caught).

---

**What is your app called?**
Red Pen: Intelligent Municipal Finance

**Programming language(s):** JavaScript (plus HTML and CSS: tick "Other" and write "HTML/CSS" if the form allows)

**Platform(s):** Web

**Video demonstration link:** `https://youtu.be/...` (upload as **Public**, not Unlisted)

---

**Please briefly describe what your app does?** (~190 words)

Red Pen reads every transaction a small city makes and marks only the ones a
person should review. Iowa has 947 cities and 327 school districts, and most
small towns can't afford a financial analyst. Traditional audits sample a small
share of transactions every year or two, so duplicate payments and overcharges
can go unnoticed for years.

When a city clerk opens Red Pen, it has already checked the whole ledger. Each
finding explains itself in plain English with numbers the clerk can check by
hand, for example: "Midwest Janitorial Solutions received two payments of $4,645
on Feb 5, 2025 and Feb 17, 2025 for invoice MJS-202502." The clerk marks it
reviewed, sends it to the council, or dismisses it, and every decision goes into
an audit log. Red Pen never blocks or changes a payment. People decide.

It also forecasts which budgets will run out before the fiscal year ends, marks
risky terms in contracts before they're signed, and merges misspelled vendor
names so duplicates can't hide. A city can drop in its own spending export. All
analysis runs in the browser, so the data never leaves the computer.

---

**What inspired you to create this app?** (~170 words, make it personal)

We started with research for the Presidential AI Challenge on how Iowa local
governments lose money to waste. Iowa State Auditor reports kept describing
problems that were only caught years later: $127,000 in duplicate payments that
went unnoticed for three years, and $27.6 million in court debt sent to the
wrong state funds. Meanwhile, property taxes rose in 91 of Iowa's 99 counties.

What stuck with us is that these weren't hard problems to spot. A computer could
catch a duplicate invoice instantly. Big cities have analysts and software for
this, but 76% of Iowa's cities have fewer than 2,500 people, and their clerks
review spreadsheets by hand. We wanted to turn our proposal into something a
small-town clerk could actually open and use, built to explain its reasoning,
because local officials have to justify every decision publicly.

[Add a sentence about your own connection: Johnston, a school program you saw
cut, a conversation with a city official, etc.]

---

**What technical difficulties did you face programming your app?** (~260 words)

No labeled data. Small towns don't have examples of "waste" to train a model on.
We combined an unsupervised Isolation Forest, which flags transactions that are
easy to separate from the rest, with rules taken from Iowa State Auditor
findings. To measure accuracy honestly, we built a fictional town's five-year
ledger with ten planted problems. The detectors never see which ones were
planted, and the app reports how many it catches.

Seasonality. Our first anomaly detector flagged every summer electric bill and
every January snow-plowing bill. We added gradient-boosted decision trees that
learn each category's normal spending by month of the year, using Huber loss so
a single bad month doesn't distort the model.

Messy vendor names. Iowa Code Chapter 384 lets cities keep their books their own
way, so "Bobs Plumbing" and "Bob's Plumbing Service" looked like two vendors and
a duplicate payment hid between them. We normalize names and cluster them with
Jaro-Winkler string similarity.

Too many alerts. Early versions produced more than 35 findings, which is more
than a clerk would trust. We merged alerts that point at the same transactions
and tuned thresholds until the queue was short and every item mattered.

Forecasting. Our first seasonal ARIMA forecast projected most categories over
budget. We had to fix how it handled seasonal differencing and trend before its
projections made sense.

Everything runs in the browser with no libraries, so we implemented each
algorithm ourselves and wrote automated tests for each one.

---

**What improvements would you make for a 2.0 version?** (~150 words)

- A pilot with a real Iowa county that has towns of different sizes, with
  traditional audits run alongside to measure real accuracy.
- Direct import from the accounting systems Iowa towns use (MUNIS, QuickBooks,
  Caselle) instead of CSV exports.
- Shared, secure accounts so a clerk, a finance committee, and the auditor see
  the same queue and audit log.
- A public view for residents: where their tax dollars went this year, in plain
  language.
- Better contract analysis trained on real Iowa municipal contracts and their
  outcomes.
- An option, if a city chooses, to hold an extremely suspicious payment for a
  human's approval.

---

**Did you use AI? How, and what did your team contribute directly?**
> **YOU MUST EDIT THIS.** It has to be accurate. Below is a starting point that
> describes the AI tools truthfully. Fill in the bracketed parts with what the
> two of you actually did.

Yes. We used Anthropic's Claude (through Claude Code) and OpenAI's Codex as
coding assistants. Claude helped design and write the user interface, the
three.js video opening, and the data generator. Codex helped write and test the
analysis engine (Isolation Forest, gradient boosting, ARIMA forecasting, naive
Bayes contract analysis). We used Claude earlier to organize research for our
proposal.

Our team contributed: the original idea and research (our Presidential AI
Challenge proposal on Iowa municipal waste); choosing which methods to use and
why; the Iowa-specific rules and thresholds based on State Auditor guidance;
the ten planted test cases modeled on real audit findings; [testing the app and
deciding what to fix]; [code you wrote or changed yourselves]; [the
narration and video]. We reviewed the code and can explain how each algorithm
works.

---

**What did you learn or take away?** (~120 words, make it yours)

That AI and machine learning only help if they fit the problem. The most useful
parts of Red Pen are simple, explainable checks that a clerk can defend at a
council meeting, not the most complex model. We learned how much municipal
finance and Iowa law shape what a tool like this can and should do, and that
testing against known answers is the only honest way to claim something works.
[Add something personal: working as a team, presenting to judges, etc.]

---

**Cover photo:** `video/out/cover.jpg` (600 x 800 JPEG)

**Project link:** live app URL (Vercel) and/or https://github.com/Dakadada/intelligent-municipal-finance.
The repo must be public to qualify for Hack Club's Congressional Certification.

**Where did you do most of the coding?** At Home

**Date you completed the coding:** 10/25/2026 (or whenever you finish your own edits)

**Part of a school project or club?** No. Answer Yes only if it was assigned or
mentored through a class or club.
