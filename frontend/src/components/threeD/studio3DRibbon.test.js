import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import samples from "./ribbon-conformance.json";
import { ribbonMesh, RIBBON_DEFAULTS } from "./studio3DRibbon";
import { createStudio3DScene, normalizeStudio3DScene, studio3DSceneRevision } from "./studio3DModel";
import Studio3DObjectEditor from "./Studio3DObjectEditor";

test.each(samples)("browser and canonical mesh agree for $config.path at $time", sample => {
  const mesh = ribbonMesh(sample.config, sample.time);
  expect(mesh.positions.length / 3).toBe(sample.vertices);
  for (const point of sample.points) point.position.forEach((value, axis) => expect(mesh.positions[point.index * 3 + axis]).toBeCloseTo(value, 7));
  expect(Math.max(...mesh.indices)).toBeLessThan(sample.vertices);
});
test("seeking is deterministic and speed zero holds a procedural surface", () => {
  const moving = { ...RIBBON_DEFAULTS };
  const first = ribbonMesh(moving, 1).positions;
  expect(ribbonMesh(moving, 2).positions).not.toEqual(first);
  expect(ribbonMesh(moving, 1).positions).toEqual(first);
  expect(ribbonMesh({ ...moving, speed: 0 }, 1).positions).toEqual(ribbonMesh({ ...moving, speed: 0 }, 9).positions);
});
test("ordinary controls retain ribbon form and surface decisions across backup normalization", () => {
  let scene;
  function Editor() {
    const [value, setValue] = useState(createStudio3DScene("object_scene", 0, "flow")); scene = value;
    return <Studio3DObjectEditor scene={value} playhead={2} onChange={objects => setValue({ ...value, objects })} />;
  }
  render(<Editor />); fireEvent.click(screen.getByRole("button", { name: "Add ribbon" }));
  const before = studio3DSceneRevision(scene);
  fireEvent.change(screen.getByLabelText("Ribbon path"), { target: { value: "wave" } });
  fireEvent.change(screen.getByLabelText("Ribbon speed"), { target: { value: "-.4" } });
  fireEvent.change(screen.getByLabelText("Object surface"), { target: { value: "brushed" } });
  fireEvent.change(screen.getByLabelText("Object surface roughness"), { target: { value: ".19" } });
  const restored = normalizeStudio3DScene(JSON.parse(JSON.stringify(scene)));
  expect(restored.objects.at(-1)).toMatchObject({ shape: "ribbon", material: "brushed", roughness: .19, ribbon: { path: "wave", speed: -.4 } });
  expect(studio3DSceneRevision(restored)).not.toBe(before);
  fireEvent.change(screen.getByLabelText("Object shape"), { target: { value: "sphere" } });
  expect(scene.objects.at(-1).ribbon).toBeUndefined();
});
