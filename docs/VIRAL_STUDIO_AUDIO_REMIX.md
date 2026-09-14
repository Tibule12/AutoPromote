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
- Send `audioRemixForRender(audioRemix)` as `audio_remix`.
- Accept `audio_remix` in `RenderViralRequest` and call
  `render_audio_remix` after the base MP4 is rendered.

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
  "keep_pitch": false
}
```

The existing Studio speed plan owns the video speed. The remix renderer owns
independent pitch, EQ, reverb, limiting, and final AAC delivery.
