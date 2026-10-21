# Product Knowledge System V1

The canonical source is `config/product-knowledge/knowledge.v1.json`, validated
by `contracts/product-knowledge-v1.schema.json`. The development snapshot is
product 1.2.0 / knowledge 1.0.0. Stable feature, control and task IDs are the
integration contract. Readiness is attached to every entry. This source audit
does not grant product, creative, publication or execution approval.

## Authoring and documentation lifecycle

Edit the JSON source, not generated Markdown or public bundles. Keep source
paths and literal anchors accurate; add retained evidence with its actual scope.
An unimplemented/proxy record may cite the exposed study or contract that
establishes the limitation. It must not claim a completed customer workflow.

1. Add/change the feature and its controls, guides and explicit graph edges.
2. Declare major surface coverage in `inventory.v1.json`. Required surfaces
   without an entry fail validation. Explicit adjacent deferred surfaces warn.
3. Declare `feature_id`, `documentation_impact`, `status_before`, `status_after`,
   source paths and reason in `change-impact.v1.json`. A status change requires
   READINESS impact. Post-change status must match the feature. These
   declarations describe a documentation review, not execution evidence.
4. Inspect the changed implementation and reconcile authoritative Studio
   readiness, exact template versions and runtime capability contracts. No
   PRO_READY/PRODUCTION_READY claim may bypass authoritative qualification.
5. Run `npm run knowledge:review -- --reviewer NAME --reason 'concrete audit reason'`
   after that review, then `npm run knowledge:build`, `knowledge:test` and
   `knowledge:check`. Review is explicit; build never silently refreshes it.

The review lock fingerprints the catalogue and linked implementation/evidence,
inventory, impact declarations, schemas, product version, Studio readiness,
parity, template and model contracts. A source/status change fails strict load,
validation, build and retrieval until documentation is reviewed again. An
authoritative readiness downgrade also rejects stale positive claims even
without the fingerprint check. `knowledge:check` rejects stale or obsolete
generated documents. Rebuilding prunes only old files owned by the generated
manifest, so removed capabilities do not leave a generated old claim behind.

This is a bounded audited inventory, not automatic discovery of every new
button. Authors must register new major surfaces. Broad changed-file discovery
and a mandatory repository CI gate are not installed by V1; use the check as a
required review/release step before any future documentation publication.

21 October assistance question qualification adds a rerunnable broad corpus at
`test/product-assistance/question-coverage.js` and
`scripts/check-product-assistance-questions.js`. It covers every public feature,
control and task, plus independent wording, typos, context, greeting, unknown and
privacy cases. Expected topic/control/guide checks are distinct from successful
transport. Exact names and aliases, bounded typo normalization and a precomputed
lexical index share the existing public catalogue; no model or action adapter is
introduced. Normal human questions containing contact details, source links,
paths or credential assignments are redacted before retrieval and journal writes.
Structured unsafe context and oversized/malformed payloads remain rejected.
Unknown questions ask for clarification; unsupported languages are not presented
as translated answers. A unique previous feature may supply a safe stable ID for
an ordinary follow-up, and Clear context removes it. Real network, validation and
rate-limit failures remain visible with appropriate retry guidance. Corpus
success is bounded question qualification, not proof of every possible question,
complete documentation, account diagnosis or product/creative readiness.

## Internal and public data

Internal JSON contains implementation references, abstract model capability
bindings, exact template bindings, retained private evidence references and
documentation qualification records. Do not serve this JSON as public data.
The public projection uses explicit allowed fields and PUBLIC visibility,
filters hidden relationships, and rejects common sensitive path/token/model
patterns in public prose. It omits source paths, example/evidence paths,
worker/checkpoint information, implementation field names and review records.
Private project objects, sources, prompts and credentials are never loaded by
the knowledge engine. The pattern guard is defense in depth; prose still needs
review before publication.

Generated `docs/product/` is the safe user projection, including Markdown,
`_data/knowledge.public.v1.json`, searchable JSONL and graph JSON. It is static
local output, not a deployed documentation endpoint. The full internal graph
is in the canonical catalogue; the public graph excludes model/runtime binding
nodes and private records. No public film, project, source media or login record
is copied into documentation.

