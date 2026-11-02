import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import StudioCompWorkbench from "../StudioCompWorkbench";
import { evaluateWorldLayerPose } from "../studioCompRigging";

const time = 1.2;
const parent = {
  id: "rig", name: "Camera Rig", type: "text", text: "", isNullRig: true,
  x: 42, y: 61, scale: 1.6, rotation: 35, opacity: 1,
  startTime: 0, duration: 4,
};
const plate = {
  id: "plate", name: "Evidence", type: "image", src: "plate.png", parentId: "rig",
  x: 60, y: 40, scale: 0.8, rotation: 15, opacity: 0.7,
  startTime: 0, duration: 4,
};

function Harness({ layer = plate, keys = [], main = false }) {
  const [motionKeyframes, setMotionKeyframes] = useState(keys);
  const [activeOverlayId, setActiveOverlayId] = useState(main ? 'main-video' : layer.id);
  const overlays = main ? [parent] : [parent, layer];
  const mainTransform = main ? layer : {};
  const pose = evaluateWorldLayerPose(layer, overlays, motionKeyframes, time, mainTransform);
  return <>
    <StudioCompWorkbench
      overlays={overlays}
      mainTransform={mainTransform}
      motionKeyframes={motionKeyframes}
      activeOverlayId={activeOverlayId}
      onSelectOverlay={setActiveOverlayId}
      currentTime={time}
      programmeDuration={4}
      onChangeMotionKeyframes={setMotionKeyframes}
    />
    <output data-testid="stamp-state">{JSON.stringify({ pose, motionKeyframes })}</output>
  </>;
}

const state = () => JSON.parse(screen.getByTestId("stamp-state").textContent);
const stamp = property => {
  fireEvent.change(screen.getByLabelText("Motion driver target property"), {
    target: { value: property },
  });
  fireEvent.click(screen.getByTestId("comp-add-keyframe-playhead"));
};

test('selecting Main Programme stamps the source transform rather than the first graphic', () => {
  render(<Harness />);
  fireEvent.click(screen.getByText('Main Programme', { exact: true }));
  stamp('scale');
  expect(state().motionKeyframes[0].targetId).toBe('main-video');
  expect(state().motionKeyframes[0].value).toBe(1);
});

test.each(["x", "y", "scale", "rotation", "opacity"])(
  "stamping %s on an animated parented layer retains its authored local value and visible pose",
  property => {
    const keys = [
      { id: "rig-x-0", targetId: "rig", property: "x", time: 0, value: 32, easing: "linear" },
      { id: "rig-x-2", targetId: "rig", property: "x", time: 2, value: 52, easing: "linear" },
      { id: "plate-0", targetId: "plate", property, time: 0, value: plate[property], easing: "linear" },
      { id: "plate-2", targetId: "plate", property, time: 2, value: plate[property] * 1.2, easing: "linear" },
    ];
    render(<Harness keys={keys} />);
    const before = state();
    stamp(property);
    const after = state();
    const added = after.motionKeyframes.find(key => key.targetId === "plate" && key.time === time);
    expect(added.value).toBeCloseTo(plate[property] * 1.12, 4);
    for (const prop of ["x", "y", "scale", "rotation", "opacity"]) {
      expect(after.pose[prop]).toBeCloseTo(before.pose[prop], 3);
    }
    expect(after.motionKeyframes.filter(key => key.targetId === "rig")).toEqual(keys.slice(0, 2));
  }
);

test.each([false, true])(
  "stamping a driven rotation applies the driver once (main programme: %s)",
  main => {
    const layer = {
      ...plate,
      id: main ? "main-video" : plate.id,
      parentId: main ? undefined : plate.parentId,
      motionDrivers: { rotation: { type: "spin", enabled: true, ratePerSecond: 45 } },
    };
    render(<Harness layer={layer} main={main} />);
    const before = state();
    stamp("rotation");
    const after = state();
    expect(after.motionKeyframes[0].value).toBe(layer.rotation);
    expect(after.pose.rotation).toBeCloseTo(before.pose.rotation, 4);
  }
);


test('a polygon point can be stamped, curved and changed in the shared graph while transform drivers remain gated', () => {
  const layer = {...plate, parentId: undefined, mask: {enabled:true, shape:'polygon', path:'polygon(10% 10%, 90% 10%, 50% 90%)'}};
  render(<Harness layer={layer} keys={[
    {id:'point-0',targetId:'plate',property:'maskPoint0X',time:0,value:10,easing:'linear'},
    {id:'point-2',targetId:'plate',property:'maskPoint0X',time:2,value:30,easing:'linear'},
  ]} />);
  stamp('maskPoint0X');
  expect(state().motionKeyframes.find(key=>key.time===time).value).toBeCloseTo(22,4);
  fireEvent.change(screen.getByLabelText('Selected keyframe value'), {target:{value:'25'}});
  expect(state().motionKeyframes.find(key=>key.time===time).value).toBe(25);
  fireEvent.click(screen.getByTestId('comp-curve-preset-whip_snap'));
  expect(state().motionKeyframes.find(key=>key.time===time).easing).toBe('bezier');
  expect(screen.getByLabelText('Motion driver expression type')).toBeDisabled();
});
