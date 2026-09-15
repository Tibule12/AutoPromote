# Viral Studio Remix Audio

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
