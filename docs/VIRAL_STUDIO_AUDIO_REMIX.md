# Viral Studio Remix Audio

8 November: Live Edit pitch now uses a pinned, locally served Signalsmith
Stretch WASM processor instead of the original per-bin FFT remapper. The
existing node, EQ/reverb graph, preset parameters and programme speed contract
remain. The module compiles before audio-thread instantiation, fades into the
prepared processor and clears old speech on seeks; failures retain dry sound.
Its measured stereo latency is 96 ms at 48 kHz. Live EQ/reverb/dynamics remain
an approximation of final Rubber Band mastering, not a sample-exact substitute.
See [repair evidence](../reports/studio-remix-clarity-20261108/README.md).
The vendored MIT source, extracted binary and derivation hashes are recorded in
`frontend/public/vendor/signalsmith/provenance.json` and `LICENSE.txt`.

30 October: **Chipmunk** joins the existing presets, raising the voice by one
octave at unchanged picture timing. Use **Preview Remix** to hear the same
independent pitch chain used in export; the immediate Web Audio monitor only
approximates EQ, reverb and speed. [Repair and verification](../reports/studio-cut-controls-20261030/README.md).

This branch is intentionally based on `agent/viral-studio-motion-sound` so the
feature can be ported into a newer Studio without merging the older screen.

## Portable files

- `frontend/src/components/audio/AudioRemixPanel.js`
- `frontend/src/components/audio/audioRemix.css`
- `frontend/src/components/audio/audioRemixModel.js`
- `frontend/src/components/audio/audioRemixPreview.js`
- `frontend/src/components/audio/audioRemixTimeline.css`
- `python_media_worker/viral_audio_remix.py`

## Integration points

- Mount `AudioRemixPanel` in the Sound inspector.
- Persist `audioRemix` in editor history.
- Call `updateAudioRemixPreview` for live browser playback.
- Subscribe to `subscribeAudioRemixMeter` for the live peak/clipping meter.
- Send `audioRemixForRender(audioRemix)` as `audio_remix`.
- Accept `audio_remix` in `RenderViralRequest` and call
  `render_audio_remix` after the base MP4 is rendered.
- Send the selected loop to `/api/media/preview-audio-remix`; the worker caps
  it at eight seconds and returns an AAC preview from the final mastering chain.

## Version 1 render contract

```json
{
  "version": 1,
  "enabled": true,
  "preset": "slowed_reverb",
  "speed": 0.82,
  "pitch_semitones": -3,
  "bass_db": 4,
  "clarity_db": 2,
  "air_db": 1,
  "reverb_mix": 0.68,
  "intensity": 0.7,
  "keep_pitch": false,
  "content_type": "choir",
  "target": "master",
  "output_gain_db": 0,
  "level_match": true,
  "quality": "studio"
}
```

The existing Studio speed plan owns the video speed. The remix renderer owns
independent pitch, EQ, reverb, limiting, and final AAC delivery.

`target` supports `master`, `voice`, and `music`. Mastering runs after motion
sound cues so the limiter protects the complete mix. Voice and music targeting
run before the tracks are mixed. `content_type` supports `auto`, `choir`,
`speech`, and `music`; each uses a different dynamics/protection chain.

The browser remains responsive with an instant Web Audio approximation while
sliders move. **Preview Remix** is the proof step: it renders the selected loop
through FFmpeg, including target isolation, precision pitch, level matching and
the final limiter, then automatically plays the returned mastered audio.
