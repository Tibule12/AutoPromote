# Modify Director edits manually

Development documentation • product 1.2.0 • knowledge 1.0.21 • 2026-10-15

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.director_manual` • **PARTIAL** • SUPPORTED_WITH_LIMITATIONS

Reviewed Director changes and manual controls share the same project graph.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. Review source/evidence and the current revision-bound proposal.
   Feature: `director.evidence`.

2. Apply only a valid reviewed proposal.
   Feature: `director.review`.

3. Select ordinary clips/layers/audio and modify supported native controls; undo/redo stays available.
   Feature: `studio.transforms`. Controls: [studio.transform.x](../control-reference/index.md#studio-transform-x), [studio.transform.scale](../control-reference/index.md#studio-transform-scale), [studio.transform.opacity](../control-reference/index.md#studio-transform-opacity).

4. Save/reopen and export the current revision; stale proposals need fresh review.
   Feature: `studio.revision`.

## Feature readiness

- studio.keyframes — **FUNCTIONAL**: Edit property keys and sampled motion paths directly over the picture, or shape value/velocity curves in the timeline. Manual edits, Director/template keys, saving and export use the same canonical animation data.
- studio.audio — **FUNCTIONAL**: Mixes owned original audio, master podcast, voiceover, music, B-roll and SFX buses. Cues and gain keys remain editable in the project.
- studio.undo_redo — **FUNCTIONAL**: Uses the shared command history to restore edits and redo them with revision-aware state. It is not permission to mutate a different revision silently.
- director.evidence — **FUNCTIONAL**: Binds suggestions to owned source, analysis/artifact evidence and the current project revision. Unsupported visual claims are not acceptable evidence.
- director.review — **FUNCTIONAL**: Reviews and applies a proposal against its current revision and operation preconditions. A stale proposal needs fresh review.
- studio.transforms — **FUNCTIONAL**: Edits position, scale, rotation, anchor, crop and opacity of ordinary layers. Native transform animation is preserved after save and reopen.
- studio.revision — **FUNCTIONAL**: Preserves canonical revision and provenance for manual edits, Director proposals, artifact review and output binding. Stale proposals must be reviewed again.

## Result and limitations

An owned editable result with current revision and reviewed output; inspect the actual moving picture and sound.

- Follow the linked feature readiness; these steps do not promote the workflow to professional or production readiness.

Troubleshooting references: system.unsupported_media, studio.revision.
