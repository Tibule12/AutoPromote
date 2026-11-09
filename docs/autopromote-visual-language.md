# AutoPromote visual language

## Direction

AutoPromote is a creator's cutting room: expressive footage inside a precise,
calm workspace. The signature is a violet edit line and a diagonal cut mark.
These connect the public site's wordmark, film framing, chapter controls and
motion transitions. The current film is recorded software, edited with FFmpeg.
It is not an After Effects export or an AI generated video.

- **Palette:** ink `#080a12`, white `#f4f0ff`, violet `#a18aff`. Violet marks
  an active choice, a cut or a playhead. Use charcoal space around the footage.
- **Type:** a strong sentence, then a short explanation. Keep titles on a matte,
  away from working controls. Give actual UI closeups enough time to be read.
- **Motion:** establish the workspace, cut to the important control, show the
  result. Repeat this rhythm through the product film. Motion follows an edit.
- **Sound:** a quiet original two-note pulse accompanies the current tour.
  No speech, invented interview dialogue or licensed music is present.
- **Imagery:** people creating and the software responding to their choices.
  Use original or licensed video with an asset receipt. Label sample metrics.

## Current four-chapter film

| Chapter | Time | Recorded action | Editorial treatment |
| --- | --- | --- | --- |
| Uploads | 00:00 | Choose footage, review destinations and open customization | Workspace establishing shot, destination closeup |
| Studio | 00:09 | Choose the output frame, compare source and edit, split the actual timeline | Moving previews, then the real split control and resulting clips |
| Schedule | 00:18 | Inspect queued posts and switch to the calendar | Queue context, then the calendar |
| Analytics | 00:27 | Read platform performance and change the date range | KPI context, then platform comparison |

Every page is the existing application, captured in a local sample workspace.
Publishing data and analytics are fixtures. The capture sends no production
requests or publishing actions. The film clearly labels sample workspace and
metrics. The original dashboard, editor and auth source remain unchanged.

The homepage and Watch Demo share one player. Film data loads on an explicit
play or chapter selection. Native controls and English captions remain available.
Offscreen/hidden playback pauses; unmount releases the source. Reduced motion
keeps the poster until the visitor chooses playback.

## Expand the AutoPromote film library

Produce short, individually reviewable shots with this same visual language:

| Asset family | Production method | Creative brief |
| --- | --- | --- |
| Creator opening | Original filming or image-to-video | Intimate podcast room, natural gestures, practical violet rim light, restrained camera movement |
| Uploads / media library | Record the actual app | Bring multiple takes into the workspace; focus on choosing and organizing footage |
| Deep editing | Record the actual app | Show a cut, reframing, captions, a visible before/after and the resulting timeline |
| Publishing / scheduling | Record the actual app with sample data | Follow a reviewed clip to platform customization and the calendar |
| Analytics | Record the actual app with sample data | Read the metric, change the range and show the next useful decision |
| Brand transitions | Code composition or After Effects | A violet cut passes through a frame and reveals the next chapter |
| Social campaign variants | Edit approved source masters | Export a readable 9:16 film with its own composition; keep brand titles separate from generated footage |

Generative footage supplies creator scenes and B-roll. Interface text, actions,
metrics, typography and logos are composed from actual software or authored
layers. Each generation needs a fixed brief, seed, model/checkpoint identity,
source-image provenance, output receipt and visual review before homepage use.
A generated clip is not proof that a software feature ran.

## GPU findings and the generation pilot

The [GPU audit](../reports/public-product-tour-20261006/gpu-audit.json) verified:

- Local Quadro M1200: 4 GB VRAM. The actual tour encoded with NVIDIA H.264 NVENC.
- `autopromote-cc6d3`, Compute Engine, `us-central1`: regular L4 quota **16**, usage
  **0**; preemptible L4 quota **16**, usage **0**. No Compute Engine VMs exist.
- Project-info returned no global GPU quota metric. Cloud Run GPU quotas and
  zone allocation capacity have not been verified by this audit.
- No cloud infrastructure was changed; no generative model has been installed
  or executed. Quota alone does not establish an available inference worker.

[Google documents 24 GB of GPU memory for G2's NVIDIA L4](https://docs.cloud.google.com/compute/docs/accelerator-optimized-machines).
[Wan2.2 documents TI2V-5B text/image-to-video at 720p and a 24 GB configuration using offload](https://github.com/Wan-Video/Wan2.2).
That makes one L4 a candidate for a small generation pilot; memory use, host RAM,
throughput and visual quality still need a measured inference run.

The concrete next GPU job is one short creator opening from an approved source
image, followed by a restrained movement variant. Record inference time, peak
VRAM, cost and the resulting clip. Review temporal consistency and composition
before extending the library. The earlier homepage brief explicitly prohibits
GPU infrastructure changes, so provisioning remains outside this local tour
implementation.

## Motion implementation classification

| Sequence | Class | Current implementation / later authoring |
| --- | --- | --- |
| Headline reveals and chapter controls | A — live web | Native DOM, masks, accessible buttons |
| Camera panels, programme frame and social crops | C — Three.js | One shared video texture per visible scene |
| Scroll-driven editing sequence | D — hybrid | DOM chapter narrative with a Three.js composition |
| Actual product tour | D — hybrid | Browser recording, offline FFmpeg edit, NVENC encoding, native web playback |
| Future signature transitions and original opening | B — After Effects | Candidates for an authored film; no AE assets are supplied yet |
| Future generated creator footage | D — hybrid | Model output as source footage, then an authored edit with real recorded UI |
