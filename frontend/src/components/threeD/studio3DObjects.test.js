import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { createStudio3DScene, normalizeStudio3DScene, studio3DSceneRevision } from "./studio3DModel";
import { studio3DObjectPose } from "./studio3DObjects";
import Studio3DObjectEditor from "./Studio3DObjectEditor";

test("different object poses survive serialisation without sharing another object's transforms", () => {
  const scene = createStudio3DScene("object_scene", 4, "objects");
  const object = scene.objects[0]; object.keyframes = [
    { id: "a", time: 0, easing: "linear", values: { ...studio3DObjectPose(object, 0), x: -2 } },
    { id: "b", time: 2, easing: "linear", values: { ...studio3DObjectPose(object, 0), x: 2, rotationZ: 90 } },
  ];
  scene.objects.push({ ...object, id: "other", x: 4, keyframes: [] });
  const restored = normalizeStudio3DScene(JSON.parse(JSON.stringify(scene)));
  expect(studio3DObjectPose(restored.objects[0], 1)).toMatchObject({ x: 0, rotationZ: 45 });
  expect(studio3DObjectPose(restored.objects[1], 1).x).toBe(4);
  expect(studio3DSceneRevision(restored)).toBe(studio3DSceneRevision(scene));
  expect(studio3DSceneRevision({ ...restored, objects: restored.objects.slice(0, 1) })).not.toBe(studio3DSceneRevision(scene));
});
test("normal object controls create and animate geometry with scene-local timing", () => {
  let saved;
  const seek = jest.fn();
  function Editor() {
    const [scene, setScene] = useState(createStudio3DScene("object_scene", 3, "editable"));
    saved = scene; return <Studio3DObjectEditor scene={scene} playhead={4} onSeek={seek} onChange={objects => setScene({ ...scene, objects })} />;
  }
  render(<Editor />); fireEvent.click(screen.getByRole("button", { name: "Add torus" }));
  fireEvent.change(screen.getByLabelText("Object x"), { target: { value: "2" } });
  fireEvent.blur(screen.getByLabelText("Object x"));
  fireEvent.change(screen.getByLabelText("Object rotationY"), { target: { value: "60" } });
  fireEvent.blur(screen.getByLabelText("Object rotationY"));
  fireEvent.click(screen.getByRole("button", { name: "Add object pose at 1.00s" }));
  expect(saved.objects).toHaveLength(2);
  expect(saved.objects[0].x).toBe(0);
  expect(saved.objects[1]).toMatchObject({ shape: "torus", x: 2, keyframes: [{ time: 1, values: { x: 2, rotationY: 60 } }] });
  fireEvent.click(screen.getByRole("button", { name: "Load object pose 1 · 1.00s" })); expect(seek).toHaveBeenCalledWith(4);
  fireEvent.click(screen.getByRole("button", { name: "Delete object pose 1" }));
  expect(saved.objects[1].keyframes).toEqual([]);
});
test("partial signed object numbers stay out of the project until commit and Escape cancels", () => {
  let saved;
  function Editor() {
    const [scene, setScene] = useState(createStudio3DScene("object_scene", 0, "signed"));
    saved = scene; return <Studio3DObjectEditor scene={scene} playhead={1} onChange={objects => setScene({ ...scene, objects })} />;
  }
  render(<Editor />);
  const x = screen.getByLabelText("Object x");
  fireEvent.change(x, { target: { value: "-" } }); expect(x).toHaveValue("-"); expect(saved.objects[0].x).toBe(0);
  fireEvent.change(x, { target: { value: "-2.5" } }); fireEvent.blur(x); expect(saved.objects[0].x).toBe(-2.5);
  fireEvent.change(x, { target: { value: "-3.75" } }); fireEvent.keyDown(x, { key: "Escape" }); fireEvent.blur(x);
  expect(saved.objects[0].x).toBe(-2.5);
});
