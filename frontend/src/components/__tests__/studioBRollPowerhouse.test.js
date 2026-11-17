import { validateStudioMediaColorize } from '../studioMediaColorize';
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  BROLL_AUDIO_CUT_PRESETS,
  BROLL_CHOREOGRAPHY_PRESETS,
  BROLL_LAYOUT_PRESETS,
  BROLL_LOOK_POLISH_PRESETS,
  applyBRollAudioCutPreset,
  applyBRollChoreographyPreset,
  applyBRollLayoutPreset,
  applyBRollLookPolishPreset,
  buildBRollBeatMontage,
} from "../studioBRollPowerhouse";
import StudioBRollPowerhousePanel from "../StudioBRollPowerhousePanel";

describe("studioBRollPowerhouse", () => {
  const sampleVideoOverlay = {
    id: "broll-vid-1",
    type: "video",
    name: "cutaway-1.mp4",
    bRollMode: "fullscreen",
    startTime: 4.0,
    duration: 3.0,
    x: 50,
    y: 50,
    width: 100,
    height: 100,
    scale: 1,
    rotation: 0,
    opacity: 1,
  };

  test("applies all 10 B-roll layout presets including split-screens and circle portal", () => {
    expect(BROLL_LAYOUT_PRESETS).toHaveLength(10);

    const pipTR = applyBRollLayoutPreset(sampleVideoOverlay, "pip_top_right");
    expect(pipTR.bRollMode).toBe("pip");
    expect(pipTR.x).toBe(74);
    expect(pipTR.y).toBe(24);
    expect(pipTR.frameShape).toBe("round");
    expect(pipTR.layerShadow.enabled).toBe(true);

    const splitRight = applyBRollLayoutPreset(sampleVideoOverlay, "split_right_half");
    expect(splitRight.bRollMode).toBe("sideBySide");
    expect(splitRight.x).toBe(75);
    expect(splitRight.width).toBe(50);
    expect(splitRight.height).toBe(100);

    const splitTop = applyBRollLayoutPreset(sampleVideoOverlay, "split_top_half");
    expect(splitTop.x).toBe(50);
    expect(splitTop.y).toBe(25);
    expect(splitTop.width).toBe(100);
    expect(splitTop.height).toBe(50);

    const portal = applyBRollLayoutPreset(sampleVideoOverlay, "circle_portal");
    expect(portal.mask).toEqual({
      enabled: true,
      shape: "ellipse",
      feather: 4,
      inverted: false,
    });
    expect(portal.glow.enabled).toBe(true);
  });

  test("applies keyframed motion choreographies for both video and image B-roll", () => {
    expect(BROLL_CHOREOGRAPHY_PRESETS).toHaveLength(6);

    const whip = applyBRollChoreographyPreset({
      overlay: sampleVideoOverlay,
      keyframes: [],
      presetId: "whip_pan_cutaway",
    });
    expect(whip.overlay.motionBlur).toEqual({ enabled: true, samples: 6, shutter: 0.65 });
    expect(whip.keyframes.some(k => k.targetId === "broll-vid-1" && k.property === "x")).toBe(true);
    expect(whip.keyframes.some(k => k.targetId === "broll-vid-1" && k.property === "opacity")).toBe(true);

    const floating = applyBRollChoreographyPreset({
      overlay: { ...sampleVideoOverlay, type: "image" },
      keyframes: [],
      presetId: "floating_parallax_card",
    });
    expect(floating.overlay.motionDrivers.x.enabled).toBe(true);
    expect(floating.overlay.motionDrivers.y.enabled).toBe(true);
    expect(floating.overlay.motionDrivers.rotation.enabled).toBe(true);
  });

  test("applies J-Cut, L-Cut, and audio ducking presets with timeline clamping", () => {
    expect(BROLL_AUDIO_CUT_PRESETS).toHaveLength(5);

    const voiceFirst = applyBRollAudioCutPreset(sampleVideoOverlay, "voice_first_duck", 30);
    expect(voiceFirst.useOverlayAudio).toBe(true);
    expect(voiceFirst.audioDucking).toBe(true);
    expect(voiceFirst.audioDuckingStrength).toBe(0.2);
    expect(voiceFirst.overlayAudioVolume).toBe(0.25);

    const jCut = applyBRollAudioCutPreset(sampleVideoOverlay, "j_cut_lead_in", 30);
    expect(jCut.startTime).toBe(3.65);
    expect(jCut.duration).toBe(3.35);
    expect(jCut.animation.enterDuration).toBe(0.35);

    const lCut = applyBRollAudioCutPreset(sampleVideoOverlay, "l_cut_trail_out", 30);
    expect(lCut.duration).toBe(3.45);
    expect(lCut.animation.exitDuration).toBe(0.45);
  });

  test("applies visual grade and depth polish presets", () => {
    expect(BROLL_LOOK_POLISH_PRESETS).toHaveLength(5);

    const warm = applyBRollLookPolishPreset(sampleVideoOverlay, "cinema_warm_match");
    expect(warm.colorize.enabled).toBe(true);
    expect(warm.colorize.color).toBe("#f59e0b");

    const noir = applyBRollLookPolishPreset(sampleVideoOverlay, "noir_archival_proof");
    expect(noir.colorize.gamma).toBe(0.98);
    expect(noir.colorize.contrast).toBe(1.25);
  });

  test("sequences multi-clip B-roll montage and snaps to beat markers", () => {
    const overlays = [
      { ...sampleVideoOverlay, id: "b1", startTime: 8, duration: 4 },
      { ...sampleVideoOverlay, id: "b2", type: "image", startTime: 2, duration: 4 },
    ];
    const beatMarkers = [{ time: 1.05 }, { time: 3.1 }, { time: 5.15 }];

    const montage = buildBRollBeatMontage({
      overlays,
      keyframes: [],
      beatMarkers,
      startTime: 1.0,
      clipDuration: 2.0,
      mode: "sequential_montage",
      programmeDuration: 20,
    });

    expect(montage.updatedCount).toBe(2);
    const b2 = montage.overlays.find(item => item.id === "b2");
    const b1 = montage.overlays.find(item => item.id === "b1");
    expect(b2.startTime).toBeCloseTo(1.05, 2);
    expect(b1.startTime).toBeGreaterThanOrEqual(b2.startTime + b2.duration - 0.05);
    expect(montage.keyframes.length).toBeGreaterThan(0);
  });

  test("renders StudioBRollPowerhousePanel and dispatches layout, choreography, audio, look, and montage actions", () => {
    const onUpdateOverlay = jest.fn();
    const onApplyChoreography = jest.fn();
    const onApplyBatchMontage = jest.fn();

    render(
      <StudioBRollPowerhousePanel
        activeOverlay={sampleVideoOverlay}
        overlays={[sampleVideoOverlay]}
        keyframes={[]}
        beatMarkers={[{ time: 2.0 }, { time: 4.0 }]}
        playheadTime={2.0}
        programmeDuration={30}
        onUpdateOverlay={onUpdateOverlay}
        onApplyChoreography={onApplyChoreography}
        onApplyBatchMontage={onApplyBatchMontage}
      />
    );

    fireEvent.click(screen.getByTestId("broll-layout-circle_portal"));
    expect(onUpdateOverlay).toHaveBeenCalledTimes(1);
    expect(onUpdateOverlay.mock.calls[0][0].mask.shape).toBe("ellipse");

    fireEvent.click(screen.getByTestId("broll-choreo-whip_pan_cutaway"));
    expect(onApplyChoreography).toHaveBeenCalledTimes(1);
    expect(onApplyChoreography.mock.calls[0][0].overlay.motionBlur.enabled).toBe(true);

    fireEvent.click(screen.getByTestId("broll-audio-j_cut_lead_in"));
    expect(onUpdateOverlay).toHaveBeenCalledTimes(2);
    expect(onUpdateOverlay.mock.calls[1][0].startTime).toBe(3.65);

    fireEvent.click(screen.getByTestId("broll-look-cool_tech_glass"));
    expect(onUpdateOverlay).toHaveBeenCalledTimes(3);
    expect(onUpdateOverlay.mock.calls[2][0].glow.enabled).toBe(true);

    fireEvent.click(screen.getByTestId("broll-montage-sequence"));
    expect(onApplyBatchMontage).toHaveBeenCalledTimes(1);
    expect(onApplyBatchMontage.mock.calls[0][0].updatedCount).toBe(1);
  });
});

test("every B-roll look writes colour settings accepted by the canonical compiler", () => {
 for (const preset of BROLL_LOOK_POLISH_PRESETS) {
  const layer=applyBRollLookPolishPreset({id:"shot",type:"video",bRollMode:"pip"},preset.id);
  expect(()=>validateStudioMediaColorize(layer.colorize)).not.toThrow();
 }
});
test('montage leaves clips with no remaining programme slot unchanged and never overlaps a snapped cut',()=>{
 const overlays=[0,1,2].map(i=>({id:'shot-'+i,type:'video',bRollMode:'fullscreen',startTime:i,duration:1}));
 const result=buildBRollBeatMontage({overlays,startTime:8.5,programmeDuration:10,clipDuration:2,beatMarkers:[{time:8.2},{time:9.9},{time:10.2}]});
 expect(result.updatedCount).toBe(1);
 expect(result.overlays[0].startTime+result.overlays[0].duration).toBeLessThanOrEqual(10);
 expect(result.overlays[1]).toEqual(overlays[1]);expect(result.overlays[2]).toEqual(overlays[2]);
});
