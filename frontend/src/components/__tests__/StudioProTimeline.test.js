import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import StudioProTimeline, {buildTimelineCaptionRegions} from "../StudioProTimeline";
import { motionKeyAtPlayhead, motionKeyframeTolerance } from "../studioMotionProperties";

test('Razor cuts at the clicked programme time without first seeking or cutting locked tracks', () => {
  const cut = jest.fn(), seek = jest.fn();
  const props = { duration: 10, editTool: 'razor', onRazorCut: cut, onSeek: seek,
    timelineSegments: [{ id: 'main', name: 'Source', startRequest: 10, endRequest: 20 }], trackStates: {} };
  const { rerender } = render(<StudioProTimeline {...props} />);
  let clip = screen.getByTestId('pro-video-clip-1');
  clip.parentElement.getBoundingClientRect = () => ({ left: 100, width: 500 });
  fireEvent.click(clip, { clientX: 275, detail: 1 });
  expect(cut).toHaveBeenLastCalledWith(3.5, null);
  expect(seek).not.toHaveBeenCalled();
  rerender(<StudioProTimeline {...props} trackStates={{ video: { locked: true } }} />);
  fireEvent.click(screen.getByTestId('pro-video-clip-1'), { clientX: 300, detail: 1 });
  expect(cut).toHaveBeenCalledTimes(1);
});

test.each(['tracks', 'layers'])('Razor cuts the clicked graphic in %s view', view => {
  const cut = jest.fn();
  render(<StudioProTimeline duration={10} editTool="razor" onRazorCut={cut} defaultView={view}
    trackStates={{}} overlays={[{ id: 'title', type: 'text', name: 'Title', startTime: 1, duration: 8 }]} />);
  const clip = view === 'layers' ? screen.getByRole('button', { name: 'Select Title layer clip' })
    : screen.getByTestId('pro-graphics-clip-1');
  clip.closest('.pro-track-lane').getBoundingClientRect = () => ({ left: 100, width: 500 });
  fireEvent.click(clip, { clientX: 275, detail: 1 });
  expect(cut).toHaveBeenCalledWith(3.5, 'title');
});

test('group property rows share key gestures and expose translation/scale bounds without media crop', () => {
  const toggle=jest.fn(),update=jest.fn(),select=jest.fn();
  render(<StudioProTimeline duration={3} playhead={1} trackStates={{}} onToggleMotionPropertyKeyframe={toggle}
    onUpdateMotionProperty={update} onSelectMotionKeyframe={select}
    graphicGroups={[{id:'group',name:'Master',kind:'graphic_group',transform:{x:-8,y:0,scale:.85,rotation:0,opacity:1}}]}
    motionKeyframes={[{id:'ga',targetId:'group',property:'x',time:0,value:-8},{id:'gb',targetId:'group',property:'x',time:2,value:8,easing:'linear'}]} />);
  fireEvent.click(screen.getByRole('button',{name:'Show motion keyframes'}));fireEvent.click(screen.getByRole('button',{name:'Expand Master keyframes'}));
  const x=screen.getByLabelText('Master x value');expect(x).toHaveValue(0);expect(x).toHaveAttribute('min','-100');
  expect(screen.getByLabelText('Master scale value')).toHaveAttribute('max','2');expect(screen.queryByLabelText('Master cropX value')).toBeNull();
  fireEvent.focus(x);fireEvent.change(x,{target:{value:'-4'}});fireEvent.blur(x);expect(update).toHaveBeenCalledWith('group','x',-4);
  fireEvent.click(screen.getByRole('button',{name:'Add Master x keyframe at playhead'}));expect(toggle).toHaveBeenCalledWith('group','x');
  fireEvent.click(screen.getByTestId('motion-timeline-key-gb'));expect(select).toHaveBeenCalledWith('gb','group');
});

