import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import StudioCreativeEffectsPanel from "../StudioCreativeEffectsPanel";
import {
  STUDIO_CREATIVE_EFFECT_CATALOG,
  STUDIO_CREATIVE_CATEGORIES,
  buildSpeedRampingKeyframes,
  createCreativeEffectInstance,
  evaluateCreativeEffectParams,
  getAvailableCreativeCategories,
} from "../studioCreativeEffects";
import { buildSpeedSegmentsFromKeyframes } from "../studioCreatorRecipes";
import { adaptStudioSnapshotToDocument } from "../studioProjectDocument";
import { compileStudioFinishForRender } from "../studioRenderCompiler";

describe("Phase 3 Motion Effects & Full 9-Category Library", () => {
  test("all 9 requested UI categories and all 13 creative effects are functional and available", () => {
    const cats = getAvailableCreativeCategories().map(c => c.id);
    expect(cats).toEqual(STUDIO_CREATIVE_CATEGORIES.map(c => c.id));
    expect(cats).toHaveLength(10); // 'all' + all 9 categories

    const ids = STUDIO_CREATIVE_EFFECT_CATALOG.filter(e => e.available).map(e => e.id);
    expect(ids).toEqual([
      "ripped_paper",
      "scrapbook",
      "doodles",
      "film_grain",
      "light_leaks",
      "vhs_glitch",
      "comic_pop_art",
      "freeze_cutout",
      "kinetic_typography",
      "speed_ramping",
      "zoom_motion_blur",
      "flash_camera_shake",
      "particle_overlays",
    ]);
  });

  test("speed_ramping compiles cleanly to canonical speedKeyframes & speed segments", () => {
    const eff = createCreativeEffectInstance("speed_ramping", {
      id: "fx-spd-1",
      startTime: 1.0,
      duration: 4.0,
      params: { preset: "hero_slow_mo", startRate: 2.0, midRate: 0.4, endRate: 1.6, reverse: false, opticalFlow: true },
    });
    const keys = buildSpeedRampingKeyframes(eff);
    expect(keys).toHaveLength(3);
    expect(keys[0].value).toBe(2.0);
    expect(keys[1].value).toBe(0.4);
    expect(keys[2].value).toBe(1.6);

    const segments = buildSpeedSegmentsFromKeyframes({ keyframes: keys, duration: 6.0 });
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments.some(seg => seg.rate < 1.0)).toBe(true);

    const onSync = jest.fn();
    render(
      <StudioCreativeEffectsPanel
        creativeEffects={[eff]}
        activeEffectId="fx-spd-1"
        onSyncSpeedRampEffect={onSync}
        currentTime={1.5}
        programmeDuration={6.0}
      />
    );
    expect(screen.getByTestId("speed-ramp-curve-box")).toBeTruthy();
    fireEvent.click(screen.getByTestId("sync-speed-ramp-btn"));
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  test("zoom_motion_blur, flash_camera_shake, and particle_overlays serialize & keyframe properly", () => {
    const zoom = createCreativeEffectInstance("zoom_motion_blur", {
      id: "fx-zoom-1",
      startTime: 0,
      duration: 2.0,
      tracking: { enabled: true, sourceLayerId: "hero-subj" },
    });
    const shake = createCreativeEffectInstance("flash_camera_shake", { id: "fx-sh-1", startTime: 2.0, duration: 1.0, params: { beatSync: true } });
    const particles = createCreativeEffectInstance("particle_overlays", { id: "fx-pt-1", startTime: 0, duration: 4.0, params: { particleType: "confetti", maskMode: "behind_subject" } });
    const keys = [
      { id: "kz1", targetId: "fx-zoom-1", property: "zoomScale", time: 0, value: 1.0, easing: "linear" },
      { id: "kz2", targetId: "fx-zoom-1", property: "zoomScale", time: 2, value: 2.2, easing: "linear" },
    ];
    expect(evaluateCreativeEffectParams(zoom, keys, 1.0).params.zoomScale).toBeCloseTo(1.6, 3);

    const doc = adaptStudioSnapshotToDocument({
      snapshot: {
        timeline: [{ id: "c1", sourceClipId: "s1", startRequest: 0, endRequest: 4 }],
        creativeEffects: [zoom, shake, particles],
        motionKeyframes: keys,
      },
      projectId: "p3-motion",
    });
    const compiled = compileStudioFinishForRender(doc);
    expect(compiled.creative_effects).toHaveLength(3);
    expect(compiled.creative_effects[2].params.maskMode).toBe("behind_subject");
  });
});
