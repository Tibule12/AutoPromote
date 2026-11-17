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
  const [finishFx, setFinishFx] = useState({ contrast: 1 });
  const [finishKeyframes, setFinishKeyframes] = useState([]);
  const [advancedColor, setAdvancedColor] = useState(null);
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
        finishFx={finishFx}
        finishKeyframes={finishKeyframes}
        advancedColor={advancedColor}
        adjustmentLayers={adjustmentLayers}
        motionKeyframes={motionKeyframes}
        nodeFlow={nodeFlow}
        activeOverlayId={activeOverlayId}
        currentTime={1.2}
        programmeDuration={6}
        onSelectOverlay={setActiveOverlayId}
        onChangeOverlays={setOverlays}
        onChangeMainTransform={setMainTransform}
        onChangeFinishFx={setFinishFx}
        onChangeFinishKeyframes={setFinishKeyframes}
        onChangeAdvancedColor={setAdvancedColor}
        onChangeAdjustmentLayers={setAdjustmentLayers}
        onChangeMotionKeyframes={setMotionKeyframes}
        onChangeNodeFlow={setNodeFlow}
      />
      <output data-testid="state-readout">
        {JSON.stringify({
          overlayCount: overlays.length,
          overlays,
          plateParent: overlays.find(o => o.id === "plate-1")?.parentId || null,
          plateMatte: overlays.find(o => o.id === "plate-1")?.trackMatte?.mode || "none",
          keyCount: motionKeyframes.length,
          finishKeyCount: finishKeyframes.length,
          viewerB: nodeFlow.viewerB,
          lift: finishFx?.lift ?? 0,
          lutPresetId: advancedColor?.lutPresetId || "",
          lutSize: advancedColor?.lut?.size || 0,
          curveShadows: advancedColor?.curve?.shadows ?? 0,
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

  test("Signal Node Flow contextual inspectors edit MediaIn, PolygonMask, GlowBlur, Fit View, Bypass, and Remove Node", () => {
    render(<Harness />);

    // Add Kinetic Title node -> auto-selects MediaIn:<id> and exposes Title Copy input
    fireEvent.click(screen.getByTestId("flow-palette-add_title_node"));
    expect(JSON.parse(screen.getByTestId("state-readout").textContent).overlayCount).toBe(3);
    const titleInput = screen.getByTestId("flow-inspector-title-text");
    fireEvent.change(titleInput, { target: { value: "VIRAL HOOK" } });
    expect(titleInput.value).toBe("VIRAL HOOK");

    // Add Polygon Mask to active layer -> auto-selects PolygonMask:<id> and exposes stencil shape & invert controls
    fireEvent.click(screen.getByTestId("flow-palette-add_polygon_mask"));
    const maskShapeSelect = screen.getByTestId("flow-inspector-mask-shape");
    fireEvent.change(maskShapeSelect, { target: { value: "diamond" } });
    expect(maskShapeSelect.value).toBe("diamond");
    fireEvent.click(screen.getByTestId("flow-inspector-mask-invert"));

    // Add Glow & Blur -> auto-selects GlowBlur:<id> and exposes optical glow toggle
    fireEvent.click(screen.getByTestId("flow-palette-add_glow_blur"));
    const glowToggle = screen.getByTestId("flow-inspector-glow-toggle");
    expect(glowToggle).toBeChecked();

    // Bypass and re-enable selected node, Fit View, and Remove Node
    fireEvent.click(screen.getByTestId("flow-inspector-bypass-btn"));
    fireEvent.click(screen.getByTestId("flow-fit-view"));
    fireEvent.click(screen.getByTestId("flow-delete-selected-node"));
  });

  test("ColorGrade node drives 3-Way Wheels, 5-Knot Tone Curve, HSL & 3D .cube LUTs, Vector Bezier & Polygon Mask editors work live, and deleting a bound matte source detaches consumers cleanly", () => {
    render(<Harness />);

    // 1. Select ColorCorrector:finish node -> full Cinema Color Grading Suite + Broadcast Scopes + Grade Keyframes appear
    fireEvent.click(screen.getByTestId("flow-node-ColorCorrector:finish"));
    expect(screen.getByTestId("flow-color-grade-suite")).toBeInTheDocument();
    expect(screen.getByTestId("flow-color-scopes-card")).toBeInTheDocument();
    expect(screen.getByTestId("flow-grade-keyframes-card")).toBeInTheDocument();
    expect(screen.getByTestId("flow-3way-wheels-card")).toBeInTheDocument();
    expect(screen.getByTestId("flow-tone-curve-card")).toBeInTheDocument();
    expect(screen.getByTestId("flow-lut-lab-card")).toBeInTheDocument();

    // Switch Broadcast Color Scopes between Waveform, RGB Parade, and Vectorscope
    fireEvent.click(screen.getByTestId("flow-scope-mode-parade"));
    expect(screen.getByTestId("flow-color-scope-svg")).toHaveAttribute("data-scope-mode", "parade");
    fireEvent.click(screen.getByTestId("flow-scope-mode-vectorscope"));
    expect(screen.getByTestId("flow-color-scope-svg")).toHaveAttribute("data-scope-mode", "vectorscope");

    // Stamp a grade keyframe and generate Beat-Synced Grade Pulses
    fireEvent.click(screen.getByTestId("flow-stamp-grade-keyframe"));
    expect(JSON.parse(screen.getByTestId("state-readout").textContent).finishKeyCount).toBe(1);
    fireEvent.click(screen.getByTestId("flow-beat-sync-grade"));
    expect(JSON.parse(screen.getByTestId("state-readout").textContent).finishKeyCount).toBeGreaterThan(3);

    fireEvent.change(screen.getByLabelText("Grade Lift Shadows"), {
      target: { value: "-0.12" },
    });
    fireEvent.change(screen.getByLabelText("Curve Shadows"), {
      target: { value: "0.18" },
    });
    fireEvent.change(screen.getByTestId("flow-lut-preset-select"), {
      target: { value: "kodak_2383" },
    });

    const stateAfterGrade = JSON.parse(screen.getByTestId("state-readout").textContent);
    expect(stateAfterGrade.lift).toBeCloseTo(-0.12, 2);
    expect(stateAfterGrade.curveShadows).toBeCloseTo(0.18, 2);
    expect(stateAfterGrade.lutPresetId).toBe("kodak_2383");
    expect(stateAfterGrade.lutSize).toBe(17);

    // 2. Add Vector Shape -> embeds interactive StudioVectorPathEditor & Split Segment button
    fireEvent.click(screen.getByTestId("flow-palette-add_vector_shape"));
    expect(screen.getByTestId("flow-vector-bezier-box")).toBeInTheDocument();
    expect(screen.getByTestId("studio-vector-path-editor")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("flow-split-vector-segment"));

    // 3. Add Polygon Mask -> embeds interactive SVG Polygon Vertex Editor + Vertex Keyframe Stamping
    fireEvent.click(screen.getByTestId("flow-palette-add_polygon_mask"));
    expect(screen.getByTestId("flow-polygon-mask-editor")).toBeInTheDocument();
    expect(screen.getByTestId("flow-mask-vertex-0")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("flow-mask-autokey-toggle"));
    fireEvent.click(screen.getByTestId("flow-mask-stamp-keys"));
    expect(JSON.parse(screen.getByTestId("state-readout").textContent).keyCount).toBe(10);

    // 4. Bind plate-1 to title-1 as Alpha Matte + Parent, then delete title-1 via Comp Workbench delete button -> plate-1 detaches cleanly
    fireEvent.change(screen.getByLabelText("Parent layer for Accent Plate"), {
      target: { value: "title-1" },
    });
    fireEvent.change(screen.getByLabelText("Track matte mode for Accent Plate"), {
      target: { value: "alpha" },
    });
    expect(JSON.parse(screen.getByTestId("state-readout").textContent).plateMatte).toBe("alpha");

    fireEvent.click(screen.getByTestId("comp-delete-layer-title-1"));
    const stateAfterDelete = JSON.parse(screen.getByTestId("state-readout").textContent);
    expect(stateAfterDelete.plateParent).toBeNull();
    expect(stateAfterDelete.plateMatte).toBe("none");
  });
});

test('a physical down/up/click sequence keeps an output port armed for click-to-wire',()=>{
  render(<Harness/>);
  const port=screen.getByTestId('flow-port-out-Transform:plate-1-Out');
  fireEvent.mouseDown(port);fireEvent.mouseUp(port);fireEvent.click(port);
  expect(port).toHaveClass('is-wiring-source');
});

test('a physical input mouse-up followed by click connects once instead of disconnecting the new wire',()=>{
  render(<Harness/>);fireEvent.click(screen.getByTestId('flow-palette-add_null_rig'));
  const layers=JSON.parse(screen.getByTestId('state-readout').textContent).overlays;
  const rig=layers.find(layer=>layer.isNullRig);
  const output=screen.getByTestId(`flow-port-out-NullRig:${rig.id}-Out`);
  const input=screen.getByTestId('flow-port-in-Transform:plate-1-Parent');
  fireEvent.mouseDown(output);fireEvent.mouseUp(output);fireEvent.click(output);
  fireEvent.mouseDown(input);fireEvent.mouseUp(input);fireEvent.click(input);
  expect(JSON.parse(screen.getByTestId('state-readout').textContent).plateParent).toBe(rig.id);
  fireEvent.click(input);
  expect(JSON.parse(screen.getByTestId('state-readout').textContent).plateParent).toBeNull();
});

test('published macro scale applies once and preserves child scale and opacity through zero',()=>{
  render(<Harness/>);
  fireEvent.click(screen.getByTestId('flow-palette-add_compound_macro'));
  const read=()=>JSON.parse(screen.getByTestId('state-readout').textContent).overlays;
  const before=read(),child=before.find(l=>l.id==='plate-1');
  fireEvent.change(screen.getByTestId('flow-macro-scale-slider'),{target:{value:'1.5'}});
  expect(read().find(l=>l.id==='plate-1').scale).toBe(child.scale);
  expect(read().find(l=>l.isCompoundMacro).scale).toBe(1.5);
  fireEvent.change(screen.getByTestId('flow-macro-opacity-slider'),{target:{value:'0'}});
  expect(read().find(l=>l.id==='plate-1').opacity).toBe(0);
  fireEvent.change(screen.getByTestId('flow-macro-opacity-slider'),{target:{value:'1'}});
  expect(read().find(l=>l.id==='plate-1').opacity).toBe(child.opacity);
});

test('expanded graph returns with Escape and does not steal Delete from the rest of Studio',()=>{
  render(<Harness/>);
  const panel=()=>screen.getByTestId('studio-node-flow'),button=()=>screen.getByTestId('flow-expand-workspace');
  fireEvent.click(button());expect(button()).toHaveAttribute('aria-pressed','true');
  fireEvent.keyDown(button(),{key:'Escape'});expect(button()).toHaveAttribute('aria-pressed','false');
  fireEvent.click(screen.getByTestId('flow-node-Transform:plate-1'));
  const before=screen.getByTestId('state-readout').textContent;
  fireEvent.keyDown(document.body,{key:'Delete'});
  expect(screen.getByTestId('state-readout').textContent).toBe(before);
  expect(panel()).not.toHaveClass('is-expanded-workspace');
});

test('A/B divider offers keyboard control with bounded Home and End positions',()=>{
  render(<Harness/>);fireEvent.click(screen.getByTestId('flow-toggle-ab-wipe'));
  const handle=screen.getByTestId('flow-viewer-split-handle');
  fireEvent.keyDown(handle,{key:'End'});expect(handle).toHaveAttribute('aria-valuenow','90');
  fireEvent.keyDown(handle,{key:'ArrowRight'});expect(handle).toHaveAttribute('aria-valuenow','90');
  fireEvent.keyDown(handle,{key:'Home'});expect(handle).toHaveAttribute('aria-valuenow','10');
  fireEvent.keyDown(handle,{key:'ArrowRight',shiftKey:true});expect(handle).toHaveAttribute('aria-valuenow','20');
});

test('Fit graph reveals the full node network without mutating the canonical edit',()=>{
 render(<Harness/>);const panel=screen.getByTestId('studio-node-flow'),before=screen.getByTestId('state-readout').textContent;fireEvent.click(within(panel).getByRole('button',{name:'Fit graph'}));expect(screen.getByTestId('state-readout').textContent).toBe(before);expect(within(panel).getByRole('button',{name:'Zoom node graph out'})).toBeInTheDocument();
});

test('Inspect node selects an off-canvas branch and keeps its canonical pose intact',()=>{render(<Harness/>);const panel=screen.getByTestId('studio-node-flow'),before=screen.getByTestId('state-readout').textContent;fireEvent.change(within(panel).getByLabelText('Inspect node'),{target:{value:'Transform:plate-1'}});expect(screen.getByTestId('state-readout').textContent).toBe(before);expect(screen.getByTestId('flow-node-inspector')).toHaveTextContent('Transform');});

test('ColorCorrector applies Camera CST, Film Emulation, HSL Qualifier, Power Window, and Preset Import/Export',()=>{
  render(<Harness/>);
  fireEvent.click(screen.getByTestId('flow-node-ColorCorrector:finish'));
  fireEvent.change(screen.getByTestId('flow-cst-profile-select'),{target:{value:'apple_log'}});
  fireEvent.change(screen.getByTestId('flow-film-emulation-select'),{target:{value:'35mm_halation'}});
  fireEvent.change(screen.getByTestId('flow-hsl-qualifier-select'),{target:{value:'skin_isolate'}});
  fireEvent.change(screen.getByTestId('flow-power-window-select'),{target:{value:'subject_spotlight'}});
  const state=JSON.parse(screen.getByTestId('state-readout').textContent);
  expect(state.lutPresetId).toBe('cst:apple_log->rec709');
  expect(state.lutSize).toBe(17);
  expect(screen.getByTestId('flow-capture-shot-ref')).toBeInTheDocument();
  expect(screen.getByTestId('flow-export-preset')).toBeInTheDocument();
  expect(screen.getByTestId('flow-import-preset')).toBeInTheDocument();
});

test('Powerhouse Node Flow: ChromaKeyer, 2.5D CornerPin, CompoundMacro, Boolean Sub-Masks, Masked Grade Port, Parameter Expression Pick-Whip, and Quick Node Search',()=>{
  render(<Harness/>);
  // 1. Quick Node Search Launcher (/ button) + Splice ChromaKeyer into active branch
  fireEvent.click(screen.getByTestId('flow-open-quick-search'));
  expect(screen.getByTestId('flow-quick-search-modal')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('flow-splice-into-branch-add_chroma_keyer'));
  expect(screen.getByTestId('flow-chroma-keyer-controls')).toBeInTheDocument();
  fireEvent.change(screen.getByTestId('flow-chroma-mode-select'),{target:{value:'hsl_delta'}});

  // 2. Add 2.5D CornerPin Homography Node & stamp 4 corner keyframes
  fireEvent.click(screen.getByTestId('flow-palette-add_corner_pin'));
  expect(screen.getByTestId('flow-corner-pin-editor')).toBeInTheDocument();
  expect(screen.getByTestId('flow-corner-pin-handle-0')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('flow-corner-pin-stamp-keys'));
  expect(JSON.parse(screen.getByTestId('state-readout').textContent).keyCount).toBe(8);

  // 3. Add Polygon Mask & Multi-Mask Boolean Sub-Mask
  fireEvent.click(screen.getByTestId('flow-palette-add_polygon_mask'));
  expect(screen.getByTestId('flow-boolean-mask-stack')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('flow-add-boolean-submask'));
  expect(screen.getByTestId('flow-boolean-submask-row-0')).toBeInTheDocument();

  // 4. Select Transform:plate-1 -> 2.5D Depth Parallax + Bind Cross-Node Parameter Expression
  fireEvent.click(screen.getByTestId('flow-node-Transform:plate-1'));
  expect(screen.getByTestId('flow-depth-parallax-controls')).toBeInTheDocument();
  expect(screen.getByTestId('flow-parameter-link-card')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('flow-bind-param-link'));
  expect(screen.getByTestId('flow-active-param-link-scale')).toBeInTheDocument();

  // 5. Select ColorCorrector:finish -> Route PolygonMask:plate-1 into Mask Port
  fireEvent.click(screen.getByTestId('flow-node-ColorCorrector:finish'));
  expect(screen.getByTestId('flow-masked-grade-controls')).toBeInTheDocument();
  fireEvent.change(screen.getByTestId('flow-grade-mask-source-select'),{target:{value:'PolygonMask:plate-1'}});

  // 6. Add CompoundMacro Group Node
  fireEvent.click(screen.getByTestId('flow-palette-add_compound_macro'));
  expect(screen.getByTestId('flow-macro-controls')).toBeInTheDocument();
});
test('connected grade mask survives advanced edits and uses its own inversion flag',()=>{
 render(<Harness/>);fireEvent.click(screen.getByTestId('flow-node-ColorCorrector:finish'));
 fireEvent.change(screen.getByTestId('flow-grade-mask-source-select'),{target:{value:'Transform:plate-1'}});
 fireEvent.click(screen.getByTestId('flow-grade-mask-invert'));
 expect(screen.getByTestId('flow-grade-mask-invert')).toBeChecked();
 expect(screen.getByTestId('flow-grade-mask-source-select')).toHaveValue('Transform:plate-1');
 fireEvent.change(screen.getByTestId('flow-hsl-qualifier-select'),{target:{value:'skin_isolate'}});
 expect(screen.getByTestId('flow-grade-mask-invert')).toBeChecked();
 expect(screen.getByTestId('flow-grade-mask-source-select')).toHaveValue('Transform:plate-1');
});