test('unanimated layers expose supported properties; value entry commits once and Escape cancels', () => {
  const update = jest.fn(), toggle = jest.fn();
  render(<StudioProTimeline duration={3} playhead={1} mainTransform={{ scale: 1.2 }} trackStates={{}}
    overlays={[{ id: 'title', type: 'text', name: 'Title', x: 35, scale: 1 }]}
    onUpdateMotionProperty={update} onToggleMotionPropertyKeyframe={toggle} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show motion keyframes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Expand Source video keyframes' }));
  const scale = screen.getByLabelText('Source video scale value');
  expect(scale).toHaveValue(1.2);
  fireEvent.focus(scale); fireEvent.change(scale, { target: { value: '1.45' } });
  expect(update).not.toHaveBeenCalled(); fireEvent.blur(scale);
  expect(update).toHaveBeenCalledTimes(1); expect(update).toHaveBeenCalledWith('main-video', 'scale', 1.45);
  fireEvent.focus(scale); fireEvent.change(scale, { target: { value: '4' } });
  fireEvent.keyDown(scale, { key: 'Escape' }); fireEvent.blur(scale);
  expect(update).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Add Source video scale keyframe at playhead' }));
  expect(toggle).toHaveBeenCalledWith('main-video', 'scale');
  fireEvent.click(screen.getByRole('button', { name: 'Expand Title keyframes' }));
  expect(screen.getByLabelText('Title x value')).toHaveValue(35);
  expect(screen.queryByLabelText('Title cropX value')).toBeNull();
});

test('property values evaluate the playhead; locks block edits but permit neighbouring key navigation', () => {
  const seek = jest.fn();
  render(<StudioProTimeline duration={3} playhead={1} frameRate={60} trackStates={{ video: { locked: true } }}
    onSeek={seek} onUpdateMotionProperty={jest.fn()} onToggleMotionPropertyKeyframe={jest.fn()}
    motionKeyframes={[{ id: 'a', targetId: 'main-video', property: 'x', time: 0, value: 20 },
      { id: 'b', targetId: 'main-video', property: 'x', time: 2, value: 80, easing: 'linear' }]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show motion keyframes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Expand Source video keyframes' }));
  expect(screen.getByLabelText('Source video x value')).toHaveValue(50);
  expect(screen.getByLabelText('Source video x value')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Add Source video x keyframe at playhead' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Previous Source video x keyframe' }));
  expect(seek.mock.lastCall[1]).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Next Source video x keyframe' }));
  expect(seek.mock.lastCall[1]).toBe(2);
});

test('focusing an interpolated property preserves its displayed number and replacement entry', () => {
  const update=jest.fn();
  render(<StudioProTimeline duration={3} playhead={1} trackStates={{}} defaultView="layers" onUpdateMotionProperty={update}
    overlays={[{id:'word',type:'text',name:'Word',startTime:0,duration:3}]}
    motionKeyframes={[{id:'a',targetId:'word',property:'x',time:0,value:0},
      {id:'b',targetId:'word',property:'x',time:3,value:100,easing:'linear'}]} />);
  fireEvent.click(screen.getByRole('button',{name:'Expand Word keyframes'}));
  const field=screen.getByLabelText('Word x value');expect(field).toHaveValue(33.333);
  fireEvent.focus(field);expect(field).toHaveValue(33.333);fireEvent.blur(field);expect(update).not.toHaveBeenCalled();
  fireEvent.focus(field);fireEvent.change(field,{target:{value:'70'}});fireEvent.blur(field);
  expect(update).toHaveBeenCalledWith('word','x',70);
});

test('adjacent delivery frames at 60fps or double speed remain distinct property keys', () => {
  for (const rate of [1, 2]) {
    const time = rate / 60, tolerance = motionKeyframeTolerance(60, rate);
    const keys = [{ id: 'a', targetId: 'main-video', property: 'scale', time: 0 },
      { id: 'b', targetId: 'main-video', property: 'scale', time }];
    expect(motionKeyAtPlayhead(keys, 'main-video', 'scale', time, tolerance).id).toBe('b');
    expect(motionKeyAtPlayhead(keys.slice(0, 1), 'main-video', 'scale', time, tolerance)).toBeUndefined();
  }
});

test('motion property lanes select the actual authored key and support precise frame nudges and deletion', () => {
  const select = jest.fn(), update = jest.fn(), remove = jest.fn(), seek = jest.fn();
  render(<StudioProTimeline duration={10} playbackRate={2} frameRate={24} trackStates={{}}
    motionKeyframes={[{ id: 'scale-a', targetId: 'main-video', property: 'scale', time: 3, value: 1.2, easing: 'linear' }]}
    onSelectMotionKeyframe={select} onUpdateMotionKeyframe={update} onRemoveMotionKeyframe={remove} onSeek={seek} />);
  expect(screen.queryByTestId('motion-timeline-key-scale-a')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show motion keyframes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Expand Source video keyframes' }));
  const key = screen.getByTestId('motion-timeline-key-scale-a');
  fireEvent.click(key);
  expect(select).toHaveBeenCalledWith('scale-a', 'main-video');
  expect(seek.mock.lastCall[1]).toBe(3);
  fireEvent.keyDown(key, { key: 'ArrowRight' });
  expect(update.mock.lastCall[0]).toBe('scale-a');
  expect(update.mock.lastCall[1].time).toBeCloseTo(3 + 2/24, 10);
  fireEvent.keyDown(key, { key: 'Delete' });
  expect(remove).toHaveBeenCalledWith('scale-a');
});

test('dragging a motion key commits one edit; locking its owning track retains selection and blocks mutation', () => {
  const update = jest.fn(), select = jest.fn(), remove = jest.fn();
  const props = { duration: 10, frameRate: 20, trackStates: {}, overlays: [{ id: 'logo', type: 'image', name: 'Logo' }],
    motionKeyframes: [{ id: 'logo-x', targetId: 'logo', property: 'x', time: 2, value: 40 }],
    onSelectMotionKeyframe: select, onUpdateMotionKeyframe: update, onRemoveMotionKeyframe: remove };
  const { rerender } = render(<StudioProTimeline {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show motion keyframes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Expand Logo keyframes' }));
  const key = screen.getByTestId('motion-timeline-key-logo-x');
  jest.spyOn(key.parentElement, 'getBoundingClientRect').mockReturnValue({ width: 1000 });
  fireEvent(key, new MouseEvent('pointerdown', { bubbles: true, clientX: 200, button: 0 }));
  fireEvent(key, new MouseEvent('pointermove', { bubbles: true, clientX: 350 }));
  fireEvent(key, new MouseEvent('pointerup', { bubbles: true, clientX: 350 }));
  expect(update).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith('logo-x', { time: 3.5 });
  update.mockClear(); rerender(<StudioProTimeline {...props} trackStates={{ broll: { locked: true } }} />);
  fireEvent.click(key); fireEvent.keyDown(key, { key: 'ArrowRight' }); fireEvent.keyDown(key, { key: 'Delete' });
  key.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 200, button: 0 }));
  key.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 350 }));
  key.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 350 }));
  expect(select).toHaveBeenCalledWith('logo-x', 'logo');
  expect(update).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
});

