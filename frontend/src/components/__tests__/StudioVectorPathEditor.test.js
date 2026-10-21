import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import StudioVectorPathEditor from "../StudioVectorPathEditor";
import { createStudioVectorShape } from "../studioVectorShape";
const pointer = (e, type, props) =>
  fireEvent(e, new MouseEvent(type, { bubbles: true, button: 0, ...props }));
test("a contour drag commits once, Escape cancels and a lock cancels an active gesture", () => {
  const change = jest.fn(),
    shape = createStudioVectorShape(),
    props = { shape, onChange: change, selected: 0, onSelect: jest.fn() };
  const { rerender } = render(<StudioVectorPathEditor {...props} />),
    svg = screen.getByTestId("studio-vector-path-editor");
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  const n = screen.getByRole("button", { name: "Vector point 1" });
  pointer(n, "pointerdown", { clientX: 15, clientY: 78 });
  pointer(svg, "pointermove", { clientX: 25, clientY: 65 });
  expect(change).not.toHaveBeenCalled();
  pointer(svg, "pointerup");
  expect(change).toHaveBeenCalledTimes(1);
  expect(change.mock.calls[0][0].nodes[0]).toMatchObject({
    x: 25,
    y: 65,
    in: [0, 0],
    out: [0, -48],
  });
  change.mockClear();
  pointer(n, "pointerdown", { clientX: 15, clientY: 78 });
  pointer(svg, "pointermove", { clientX: 30, clientY: 70 });
  fireEvent.keyDown(n, { key: "Escape" });
  pointer(svg, "pointerup");
  expect(change).not.toHaveBeenCalled();
  pointer(n, "pointerdown", { clientX: 15, clientY: 78 });
  pointer(svg, "pointermove", { clientX: 20, clientY: 70 });
  rerender(<StudioVectorPathEditor {...props} locked />);
  pointer(svg, "pointerup");
  expect(change).not.toHaveBeenCalled();
  fireEvent.keyDown(n, { key: "ArrowRight" });
  expect(change).not.toHaveBeenCalled();
});
test("tangent keyboard editing changes only the chosen local handle", () => {
  const change = jest.fn();
  render(
    <StudioVectorPathEditor
      shape={createStudioVectorShape()}
      onChange={change}
      selected={0}
      onSelect={jest.fn()}
    />
  );
  fireEvent.keyDown(screen.getByRole("button", { name: "Vector point 1 out tangent" }), {
    key: "ArrowRight",
    shiftKey: true,
  });
  expect(change.mock.calls[0][0].nodes[0]).toMatchObject({
    x: 15,
    y: 78,
    in: [0, 0],
    out: [1, -48],
  });
});
