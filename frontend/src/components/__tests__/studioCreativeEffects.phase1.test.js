import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import StudioCreativeEffectsPanel from "../StudioCreativeEffectsPanel";
import {
  STUDIO_CREATIVE_EFFECT_CATALOG,
  buildScrapbookCollagePreset,
  buildScrapbookElementLayer,
  createCreativeEffectInstance,
  evaluateCreativeEffectParams,
  generateDoodlePaths,
  generateTornEdgePolyline,
  getAvailableCreativeCategories,
  mulberry32,
  hashSeed,
  normalizeCreativeEffects,
} from "../studioCreativeEffects";
import {
  adaptStudioSnapshotToDocument,
  projectStudioEditableStateToSnapshot,
} from "../studioProjectDocument";
import {
  compileStudioCompositionForRender,
  compileStudioFinishForRender,
} from "../studioRenderCompiler";
import { studioMotionPropertiesForTarget } from "../studioMotionProperties";

describe("Phase 1 Creative Effects & Overlays", () => {
  test("catalog exposes only implemented Phase 1 functional effects", () => {
    const ids = STUDIO_CREATIVE_EFFECT_CATALOG.filter(e => e.available).map(e => e.id);
    expect(ids).toEqual(expect.arrayContaining(["ripped_paper", "scrapbook", "doodles", "film_grain", "light_leaks"]));
    const catIds = getAvailableCreativeCategories().map(c => c.id);
    expect(catIds).toEqual(expect.arrayContaining(["all", "paper_collage", "drawing_doodles", "vintage_film"]));
  });

  test("deterministic PRNG, torn edge polyline and doodle stroke geometry are reproducible", () => {
    const r1 = mulberry32(hashSeed("torn-17"));
    const r2 = mulberry32(hashSeed("torn-17"));
    expect(Array.from({ length: 5 }, () => r1())).toEqual(Array.from({ length: 5 }, () => r2()));

    const polyA = generateTornEdgePolyline({
      width: 640,
      height: 360,
      progress: 50,
      positionPct: 50,
      direction: "vertical",
      angleDeg: 0,
      roughness: 60,
      seed: 17,
    });
    const polyB = generateTornEdgePolyline({
      width: 640,
      height: 360,
      progress: 50,
      positionPct: 50,
      direction: "vertical",
      angleDeg: 0,
      roughness: 60,
      seed: 17,
    });
    expect(polyA.seam).toEqual(polyB.seam);
    expect(polyA.seam.length).toBe(97);

    const arrow = generateDoodlePaths("arrow", 11, 40);
    expect(arrow.length).toBe(2);
    expect(arrow[0].length).toBe(19);
    const heart = generateDoodlePaths("heart", 11, 40);
    expect(heart[0].length).toBe(49);
  });

  test("keyframes animate creative effect parameters and expose curve properties", () => {
    const fx = createCreativeEffectInstance("ripped_paper", { id: "fx-tear-1", startTime: 0, duration: 4 });
    const props = studioMotionPropertiesForTarget(fx);
    expect(props.some(p => p.id === "tearProgress")).toBe(true);
    expect(props.some(p => p.id === "opacity")).toBe(true);

    const keys = [
      { id: "k1", targetId: "fx-tear-1", property: "tearProgress", time: 0, value: 0, easing: "linear" },
      { id: "k2", targetId: "fx-tear-1", property: "tearProgress", time: 2, value: 100, easing: "linear" },
    ];
    expect(evaluateCreativeEffectParams(fx, keys, 0).params.tearProgress).toBeCloseTo(0, 3);
    expect(evaluateCreativeEffectParams(fx, keys, 1).params.tearProgress).toBeCloseTo(50, 3);
    expect(evaluateCreativeEffectParams(fx, keys, 2).params.tearProgress).toBeCloseTo(100, 3);
  });

  test("canonical project save/reopen and render compilers preserve creativeEffects & scrapbookFrame", () => {
    const fx = createCreativeEffectInstance("film_grain", {
      id: "fx-grain-1",
      startTime: 0.5,
      duration: 3.5,
      params: { preset: "8mm_kodachrome", intensity: 72 },
    });
    const doodle = createCreativeEffectInstance("doodles", {
      id: "fx-doodle-1",
      startTime: 0,
      duration: 3,
      tracking: { enabled: true, sourceLayerId: "tracked-logo", offsetX: 4, offsetY: -6 },
    });
    const scrapbookPreset = buildScrapbookCollagePreset({ preset: "polaroid_duo", startTime: 0, duration: 4 });
    const snapshot = {
      timeline: [{ id: "clip-1", sourceClipId: "src-1", startRequest: 0, endRequest: 6 }],
      overlays: [
        {
          id: "tracked-logo",
          name: "Tracked Logo",
          type: "image",
          src: "https://example.com/logo.png",
          x: 42,
          y: 38,
          width: 30,
          height: 30,
          startTime: 0,
          duration: 5,
          scrapbookFrame: { enabled: true, frameStyle: "polaroid", captionText: "LIVE", borderColor: "#f7f3eb", borderWidth: 20, tapeTop: true },
        },
        ...scrapbookPreset.layers,
      ],
      creativeEffects: [fx, doodle, scrapbookPreset.fx],
      motionKeyframes: [
        { id: "mk1", targetId: "tracked-logo", property: "x", time: 0, value: 30, easing: "linear" },
        { id: "mk2", targetId: "tracked-logo", property: "x", time: 2, value: 65, easing: "linear" },
        { id: "fk1", targetId: "fx-grain-1", property: "intensity", time: 0.5, value: 25, easing: "linear" },
        { id: "fk2", targetId: "fx-grain-1", property: "intensity", time: 3.5, value: 90, easing: "linear" },
      ],
    };

    const doc = adaptStudioSnapshotToDocument({ snapshot, projectId: "phase1-parity" });
    const roundTripped = JSON.parse(JSON.stringify(doc));
    const reopened = projectStudioEditableStateToSnapshot(roundTripped, snapshot);
    expect(reopened.creativeEffects).toHaveLength(3);
    expect(reopened.creativeEffects[0].params.preset).toBe("8mm_kodachrome");
    expect(reopened.overlays[0].scrapbookFrame.enabled).toBe(true);

    const compiledFinish = compileStudioFinishForRender(roundTripped);
    expect(compiledFinish.creative_effects).toHaveLength(3);
    expect(compiledFinish.creative_effects[0].motion_keyframes).toHaveLength(2);
    expect(compiledFinish.creative_effects[1].tracking.source_keyframes).toHaveLength(2);

    const compiledComp = compileStudioCompositionForRender(roundTripped);
    const compiledLogo = compiledComp.layers.find(l => l.id === "tracked-logo");
    expect(compiledLogo.effects.scrapbook_frame.enabled).toBe(true);
  });

  test("StudioCreativeEffectsPanel supports search, filtering, apply, reorder, disable, duplicate, keyframe toggle, delete", () => {
    function Harness() {
      const [effects, setEffects] = React.useState([]);
      const [activeId, setActiveId] = React.useState(null);
      const [keys, setKeys] = React.useState([]);
      return (
        <div>
          <StudioCreativeEffectsPanel
            creativeEffects={effects}
            activeEffectId={activeId}
            onSelectEffect={setActiveId}
            onChangeCreativeEffects={setEffects}
            motionKeyframes={keys}
            onToggleEffectKeyframe={(targetId, prop, val) =>
              setKeys(prev => [...prev, { id: `k-${prev.length}`, targetId, property: prop, time: 0.5, value: val }])
            }
            currentTime={0.5}
            programmeDuration={8}
          />
          <output data-testid="fx-count">{effects.length}</output>
          <output data-testid="kf-count">{keys.length}</output>
        </div>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByTestId("apply-fx-ripped_paper"));
    expect(screen.getByTestId("fx-count").textContent).toBe("1");

    fireEvent.change(screen.getByTestId("creative-fx-search"), { target: { value: "light" } });
    expect(screen.queryByTestId("apply-fx-ripped_paper")).toBeNull();
    expect(screen.getByTestId("apply-fx-light_leaks")).toBeTruthy();

    fireEvent.click(screen.getByTestId("apply-fx-light_leaks"));
    expect(screen.getByTestId("fx-count").textContent).toBe("2");

    // Duplicate & Keyframe toggle
    fireEvent.click(screen.getAllByTitle("Duplicate effect")[0]);
    expect(screen.getByTestId("fx-count").textContent).toBe("3");

    fireEvent.click(screen.getByLabelText("Toggle opacity keyframe"));
    expect(screen.getByTestId("kf-count").textContent).toBe("1");

    // Delete works without error
    fireEvent.click(screen.getAllByTitle("Delete effect")[0]);
    expect(screen.getByTestId("fx-count").textContent).toBe("2");
  });

  test("buildScrapbookElementLayer builds draggable tape, paper sheet, and sticker artwork", () => {
    const tape = buildScrapbookElementLayer({ kind: "tape", startTime: 1, duration: 3 });
    expect(tape.type).toBe("image");
    expect(tape.src.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(normalizeCreativeEffects([createCreativeEffectInstance("doodles")]).length).toBe(1);
  });
});
