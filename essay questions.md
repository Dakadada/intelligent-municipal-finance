### Questions (from the application form, 400-word limit each):
Please briefly describe what your app does? *
Word Count: 0 / 400
What inspired you to create this app? *
Word Count: 0 / 400
What technical difficulties did you face programming your app? *
Word Count: 0 / 400
What improvements would you make if you were to create a 2.0 version of your app? *
Word Count: 0 / 400
Did you use AI in the creation, development, or functionality of your app? *
If you used AI, tell us how you used it and what your team contributed directly. Please list the AI tools you used and briefly explain how they helped. Then describe what your team designed, coded, changed, tested, or finalized yourselves.
Word Count: 0 / 400
What did you learn or take away from participating in the Congressional App Challenge? *

Polished 2026-10-26. The earlier drafts, the raw Codex answers, and the technical notes are kept unchanged in `essay questions.ORIGINAL.md`. Answers are in the same order as the form. Before pasting, resolve every `[NEEDS TEAM: ...]` (fill it in or delete it).


### 1. Please briefly describe what your app does?

Red Pen is a web app that checks every payment a small city makes and shows the clerk only the few that need a person to look at them. The clerk uploads the spending file exported from the city's accounting software, or opens our fictional sample town, Willow Creek. Red Pen reads the whole ledger in about a second. For Willow Creek, that means 1,885 payments over five years, which Red Pen narrows to 20 findings.

Each finding explains itself in plain sentences, with numbers the clerk can check by hand. For example, one finding shows that Midwest Janitorial Solutions was paid $4,645 on February 5, 2025 and again on February 17, 2025 for the same invoice number. The clerk can mark a finding reviewed, mark it for the city council, or dismiss it, and Red Pen saves the decision and any notes. Red Pen never pays, blocks, or changes a payment. A person always makes the final decision.

The app has five analysis screens. The review queue ranks findings by risk. The spending patterns screen shows what each category normally costs in each month and highlights months far outside that range. The budget runway screen forecasts which budget lines will run out before the fiscal year ends. In the sample town, for example, the fire vehicle maintenance budget is on track to run out in April. The vendors screen combines names that were typed differently, such as "Bobs Plumbing" and "Bob's Plumbing Service," so a duplicate payment cannot hide between two spellings. The contracts screen marks risky terms before a contract is signed, such as automatic renewal, uncapped price increases, and penalties for leaving early.

Behind these screens are checks based on Iowa State Auditor findings and four models we wrote from scratch in JavaScript without machine-learning libraries: an Isolation Forest for unusual payments, gradient-boosted trees that learn each category's normal monthly spending, a seasonal ARIMA forecast for budgets, and a naive Bayes classifier for contract language. Everything runs inside the browser. There is no server, so a city's financial data never leaves its own computer.


### 2. What inspired you to create this app?

We were inspired by how simple the mistakes in Iowa's audit reports were, and how long they went unnoticed. Red Pen began as our research proposal for the Presidential AI Challenge on how Iowa local governments lose money to waste. In the Iowa State Auditor's reports, we kept finding the same pattern. In one county, $127,000 in duplicate payments went unnoticed for three years. Another report found $27.6 million in court debt that had been misallocated between 2021 and 2024. Meanwhile, property taxes rose in 91 of Iowa's 99 counties in 2024, so every wasted dollar came out of residents' pockets.

None of these mistakes were hard to catch. A computer can compare invoice numbers and payment dates in a fraction of a second. The problem was that many Iowa towns have no computer doing that work. About 76% of Iowa's municipalities have fewer than 2,500 residents, and many depend on one clerk who checks the books by hand in a spreadsheet. A traditional audit samples a small share of payments every year or two, so an error can stay in the books for years. Iowa's 3rd District has many towns of this size, so this was a local problem for us.

In June 2026, as part of the Presidential AI Challenge, we presented an early version of the project to Congressman Nunn at Capitol Hill. After that, we wanted to turn the proposal into a tool a clerk could open in a browser and use without installing or setting up anything.

We made one decision early: every finding had to explain its reasoning in plain language. A clerk who flags a payment has to justify it to the city council and to the residents who pay the taxes, so a risk score with no explanation would not help them. That decision shaped most of Red Pen. It only advises, it shows the numbers behind every finding, and it leaves the final decision to a person.


### 3. What technical difficulties did you face programming your app?

Our hardest problems were cases where the obvious approach flagged innocent payments.

The first was telling a duplicate payment apart from a normal recurring bill. Flagging every pair of equal payments would flag every monthly service contract. Our duplicate rule therefore skips equal payments 28 to 32 days apart, and prices that repeat across at least three billing months. The exception is a repeated invoice number, because paying the same invoice twice is a problem even when the amounts differ.

