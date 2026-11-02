import React, { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import StudioCurveHandles, { clampStudioCurve } from '../StudioCurveHandles';
import StudioRigController from '../StudioRigController';
import StudioAdjustmentControls from '../StudioAdjustmentControls';
import { compileStudioAdjustmentStack } from '../studioAdjustmentGrade';
import { evaluateWorldLayerPose } from '../studioCompRigging';
import { deriveNodeFlowGraph } from '../studioNodeFlow';

const pointer = (node, type, x, y) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 7 });
  fireEvent(node, event);
};

test('dragging a Bezier handle updates actual coefficients, clamps boundaries and brackets one interaction', () => {
  const start = jest.fn(), end = jest.fn(), change = jest.fn();
  render(<StudioCurveHandles value={[.25, 0, .75, 1]} onChange={change} onInteractionStart={start} onInteractionEnd={end} />);
  const svg = screen.getByLabelText('Cubic Bezier easing handles');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 192 });
  pointer(screen.getByTestId('comp-curve-handle-1'), 'pointerdown', 92, 96);
  pointer(svg, 'pointermove', 160, 48);
  expect(change).toHaveBeenLastCalledWith([.5, 1.2, .75, 1]);
  pointer(svg, 'pointermove', -400, -900);
  expect(change).toHaveBeenLastCalledWith([0, 2, .75, 1]);
  pointer(svg, 'pointerup', 160, 48);
  expect(start).toHaveBeenCalledTimes(1); expect(end).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenLastCalledWith([.5, 1.2, .75, 1]);
  expect(clampStudioCurve([NaN, Infinity, -5, -7])).toEqual([.33, 0, 0, -2]);
});

test('cancelling a curve gesture restores its exact initial value', () => {
  const change = jest.fn();
  render(<StudioCurveHandles value={[.1, .2, .3, .4]} onChange={change} />);
  const svg = screen.getByLabelText('Cubic Bezier easing handles');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 192 });
  pointer(screen.getByTestId('comp-curve-handle-2'), 'pointerdown', 100, 40);
  pointer(svg, 'pointermove', 200, 60);
  pointer(svg, 'pointercancel', 200, 60);
  expect(change).toHaveBeenLastCalledWith([.1, .2, .3, .4]);
});

function RigHarness() {
  const stage = useRef(null);
  const [rig, setRig] = useState({ id: 'rig', name: 'Evidence Rig', x: 50, y: 50, rotation: 0, scale: 1 });
  const child = { id: 'child', parentId: 'rig', x: 60, y: 50, rotation: 0, scale: 1 };
  return <div ref={stage} data-testid="rig-stage">
    <StudioRigController layer={rig} layers={[rig, child]} keys={[]} time={0} stageRef={stage}
      onChange={patch => setRig(old => ({ ...old, ...patch }))} />
    <output data-testid="rig-pose">{JSON.stringify({ rig, child: evaluateWorldLayerPose(child, [rig, child]) })}</output>
  </div>;
}
test('dragging a rig away from its centre has no initial jump and moves its child', () => {
  render(<RigHarness />);
  screen.getByTestId('rig-stage').getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 });
  const control = screen.getByLabelText('Move Evidence Rig');
  pointer(control, 'pointerdown', 520, 510);
  pointer(control, 'pointermove', 520, 510);
  expect(JSON.parse(screen.getByTestId('rig-pose').textContent).rig.x).toBe(50);
  pointer(control, 'pointerup', 620, 610);
  const result = JSON.parse(screen.getByTestId('rig-pose').textContent);
  expect(result.rig.x).toBe(60); expect(result.rig.y).toBe(60);
  expect(result.child.x).toBe(70); expect(result.child.y).toBe(60);
});

test('adjustment controls update normalized supported values and ordering callbacks', () => {
  const change = jest.fn(), move = jest.fn();
  render(<StudioAdjustmentControls layer={{ id: 'grade', finishFx: { contrast: 1 } }} onChange={change} onMove={move} index={1} count={3} />);
  fireEvent.change(screen.getByLabelText('Adjustment contrast'), { target: { value: '1.35' } });
  expect(change.mock.calls.at(-1)[0].finishFx.contrast).toBe(1.35);
  fireEvent.click(screen.getByLabelText('Adjustment enabled'));
  expect(change.mock.calls.at(-1)[0].enabled).toBe(false);
  fireEvent.click(screen.getByLabelText('Move adjustment earlier')); expect(move).toHaveBeenCalledWith(-1);
});

test('preview/export normalization excludes bypassed nodes and applies strength once', () => {
  const result = compileStudioAdjustmentStack([
    { id: 'first', opacity: .5, intensity: 50, finishFx: { contrast: 140, exposureStops: 2, saturation: 0 } },
    { id: 'second', enabled: false, finishFx: { contrast: 1.75 } },
  ]);
  expect(result.map(x => x.id)).toEqual(['first']);
  expect(result[0].effects.color.contrast).toBeCloseTo(1.1);
  expect(result[0].effects.color.exposureStops).toBe(.5);
  expect(result[0].effects.color.saturation).toBe(.75);
  expect(result[0].effects.opacity).toBe(1);
  const graph = deriveNodeFlowGraph({ adjustmentLayers: [{ id: 'first' }], nodeFlow: { viewerB: 'Adjustment:first' } });
  expect(graph.viewerB).toBe('Adjustment:first');
});

test('a LUT-only node preserves its exact imported grid instead of bloating signed export requests', () => {
  const data = [];
  for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) data.push(1-r, 1-g, 1-b);
  const layer = { finishFx: { advancedColor: { lutData: { size: 2, data }, lutIntensity: 100 } } };
  const cube = compileStudioAdjustmentStack([layer])[0].effects.color_cube;
  expect(cube.size).toBe(2); expect(cube.data).toEqual(data);
});
