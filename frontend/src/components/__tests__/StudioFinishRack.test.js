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

test("drives professional finish, dead-content revitalizer, selective object color, and podcast motion from explicit project values", () => {
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

  // Dead-Content Revitalizer preset & slider
  fireEvent.click(screen.getByRole("button", { name: /Revive Flat \/ Washed-Out Footage/i }));
  expect(onUpdateFx).toHaveBeenCalledWith("revitalizerPresetId", "flat_log_revival");
  expect(onUpdateFx).toHaveBeenCalledWith("dehaze", 0.45);

  fireEvent.change(screen.getByRole("slider", { name: "Shadow rescue" }), {
    target: { value: "0.64" },
  });
  expect(onUpdateFx).toHaveBeenCalledWith("shadowRecovery", 0.64);

  // Selective Object & Body Part Qualifier + Spatial Power Window
  fireEvent.change(screen.getByLabelText("Selective object qualifier preset"), {
    target: { value: "garment_crimson" },
  });
  expect(onUpdateFx).toHaveBeenCalledWith(
    "qualifier",
    expect.objectContaining({ label: "Red / Garment & Lips Recolor", enabled: true })
  );

  fireEvent.change(screen.getByLabelText("Selective spatial power window"), {
    target: { value: "face_upper_body" },
  });
  expect(onUpdateFx).toHaveBeenCalledWith(
    "powerWindow",
    expect.objectContaining({ label: "Face & Upper Body Key Light", enabled: true })
  );

  fireEvent.click(screen.getByRole("button", { name: "Off" }));
  expect(onUpdateVisualizer).toHaveBeenCalledWith("enabled", true);
  fireEvent.click(screen.getByRole("button", { name: /Pulse ring/i }));
  expect(onUpdateVisualizer).toHaveBeenCalledWith("mode", "ring");

  fireEvent.change(screen.getByRole("slider", { name: "Pro-Mist bloom" }), {
    target: { value: "0.4" },
  });
  expect(onUpdateFx).toHaveBeenCalledWith("dreamGlow", 0.4);

  fireEvent.change(screen.getByRole("slider", { name: "Anamorphic flare" }), {
    target: { value: "0.55" },
  });
  expect(onUpdateFx).toHaveBeenCalledWith("anamorphicFlare", 0.55);

  fireEvent.change(screen.getByRole("slider", { name: "Optical edge blur" }), {
    target: { value: "0.35" },
  });
  expect(onUpdateFx).toHaveBeenCalledWith("lensBlur", 0.35);
});

test('face restoration has explicit reconstruction disclosure, amount and temporal controls',()=>{
 const onUpdateFx=jest.fn();const view=render(<StudioFinishRack fx={fx} hasEffects={false} onUpdateFx={onUpdateFx} onReset={()=>{}} visualizer={visualizer} />);
 fireEvent.click(screen.getByRole('checkbox',{name:'Restore facial detail'}));
 expect(onUpdateFx).toHaveBeenCalledWith('faceRestoration',{model:'gfpgan-v1.4-natural-v2',enabled:true,strength:.85,stability:.65});
 view.rerender(<StudioFinishRack fx={{...fx,faceRestoration:{enabled:true,strength:.85,stability:.65}}} hasEffects onUpdateFx={onUpdateFx} onReset={()=>{}} visualizer={visualizer} />);
 expect(screen.getByText(/AI reconstructs detail/)).toBeInTheDocument();
 expect(screen.getByText(/The live edit shows the source/)).toBeInTheDocument();
 fireEvent.change(screen.getByRole('slider',{name:'Face temporal stability'}),{target:{value:'.75'}});
 expect(onUpdateFx).toHaveBeenLastCalledWith('faceRestoration',{enabled:true,strength:.85,stability:.75});
 fireEvent.change(screen.getByRole('combobox',{name:'Face restoration style'}),{target:{value:'gfpgan-v1.4-natural-v2'}});
 expect(onUpdateFx).toHaveBeenLastCalledWith('faceRestoration',{enabled:true,strength:.85,stability:.65,model:'gfpgan-v1.4-natural-v2'});
});

test('picture cleanup is discoverable in Color and changes the saved cleanup option', () => {
  const change = jest.fn();
  render(<StudioFinishRack fx={fx} visualizer={visualizer} qualityCleanup={false}
    onQualityCleanupChange={change} onUpdateFx={jest.fn()} onApplyPreset={jest.fn()} onReset={jest.fn()} />);
  fireEvent.click(screen.getByLabelText('Clean video noise and compression'));
  expect(change).toHaveBeenCalledWith(true);
  expect(screen.getByText(/your soundtrack stays unchanged/)).toBeInTheDocument();
});
