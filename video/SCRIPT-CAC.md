# Red Pen: Congressional App Challenge video script (v3, 2026-10-26)

Target: about 2:45 (the rules allow 1 to 3 minutes). Deadline 12:00 am EDT, 2026-10-27.

v3 changes: Presidential AI Challenge mention removed (essays only). Lines re-split and
reassigned so everyone speaks about the same amount (David 127 words, Srihari 130, Alex 132),
with the wording unchanged. No bare-face shots: the names play over a designed team card, and
the close plays over a final slide. Lines are renumbered 1 to 20 for recording.

**Picture types**
- **3D**: the reworked three.js intro (`video/cac/intro.html`). Every dot is one of the test
  town's 1,885 real payments, and the circled dots are Red Pen's real findings.
- **TEAM**: a designed card with the three of you side by side, names underneath.
- **BUBBLE**: the screen (app demo, slide, or code) with the speaker's face in a corner circle.
- Captions run along the bottom the whole time. Statistics pop up on screen as they're said.

**Rulebook requirements:** names (6 to 8), app name (8, 9), one-sentence purpose (9), target
audience (9), tools and languages (15, 16), functionality (10 to 14, 18).

**Sources:** 91 of 99 counties, 76% of cities under 2,500, and $127,000 in duplicate payments
come from the team's proposal (Iowa State Auditor reports; Iowa property tax data). 1,885 / 20 /
April / 10 of 10 come from the live app. 35 tests from `bun test`.

---

## Storyboard

| # | Who | Words | Picture | Line |
|---|---|---|---|---|
| **1. Cold open (3D, voices only)** | | | | |
| 1 | David | 16 | 3D: dots appear out of the dark. *Willow Creek, Iowa · 1,885 payments · five years* | "This is five years of spending from one small Iowa town. Every dot is a payment." |
| 2 | Alex | 26 | 3D: 99 tiles, 91 turn red. *91 of Iowa's 99 counties saw property taxes rise in 2024.* | "In 2024, property taxes went up in 91 of Iowa's 99 counties. Families are paying more, and they deserve to know every dollar is spent well." |
| 3 | David | 28 | 3D: dots pulse, a counter ticks up to *$127,000 in duplicate payments, unnoticed for three years* | "But three out of four Iowa towns have fewer than 2,500 people and no financial analyst. In one county, $127,000 in duplicate payments went unnoticed for three years." |
| 4 | Srihari | 9 | 3D: dots dim. *No one has time to read every line.* | "Because no one has time to read every line." |
| 5 | Alex | 3 | 3D: a red scanning plane sweeps through every payment, circling the findings, then the paper card *1,885 transactions read. 20 need you.* | "Red Pen does." |
| **2. Who we are** | | | | |
| 6 | David | 3 | TEAM card: David's tile lights up, name appears | "I'm David Shi," |
| 7 | Srihari | 3 | TEAM card: Srihari's tile | "I'm Srihari Kumaresan," |
| 8 | Alex | 9 | TEAM card: Alex's tile, then the Red Pen logo | "and I'm Alex Du, and we built Red Pen." |
| 9 | David | 36 | BUBBLE over slide "Who it's for": three cards slide in (City clerks · Councils · Taxpayers) | "Red Pen reads every payment a city makes and marks only the ones a person should review. It's built for city clerks, finance officers, and councils in small towns that can't afford an auditor on staff." |
| **3. Demo (end to end)** | | | | |
| 10 | Alex | 25 | BUBBLE: the town's spending export in a spreadsheet (Check Date, Payee Name, Net Amount, 1,885 rows), the file flies into Red Pen's upload box, the import summary appears | "A clerk starts by dropping in the city's spending file, exported straight from their accounting software. Here's five years of books from our test town." |
| 11 | Srihari | 23 | BUBBLE: reading animation, zoom to "1,885 transactions read. 20 need you." Pop-up: *1,885 read · 20 flagged · 1 second* | "In about a second, Red Pen reads all 1,885 payments and finds 20 worth a look. Every finding explains itself in plain English." |
| 12 | Alex | 37 | BUBBLE: opens the duplicate payment, zooms on the reasons (pop-up *$4,645 × 2 · 12 days apart*), types a note, clicks Mark reviewed | "This janitorial invoice was paid twice, twelve days apart. The clerk checks the numbers, adds a note, and marks it reviewed, and the decision goes into an audit log. Red Pen never blocks a payment. People decide." |
| 13 | Srihari | 29 | BUBBLE: Vendors (pop-up *Bobs Plumbing = Bob's Plumbing Service*), Spending patterns (July snow bill circled), Budget runway (pop-up *Runs out: April*) | "It catches what a spreadsheet misses: the same plumber under two spellings, a snow-removal bill in July, and a fire-truck repair budget on track to run out in April." |
| 14 | Alex | 18 | BUBBLE: Contracts view, red underlines and margin notes appear | "And before the council signs a contract, it underlines risky terms, like automatic renewal with no new bid." |
| **4. How we built it** | | | | |
| 15 | Srihari | 43 | BUBBLE over slide "How it works": spending file → four models + Iowa State Auditor rules → plain-English findings → a person decides. Each model's name pops in as it's said | "Under the hood are four models we wrote from scratch in JavaScript, with no machine-learning libraries: an Isolation Forest for unusual payments, gradient-boosted trees that learn each month's normal spending, a seasonal ARIMA forecast for budgets, and a naive Bayes classifier for contracts." |
| 16 | David | 13 | BUBBLE: the real source code in a VS Code-style editor, scrolling `isolationForest.js` | "Every flag still comes with a reason a clerk can check by hand." |
| 17 | Alex | 14 | BUBBLE: a browser window with a lock icon; pop-up *No server · data stays on your computer* | "It all runs in the browser, so a city's data never leaves its computer." |
| 18 | David | 26 | BUBBLE: the 10-of-10 checklist ticks down, then a terminal runs the real test suite: *35 pass, 0 fail* | "To test it honestly, we planted ten real-world problems in our test town's books. Red Pen caught all ten, and 35 automated tests check the code." |
| **5. Close** | | | | |
| 19 | Srihari | 23 | BUBBLE over the closing slide: parks, roads, schools icons; recap *1,885 read · 20 flagged · 10 of 10 caught* | "Every dollar a small town saves stays in its parks, its roads, and its schools, instead of coming out of higher property taxes." |
| 20 | David | 5 | Final card: Red Pen logo, *Every line, read.*, redpenapp.vercel.app, three names | "Red Pen. Every line, read." |

Totals: David 127 words (lines 1, 3, 6, 9, 16, 18, 20), Srihari 130 (4, 7, 11, 13, 15, 19),
Alex 132 (2, 5, 8, 10, 12, 14, 17).

---

## Recording sheet (each person records all their lines)

**Setup:** landscape, eye level, about an arm's length away, face lit from the front (face a
window or lamp), quiet room, same spot and shirt for every line. Every line is shown with your
face in a corner bubble except 1 to 5, which are voice only, but record those on camera too.

