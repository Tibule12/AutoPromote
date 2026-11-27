# Create a product-launch promo

Development documentation • product 1.2.0 • knowledge 1.0.72 • 2026-11-26

Overall feature ratings and working subfeatures are separate. PARTIAL or BROKEN does not mean every control fails; entries identify verified workflows, release state and the remaining limitation. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

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
- studio.export — **PARTIAL**: Downloads the exact completed movie. The released 45-second GPU export is verified, including a faster byte-identical retest. Strict size enforcement, Opus, Display P3 and SDR-mapped HDR10/PCM32 also have retained native local proof; those extensions have not reached the released build. PARTIAL applies to the wider delivery and compatibility scope.
- studio.media_ingest — **FUNCTIONAL**: Imports owned media into the ordinary project. A ready video can replace the entire source sequence at the same programme length while retaining timed graphics and soundtrack. Unused project media can be removed with Undo; source files remain stored.
- studio.templates — **PARTIAL**: Instantiates a pinned draft template into ordinary editable clips, layers, keyframes and audio. Retained signed-in local lifecycle evidence exists; public qualification and the showroom handoff remain incomplete.
- studio.keyframes — **FUNCTIONAL**: Edit property keys, spatial position handles and value/velocity graphs on the same editable project. Curve the route between paired positions while retaining ordinary history, saving and final compilation.
- studio.audio — **FUNCTIONAL**: Mixes owned original audio, master podcast, voiceover, music, B-roll and SFX buses. Cues and gain keys remain editable in the project.

## Result and limitations

An owned editable result with current revision and reviewed output; inspect the actual moving picture and sound.

- Follow the linked feature readiness; these steps do not promote the workflow to professional or production readiness.

Troubleshooting references: system.unsupported_media, studio.revision.
