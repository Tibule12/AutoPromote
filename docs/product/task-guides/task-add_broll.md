# Add B-roll

Development documentation • product 1.2.0 • knowledge 1.0.16 • 2026-10-15

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.add_broll` • **PARTIAL** • SUPPORTED_WITH_LIMITATIONS

Use owned source footage or an accepted real generated shot as editable material.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. Import owned footage or review/accept a generated B-roll request.
   Feature: `studio.b_roll`.

2. Place the shot on the native timeline, trim it and inspect its framing.
   Feature: `studio.trim`.

3. Adjust sound, save the ordinary project and export.
   Feature: `studio.audio`.

## Feature readiness

- studio.generated_video — **PARTIAL**: Requests a bounded generated shot, reviews it and imports an accepted owned video into the canonical project. Provider availability, account entitlement and normal-account lifecycle remain partial.
- studio.b_roll — **FUNCTIONAL**: Places owned B-roll as ordinary editable video occurrences or layers and mixes its sound where selected. Source cuts already inside a supplied clip are not newly authored timeline cuts.
- studio.trim — **PARTIAL**: Changes the retained source range of an occurrence and rebases linked timing. This is a source edit rather than merely hiding a browser element.
- studio.audio — **FUNCTIONAL**: Mixes owned original audio, master podcast, voiceover, music, B-roll and SFX buses. Cues and gain keys remain editable in the project.

## Result and limitations

An owned editable result with current revision and reviewed output; inspect the actual moving picture and sound.

- Follow the linked feature readiness; these steps do not promote the workflow to professional or production readiness.

Troubleshooting references: system.unsupported_media, studio.revision.
