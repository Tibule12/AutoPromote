# Create a product-launch promo

Development documentation • product 1.2.0 • knowledge 1.0.6 • 2026-10-13T19:00:52.939796Z

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.product_launch` • **PARTIAL** • SUPPORTED_WITH_LIMITATIONS

Apply the shared launch draft to owned footage and branding; distinguish your timeline cuts from cuts already inside sources.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. Import owned product footage and logo inputs.
   Feature: `studio.media_ingest`.

2. Select the exact draft launch definition and bind its footage/copy/music slots.
   Feature: `studio.templates`.

3. Refine layer movement in the native timeline and inspect the actual cuts.
   Feature: `studio.keyframes`. Controls: [studio.keyframe.time](../control-reference/index.md#studio-keyframe-time), [studio.keyframe.easing](../control-reference/index.md#studio-keyframe-easing), [studio.transform.scale](../control-reference/index.md#studio-transform-scale).

4. Place music and sound cues, listen, then export.
   Feature: `studio.audio`.

## Feature readiness

- creative.story — **PARTIAL**: Current launch and cycling drafts organize owned footage, typography, feature beats and CTA into native projects. Pre-cut source footage is documented as such.
- studio.export — **PARTIAL**: Requests a final movie and downloads the exact completed output after applicable ownership and review checks. Full preview parity and all product combinations are not qualified.
- studio.media_ingest — **FUNCTIONAL**: Imports supported owned video, image and audio into canonical assets. Decoding, source validation and ownership checks still apply.
- studio.templates — **PARTIAL**: Instantiates a pinned draft template into ordinary editable clips, layers, keyframes and audio. Retained signed-in local lifecycle evidence exists; public qualification and the showroom handoff remain incomplete.
- studio.keyframes — **FUNCTIONAL**: Adds property keys to a selected ordinary layer, moves them in the timeline and interpolates poses. Retained evidence covers native controls, undo/redo, reopen and export; whole-stage agreement is still partial.
- studio.audio — **FUNCTIONAL**: Mixes owned original audio, master podcast, voiceover, music, B-roll and SFX buses. Cues and gain keys remain editable in the project.

## Result and limitations

An owned editable result with current revision and reviewed output; inspect the actual moving picture and sound.

- Follow the linked feature readiness; these steps do not promote the workflow to professional or production readiness.

Troubleshooting references: system.unsupported_media, studio.revision.