## Contextual help integration contract

The existing control may pass `help_feature_id` and, optionally, `control_id`.
The engine accepts EXPLAIN, GUIDE, DIAGNOSE and CREATE. It returns the exact
feature, bound controls, task references, prerequisite readiness, limitations
and product/knowledge versions. Unknown IDs and mismatched controls are errors.

```js
const { contextualHelp } = require('../../src/productKnowledge');
const result = contextualHelp({
  help_feature_id: 'studio.compositing.text_behind_subject',
  mode: 'GUIDE',
  control_id: 'studio.subject.font_size',
});
// result.read_only === true; result.actions is empty.
// result.execution_authority === 'NONE'.
```

The offline test exercises all four modes for Motion Keyframes, Cam channel
mapping and real Text Behind Subject. No frontend help widget is installed.
This avoids implying a deployed assistant from a read-only contract proof.

A future assistant may receive selected feature/layer identity, a sanitized
current project summary, current availability and Director evidence from
trusted server adapters. These are separate current-state inputs, not facts
stored in this dated documentation snapshot. It should retrieve source records,
cite stable IDs and versions, explain unavailable prerequisites, and label
proxy/partial/broken features explicitly. CREATE remains explanation until an
ordinary reviewed Studio proposal and normal authorization/cost checks permit
an action. Never give retrieval arbitrary project mutation or shell authority.

## Retrieval and external consumers

`searchKnowledge(query, {limit})` is bounded offline lexical search. It includes
explicit related concepts for comparisons and returns IDs, readiness, versions
and complete projected records. It is not an LLM, embedding service or semantic
availability judge. JSONL is suitable for future search/embedding ingestion;
graph edges express requires, optionally_uses, editable_with, usable_in,
rendered_by, proxy_for and related_to.

An external assistant can consume the safe bundle, cite the exact feature/task
and control IDs, and follow dependency edges. It must check the current product
before describing account-level availability or requesting generation. Six
founder-specified retrieval questions are covered by the offline tests.

## Three first documentation qualifications

- **Motion / Transform Keyframes:** ordinary deterministic layers, actual
  transform ranges, static anchors versus animated properties, key times,
  easing/curves, shared history/reopen/render behavior and retained native
  evidence. FUNCTIONAL applies to the supported subset; whole-stage parity is
  unqualified.
- **Cam Combiner:** source count, deterministic sync/master audio/drift,
  reviewed stereo channel mapping, activity-based switching/reactions/layout,
  review and export. Documentation is source-qualified; the workflow remains
  PARTIAL. No Cam behavior was modified or executed by this task.
- **Text Behind Subject / Tracking:** owned real subject masks and bounded
  artifact-backed effects versus separately identified browser studies;
  range/point/parameter constraints, availability, scene review/export rules,
  optional unimplemented metric depth and no invented feather/expansion fields.
  Real text-behind remains PARTIAL and Creator placement remains PROXY_ONLY.

Qualifications assert documentation accuracy against sources and retained
evidence. They do not assert new authenticated testing, moving-film creative
review, professional quality, model availability or release approval.

## Known coverage boundaries and next batch

V1 has 102 internal features, 105 control records, 18 task guides and ten
explicit deferred surfaces: team, rewards, notifications, profile, security,
earnings, mission control, smart promo, memetic composer and the existing chat
assistant. Private image/narration provider records are INTERNAL, leaving 100
features in the public projection. All four current shared template versions
and all five registered abstract runtime capabilities resolve.

Important specialized controls remain to audit in a later batch: full caption
typography/word review, publish/scheduling provider-specific restrictions,
additional source framing/finishing/SFX/3D preset fields and account entitlements.
Do not infer them from labels or treat the 105 records as all product controls.
Start the next batch with the caption defect/review workflow and preview/render
failure diagnosis, then publishing/account/security surfaces. Product work
continues at shared S02, then S03/S04; the model runtime and template/showroom
backlogs remain unchanged.
