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

test("sound automation plots and edits the real bus curve without a decorative waveform", () => {
  const update = jest.fn();
  const { container } = render(<AudioRestorationPanel settings={{eq:{low:0,mid:0,high:0}}} onUpdate={jest.fn()}
    source="sfx" onSourceChange={jest.fn()} keyframes={{sfx:[
      {id:'a',property:'volume',time:0,value:100},
      {id:'b',property:'volume',time:1,value:25,easing:'bezier',curve:[.2,0,.8,1]}]}}
    playhead={1} onAddKeyframe={jest.fn()} onUpdateKeyframe={update} onRemoveKeyframe={jest.fn()}
    onSeek={jest.fn()} recording={false} onToggleRecording={jest.fn()} voiceoverCount={0} />);
  expect(container.querySelector('.audio-envelope-wave')).toBeNull();
  expect(screen.getByRole('img',{name:'volume value curve'})).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Bezier Time 2'), {target:{value:'.4'}});
  expect(update).toHaveBeenLastCalledWith('b',{easing:'bezier',curve:[.2,0,.4,1]});
  fireEvent.change(screen.getByLabelText('Selected audio key value'),{target:{value:'250'}});
  expect(update).toHaveBeenLastCalledWith('b',{value:200});
});
