# Documentation chatbot question coverage — 21 October 2026

The owner requested broad real-user question testing, beyond checking that the chatbot responds. The local Ask AutoPromote documentation chatbot at **http://localhost:5006/** now passes 1,314 defined question cases containing **490 distinct question texts**, across 24 categories. The same corpus passes the real HTTP boundary, and 26 representative questions pass through the actual signed-in browser UI with no visible errors or browser exceptions.

## What the tests found and repaired

The initial baseline contains 15 rejected human questions and 245 other failed topic/control/guide assertions under its initial relevance checks. Questions with an email, source URL or error path were rejected. Common requests such as splitting, trimming, Undo, audio repair, account help and publishing could resolve to unrelated features. Topic shortcuts could override exact current feature names, aliases and controls. Repeated tokenization also made broad retrieval unnecessarily slow. Raw `before.json` remains local; the [verification summary](verification-summary.json) records the results and evidence/source hashes.

The repair uses the existing public knowledge catalogue with precomputed lexical records, explicit name/alias matching, bounded typo correction, contextual control matching and more precise topic precedence. “Background music” and “background noise” lead to the relevant sound feature, rather than visual background replacement. General logo questions can reach the documented native Logo Workshop and motion features. The strengthened final assertions check the leading topic for independent wording, as well as required controls, guide IDs and unchanged readiness.

Normal human questions containing contact details, links, paths or credential assignments are redacted before retrieval, receipts or gap journaling. They receive an answer and a privacy notice. Incomplete URL/credential fields are covered too. Unsafe structured context, malformed JSON and oversized payloads retain controlled rejection. Unknown error-code lookup cannot treat inherited object properties as documented errors.

Greetings receive a useful introduction. Unresolved questions receive a clarification response; unsupported language input remains a documented gap instead of an invented translation. An unambiguous prior answer supplies only a stable feature ID for an ordinary follow-up such as “Where is it?”; Clear context removes it. Network failures, throttling and malformed responses have specific retry guidance. A genuine service failure is not presented as a successful answer.

## Coverage and evidence

| Coverage | Final evidence |
| --- | --- |
| 104 public feature names in three modes | All expected feature IDs present; hidden entries remain excluded |
| 104 selected features with follow-ups in three modes | Safe feature identity retained |
| 39 aliases, 195 public controls, 18 task titles in three modes | Expected feature/control/guide references present |
| Independent wording across editing, motion, sound, captions, compositing, graphics, multicam, Director, generation, templates, publishing, exports, accounts, costs and processing | Expected leading topic checked for ordinary single-topic questions |
| Greetings, typos, unknown codes, unrelated/non-English questions, privacy text, Unicode and code-like text | Structured bounded replies without execution; privacy values excluded from receipts |
| 1,314 cases through the actual HTTP parser/router | 1,314 HTTP 200 replies and relevance assertions; no mocked reply bodies |
| Rate-limit and invalid-payload boundary | Thirty-request quota retained; the next request receives controlled 429 with Retry-After; invalid JSON/context and oversized bodies receive controlled 400/413 |
| Actual signed-in local app | 26 questions, all three modes, real follow-up, privacy notice, unknown-code/gap responses, zero alerts/exceptions and only documentation POSTs |

- [Reproducible corpus](../../test/product-assistance/question-coverage.js), [runner](../../scripts/check-product-assistance-questions.js), [verification summary](verification-summary.json). Full `after.json` and `http-proof.json` remain local and are reproducible from the corpus.
- HTTP/regression tests: 51 pass, containing the broad service/HTTP corpus assertions. Frontend tests: eight pass. Generated knowledge check passes for 42 files; the ten existing deferred-surface warnings remain. Studio contract validation retains its existing counts. Raw logs remain local as `qualification-tests-final.log` and `frontend-tests.log`.
- The authenticated browser runner, logs, `browser-proof.private.json` and screenshots remain local. Representative captures are `question-6.png` (safe follow-up), `question-9.png` (voice noise), `question-10.png` (caption typo), `question-11.png` (Logo Workshop), `question-20.png` (redacted email), `question-21.png` (unknown question) and `question-23.png` (unsupported language).

The HTTP corpus uses isolated test fixtures with normal rate limiters and an isolated receipt service. It does not send 1,314 requests into a user's quota or replace retained user receipts. The signed-in browser uses the actual running local backend and real saved Firebase authentication, without route/auth/reply mocks. Only authentication is imported into its temporary context; no project is opened. The retained session file stays byte-identical with all 43 project records.

## Local activation and remaining scope

The normal integration API on port 5145 is gracefully reloaded with its original environment and background scheduling disabled. Its configured CPU worker8045 is absent; the separate podcast API5119 and CPU workers remain untouched. The local page receives the corrected production-configuration build. The prior served build remains in `reports/footer-pages-20261021/site-build.before-question-coverage-20261021`, and its hashed chunks remain available for already-open tabs. Refresh the local page to load the new chatbot UI. Activation/process receipts and `build-correct-api.log` remain local. A build targeting the wrong API port is rejected before activation and retained separately. The first browser pass also remains in `first-browser-pass`.

The source review lock fingerprints both new assistance modules. A concurrent inspector/CI evidence edit is reconciled through explicit review before activating the new service; strict validation is retained. Current catalogue facts, generated guides, feature readiness and execution authority are unchanged. No Studio project/media edit, render, provider/model generation, paid GPU work, publishing, deployment or main merge occurs. Existing source edits, films, login, schedules and timers are retained.

This is **bounded routing, protocol and UI qualification**, not proof that every possible user question has a complete answer. The assistant is still grounded in the documented catalogue. Some feature workflows remain generic, deferred surfaces remain undocumented, and current account-specific causes, unsupported languages or missing procedures need further documentation or clarification. For example, the account record does not constitute a complete account-support knowledge base. Successful topic matching is separate from a human review of the usefulness of every answer. Keep these gaps visible; never label this universal question-answering or complete product/creative readiness.

Next: retain this corpus as a regression check while expanding real source-backed answers from observed gaps. Preserve the separate ongoing CI/CodeQL work and shared Studio visual/preview/motion/ownership blockers.