test('every image/video layer has one native media lane even before a layout mode is chosen', () => {
  const select = jest.fn();
  render(<StudioProTimeline duration={10} trackStates={{}} onSelectOverlay={select}
    overlays={[{ id: 'logo', type: 'image', name: 'Brand logo', startTime: 3, duration: 2 },
      { id: 'shot', type: 'video', name: 'Inserted shot', startTime: 4, duration: 3 },
      { id: 'cutaway', type: 'text', bRollMode: 'fullscreen', name: 'Title cutaway', startTime: 2, duration: 1 },
      { id: 'headline', type: 'text', name: 'Headline', startTime: 0, duration: 2 }]} />);
  expect(screen.getAllByTestId(/pro-broll-clip-/)).toHaveLength(3);
  expect(screen.getAllByTestId(/pro-graphics-clip-/)).toHaveLength(1);
  fireEvent.click(screen.getByText('Brand logo'));
  expect(select).toHaveBeenCalledWith('logo');
});

test("2x programme clock matches export while clip selection preserves source edit coordinates", () => {
  const seek = jest.fn();
  const selectOverlay = jest.fn();
  render(<StudioProTimeline duration={12} playhead={6} playbackRate={2} trackStates={{}}
    timelineSegments={[{ id: "a", name: "First", duration: 3 }, { id: "b", name: "Second", duration: 9 }]}
    onSeek={seek} onSelectOverlay={selectOverlay} />);
  const ruler = screen.getByTestId("pro-time-ruler");
  expect(ruler.getAttribute("data-output-duration")).toBe("6");
  expect(ruler.textContent).toContain("0:06");
  expect(ruler.textContent).not.toContain("0:12");
  expect(screen.getByTestId("pro-current-edit").textContent).toBe("0:03");
  const second = screen.getByTestId("pro-video-clip-2");
  expect(second.textContent).toContain("4.5s");
  expect(second.getAttribute("aria-label")).toContain("1.50s–6.00s");
  fireEvent.click(second);
  expect(selectOverlay).toHaveBeenCalledWith(null);
  expect(seek.mock.lastCall[1]).toBe(3);
});

