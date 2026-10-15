import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import StudioKeyframeCurveEditor from "../StudioKeyframeCurveEditor";

const keys = [
  { id: "a", targetId: "title", property: "opacity", time: 0, value: 0, easing: "linear" },
  { id: "b", targetId: "title", property: "opacity", time: 1, value: 1, easing: "bezier", curve: [.2, .1, .8, .9] },
  { id: "c", targetId: "title", property: "x", time: 1, value: 50, easing: "linear" },
];
test("selected timeline key edits its own value and all four curve coordinates without overwriting sibling properties", () => {
  const update = jest.fn();
  render(<StudioKeyframeCurveEditor keyframes={keys} focusId="b" onUpdate={update} />);
  fireEvent.change(screen.getByLabelText("Selected motion key value"), { target: { value: ".75" } });
  expect(update).toHaveBeenCalledWith("b", { value: .75 });
  fireEvent.change(screen.getByLabelText("Bezier Time 1"), { target: { value: ".1" } });
  expect(update).toHaveBeenLastCalledWith("b", { easing: "bezier", curve: [.1, .1, .8, .9] });
  fireEvent.change(screen.getByLabelText("Bezier Value 2"), { target: { value: "1.25" } });
  expect(update).toHaveBeenLastCalledWith("b", { easing: "bezier", curve: [.2, .1, .8, 1.25] });
  expect(keys[1].curve).toEqual([.2, .1, .8, .9]);
});
test("graph reflects real eased values and preserves incoming-key semantics", () => {
  const { rerender } = render(<StudioKeyframeCurveEditor keyframes={keys} focusId="b" onUpdate={jest.fn()} />);
  const curved = screen.getByTestId("motion-value-curve").getAttribute("d");
  const changed = keys.map(key => key.id === "b" ? { ...key, curve: [.1, 0, .2, 1] } : key);
  rerender(<StudioKeyframeCurveEditor keyframes={changed} focusId="b" onUpdate={jest.fn()} />);
  expect(screen.getByTestId("motion-value-curve").getAttribute("d")).not.toBe(curved);
  expect(screen.getByText(/opacity: 0 → 1/)).toBeInTheDocument();
});
test("keyboard handles edit time and overshoot with precise steps", () => {
  const update = jest.fn(); render(<StudioKeyframeCurveEditor keyframes={keys} focusId="b" onUpdate={update} />);
  const handle = screen.getByRole("button", { name: "Bezier handle 1" });
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(update).toHaveBeenLastCalledWith("b", { easing: "bezier", curve: [.22, .1, .8, .9] });
  fireEvent.keyDown(handle, { key: "ArrowUp", shiftKey: true });
  expect(update).toHaveBeenLastCalledWith("b", { easing: "bezier", curve: [.2, .2, .8, .9] });
});
test("locked tracks remain selectable and inspectable but cannot change key values or handles", () => {
  const update = jest.fn(), select = jest.fn();
  render(<StudioKeyframeCurveEditor keyframes={keys} focusId="b" onUpdate={update} onSelect={select} locked />);
  expect(screen.getByLabelText("Selected motion key value")).toBeDisabled();
  expect(screen.getByLabelText("Bezier Time 1")).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("button", { name: "Bezier handle 1" }), { key: "ArrowRight" });
  expect(update).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Curve keyframe"), { target: { value: "c" } });
  expect(select).toHaveBeenCalledWith("c");
  expect(screen.getByText(/first x key/)).toBeInTheDocument();
});
test("changing the selected timeline diamond replaces an older inspector selection", () => {
  const props = { keyframes: keys, onUpdate: jest.fn() };
  const { rerender } = render(<StudioKeyframeCurveEditor {...props} focusId="b" />);
  fireEvent.change(screen.getByLabelText("Curve keyframe"), { target: { value: "c" } });
  rerender(<StudioKeyframeCurveEditor {...props} focusId="a" />);
  expect(screen.getByLabelText("Curve keyframe")).toHaveValue("a");
});
test("pointer handle movement previews locally and commits once; cancel leaves the saved key unchanged", () => {
  const update = jest.fn();
  render(<StudioKeyframeCurveEditor keyframes={keys} focusId="b" onUpdate={update} />);
  const graph = screen.getByRole('img', { name: 'opacity value curve' });
  jest.spyOn(graph, 'getBoundingClientRect').mockReturnValue({left:0, top:0, width:300, height:180});
  const handle = screen.getByRole('button', {name:'Bezier handle 1'});
  fireEvent(handle, new MouseEvent('pointerdown', {bubbles:true, clientX:73.2, clientY:142.8}));
  fireEvent(graph, new MouseEvent('pointermove', {bubbles:true, clientX:150, clientY:90}));
  expect(update).not.toHaveBeenCalled();
  fireEvent(graph, new MouseEvent('pointerup', {bubbles:true, clientX:150, clientY:90}));
  expect(update).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith('b', {easing:'bezier',curve:[.5,.5,.8,.9]});
  update.mockClear();
  fireEvent(handle, new MouseEvent('pointerdown', {bubbles:true}));
  fireEvent(graph, new MouseEvent('pointermove', {bubbles:true, clientX:170, clientY:100}));
  fireEvent(graph, new MouseEvent('pointercancel', {bubbles:true}));
  expect(update).not.toHaveBeenCalled();
});

test('velocity display and numeric influence use the saved cubic, with one commit and a range error for impossible speeds', () => {
  const update=jest.fn();render(<StudioKeyframeCurveEditor keyframes={keys} focusId="b" onUpdate={update}/>);
  fireEvent.click(screen.getByRole('button',{name:'Velocity graph'}));expect(screen.getByTestId('motion-velocity-curve')).toBeInTheDocument();
  const influence=screen.getByLabelText('Start influence (%)');fireEvent.focus(influence);fireEvent.change(influence,{target:{value:'40'}});
  expect(update).not.toHaveBeenCalled();fireEvent.blur(influence);expect(update).toHaveBeenCalledTimes(1);
  expect(update.mock.lastCall).toEqual(['b',{easing:'bezier',curve:[.4,.2,.8,.9]}]);
  const speed=screen.getByLabelText('End velocity (opacity/s)');fireEvent.focus(speed);fireEvent.change(speed,{target:{value:'900'}});fireEvent.blur(speed);
  expect(screen.getByRole('alert')).toHaveTextContent('exceeds');expect(update).toHaveBeenCalledTimes(1);
});
