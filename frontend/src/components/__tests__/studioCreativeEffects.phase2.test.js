import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import StudioCreativeEffectsPanel from "../StudioCreativeEffectsPanel";
import {
  STUDIO_CREATIVE_EFFECT_CATALOG,
  createCreativeEffectInstance,
  evaluateCreativeEffectParams,
  getAvailableCreativeCategories,
} from "../studioCreativeEffects";
import { adaptStudioSnapshotToDocument } from "../studioProjectDocument";
import { compileStudioFinishForRender } from "../studioRenderCompiler";

describe("Phase 2 Stylised Creative Effects", () => {
  test("all Phase 2 effects and categories are available", () => {
    const ids = STUDIO_CREATIVE_EFFECT_CATALOG.filter(e => e.available).map(e => e.id);
    expect(ids).toEqual(expect.arrayContaining(["vhs_glitch", "comic_pop_art", "freeze_cutout", "kinetic_typography"]));
    const cats = getAvailableCreativeCategories().map(c => c.id);
    expect(cats).toEqual(expect.arrayContaining(["glitch_distortion", "comic_pop_art", "camera_transitions", "text_typography"]));
  });

  test("freeze_cutout and kinetic_typography integrate with captions and keyframes", () => {
    const fc = createCreativeEffectInstance("freeze_cutout", { id: "fc-1", startTime: 1.0, duration: 2.0 });
    const keys = [
      { id: "k1", targetId: "fc-1", property: "cutoutScale", time: 1.0, value: 0.9, easing: "linear" },
      { id: "k2", targetId: "fc-1", property: "cutoutScale", time: 2.0, value: 1.5, easing: "linear" },
    ];
    expect(evaluateCreativeEffectParams(fc, keys, 1.5).params.cutoutScale).toBeCloseTo(1.2, 3);

    function Harness() {
      const [effects, setEffects] = React.useState([]);
      const [activeId, setActiveId] = React.useState(null);
      return (
        <div>
          <StudioCreativeEffectsPanel
            creativeEffects={effects}
            activeEffectId={activeId}
            onSelectEffect={setActiveId}
            onChangeCreativeEffects={setEffects}
            currentTime={1.25}
            programmeDuration={6}
            captionSegments={[
              {
                id: "cap-1",
                start: 1.0,
                end: 2.5,
                text: "HELLO STUDIO",
                wordTimings: [
                  { word: "HELLO", start: 1.0, end: 1.6 },
                  { word: "STUDIO", start: 1.6, end: 2.4 },
                ],
              },
            ]}
          />
          <output data-testid="state">{JSON.stringify(effects)}</output>
        </div>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByTestId("apply-fx-kinetic_typography"));
    fireEvent.click(screen.getByTestId("kinetic-import-captions-btn"));
    const parsed = JSON.parse(screen.getByTestId("state").textContent);
    expect(parsed[0].params.style).toBe("karaoke_highlight");
    expect(parsed[0].params.wordTimings).toHaveLength(2);
    expect(parsed[0].params.text).toBe("HELLO STUDIO");

    const doc = adaptStudioSnapshotToDocument({
      snapshot: { timeline: [{ id: "c1", sourceClipId: "s1", startRequest: 0, endRequest: 4 }], creativeEffects: parsed },
      projectId: "p2-kt",
    });
    const compiled = compileStudioFinishForRender(doc);
    expect(compiled.creative_effects[0].params.wordTimings).toHaveLength(2);
  });
});