test("caption cues retain individual timing, wording and selection across overlaps and gaps",()=>{
  const cues=[{id:"a",startTime:0,duration:2,text:"First",textReviewRequired:true},{id:"b",startTime:1,duration:2,text:"Second"},{id:"c",startTime:5,duration:1,text:"Payoff",textReviewed:true}];
  const before=JSON.stringify(cues);const regions=buildTimelineCaptionRegions(cues);
  expect(regions).toHaveLength(3);
  expect(regions[0]).toMatchObject({id:"a",startTime:0,duration:2,lane:0,name:"First · Review words"});
  expect(regions[1]).toMatchObject({id:"b",startTime:1,duration:2,lane:1,name:"Second"});
  expect(regions[2]).toMatchObject({id:"c",startTime:5,duration:1,lane:0,name:"Payoff"});
  expect(JSON.stringify(cues)).toBe(before);
});

test("B-roll right trim reports the absolute output end away from zero", () => {
  const onOverlayTrim = jest.fn();
  render(
    <StudioProTimeline
      duration={20}
      trackStates={{}}
      overlays={[
        {
          id: "cutaway",
          type: "video",
          bRollMode: "pip",
          startTime: 5,
          duration: 3,
          src: "https://example.com/cutaway.mp4",
        },
      ]}
      onOverlayTrim={onOverlayTrim}
    />
  );
  const clip = screen.getByTestId("pro-broll-clip-1");
  jest.spyOn(clip.parentElement, "getBoundingClientRect").mockReturnValue({ width: 1000 });
  const right = clip.lastElementChild;
  right.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 400 }));
  right.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 450 }));
  expect(onOverlayTrim).toHaveBeenCalledWith("cutaway", "end", 9);
});

test("locked B-roll keeps selection and seeking but rejects move, slip and trim gestures", () => {
  const move = jest.fn(),
    trim = jest.fn(),
    slip = jest.fn(),
    select = jest.fn(),
    seek = jest.fn();
  render(
    <StudioProTimeline
      duration={20}
      trackStates={{ broll: { locked: true } }}
      overlays={[
        {
          id: "cutaway",
          type: "video",
          bRollMode: "pip",
          startTime: 5,
          duration: 3,
          src: "https://example.com/cutaway.mp4",
        },
      ]}
      onOverlayMove={move}
      onOverlayTrim={trim}
      onOverlaySlip={slip}
      onSelectOverlay={select}
      onSeek={seek}
    />
  );
  const clip = screen.getByTestId("pro-broll-clip-1");
  jest.spyOn(clip.parentElement, "getBoundingClientRect").mockReturnValue({ width: 1000 });
  for (const handle of [...clip.children]) {
    handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 400 }));
    handle.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 450 }));
    handle.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 450 }));
  }
  clip.children[1].dispatchEvent(
    new MouseEvent("pointerdown", { bubbles: true, clientX: 400, altKey: true })
  );
  clip.children[1].dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 450 }));
  expect(move).not.toHaveBeenCalled();
  expect(trim).not.toHaveBeenCalled();
  expect(slip).not.toHaveBeenCalled();
  fireEvent.click(clip.children[1]);
  expect(select).toHaveBeenCalledWith("cutaway");
  expect(seek).toHaveBeenCalled();
});

test.each([
  [
    "adjustment",
    {
      adjustmentLayers: [
        { id: "grade", startTime: 5, duration: 3, effects: { color: { brightness: 0.1 } } },
      ],
    },
    "onAdjustmentMove",
    "onAdjustmentTrim",
  ],
  [
    "motion",
    { motionScenes: [{ id: "title", startTime: 5, duration: 3, preset: "title", name: "Title" }] },
    "onMotionMove",
    "onMotionTrim",
  ],
  ["originalAudio", { timelineSegments: [{ id: "source", duration: 20 }] }, null, "onAudioTrim"],
])("%s timing lock rejects timeline gestures", (track, items, moveKey, trimKey) => {
  const mutate = jest.fn();
  const callbacks = { [trimKey]: mutate, ...(moveKey ? { [moveKey]: mutate } : {}) };
  render(
    <StudioProTimeline
      duration={20}
      trackStates={{ [track]: { locked: true } }}
      {...items}
      {...callbacks}
    />
  );
  const clip = screen.getByTestId(`pro-track-row-${track}`).querySelector(".pro-track-clip");
  jest.spyOn(clip.parentElement, "getBoundingClientRect").mockReturnValue({ width: 1000 });
  for (const handle of [...clip.children]) {
    handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 400 }));
    handle.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 450 }));
    handle.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 450 }));
  }
  expect(mutate).not.toHaveBeenCalled();
});

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