The second was stopping unusual spending from teaching the seasonal model that it is normal. The model predicts each category's monthly cost from the month of the year. If it trained on the month it was judging, an unusual expense would become part of "normal." So the engine splits each category's history into 12-month blocks and predicts each block with a model trained without it. A month must exceed the top of its expected range by more than $2,000 and by more than 25%, and the model needs 36 months of history. It reviews past spending and does not monitor payments live.

The third was combining detectors without blaming unrelated payments. The duplicate rule, the Isolation Forest, and the seasonal model often noticed the same payment, so one problem produced several alerts. When we merged everything that overlapped, one suspicious invoice could pull every payment from that month into its finding. The engine now merges only findings that involve the same transactions and attaches seasonal findings as context. A regression test checks that the split-purchase finding contains exactly three paving invoices.

The fourth was keeping the budget forecast stable. It compares each month with the same month a year earlier, limits extreme months, and runs 400 simulations to produce a range. On our fictional data, this lowered the average error across 14 category totals from 20.25% to 15.98%. We tuned it on the same year we measured, so this is a validation result, not a final test, and some categories are still off by more than 40%.

To test all of this, we built a fictional five-year town with ten planted problems based on real audit findings. The tests remove the answer labels and require identical results, so the engine cannot read the answers. Red Pen flags transactions from all ten problems, and 35 automated tests check the code.


### 4. What improvements would you make if you were to create a 2.0 version of your app?

The most important improvement would be a pilot with a real Iowa county that has towns of different sizes. Everything we have tested so far uses a fictional town, so we would run traditional audits alongside Red Pen to measure how often it is actually right.

Second, we would add direct imports from the accounting systems Iowa towns use, such as MUNIS, QuickBooks, and Caselle. Red Pen reads CSV files today and recognizes common column names, but we have not tested it on real exports from those systems.

Third, the review log needs to become a real audit trail. Right now, decisions and notes are saved in one browser and can be edited, and "marked for the council" is a recorded status that does not send anything. In version 2.0, the clerk, the finance committee, and the auditor would sign in to shared, secure accounts and see the same findings and the same history.

Fourth, we would make the analysis more complete and more rigorous. The duplicate rule would list every duplicate pair for a vendor, not only the strongest one. The seasonal model would be evaluated strictly on past data, the way it would run on a real city's books. The contract checker would be trained on real Iowa municipal contracts, since it is currently a prototype that relies on explicit rules and a small built-in training set.

Finally, we would add a plain-language page for residents that shows where their tax dollars went each year. Red Pen is built for clerks, but the people paying property taxes should be able to see the same picture.


### 5. Did you use AI in the creation, development, or functionality of your app?

Yes. We used AI coding assistants for much of the code, and we want to be specific about each use.

The tools were OpenAI's Codex and Anthropic's Claude (through Claude Code). Codex helped write and test the analysis engine: the Isolation Forest, the gradient-boosted trees, the seasonal ARIMA forecast, and the naive Bayes contract classifier. Claude Code helped design and write the user interface, the generator for our fictional sample town, the animated 3D opening of our video, and the tools that edited our recorded clips into the final video. We also used Claude to organize research for our Presidential AI Challenge proposal, to help write the narration for our demonstration video, and to edit the wording of these written answers. The app itself does not call any AI service. Its four models were written from scratch in JavaScript and run in the user's browser.

The problem and the research behind it came from us, starting with our national finalist Presidential AI Challenge proposal on waste in Iowa municipal spending. We chose which detection methods the app should use and why. We set the Iowa-specific rules and thresholds based on State Auditor findings, such as the 90-day window for duplicate payments and the line that flags a payment 25% above similar ones. We designed the ten planted problems in the sample town from real audit findings, which is how we measure what the app catches.

[NEEDS TEAM: one line each — David, Srihari, Alex — what you personally built]

We reviewed the code, ran its 35 automated tests, and recorded the narration for the video, and each of us can explain how the parts of the app work.


### 6. What did you learn or take away from participating in the Congressional App Challenge?

Our biggest takeaway is that the most useful parts of Red Pen are the simple ones. A clerk who flags a payment has to explain it to a city council, so a plain duplicate check with a clear explanation is worth more to them than a complex model they cannot defend. Machine learning helped most when it supported checks like that, for example by learning what normal spending looks like in each month so that routine winter snow-removal bills are not flagged.

We also learned that city finance is messier than we expected. Iowa Code Chapter 384 lets cities keep their books their own way, so one vendor can appear under several spellings, and a normal monthly bill can look exactly like a duplicate payment. Much of the logic in our engine exists to handle cases like these.

Our last lesson was about testing. We could not honestly say what Red Pen finds until we built a town where we already knew the answers. That test showed us what the app catches, and it also showed us limits we would otherwise have missed. In our sample town, an unusual July snow-removal bill is caught by the unusual-payment alert, not by the seasonal model, and the duplicate rule reports only the strongest pair for each vendor. Knowing those limits makes us trust the rest of the results more. It is also why we describe Red Pen as a tool that helps a clerk decide where to look, not a system that proves anything is wrong.
