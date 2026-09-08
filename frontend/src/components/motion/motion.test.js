import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import MotionPanel from "./MotionPanel";
import { createMotion, cutMotion, motionCues, motionPose, normalizeMotion } from "./motionModel";
import { synthesizeEffect } from "./soundDesign";

test("moving a scene moves its linked cue and cuts preserve relative cue placement", () => {
  const scene = { ...createMotion("title", 8, "a"), soundOffset: 0.4 };
  expect(motionCues([scene])[0].startTime).toBe(8.4);
  const cut = cutMotion([scene], 2, 5);
  expect(cut[0].startTime).toBe(5);
  expect(motionCues(cut)[0].startTime).toBeCloseTo(5.4);
  expect(cutMotion([scene], 7, 13)).toEqual([]);
  expect(motionCues([{ ...scene, sound: "none" }])).toEqual([]);
});

test("poses are seekable and independent of playback history", () => {
  const scene = normalizeMotion({
    preset: "title",
    startTime: 2,
    duration: 4,
    x: 20,
    endX: 80,
    easing: "linear",
  });
  expect(motionPose(scene, 1)).toBeNull();
  expect(motionPose(scene, 4).x).toBe(50);
  motionPose(scene, 5.9);
  expect(motionPose(scene, 4).x).toBe(50);
  expect(motionPose(scene, 6)).toBeNull();
});

test("sound synthesis is deterministic and fades end cleanly", () => {
  const effect = { tone: "impact", duration: 0.3, fadeIn: 0.02, fadeOut: 0.1 };
  const a = synthesizeEffect(effect, 8000),
    b = synthesizeEffect(effect, 8000);
  expect(a).toEqual(b);
  expect(Math.abs(a[0])).toBe(0);
  expect(Math.abs(a[a.length - 1])).toBeLessThan(0.001);
  expect(Math.max(...a)).toBeGreaterThan(0.1);
});

test("motion editing supports words, keyframes, independent duplicates, cue waveforms and removal", () => {
  const seek = jest.fn();
  let state;
  function Harness() {
    const [scenes, setScenes] = useState([]);
    state = scenes;
    return (
      <MotionPanel scenes={scenes} onChange={setScenes} playhead={2} duration={30} onSeek={seek} />
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Add Impact title" }));
  fireEvent.change(screen.getByLabelText("Motion headline"), { target: { value: "THIS IS " } });
  expect(screen.getByLabelText("Motion headline")).toHaveValue("THIS IS ");
  fireEvent.change(screen.getByLabelText("End X"), { target: { value: "70" } });
  fireEvent.change(screen.getByLabelText("Motion start"), { target: { value: "5" } });
  expect(state[0].endX).toBe(70);
  expect(motionCues(state)[0].startTime).toBe(5);
  expect(screen.getByRole("img", { name: "Sound effect waveform" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Sound waveform position"), { target: { value: ".2" } });
  expect(seek).toHaveBeenLastCalledWith(5.2);
  fireEvent.click(screen.getByRole("button", { name: "Play motion + sound" }));
  expect(seek).toHaveBeenLastCalledWith(5, true);
  fireEvent.click(screen.getByRole("button", { name: "Duplicate scene" }));
  expect(state).toHaveLength(2);
  expect(state[0].id).not.toBe(state[1].id);
  expect(motionCues(state)[1].startTime).toBe(9);
  fireEvent.change(screen.getByLabelText("Motion sound"), { target: { value: "none" } });
  expect(motionCues(state)).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Remove scene" }));
  expect(state).toHaveLength(1);
});