test('group clip bars remain visible without opening property rows and preserve selection/lock actions',()=>{
 const select=jest.fn(),edit=jest.fn();
 const props={duration:8,trackStates:{},groupTimingRows:[{id:'g',name:'Opening',startTime:.5,duration:2,childCount:3}],onSelectGroup:select,onEditGroupTiming:edit};
 const {rerender}=render(<StudioProTimeline {...props}/>);
 const clip=screen.getByTestId('group-timeline-clip-g');expect(clip).toHaveAttribute('data-start','0.5');
 fireEvent.click(screen.getByRole('button',{name:'Select Opening group clip'}));expect(select).toHaveBeenCalledWith('g');
 fireEvent.keyDown(screen.getByRole('button',{name:'Trim Opening out'}),{key:'ArrowLeft'});expect(edit.mock.lastCall[1]).toBe('trim-end');
 rerender(<StudioProTimeline {...props} groupTimingRows={[{...props.groupTimingRows[0],locked:true}]} selectedGroupId="g"/>);
 expect(screen.getByRole('button',{name:'Trim Opening out'})).toBeDisabled();expect(screen.getByRole('button',{name:'Select Opening group clip'})).toHaveAttribute('aria-pressed','true');
});

test('selecting a group focuses its property rows while leaving ordinary clips accessible',()=>{
 const props={duration:8,trackStates:{},overlays:[{id:'title',type:'text',name:'Child title'}],
 graphicGroups:[{id:'g',name:'Opening',kind:'graphic_group',transform:{x:0,y:0,scale:1,rotation:0,opacity:1}}]};
 const {rerender}=render(<StudioProTimeline {...props} selectedGroupId="g"/>);
 fireEvent.click(screen.getByRole('button',{name:'Show motion keyframes'}));
 expect(screen.getByRole('button',{name:'Expand Opening keyframes'})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Expand Child title keyframes'})).toBeNull();expect(screen.getByTestId('pro-graphics-clip-1')).toBeInTheDocument();
 rerender(<StudioProTimeline {...props}/>);expect(screen.getByRole('button',{name:'Expand Child title keyframes'})).toBeInTheDocument();
});

test('Shift selection applies a single batch edit and copies complete keys for paste at the playhead', () => {
  const batch=jest.fn(),keys=[{id:'ka',targetId:'main-video',property:'x',time:1,value:20,easing:'linear'},
    {id:'kb',targetId:'main-video',property:'opacity',time:2,value:.5,easing:'bezier',curve:[.1,0,.8,1]}];
  const props={duration:6,playhead:4,frameRate:24,motionKeyframes:keys,onEditMotionKeyframes:batch,trackStates:{}};
  render(<StudioProTimeline {...props}/>);
  fireEvent.click(screen.getByRole('button',{name:'Show motion keyframes'}));
  fireEvent.click(screen.getByRole('button',{name:'Expand Source video keyframes'}));
  fireEvent.click(screen.getByTestId('motion-timeline-key-ka'));
  fireEvent.click(screen.getByTestId('motion-timeline-key-kb'),{shiftKey:true});
  expect(screen.getByText('2 keys selected')).toBeInTheDocument();
  fireEvent.keyDown(screen.getByTestId('motion-timeline-key-ka'),{key:'ArrowRight'});
  expect(batch).toHaveBeenCalledTimes(1);expect(batch.mock.lastCall.slice(0,2)).toEqual([['ka','kb'],'move']);
  expect(batch.mock.lastCall[2].value).toBeCloseTo(1/24,10);
  fireEvent.change(screen.getByLabelText('Selected keyframe interpolation'),{target:{value:'hold'}});
  fireEvent.click(screen.getByRole('button',{name:'Apply interpolation'}));
  expect(batch.mock.lastCall[1]).toBe('easing');expect(batch.mock.lastCall[2].value).toBe('hold');
  fireEvent.keyDown(screen.getByTestId('motion-timeline-key-ka'),{key:'c',ctrlKey:true});
  fireEvent.keyDown(screen.getByTestId('motion-timeline-key-ka'),{key:'v',ctrlKey:true});
  expect(batch.mock.lastCall).toEqual([['ka','kb'],'paste',{value:4,clipboard:keys}]);
});

test('a mixed locked selection permits copying and prevents every batch mutation', () => {
  const batch=jest.fn();render(<StudioProTimeline duration={5} onEditMotionKeyframes={batch}
    trackStates={{video:{locked:true}}} motionKeyframes={[{id:'la',targetId:'main-video',property:'x',time:1,value:20},
      {id:'lb',targetId:'title',property:'x',time:2,value:40}]} overlays={[{id:'title',name:'Title',type:'text'}]}/>);
  fireEvent.click(screen.getByRole('button',{name:'Show motion keyframes'}));
  fireEvent.click(screen.getByRole('button',{name:'Expand Source video keyframes'}));
  fireEvent.click(screen.getByRole('button',{name:'Expand Title keyframes'}));
  fireEvent.click(screen.getByTestId('motion-timeline-key-la'));fireEvent.click(screen.getByTestId('motion-timeline-key-lb'),{shiftKey:true});
  expect(screen.getByRole('button',{name:'Apply interpolation'})).toBeDisabled();
  expect(screen.getByRole('button',{name:'Move selected keys one frame later'})).toBeDisabled();
  expect(screen.getByRole('button',{name:'Copy keys'})).toBeEnabled();
  fireEvent.click(screen.getByRole('button',{name:'Copy keys'}));
  expect(screen.getByRole('button',{name:'Paste at playhead'})).toBeDisabled();
  fireEvent.keyDown(screen.getByTestId('motion-timeline-key-lb'),{key:'Delete'});expect(batch).not.toHaveBeenCalled();
});

test('paste destination uses destination locks and reveals the successfully pasted layer', () => {
  const batch = jest.fn(() => ['fresh']), selectGroup = jest.fn();
  render(<StudioProTimeline duration={5} playhead={3} onEditMotionKeyframes={batch} onSelectGroup={selectGroup}
    trackStates={{ video: { locked: true } }} overlays={[{ id: 'title', type: 'text', name: 'Title' }]}
    motionKeyframes={[{ id: 'source', targetId: 'main-video', property: 'opacity', time: 1, value: .5 }]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show motion keyframes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Expand Source video keyframes' }));
  fireEvent.click(screen.getByTestId('motion-timeline-key-source'));
  fireEvent.click(screen.getByRole('button', { name: 'Copy keys' }));
  expect(screen.getByRole('button', { name: 'Paste at playhead' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Keyframe paste destination'), { target: { value: 'title' } });
  expect(screen.getByRole('button', { name: 'Paste at playhead' })).toBeEnabled();
  fireEvent.keyDown(screen.getByTestId('motion-timeline-key-source'), { key: 'v', metaKey: true });
  expect(batch.mock.lastCall[2]).toEqual({ value: 3, clipboard: [{ id: 'source', targetId: 'main-video', property: 'opacity', time: 1, value: .5 }], pasteTargetId: 'title' });
  expect(screen.getByRole('button', { name: 'Collapse Title keyframes' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Keyframe paste destination'), { target: { value: 'main-video' } });
  expect(screen.getByRole('button', { name: 'Paste at playhead' })).toBeDisabled();
});

test('marquee spans property rows, adds/subtracts and restores selection on Escape or pointer cancellation', () => {
  const batch = jest.fn();
  const { container } = render(<StudioProTimeline duration={5} onEditMotionKeyframes={batch} trackStates={{}}
    motionKeyframes={[{ id: 'one', targetId: 'main-video', property: 'x', time: 1, value: 20 },
      { id: 'two', targetId: 'main-video', property: 'opacity', time: 2, value: .5 }]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show motion keyframes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Expand Source video keyframes' }));
  const content = container.querySelector('.pro-timeline-content');
  const lane = screen.getByRole('group', { name: 'Source video x keyframes' });
  const one = screen.getByTestId('motion-timeline-key-one'), two = screen.getByTestId('motion-timeline-key-two');
  content.getBoundingClientRect = () => ({ left: 0, top: 0 });
  one.getBoundingClientRect = () => ({ left: 100, top: 100, width: 20, height: 20 });
  two.getBoundingClientRect = () => ({ left: 200, top: 200, width: 20, height: 20 });
  const pointer = (element, type, props) => fireEvent(element, new MouseEvent(type, { bubbles: true, button: 0, ...props }));
  const start = props => pointer(lane, 'pointerdown', { clientX: 90, clientY: 90, ...props });
  const move = (x, y) => pointer(content, 'pointermove', { clientX: x, clientY: y });
  start(); move(220, 220);
  expect(screen.getByText('2 keys selected')).toBeInTheDocument();
  expect(screen.getByTestId('keyframe-marquee')).toHaveStyle({ width: '130px', height: '130px' });
  pointer(content, 'pointerup');
  start({ altKey: true }); move(130, 130); pointer(content, 'pointerup');
  expect(one).toHaveAttribute('aria-pressed', 'false'); expect(two).toHaveAttribute('aria-pressed', 'true');
  start({ shiftKey: true }); move(130, 130); pointer(content, 'pointerup');
  expect(screen.getByText('2 keys selected')).toBeInTheDocument();
  start(); move(130, 130); fireEvent.keyDown(content, { key: 'Escape' });
  expect(screen.getByText('2 keys selected')).toBeInTheDocument(); expect(screen.queryByTestId('keyframe-marquee')).toBeNull();
  start(); pointer(content, 'pointercancel'); expect(screen.getByText('2 keys selected')).toBeInTheDocument();
  expect(batch).not.toHaveBeenCalled();
});

test('the timeline graph edits only the selected owner and returns to property rows without changing keys',()=>{
  const update=jest.fn();render(<StudioProTimeline duration={3} trackStates={{}} onUpdateMotionKeyframe={update}
    motionKeyframes={[{id:'a',targetId:'main-video',property:'x',time:0,value:10},
      {id:'b',targetId:'main-video',property:'x',time:2,value:90,easing:'bezier',curve:[.2,0,.8,1]},
      {id:'foreign',targetId:'other',property:'x',time:2,value:5}]} overlays={[{id:'other',name:'Other',type:'text'}]}/>);
  fireEvent.click(screen.getByRole('button',{name:'Show motion keyframes'}));fireEvent.click(screen.getByRole('button',{name:'Expand Source video keyframes'}));
  fireEvent.click(screen.getByTestId('motion-timeline-key-b'));fireEvent.click(screen.getByRole('button',{name:'Timeline graph editor'}));
  expect(screen.getByRole('img',{name:'x value curve'})).toBeVisible();expect(screen.getByLabelText('Curve keyframe').querySelectorAll('option')).toHaveLength(2);
  const influence=screen.getByLabelText('Start influence (%)');fireEvent.focus(influence);fireEvent.change(influence,{target:{value:'50'}});fireEvent.blur(influence);
  expect(update).toHaveBeenCalledWith('b',{easing:'bezier',curve:[.5,0,.8,1]});
  fireEvent.click(screen.getByRole('button',{name:'Timeline graph editor'}));expect(screen.getByTestId('motion-timeline-key-b')).toBeVisible();
});

test('composition layers retain real front-to-back order, separate overlapping bars, and inline native property edits', () => {
  const select = jest.fn(), move = jest.fn(), trim = jest.fn(), update = jest.fn();
  const entries = [
    {id:'back',kind:'overlay',label:'Ink stage',layer:{id:'back',type:'image',name:'Ink stage',startTime:0,duration:10}},
    {id:'a',kind:'overlay',label:'BREAK',layer:{id:'a',type:'text',text:'BREAK',startTime:2,duration:4}},
    {id:'b',kind:'overlay',label:'THE LOOP',layer:{id:'b',type:'text',text:'THE LOOP',startTime:3,duration:3}},
  ];
  const props = {duration:10,playhead:4,frameRate:20,playbackRate:2,trackStates:{},defaultView:'layers',compositionEntries:entries,
    overlays:entries.map(entry=>entry.layer),onSelectOverlay:select,onOverlayMove:move,onOverlayTrim:trim,onUpdateMotionProperty:update,
    motionKeyframes:[{id:'x-a',targetId:'a',property:'x',time:3,value:40}]};
  const {rerender}=render(<StudioProTimeline {...props} />);
  expect(screen.getAllByTestId(/^timeline-layer-/).map(row=>row.dataset.layerId)).toEqual(['b','a','back']);
  const bar=screen.getByTestId('layer-timeline-clip-a');
  expect(bar).toHaveStyle({left:'20%',width:'40%'});
  expect(bar).toHaveAttribute('title','BREAK · 1.000s–3.000s');
  fireEvent.click(screen.getByRole('button',{name:'Select BREAK layer clip'}));expect(select).toHaveBeenCalledWith('a');
  fireEvent.keyDown(screen.getByRole('button',{name:'Select BREAK layer clip'}),{key:'ArrowRight'});expect(move).toHaveBeenCalledWith('a',2.1);
  fireEvent.keyDown(screen.getByRole('button',{name:'Trim BREAK out'}),{key:'ArrowLeft'});expect(trim).toHaveBeenCalledWith('a','end',5.9);
  fireEvent.click(screen.getByRole('button',{name:'Expand BREAK keyframes'}));
  expect(screen.getByTestId('motion-timeline-key-x-a').closest('.pro-motion-property').previousElementSibling).toBeTruthy();
  const value=screen.getByLabelText('BREAK x value');fireEvent.focus(value);fireEvent.change(value,{target:{value:'55'}});fireEvent.blur(value);
  expect(update).toHaveBeenCalledWith('a','x',55);
  rerender(<StudioProTimeline {...props} trackStates={{graphics:{locked:true}}} />);
  move.mockClear();trim.mockClear();fireEvent.keyDown(screen.getByRole('button',{name:'Select BREAK layer clip'}),{key:'ArrowRight'});
  expect(move).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Trim BREAK out'})).toBeDisabled();
  expect(screen.getByLabelText('BREAK x value')).toBeDisabled();
});

test('layer timing filter respects nested parent gates and group collapse without changing the edit', () => {
  const entries=[{id:'child',kind:'overlay',label:'Child',layer:{id:'child',type:'text',startTime:0,duration:10}}];
  const groups=[{id:'parent',kind:'graphic_group',name:'Parent',layerIds:['inner'],timing:{startTime:4,duration:2}},
    {id:'inner',kind:'graphic_group',name:'Inner',layerIds:['child'],timing:{startTime:2,duration:6}}];
  const props={duration:10,playhead:3,trackStates:{},defaultView:'layers',compositionEntries:entries,overlays:entries.map(e=>e.layer),graphicGroups:groups};
  const original=JSON.stringify(props);const {rerender}=render(<StudioProTimeline {...props} />);
  expect(screen.getAllByTestId(/^timeline-layer-/).map(row=>row.dataset.layerId)).toEqual(['parent','inner','child']);
  expect(screen.getByTestId('timeline-layer-child')).toHaveAttribute('data-effective-start','4');
  expect(screen.getByTestId('timeline-layer-child')).toHaveAttribute('data-effective-end','6');
  fireEvent.click(screen.getByRole('button',{name:'At playhead'}));expect(screen.queryByTestId('timeline-layer-child')).toBeNull();
  rerender(<StudioProTimeline {...props} playhead={5} />);expect(screen.getByTestId('timeline-layer-child')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Collapse Parent layers'}));expect(screen.queryByTestId('timeline-layer-child')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Expand Parent layers'}));expect(screen.getByTestId('timeline-layer-child')).toBeInTheDocument();
  expect(JSON.stringify(props)).toBe(original);
  fireEvent.click(screen.getByRole('button',{name:'Sequence tracks'}));expect(screen.getByTestId('pro-track-row-graphics')).toBeInTheDocument();
});

test('Select visible keys follows displayed layer rows when timing filters or collapsed groups hide owners', () => {
  const entries=[{id:'a',kind:'overlay',label:'First',layer:{id:'a',name:'First',type:'text',startTime:0,duration:2}},
    {id:'b',kind:'overlay',label:'Later',layer:{id:'b',name:'Later',type:'text',startTime:4,duration:2}}];
  render(<StudioProTimeline duration={8} playhead={1} trackStates={{}} defaultView="layers" compositionEntries={entries}
    overlays={entries.map(entry=>entry.layer)} onEditMotionKeyframes={jest.fn()}
    motionKeyframes={[{id:'a-x',targetId:'a',property:'x',time:1,value:50},{id:'b-x',targetId:'b',property:'x',time:4,value:50}]} />);
  fireEvent.click(screen.getByRole('button',{name:'Expand First keyframes'}));
  fireEvent.click(screen.getByRole('button',{name:'Expand Later keyframes'}));
  fireEvent.click(screen.getByRole('button',{name:'At playhead'}));
  fireEvent.click(screen.getByRole('button',{name:'Select visible keys'}));
  expect(screen.getByTestId('motion-timeline-key-a-x')).toHaveAttribute('aria-pressed','true');
  expect(screen.queryByTestId('motion-timeline-key-b-x')).toBeNull();
  expect(screen.getByText('1 keys selected')).toBeInTheDocument();
});