**How to read:** say the line number ("Line two."), pause one second, read the line, pause one
second. Stumble? Say the number again and redo it; the last take of each line wins. Look at the
lens. One long video or several clips both work. Name files like `alex_take1.mov` and AirDrop
them to Alex, who puts them in `video/takes/`.

### David (7 lines)
1. "This is five years of spending from one small Iowa town. Every dot is a payment."
3. "But three out of four Iowa towns have fewer than 2,500 people and no financial analyst. In one county, $127,000 in duplicate payments went unnoticed for three years."
6. "I'm David Shi,"
9. "Red Pen reads every payment a city makes and marks only the ones a person should review. It's built for city clerks, finance officers, and councils in small towns that can't afford an auditor on staff."
16. "Every flag still comes with a reason a clerk can check by hand."
18. "To test it honestly, we planted ten real-world problems in our test town's books. Red Pen caught all ten, and 35 automated tests check the code."
20. "Red Pen. Every line, read."

### Srihari (6 lines)
4. "Because no one has time to read every line."
7. "I'm Srihari Kumaresan,"
11. "In about a second, Red Pen reads all 1,885 payments and finds 20 worth a look. Every finding explains itself in plain English."
13. "It catches what a spreadsheet misses: the same plumber under two spellings, a snow-removal bill in July, and a fire-truck repair budget on track to run out in April."
15. "Under the hood are four models we wrote from scratch in JavaScript, with no machine-learning libraries: an Isolation Forest for unusual payments, gradient-boosted trees that learn each month's normal spending, a seasonal ARIMA forecast for budgets, and a naive Bayes classifier for contracts."
19. "Every dollar a small town saves stays in its parks, its roads, and its schools, instead of coming out of higher property taxes."

### Alex (7 lines)
2. "In 2024, property taxes went up in 91 of Iowa's 99 counties. Families are paying more, and they deserve to know every dollar is spent well."
5. "Red Pen does."
8. "and I'm Alex Du, and we built Red Pen."
10. "A clerk starts by dropping in the city's spending file, exported straight from their accounting software. Here's five years of books from our test town."
12. "This janitorial invoice was paid twice, twelve days apart. The clerk checks the numbers, adds a note, and marks it reviewed, and the decision goes into an audit log. Red Pen never blocks a payment. People decide."
14. "And before the council signs a contract, it underlines risky terms, like automatic renewal with no new bid."
17. "It all runs in the browser, so a city's data never leaves its computer."
