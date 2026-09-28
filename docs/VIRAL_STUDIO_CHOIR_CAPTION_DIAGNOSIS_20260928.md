# Viral Clip Studio choir caption diagnosis — 2026-09-28

## Scope and source

This is a local diagnosis of `WhatsApp Video 2026-09-14 at 21.30.02.mp4` (3:30). The local file has the same 18,980,401 bytes and MD5 `a258d39422dd269a1796175221d4380d` as the uploaded video, although its local filename ends in `21.31.52.mp4`. A symlink with the requested filename was used for the local test. Filename spelling did not affect FFmpeg or transcription.

The diagnostic script from `agent/viral-studio-local-caption-diagnostics` was reviewed and used to probe audio locally. The worker model was then run in the repository's local Python environment with the same 16 kHz mono, 64 kb/s MP3 extraction and caption quality filter. Private raw transcript reports are kept in `/tmp/viralclip-caption-local-diagnostic.json` and `/tmp/viralclip-caption-local-translation-first30.json` with mode `0600`; they are not included here because the model text is unreliable and the source is user media.

## Results

| Local input                 | Engine and task                                                                | Detected language | Raw segments | Accepted segments |
| --------------------------- | ------------------------------------------------------------------------------ | ----------------- | -----------: | ----------------: |
| Choir, full 210.07 s        | `digiphyte/swivuriso-turbo`, faster-whisper CPU/int8, transcribe, empty prompt | `ru`              |           10 |                 0 |
| Choir, first 30 s           | Same model, translate to English, empty prompt                                 | `ru`              |            2 |                 0 |
| Talking-video control, 30 s | Same model, transcribe, empty prompt                                           | `en`              |            1 |                 1 |
| Choir, 30–75 s              | Generic Whisper large-v3-turbo CT2, transcribe, empty prompt                   | `en`              |            2 |                 0 |
| Choir, 75–210 s             | Same generic large-v3-turbo model                                              | `es`              |            6 |                 6 |
| Choir, 30–120 s             | Generic faster-whisper `small`                                                 | `en`              |            4 |                 2 |

The choir audio has an AAC stream. FFmpeg extracted it successfully; the full extracted track measured −14.5 dB mean volume and had no silence longer than one second at the diagnostic threshold. The full choir pass took 206.57 seconds. All ten raw segments were rejected. Every segment had low confidence; six had repeated character sequences and impossible character rates, while others had repeated tokens, repeated phrases, collapsed timestamps or repeated Cyrillic tokens. The translation pass likewise rejected both raw segments for repeated characters and implausible character rates. The model produced Cyrillic loops such as repeated `омахов...` and `олалала...`, not a defensible lyric transcript.

Earlier read-only worker logs showed that the speaker-aware provider lacked `OPENAI_API_KEY` and the original-language request fell back to local faster-whisper. The local diagnostic deliberately selected that same local engine without making a provider API call. English translation also uses the local engine.

The talking control took 39.79 seconds and retained one code-switched segment for review. This verifies that the same local model and filter can return captions for speech. A separate cached `small` model also produced no accepted choir lines, so switching blindly to it is not a demonstrated recovery.

A stronger generic Whisper large-v3-turbo model was tested on the 30–75 s choir window. It returned two repeated “oh la la” lines that the original filter rejected. The creator then confirmed that this refrain is genuinely sung many times, so the filter was too broad for that case. The later 75–210 s large-model window, however, produced Spanish text and the generic small model produced English “Give me love” lines where the creator identifies an isiXhosa verse. These plausible-looking lines passed the existing quality filter despite being wrong; therefore a generic model swap would be unsafe. Demucs source separation of the 30–75 s window completed locally, but the existing caption model still returned fabricated Cyrillic vowel loops and no accepted words. A 30-second local speaker-aware API attempt returned HTTP 403; production previously had no configured API key. Apart from that rejected API attempt, these probes ran offline. Neither a model swap nor vocal separation demonstrates reliable full lyrics for this recording.

The filter now permits a tightly constrained, high-audio-evidence “oh la” refrain as an **unverified review draft** while retaining hard rejection for pure syllable loops, impossible timing and Cyrillic corruption. This does not make the wrong Spanish/English verse outputs trustworthy, and the currently configured production model did not produce the refrain on this source.

The [isiXhosa Whisper-small fine-tune](https://huggingface.co/TheirStory/whisper-small-xhosa), trained on read speech, was also tested locally on a 75–105 s window. It returned only a fragmented syllable sequence, so it did not recover the creator's supplied verse. Its published speech benchmark does not establish singing accuracy. This model is not added to the deployed worker.

Audio playback was unavailable in this environment. The diagnosis can identify obvious text corruption, but it cannot certify the exact sung words or translation by ear. A provided lyric sheet or human review is needed for accurate choir captions.

## Failure path and local repair

The worker can return HTTP 200 with zero accepted segments after filtering hallucinated text. The backend previously marked that result `completed`; the Captions panel then showed a no-reliable-words message. For English translation, the panel checked translation proof before handling an empty result and misleadingly showed “The caption service did not confirm an English translation.”

The local repair marks a zero-segment transcription job as failed with a clear message, leaves its quality evidence in the job record, and removes the generic podcast hint from all transcription requests. The Captions panel now handles failed and unreadable job statuses, allows retry, preserves existing edited captions, and checks for zero usable lines before translation provenance. It never converts a filename or typed quick caption into supposedly recognized speech after automatic transcription fails.

The recovery workflow now adds a one-click `[Choir singing]` sound cue, or lets the creator paste/import a full lyric sheet as editable timed draft lines. Plain `.txt` is supported alongside timed SRT/VTT. Draft lines cover the selected source window, keep their clip identity for export mapping, preserve captions on other video windows, and require wording review before rendering. The creator can approve all source-supplied draft lines after checking them against playback. A short fragment does not occupy an entire long video. Creating a cue or draft clears the English-translation toggle because neither operation is a verified translation. This provides a truthful caption path for the exact video while preserving the distinction between a sound description, creator-supplied words, and automatically recognized speech.

Focused frontend caption tests, backend job tests, the frontend production build, secret scan and diff check passed locally for the initial repair. The new workflow passed focused UI and timing tests. Its sound cue was also converted through the worker's reviewed-caption and ASS generator and burned into a four-second excerpt of the exact local video with FFmpeg; the resulting frame visibly contains the cue. No changes were deployed or tested against production as part of this repair.
