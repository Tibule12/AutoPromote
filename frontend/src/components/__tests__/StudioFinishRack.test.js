import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import StudioFinishRack from "../StudioFinishRack";

const fx = {
  preset: null,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  temperature: 0,
  sharpness: 0,
  vignette: 0,
  filmGrain: 0,
  chromaticAberration: 0,
  vhsTracking: 0,
  lightLeak: 0,
};

const visualizer = {
  enabled: false,
  mode: "wave",
  color: "#72f7ff",
  intensity: 0.75,
  position: "bottom",
};

test("drives professional finish and podcast motion from explicit project values", () => {
  const onUpdateFx = jest.fn();
  const onApplyPreset = jest.fn();
  const onUpdateVisualizer = jest.fn();

  render(
    <StudioFinishRack
      fx={fx}
      hasEffects={false}
      onUpdateFx={onUpdateFx}
      onApplyPreset={onApplyPreset}
      onReset={jest.fn()}
      visualizer={visualizer}
      onUpdateVisualizer={onUpdateVisualizer}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /Podcast Pro/i }));
  expect(onApplyPreset).toHaveBeenCalledWith(expect.objectContaining({ id: "podcast_pro" }));

  fireEvent.change(screen.getByRole("slider", { name: "Exposure" }), {
    target: { value: "1.18" },
  });
  expect(onUpdateFx).toHaveBeenCalledWith("brightness", 1.18);

  fireEvent.click(screen.getByRole("button", { name: "Off" }));
  expect(onUpdateVisualizer).toHaveBeenCalledWith("enabled", true);
  fireEvent.click(screen.getByRole("button", { name: /Pulse ring/i }));
  expect(onUpdateVisualizer).toHaveBeenCalledWith("mode", "ring");
});
