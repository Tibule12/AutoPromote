# Animate a person from an image

Development documentation • product 1.2.0 • knowledge 1.0.13 • 2026-10-14T16:13:51.506436Z

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.animate_person` • **PARTIAL** • INTERNAL_REVIEW_ONLY

Use the image-conditioned workflow and inspect identity/anatomy/motion; moving does not mean speaking.

## Before you start

No additional requirement recorded.

## Steps

1. Import an owned or appropriately permitted image.
   Feature: `studio.media_ingest`.

2. Request and review an image-conditioned moving scene if the capability is currently available.
   Feature: `generation.human_animation`.

3. Import only an accepted owned video and continue native editing.
   Feature: `generation.scene_workflow`.

## Feature readiness

- studio.media_ingest — **FUNCTIONAL**: Imports supported owned video, image and audio into canonical assets. Decoding, source validation and ownership checks still apply.
- generation.human_animation — **PARTIAL**: Image-conditioned moving footage can contain a person; consistent identity, exact actions and public qualification are not guaranteed. A moving person does not demonstrate speaking.
- generation.scene_workflow — **PARTIAL**: Plans a bounded shot, requests it, reviews the returned video and imports only an accepted owned asset into the same canonical project.

## Result and limitations

An accepted owned image-conditioned moving shot, when execution is available; no speaking/lip synchronization claim.

- Image-conditioned motion is partial; talking/lip synchronization is unimplemented. No universal self-service person-animation availability is qualified.

Troubleshooting references: system.unsupported_media, studio.revision.
