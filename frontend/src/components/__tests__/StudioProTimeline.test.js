import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import StudioProTimeline from "../StudioProTimeline";

test("trimmed source lengths determine clip width and the next clip's start", () => {
  render(
    <StudioProTimeline
      duration={8}
      trackStates={{}}
      timelineSegments={[
        { id: "left", duration: 12, startRequest: 0, endRequest: 3 },
        { id: "right", duration: 12, startRequest: 7, endRequest: 12 },
      ]}
    />
  );
  expect(screen.getByTestId("pro-video-clip-1")).toHaveStyle({ width: "37.5%" });
  expect(screen.getByTestId("pro-video-clip-2")).toHaveStyle({ left: "37.5%", width: "62.5%" });
});

test("motion scenes are selectable from their own lane and seek to their actual time", () => {
  const onSelectMotion = jest.fn(),
    onSeek = jest.fn();
  render(
    <StudioProTimeline
      duration={12}
      trackStates={{}}
      motionScenes={[{ id: "motion-1", text: "Your story", startTime: 4, duration: 3 }]}
      onSelectMotion={onSelectMotion}
      onSeek={onSeek}
    />
  );
  fireEvent.click(screen.getByTestId("pro-motion-clip-1"));
  expect(onSelectMotion).toHaveBeenCalledWith("motion-1");
  expect(onSeek.mock.calls[0][1]).toBe(4);
});

test("timed color adjustment block moves and trims the exported grade interval", () => {
  const onAdjustmentMove = jest.fn();
  const onAdjustmentTrim = jest.fn();
  const onSelectTool = jest.fn();
  render(
    <StudioProTimeline
      duration={20}
      trackStates={{}}
      adjustmentLayers={[{ id: "grade-1", name: "Interview grade", startTime: 4, duration: 3,
        effects: { color: { brightness: 1.1 } } }]}
      onAdjustmentMove={onAdjustmentMove}
      onAdjustmentTrim={onAdjustmentTrim}
      onSelectTool={onSelectTool}
    />
  );
  const clip = screen.getByTestId("pro-adjustment-clip-1");
  jest.spyOn(clip.parentElement, "getBoundingClientRect").mockReturnValue({ width: 1000 });
  const body = clip.children[1];
  body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 200 }));
  body.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 250 }));
  expect(onAdjustmentMove).toHaveBeenCalledWith("grade-1", 5);
  fireEvent.click(body);
  expect(onSelectTool).toHaveBeenCalledWith("composite");
  clip.children[0].dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 200 }));
  clip.children[0].dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 250 }));
  expect(onAdjustmentTrim).toHaveBeenCalledWith("grade-1", "start", 5);
});

test("auto-motion button in toolbar triggers onAutoGenerateMotionBeats", () => {
  const onAutoGenerate = jest.fn();
  render(
    <StudioProTimeline
      duration={12}
      trackStates={{}}
      onSplit={jest.fn()}
      onAutoGenerateMotionBeats={onAutoGenerate}
    />
  );
  const autoBtn = screen.getByTestId("pro-quick-auto-motion");
  expect(autoBtn).toBeInTheDocument();
  fireEvent.click(autoBtn);
  expect(onAutoGenerate).toHaveBeenCalledTimes(1);
});

test("motion clip supports dragging to move and trimming edges", () => {
  const onMotionMove = jest.fn();
  const onMotionTrim = jest.fn();
  render(
    <StudioProTimeline
      duration={20}
      trackStates={{}}
      motionScenes={[{ id: "motion-1", preset: "badge", text: "WAIT FOR IT", startTime: 4, duration: 3 }]}
      onMotionMove={onMotionMove}
      onMotionTrim={onMotionTrim}
    />
  );
  const clip = screen.getByTestId("pro-motion-clip-1");
  expect(clip).toBeInTheDocument();

  // Mock getBoundingClientRect for track lane
  jest.spyOn(clip.parentElement, "getBoundingClientRect").mockReturnValue({
    width: 1000,
    height: 30,
    top: 0,
    left: 0,
    bottom: 30,
    right: 1000,
  });

  // Drag move
  const downEvent = new MouseEvent("pointerdown", { bubbles: true, clientX: 200 });
  const moveEvent = new MouseEvent("pointermove", { bubbles: true, clientX: 250 });
  clip.dispatchEvent(downEvent);
  clip.dispatchEvent(moveEvent);
  expect(onMotionMove).toHaveBeenCalledWith("motion-1", 5);

  // Trim start handle
  const trimStartHandle = clip.querySelector('div[title="Drag to trim start"]');
  trimStartHandle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 200 }));
  clip.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 250 }));
  clip.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  expect(onMotionTrim).toHaveBeenCalledWith("motion-1", "start", 5);

  // Trim end handle
  const trimEndHandle = clip.querySelector('div[title="Drag to trim duration"]');
  trimEndHandle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 200 }));
  clip.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 250 }));
  clip.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  expect(onMotionTrim).toHaveBeenCalledWith("motion-1", "end", 8);
});
