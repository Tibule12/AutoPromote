import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import StudioCinematicPanel from "./StudioCinematicPanel";
import { createCinematicParameters, validateCinematicScene, PODCAST_PRESET } from "./cinematicContract";
import { normalizeStudio3DScene, studio3DSceneRevision } from "./studio3DModel";
import { programmeDocumentKey } from "./cinematicProgrammeClient";

test("moving a scene retains verified local frames while a camera edit invalidates them", () => {
  const scene = normalizeStudio3DScene({ id: "evidence", sceneType: "cinematic_evidence", startTime: 0,
    duration: 8, cinematic: createCinematicParameters("a".repeat(64)) });
  const revision = studio3DSceneRevision(scene);
  scene.hqPreviewRevision = revision; scene.hqPreviewUrl = "/api/cinematic/jobs/test/movie.mp4";
  scene.localExport = { revision, url: scene.hqPreviewUrl, jobId: "a".repeat(64), sha256: "b".repeat(64) };
  const change = jest.fn();
  render(<StudioCinematicPanel scenes={[scene]} focusId={scene.id} onChange={change} onSelect={() => {}} duration={16} />);
  fireEvent.change(screen.getByLabelText("Programme start (s)"), { target: { value: "8" } });
  const moved = change.mock.calls[0][0][0];
  expect(moved.localExport.revision).toBe(studio3DSceneRevision(moved));
  expect(moved.hqPreviewRevision).toBe(studio3DSceneRevision(moved));
  expect(moved.localExport.jobId).toBe(scene.localExport.jobId);
  fireEvent.change(screen.getByLabelText("Focal length (mm)"), { target: { value: "60" } });
  const changed = change.mock.calls[1][0][0];
  expect(changed.localExport.revision).not.toBe(studio3DSceneRevision(changed));
});

test("an async programme review ignores save journal changes but detects creative and source edits", () => {
  const document = { revision: 1, journal: ["saved"], layers: [{ parameters: { text: "Evidence" } }], assets: [{ contentHash: "a" }] };
  const saved = { ...document, revision: 2, journal: ["saved", "checkpoint"] };
  expect(programmeDocumentKey(saved)).toBe(programmeDocumentKey(document));
  expect(programmeDocumentKey({ ...saved, assets: [{ contentHash: "b" }] })).not.toBe(programmeDocumentKey(document));
  expect(programmeDocumentKey({ ...saved, layers: [{ parameters: { text: "Revised" } }] })).not.toBe(programmeDocumentKey(document));
});

test("the native preset control creates valid editable podcast timing without retaining illustrative clock content", () => {
  const scene = normalizeStudio3DScene({ id: "set", sceneType: "cinematic_evidence", startTime: 0,
    duration: 8, cinematic: createCinematicParameters("a".repeat(64)) });
  const change = jest.fn();
  render(<StudioCinematicPanel scenes={[scene]} focusId={scene.id} onChange={change} onSelect={() => {}} duration={16} />);
  fireEvent.change(screen.getByLabelText("Set design"), { target: { value: PODCAST_PRESET } });
  const next = change.mock.calls[0][0][0];
  expect(() => validateCinematicScene(next)).not.toThrow();
  expect(next.cinematic.content.brand).toBe("UNMUTED");
  expect(next.cinematic.content.clockA).toBeUndefined();
  expect(next.cinematic.timing.wordA).toBeGreaterThan(0);
});

test("podcast yaw displays and edits the physical surface angle in degrees", () => {
  const scene = normalizeStudio3DScene({ id: "set-angle", sceneType: "cinematic_evidence", startTime: 0,
    duration: 8, cinematic: createCinematicParameters("a".repeat(64), "b".repeat(64), PODCAST_PRESET) });
  const change = jest.fn();
  render(<StudioCinematicPanel scenes={[scene]} focusId={scene.id} onChange={change} onSelect={() => {}} duration={16} />);
  expect(screen.getByLabelText("Presenter yaw (°)")).toHaveValue(-3);
  fireEvent.change(screen.getByLabelText("Presenter yaw (°)"), { target: { value: "-4" } });
  expect(change.mock.calls[0][0][0].cinematic.camera.screenYaw / 4).toBe(-4);
});
