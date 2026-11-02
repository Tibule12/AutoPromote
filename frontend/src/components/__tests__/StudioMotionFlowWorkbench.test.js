import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import StudioCompWorkbench from "../StudioCompWorkbench";
import StudioNodeFlow from "../StudioNodeFlowPanel";
import {
  StudioInspectorTabs,
  StudioWorkspaceModeSwitch,
  VIRAL_STUDIO_WORKSPACE_MODES,
  getViralStudioToolsForMode,
  normalizeViralStudioWorkspaceMode,
} from "../ViralStudioChrome";

const COMPETITOR_BRAND_PATTERN = /\b(adobe|after\s*effects|davinci|fusion|premiere|capcut|final\s*cut|ae)\b/i;

function Harness() {
  const [overlays, setOverlays] = useState([
    {
      id: "title-1",
      name: "Hero Title",
      type: "text",
      text: "LOCK IN",
      x: 50,
      y: 35,
      scale: 1,
      rotation: 0,
      opacity: 1,
      startTime: 0,
      duration: 5,
    },
    {
      id: "plate-1",
      name: "Accent Plate",
      type: "image",
      src: "https://example.com/plate.png",
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
      opacity: 1,
      startTime: 0,
      duration: 5,
    },
  ]);
  const [mainTransform, setMainTransform] = useState({ x: 50, y: 50, scale: 1, rotation: 0, opacity: 1 });
  const [motionKeyframes, setMotionKeyframes] = useState([]);
  const [adjustmentLayers, setAdjustmentLayers] = useState([]);
  const [nodeFlow, setNodeFlow] = useState({ version: 1, viewerA: "MediaOut", viewerB: null, splitPosition: 50 });
  const [activeOverlayId, setActiveOverlayId] = useState("plate-1");
  const [hideShyLayers, setHideShyLayers] = useState(false);

  return (
    <div>
      <StudioCompWorkbench
        overlays={overlays}
        mainTransform={mainTransform}
        motionKeyframes={motionKeyframes}
        adjustmentLayers={adjustmentLayers}
        activeOverlayId={activeOverlayId}
        hideShyLayers={hideShyLayers}
        currentTime={1.2}
        programmeDuration={6}
        onSelectOverlay={setActiveOverlayId}
        onChangeOverlays={setOverlays}
        onChangeMainTransform={setMainTransform}
        onChangeMotionKeyframes={setMotionKeyframes}
        onChangeAdjustmentLayers={setAdjustmentLayers}
        onChangeHideShyLayers={setHideShyLayers}
      />
      <StudioNodeFlow
        overlays={overlays}
        mainTransform={mainTransform}
        finishFx={{ contrast: 100 }}
        adjustmentLayers={adjustmentLayers}
        motionKeyframes={motionKeyframes}
        nodeFlow={nodeFlow}
        activeOverlayId={activeOverlayId}
        currentTime={1.2}
        programmeDuration={6}
        onSelectOverlay={setActiveOverlayId}
        onChangeOverlays={setOverlays}
        onChangeMainTransform={setMainTransform}
        onChangeAdjustmentLayers={setAdjustmentLayers}
        onChangeNodeFlow={setNodeFlow}
      />
      <output data-testid="state-readout">
        {JSON.stringify({
          overlayCount: overlays.length,
          plateParent: overlays.find(o => o.id === "plate-1")?.parentId || null,
          plateMatte: overlays.find(o => o.id === "plate-1")?.trackMatte?.mode || "none",
          keyCount: motionKeyframes.length,
          viewerB: nodeFlow.viewerB,
        })}
      </output>
    </div>
  );
}

