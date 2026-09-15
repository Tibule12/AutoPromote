import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import StudioVoiceoverPreview from "../StudioVoiceoverPreview";
import { uploadVoiceoversForRender, voiceoverTrackAudible } from "../studioVoiceover";
import { buildViralRenderData } from "../viralRenderPayload";

test("uploads a full-length recording and preserves trim, zero gain and kind through the actual render builder", async () => {
  const file = new File(["recording"], "take.webm", { type: "audio/webm" });
  const upload = jest.fn().mockResolvedValue({ url: "https://example.com/take.webm" });
  const cues = await uploadVoiceoversForRender([{ id: "voice", name: "Take 1", file, url: "blob:recording",
    startTime: 4, trimStart: 2, duration: 45, volume: 0 }], { upload, token: "test" });
  expect(upload).toHaveBeenCalledWith(expect.objectContaining({ file, mediaType: "audio", token: "test" }));
  const payload = buildViralRenderData({ selectedClip: { start: 0, end: 60 },
    finalVideoUrl: "https://example.com/source.mp4", extraOptions: { soundEffects: cues } });
  expect(payload.sound_effects).toEqual([expect.objectContaining({ kind: "voiceover", duration: 45,
    trimStart: 2, startTime: 4, volume: 0, url: "https://example.com/take.webm" })]);
});

test("does not export muted takes or a muted track, and refuses a lost recording", async () => {
  const upload = jest.fn();
  expect(await uploadVoiceoversForRender([{ enabled: false }], { upload })).toEqual([]);
  expect(await uploadVoiceoversForRender([{ name: "lost", url: "blob:expired" }], { upload, audible: false })).toEqual([]);
  await expect(uploadVoiceoversForRender([{ name: "lost", url: "blob:expired" }], { upload })).rejects.toThrow("Reconnect");
  expect(upload).not.toHaveBeenCalled();
  expect(voiceoverTrackAudible({ voiceover: { muted: true } })).toBe(false);
  expect(voiceoverTrackAudible({ music: { solo: true } })).toBe(false);
  expect(voiceoverTrackAudible({ voiceover: { solo: true }, music: { solo: true } })).toBe(true);
});

test("follows playback, seek, source trim, speed, master volume, mute and cleanup independently of the inspector", () => {
  const play = jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const pause = jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const video = document.createElement("video");
  Object.defineProperty(video, "paused", { configurable: true, value: false });
  const props = { takes: [{ id: "take", name: "Take 1", url: "https://example.com/voice.wav", startTime: 2,
    duration: 30, trimStart: 1, volume: .5 }], videoRef: { current: video },
    getTimelineTime: time => time, activeClip: 0, muted: false, volume: .4,
    automationKeyframes: [{ property: "volume", time: 0, value: 50 }] };
  const { rerender, unmount } = render(<StudioVoiceoverPreview {...props} />);
  const audio = screen.getByTestId("voiceover-audio-take");
  video.currentTime = 20;
  video.playbackRate = 1.5;
  fireEvent.timeUpdate(video);
  expect(audio.currentTime).toBe(19);
  expect(audio.volume).toBeCloseTo(.1);
  expect(audio.playbackRate).toBe(1.5);
  expect(audio.preservesPitch).toBe(true);
  expect(play).toHaveBeenCalled();
  rerender(<StudioVoiceoverPreview {...props} muted />);
  expect(audio.muted).toBe(true);
  rerender(<StudioVoiceoverPreview {...props} volume={0} />);
  expect(audio.volume).toBe(0);
  video.currentTime = 1;
  pause.mockClear();
  fireEvent.seeked(video);
  expect(pause).toHaveBeenCalled();
  play.mockClear();
  rerender(<StudioVoiceoverPreview {...props} renderedOutputUrl="https://example.com/render.mp4" />);
  video.currentTime = 5;
  fireEvent.play(video);
  expect(play).not.toHaveBeenCalled();
  unmount();
  play.mockRestore(); pause.mockRestore();
});
