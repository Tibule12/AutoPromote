import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { AudioRestorationPanel } from "../StudioAdvancedInspectors";

test("repair presets change the complete processing chain and can be bypassed", () => {
  const onUpdate = jest.fn();
  render(<AudioRestorationPanel settings={{ enabled: true, preset: "natural", voiceIsolation: false,
    denoise: 22, deEsser: 18, humFrequency: 50, compressor: 35, limiter: -1, loudness: -14,
    eq: { low: 0, mid: 0, high: 0 } }} onUpdate={onUpdate} source="originalAudio"
    onSourceChange={jest.fn()} keyframes={{ originalAudio: [] }} playhead={0}
    onAddKeyframe={jest.fn()} onUpdateKeyframe={jest.fn()} onRemoveKeyframe={jest.fn()}
    onSeek={jest.fn()} recording={false} onToggleRecording={jest.fn()} voiceoverCount={0} />);
  fireEvent.click(screen.getByRole("button", { name: "noisy room" }));
  expect(onUpdate).toHaveBeenCalledWith("preset", "noisy_room");
  expect(onUpdate).toHaveBeenCalledWith("voiceIsolation", true);
  expect(onUpdate).toHaveBeenCalledWith("denoise", 70);
  expect(onUpdate).toHaveBeenCalledWith("eq", { low: -2, mid: 3, high: 0 });
  fireEvent.click(screen.getByLabelText("Use voice repair on export"));
  expect(onUpdate).toHaveBeenCalledWith("enabled", false);
});