describe("StudioCompWorkbench & StudioNodeFlow UI Integration", () => {
  test("Comp Workbench creates Null Rig, wires Pick-Whip parenting, sets Track Matte, adds Motion Driver, stamps keyframes and syncs live to Signal Node Flow", () => {
    render(<Harness />);

    // 1. Add a Null Rig in Comp Workbench -> appears in both layer matrix and Signal Node Flow
    fireEvent.click(screen.getByTestId("comp-add-null-rig"));
    expect(JSON.parse(screen.getByTestId("state-readout").textContent).overlayCount).toBe(3);

    // 2. Parent Accent Plate to Hero Title via Pick-Whip selector
    fireEvent.change(screen.getByLabelText("Parent layer for Accent Plate"), {
      target: { value: "title-1" },
    });
    expect(JSON.parse(screen.getByTestId("state-readout").textContent).plateParent).toBe("title-1");

    // 3. Assign Alpha Matte on Accent Plate -> Merge:plate-1 receives Matte wire in Signal Node Flow
    fireEvent.change(screen.getByLabelText("Track matte mode for Accent Plate"), {
      target: { value: "alpha" },
    });
    expect(JSON.parse(screen.getByTestId("state-readout").textContent).plateMatte).toBe("alpha");

    // 4. Select Accent Plate, enable Inertial Spring driver, stamp keyframe, switch Speed Graph & apply Whip Snap curve
    fireEvent.click(
      within(screen.getByTestId("comp-layer-row-plate-1")).getByText("Accent Plate", {
        selector: ".ap-comp-layer-name",
      })
    );
    fireEvent.change(screen.getByLabelText("Motion driver expression type"), {
      target: { value: "spring" },
    });
    fireEvent.click(screen.getByTestId("comp-add-keyframe-playhead"));
    expect(JSON.parse(screen.getByTestId("state-readout").textContent).keyCount).toBe(1);

    fireEvent.click(screen.getByRole("tab", { name: "Speed Graph" }));
    fireEvent.click(screen.getByTestId("comp-curve-preset-whip_snap"));

    // 5. Assign ColorGrade node to Viewer [2] in Signal Node Flow -> Dual A/B wipe activates
    fireEvent.click(screen.getByLabelText("Assign ColorGrade to Viewer 2"));
    expect(JSON.parse(screen.getByTestId("state-readout").textContent).viewerB).toBe(
      "ColorCorrector:finish"
    );
    expect(screen.getByLabelText("Signal Flow A/B viewer wipe split")).toBeInTheDocument();

    // 6. Insert a 1-Click Smart Flow Rig -> adds real canonical layers synced back to Comp Workbench
    fireEvent.change(screen.getByTestId("flow-smart-rig-select"), {
      target: { value: "alpha_matte_reveal" },
    });
    expect(JSON.parse(screen.getByTestId("state-readout").textContent).overlayCount).toBe(5);
  });

  test("ViralStudioChrome exposes Motion & Flow (fxflow) mode and Node Flow tab with 100% AutoPromote product naming", () => {
    expect(normalizeViralStudioWorkspaceMode(undefined)).toBe("creator");
    expect(normalizeViralStudioWorkspaceMode("fxflow")).toBe("fxflow");

    for (const mode of VIRAL_STUDIO_WORKSPACE_MODES) {
      expect(mode.label).not.toMatch(COMPETITOR_BRAND_PATTERN);
      expect(mode.shortLabel).not.toMatch(COMPETITOR_BRAND_PATTERN);
      expect(mode.helper).not.toMatch(COMPETITOR_BRAND_PATTERN);
    }

    const sampleTools = [
      { id: "moments", label: "Moments" },
      { id: "flow", label: "Node Flow" },
      { id: "export", label: "Export" },
    ];
    expect(getViralStudioToolsForMode(sampleTools, "quick").map(t => t.id)).toEqual(["moments", "export"]);
    expect(getViralStudioToolsForMode(sampleTools, "fxflow").map(t => t.id)).toEqual([
      "moments",
      "flow",
      "export",
    ]);

    const onMode = jest.fn();
    const { container } = render(
      <>
        <StudioWorkspaceModeSwitch mode="fxflow" onChange={onMode} />
        <StudioInspectorTabs mode="fxflow" activeTab="flow" onSelect={() => {}} />
        <Harness />
      </>
    );
    expect(screen.getByTestId("studio-mode-fxflow")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Node Flow/i })).toHaveAttribute("aria-selected", "true");

    // Brand-hygiene regression check: zero competitor names in text, aria-label, or title attributes
    expect(container.textContent).not.toMatch(COMPETITOR_BRAND_PATTERN);
    for (const el of container.querySelectorAll("[aria-label], [title]")) {
      expect(el.getAttribute("aria-label") || "").not.toMatch(COMPETITOR_BRAND_PATTERN);
      expect(el.getAttribute("title") || "").not.toMatch(COMPETITOR_BRAND_PATTERN);
    }
  });
});
