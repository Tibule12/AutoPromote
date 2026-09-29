# Viral Clip Studio semantic timeline contract (v1)

`frontend/src/components/studioSemanticTimeline.js` defines the first data boundary for reusable analysis evidence. It is a contract and validator. It does not run a model, choose an edit, alter a project, or start a render.

## Identity and storage

An analysis run yields an immutable manifest plus optional large artifacts. The manifest identifies the source by **SHA-256 of its bytes**, an immutable asset ID, source duration in integer ticks, and the Studio clock of 90,000 ticks per second. Every record has a source time range in the `{ space: "source", startTick, endTick }` form. Ranges are half-open; shot and scene boundary markers are points with `startTick === endTick`.

The manifest contains one versioned list of typed records. Its `artifacts` entries hold an artifact ID, content SHA-256, owned storage key, and media type. `artifactRefs` in records point to those entries. Word arrays, dense visual tracks, waveforms, depth maps, and mattes belong in separate blobs, not in each saved project version. Storage code should verify the blob's hash on write/read and resolve access-controlled storage keys at read time. Signed URLs are temporary transport values and fail this contract's storage-key check.

A project snapshot should retain only `createSemanticAnalysisReference(...)` output: `artifactId`, manifest hash, source hash, cache key, kind, and schema version. The new reference is additive. `appendSemanticAnalysisReference` keeps earlier artifacts on a rerun, even if two runs share the same cache key. It has no path to an edit node or accepted human decision. A later project command may select a reference, but applying an editorial hypothesis to a timeline requires a separate validated edit command and revision check.

The current Studio project store uses IndexedDB `projects` records with full editable snapshots and up to twelve checkpoint versions (`viralStudioProjectStore.js`, `ViralClipStudio.js`). This new artifact contract does not migrate those snapshots. The existing promo-summary reuse path in `src/routes/clipRoutes.js` can key by a source fingerprint, storage path, content ID, or URL; it is a different cache and is **not** semantic evidence under this contract. A semantic producer must hash actual source content before claiming a semantic cache hit.

## Cache identity

`buildSemanticAnalysisCacheKey` includes:

1. the source bytes' SHA-256;
2. analysis type;
3. model revision;
4. settings schema/config revision; and
5. SHA-256 of the exact settings/config values.

The key format is `semantic:1:<source-hash>:<analysis-type>:<model-revision>:<config-revision>:<config-hash>`. A producer is responsible for deterministic config serialization before hashing. Merely renaming a file or changing an expiring URL leaves the key unchanged; changing the source bytes, model, or a setting changes it. Analysis artifacts and project revisions have separate identity and lifecycle.

## Record semantics

Each record has `schemaVersion`, `id`, `type`, `sourceRange`, `provenance`, `verification`, `uncertainty`, and `artifactRefs`. Provenance records provider, model, model revision, config SHA-256, and run ID. Verification distinguishes unverified, needs review, human verified, and rejected; human verification requires a reviewer and time. Uncertainty is a qualitative level plus its basis. The schema rejects free-floating numeric `confidence` or `probability` claims; model scores must not be presented as calibrated probabilities.

The fifteen v1 record types are observations, utterances, word-alignment references, voice clusters, visual tracks, speaker/visible-person associations, shot boundaries, scene boundaries, audio events, music/speech activity, prosody/emphasis, OCR/entity evidence, editorial hypotheses, chapters, and coverage. Coverage can state complete, partial, failed, or not analyzed for a source interval; absence of an observation cannot imply absence of an event outside covered intervals.

A voice cluster is an acoustic grouping. A visual track is a visible subject grouping. `speaker_visible_person_association` links those records as co-occurring, likely speaking, or human confirmed. It carries evidence references and cannot contain an actual person's identity. A human-confirmed association additionally needs a human-verified receipt. Any later identity claim needs its own evidence and review contract.

Hooks, payoffs, important claims, reactions, boring sections, and chapter titles are editorial hypotheses. They require links to evidence records and remain hypotheses even if a model generated them. The validator rejects a hypothesis citing another hypothesis or chapter as its only evidence. Nothing in this manifest is executable editing state.

## Compatibility boundary

Workers may emit this JSON shape and store the result as an owned artifact. The browser can validate and display it, then attach the small immutable reference to a versioned project document. Browser preview and final render continue to consume the existing edit state until a separate command accepts a particular proposal. Older Studio projects and existing clip-analysis responses have no semantic reference and continue to load. A future adapter should reject unknown record versions explicitly and never silently reinterpret source ticks as programme ticks.
