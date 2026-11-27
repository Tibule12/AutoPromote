# Verified functionality and release status

Updated 22 November 2026. A working feature, its wider limitations and its release state are separate facts. A family marked PARTIAL or BROKEN can contain tested, working controls. The status must say which behaviour still fails; it must not erase a successful workflow.

| Feature or workflow | What the retained proof establishes | Release state on 22 November | Remaining limits |
| --- | --- | --- | --- |
| Caption spelling context and correction | **Working in the tested local build.** 104 focused checks and a real signed-in human-speech workflow cover saved names/terms, caption editing, Undo/Redo, exact save/reopen, an eight-second native export and finished playback. Supplying “Ann” corrected “Anne” on the same recording. | This expanded workflow is outside main. The live app has its existing caption editor; the extra controls must not be advertised as deployed. | Recognition can still mishear words and numbers. Broad accents, noise, code-switching, gap-only and multilingual flows remain separate. |
| Uncertain-word review and missing-speech markers | Exact word highlighting/selection, next-issue navigation, editable gaps, approval guards and persistence have passing component, worker and helper checks. The human-speech follow-up also tests local speech-activity detection. | Retained local implementation outside main. | The evidence does not establish a complete native lifecycle for every gap-only or multilingual case. This is correction assistance, not a claim of perfect ASR. |
| Maximum file size | **Working in the tested local build.** A normal 12-second export selected a 1 MB maximum and delivered 941,576 bytes, with exact download, decode, save/reopen and recorded playback. The implementation measures finished bytes. | Strict measured enforcement is outside main. Main contains bitrate/size-budget estimation; that is a different contract. | An impossible size request is refused. Long jobs and all delivery combinations were not qualified. |
| Opus audio and Display P3 delivery | **Working in the tested local build.** The native H.264/Opus/Display P3 file downloads, decodes and plays with pictures; its Studio recording and original movie remain intact. | Outside main. | This is a specific delivery case, not broad player/device compatibility. |
| HDR10 mapping and PCM32 delivery | **Working for the tested external-decoder delivery.** The native 12-second HEVC/PCM32 movie fully decodes externally and remains downloadable. | The additional mapped-colour/PCM32 implementation is outside main. Main separately supports ProRes/MOV with PCM. | This is SDR mapped to 100-nit PQ, not a full HDR grading pipeline. The tested browser could not decode its pictures; that limitation remains explicit. |
| Node Flow repair | **Passed in the retained local test build.** Six fixed picture comparisons and three native playback profiles pass; the report also retains 178 frontend cases, 258 renderer cases plus 13 subtests, and exact native save/reopen and control evidence. | The repaired Node path is represented in main. The dated proof belongs to its recorded build. | Separate Node/VFX edits made on 22 November need matching-version evidence review. The older pass does not certify all later edits or every combination. |
| Original frame styles and sound cues | **Verified in production.** A 45-second editable project uses 120 layers, 25 moving windows, 136 keys, 12 sound cues and its original score. Native restore, render, download and complete finished playback with sound pass. | Deployed. | This does not establish every template, voice-recording path or concurrent-user workload. |
| GPU render optimization | **Verified in production.** The same export completes in 133.335 seconds instead of 348.134 seconds. The finished MP4 is byte-for-byte identical. One retest charged five app credits. | Deployed through PR #554. | One comparison is not a capacity, cold-start, forced-failover or service-level guarantee. Google invoice savings were not measured. |
| Accurate paused frames for a larger source | **Verified live on the retained 293.7 MB podcast.** The authenticated original-clock PNG request returns HTTP 200 with matching source identity. | Deployed through PR #554. | Up to 512 MiB per source on disk-backed hosts, with shared storage/admission limits and a 90-second request window. RAM-backed temporary storage retains a smaller allowance. Whole moving-preview parity remains separate. |

The three export movies and their Studio recordings, plus the caption vocabulary movie, were checked again on 22 November: all seven retained files match their recorded SHA-256 values. No film or private recording is made public by this documentation update.

## How to read the existing labels

- **Captions — BROKEN overall:** automatic recognition still has measured wording failures. The correction, spelling-context and review features above have their own passing evidence; they are not being called broken.
- **Export — PARTIAL overall:** supported delivery paths work. Other controls are either separately verified locally, absent from the released build, or have specific compatibility limits.
- **Compositing and preview — PARTIAL overall:** passed Node comparisons and completed-film playback remain valid. Broad predictive picture/sound agreement and every layered combination remain open.
- **Voiceover/SFX — PARTIAL as a combined family:** the production sound-cue workflow above works. That does not establish every microphone/voiceover roundtrip or mix.

The formal register still contains 29 capability families. Its unchanged 17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED counts describe those families, not a count of every working subfeature. Zero PRO/PRODUCTION qualifications are claimed for the complete product.

## Other local work

The isolated AI Product Demo Studio implementation is on its separate local branch and is absent from main. This reconciliation does not supply a full lifecycle or production qualification for it. Additional local Node/VFX edits include keyer animation, light wrap, mask tools and stereo-panning work; they must be compared with evidence for their exact revision before release.

## Evidence

- [Retained local proof manifest and hash checks](../reports/studio-feature-documentation-20261122/retained-local-proofs.json)
- [Node repair measurements and limits](../reports/studio-node-repair-20261116/README.md)
- [Actual production release and render receipts](../reports/studio-render-throughput-20261122/release-verification.json)
- [Original frames and sound delivery](../reports/studio-original-frames-20261122/README.md)
- [Capability register](../test/e2e/studio-capability-matrix.json)

This is an evidence reconciliation and documentation update. It does not merge the separately retained implementations, run another paid job, publish a film or change billing, permissions or feature flags.
