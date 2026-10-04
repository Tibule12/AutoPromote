import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import StudioProTimeline from "../StudioProTimeline";

test("source clicks seek the clicked output time across trimmed clips, including a scrolled lane", () => {
  const onSeek = jest.fn();
  render(
    <StudioProTimeline
      duration={8}
      trackStates={{}}
      onSeek={onSeek}
      timelineSegments={[
        { id: "first", startRequest: 10, endRequest: 13 },
        { id: "second", startRequest: 30, endRequest: 35 },
      ]}
    />
  );
  const clip = screen.getByTestId("pro-video-clip-2");
  jest
    .spyOn(clip.parentElement, "getBoundingClientRect")
    .mockReturnValue({ left: -200, width: 1000 });
  fireEvent.click(clip, { clientX: 550, detail: 1 });
  expect(onSeek.mock.calls[0][1]).toBe(6);
  fireEvent.click(clip, { detail: 0 });
  expect(onSeek.mock.calls[1][1]).toBe(3);
});

test("the current framing block follows the preview playhead and empty tracks stay accessible", () => {
  const props = {
    duration: 20,
    trackStates: {},
    activeTool: "reframe",
    framingCuts: [
      { id: "solo", time: 0, mode: "speaker_track" },
      { id: "wide", time: 8, mode: "center" },
    ],
  };
  const { rerender } = render(<StudioProTimeline {...props} playhead={5} />);
  expect(screen.getByTestId("pro-framing-clip-1")).toHaveClass("is-at-playhead");
  expect(screen.getByTestId("pro-current-edit")).toHaveTextContent(
    "0:05 · Solo Speaker · 0:00–0:08"
  );
  expect(screen.getByTestId("pro-framing-clip-2")).not.toHaveClass("is-at-playhead");
  expect(screen.queryByTestId("pro-track-row-graphics")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show empty tracks" }));
  expect(screen.getByTestId("pro-track-row-graphics")).toBeInTheDocument();
  rerender(<StudioProTimeline {...props} playhead={8} />);
  expect(screen.getByTestId("pro-framing-clip-1")).not.toHaveClass("is-at-playhead");
  expect(screen.getByTestId("pro-framing-clip-2")).toHaveClass("is-at-playhead");
  expect(screen.getByTestId("pro-current-edit")).toHaveTextContent(
    "0:08 · Show Everyone · 0:08–0:20"
  );
  rerender(<StudioProTimeline {...props} activeTool="finish" playhead={8} />);
  expect(screen.getByTestId("pro-track-row-adjustment")).toHaveClass("is-focused");
});

test("zoom keeps the current edit centered and Fit restores the complete time axis", () => {
  const onZoomChange = jest.fn();
  const props = {
    duration: 600,
    playhead: 100,
    trackStates: {},
    onZoomChange,
    timelineSegments: [{ id: "source", duration: 600 }],
  };
  const { rerender } = render(<StudioProTimeline {...props} zoom={1} />);
  const lane = screen.getByTestId("pro-track-row-video").querySelector(".pro-track-lane");
  const header = lane.parentElement.querySelector(".pro-track-header");
  const scroll = lane.closest(".pro-timeline-scroll");
  Object.defineProperty(scroll, "clientWidth", { value: 1000 });
  jest.spyOn(lane, "getBoundingClientRect").mockReturnValue({ width: 4800 });
  jest.spyOn(header, "getBoundingClientRect").mockReturnValue({ width: 154 });
  fireEvent.click(screen.getByRole("button", { name: "Zoom in timeline" }));
  expect(onZoomChange).toHaveBeenLastCalledWith(2);
  rerender(<StudioProTimeline {...props} zoom={4} />);
  expect(scroll.scrollLeft).toBe(377);
  expect(screen.getByText("0:15")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Fit entire timeline" }));
  expect(onZoomChange).toHaveBeenLastCalledWith(1);
  rerender(<StudioProTimeline {...props} zoom={1} />);
  expect(scroll.scrollLeft).toBe(0);
  expect(screen.getByRole("button", { name: "Zoom out timeline" })).toBeDisabled();
});

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

test("short framing cuts retain exact timing widths instead of covering later cuts", () => {
  render(
    <StudioProTimeline
      duration={600}
      trackStates={{}}
      playhead={2.1}
      framingCuts={[
        { id: "first", time: 0, mode: "speaker_track" },
        { id: "short", time: 2, mode: "speaker_track" },
        { id: "third", time: 2.2, mode: "center" },
      ]}
    />
  );
  const cut = screen.getByTestId("pro-framing-clip-2");
  expect(parseFloat(cut.style.width)).toBeCloseTo((0.2 / 600) * 100, 6);
  expect(cut).toHaveAttribute("data-start-time", "2");
  expect(cut).toHaveAttribute("data-end-time", "2.2");
  expect(cut).toHaveClass("is-at-playhead");
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
      adjustmentLayers={[
        {
          id: "grade-1",
          name: "Interview grade",
          startTime: 4,
          duration: 3,
          effects: { color: { brightness: 1.1 } },
        },
      ]}
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
      motionScenes={[
        { id: "motion-1", preset: "badge", text: "WAIT FOR IT", startTime: 4, duration: 3 },
      ]}
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
