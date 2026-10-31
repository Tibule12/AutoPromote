import { validateStudioTextAnimation } from "./studioTextAnimator";
import { createOutputTimeMap, createTimeRange, secondsToTicks, ticksToSeconds } from "./studioTime";
import { projectStudioLinkedTimingToSnapshot, projectStudioEditableStateToSnapshot, validateStudioProjectDocument } from "./studioProjectDocument";
import { buildAdvancedColorCube } from "./studioColorCube";
import { assertStudioLayerBlendMode, assertStudioMainBlendMode } from "./studioBlendModes";
import { parseStudioMaskPolygon } from "./studioMaskGeometry";
import { studioGroupTree, removeStudioGroupMembers, GROUP_KIND, validateStudioGroupKeyframes } from "./studioGroups";
import { validateSpatialCurve } from "./studioAutomation";
import { validateStudioVectorShape, validateStudioVectorTrim } from "./studioVectorShape";
import { validateStudioPerspectiveLayer, encodeStudioPerspective } from './studioPerspective';

export const compileStudioOverlaysForRender = (document, transportSnapshot = {}) =>
  projectStudioEditableStateToSnapshot(document, transportSnapshot).overlays
    .filter(layer => !layer.isCaption).map(layer => {
      assertStudioLayerBlendMode(layer);
      if (layer.vectorShape !== undefined) {
        if (layer.type !== 'image') fail('INVALID_VECTOR_LAYER', 'Vector artwork needs an ordinary image layer.');
        validateStudioVectorShape(layer.vectorShape);
      }
      return { ...layer, ...(layer.perspective ? {perspective: encodeStudioPerspective(layer.perspective)} : {}), start_time: Number(layer.startTime ?? 0), duration: Number(layer.duration ?? 0) };
    });

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

// Sequence and migrated visual decisions compile from the shared document.
// Hook/composition staging and worker rasterization still need parity qualification.
export const compileStudioTimelineForRender = document => {
  validateStudioProjectDocument(document);
  return document.clipOccurrences.map(occurrence => {
    const asset = document.assets.find(item => item.assetId === occurrence.assetId);
    return {
      id: occurrence.occurrenceId,
      source_clip_id: asset.sourceId,
      start_time: ticksToSeconds(occurrence.sourceRange.startTick),
      end_time: ticksToSeconds(occurrence.sourceRange.endTick),
      duration: ticksToSeconds(occurrence.sourceRange.endTick - occurrence.sourceRange.startTick),
      ...(occurrence.parameters?.transitionIn ? { transition_in: occurrence.parameters.transitionIn } : {}),
      ...(occurrence.parameters?.transitionOut ? { transition_out: occurrence.parameters.transitionOut } : {}),
      ...(occurrence.parameters?.transitionDuration !== undefined ? { transition_duration: occurrence.parameters.transitionDuration } : {}),
      ...Object.fromEntries(['audioTrimOffsetStart', 'audioTrimOffsetEnd', 'audioDetached',
        'audioSourceStart', 'audioSourceEnd', 'audioProgrammeStart']
        .filter(field => occurrence.parameters?.[field] !== undefined).map(field => [field, occurrence.parameters[field]])),
    };
  });
};

const visualRenderState = document => {
  validateStudioProjectDocument(document);
  (document.visualGraph.settings.motionKeyframes || []).forEach(validateSpatialCurve);
  if (document.compatibility?.visualStateVersion !== 1)
    fail("UNMIGRATED_VISUAL_STATE", "Reconcile the saved visual state before compiling its render.");
  return { ...JSON.parse(JSON.stringify(document.visualGraph.settings)),
    ...projectStudioLinkedTimingToSnapshot(document) };
};

// Extracted from the production export builder. The preview hydrates these
// same canonical decisions; this does not assert rasterization/pixel parity.
export const compileStudioFinishForRender = document => {
  const state = visualRenderState(document);
  const fx = state.finishFx || {}, transform = state.mainTransform || {}, frame = state.mainFrame || {};
  assertStudioMainBlendMode(transform);
  const colorFields = ["preset", "exposureStops", "lift", "gamma", "gain", "tint",
    "brightness", "contrast", "saturation", "temperature", "sharpness", "vignette"];
  return {
    color_cube: buildAdvancedColorCube(state.advancedColor),
    main_frame: { enabled: frame.enabled !== false, shape: "round", inset_percent: frame.insetPercent,
      border_radius_percent: frame.radiusPercent, background: frame.background },
    color: { ...Object.fromEntries(colorFields.filter(field => fx[field] !== undefined)
      .map(field => [field, fx[field]])), precisionGrade: !!fx.precisionGrade },
    motion: { zoom: fx.zoom, zoom_anchor: fx.zoomAnchor, base_scale: transform.scale ?? 1,
      scale_keyframes: (state.motionKeyframes || []).filter(key => key.targetId === "main-video" && key.property === "scale"),
      base_transform: compileBaseTransform(transform),
      keyframes: (state.motionKeyframes || []).filter(key => key.targetId === "main-video") },
    texture: { film_grain: fx.filmGrain, chromatic_aberration: fx.chromaticAberration,
      vhs_tracking: fx.vhsTracking, light_leak: fx.lightLeak },
    visualizer: { ...state.podcastVisualizer, source: "original_speech" },
    keyframes: (state.finishKeyframes || []).map(key => ({ id: key.id,
      time: Number(key.time || 0), values: { ...key.values }, interpolation: "linear" })),
  };
};

const compileBaseTransform = layer => ({
  ...(layer.perspective ? { perspective_progress: layer.perspectiveProgress ?? 100 } : {}),
  ...(layer.textAnimator ? { text_progress: layer.textProgress ?? 100 } : {}),
  x: Number(layer.x ?? 50), y: Number(layer.y ?? 50), scale: Number(layer.scale ?? 1),
  rotation: Number(layer.rotation ?? 0), opacity: Number(layer.opacity ?? 1),
  crop_x: Number(layer.cropX ?? 0), crop_y: Number(layer.cropY ?? 0),
  ...(layer.vectorShape ? { stroke_start: layer.strokeStart ?? 0, stroke_end: layer.strokeEnd ?? 100,
    stroke_offset: layer.strokeOffset ?? 0 } : {}),
});

export const compileStudioCompositionForRender = document => {
  const state = visualRenderState(document);
  const compounds = document.editGraph?.settings?.compoundClips || [];
  validateStudioGroupKeyframes(compounds, state.motionKeyframes);
  if (compounds.some(group => group.kind === GROUP_KIND) && !Array.isArray(state.compositionOrder))
    fail("MISSING_GROUP_LAYER_ORDER", "Graphic groups need an explicit canonical layer order.");
  const disabledIds = state.threeDScenes.filter(scene => scene.enabled === false).map(scene => scene.id);
  const order = state.compositionOrder?.filter(id => !disabledIds.includes(id));
  // Validate the saved hierarchy first. Disabled 3D retains its editable parent;
  // only the render projection removes that leaf and any resulting empty group.
  if (Array.isArray(state.compositionOrder)) {
    studioGroupTree(compounds, state.compositionOrder);
  }
  const groups = studioGroupTree(removeStudioGroupMembers(compounds, disabledIds), order || []).groups;
  assertStudioMainBlendMode(state.mainTransform);
  state.overlays.filter(overlay => !overlay.isCaption).forEach(assertStudioLayerBlendMode);
  for (const layer of [state.mainTransform, ...state.overlays]) {
    validateStudioPerspectiveLayer(layer, (state.motionKeyframes || []).filter(key => key.targetId === layer?.id),
      compounds.some(group => group.layerIds?.includes(layer?.id)));
    validateStudioTextAnimation(layer, (state.motionKeyframes || []).filter(key => key.targetId === layer?.id));
    validateStudioVectorTrim(layer, (state.motionKeyframes || []).filter(key => key.targetId === layer?.id));
    if (layer?.mask?.enabled && (layer.id === "main-video" || layer.type === "video" || layer.bRollPlaceholder || (layer.bRollMode === "fullscreen" && layer.type === "text")))
      fail("UNSUPPORTED_GEOMETRIC_VIDEO_MASK", "Geometric masks currently export on image and ordinary title layers. Use the reviewed subject-mask workflow for source video.");
    if (layer?.mask?.enabled && layer.mask.shape === "polygon") {
      try { parseStudioMaskPolygon(layer.mask.path || undefined); }
      catch (error) { fail("INVALID_GEOMETRIC_MASK_PATH", `Mask polygon path: ${error.message}`); }
    }
  }
  return { version: 1, coordinate_space: "canvas_percent", preview_timebase: "output_timeline_seconds",
    ...(order ? { order } : {}),
    ...(groups.length ? { groups: groups.map(group => {
      const keys = (state.motionKeyframes || []).filter(key => key.targetId === group.id);
      return { ...JSON.parse(JSON.stringify(group)), ...(keys.length ? { motion_keyframes: keys.map(key => ({
        id: key.id, property: key.property, time: key.time, value: key.value, easing: key.easing || 'linear',
        ...(key.curve ? { curve: [...key.curve] } : {}),
        ...(key.spatialCurve ? { spatialCurve: [...key.spatialCurve] } : {}),
      })) } : {}) };
    }) } : {}),
    layers: [state.mainTransform || { id: "main-video", type: "video" },
      ...state.overlays.filter(overlay => !overlay.isCaption)].map(layer => ({
      id: layer.id, name: layer.name || layer.text || "Visual layer", type: layer.type || "visual",
      ...(layer.perspective ? { perspective: encodeStudioPerspective(layer.perspective) } : {}),
      ...(layer.vectorShape ? {vector_shape: JSON.parse(JSON.stringify(validateStudioVectorShape(layer.vectorShape)))} : {}),
      ...(layer.textAnimator ? { text_animator: JSON.parse(JSON.stringify(layer.textAnimator)) } : {}),
      blend_mode: layer.blendMode || "normal",
      base_transform: compileBaseTransform(layer), anchor_x: Number(layer.anchorX ?? 50),
      anchor_y: Number(layer.anchorY ?? 50), effects: {
        mask: layer.mask ? JSON.parse(JSON.stringify(layer.mask)) : { enabled: false },
        blur: Number(layer.blur || 0),
        glow: { enabled: !!layer.glow?.enabled, color: layer.glow?.color || "#8b5cf6",
          radius: Number(layer.glow?.radius || 0), intensity: Number(layer.glow?.intensity || 0) },
        shadow: { enabled: !!layer.layerShadow?.enabled, color: layer.layerShadow?.color || "#000000",
          blur: Number(layer.layerShadow?.blur || 0), opacity: Number(layer.layerShadow?.opacity || 0),
          x: Number(layer.layerShadow?.x || 0), y: Number(layer.layerShadow?.y || 0) },
        motion_blur: { enabled: !!layer.motionBlur?.enabled, samples: Number(layer.motionBlur?.samples || 1),
          shutter: Number(layer.motionBlur?.shutter || 0) },
      },
      motion_keyframes: (state.motionKeyframes || []).filter(key => String(key.targetId) === String(layer.id))
        .map(key => ({ id: key.id, property: key.property, time: Number(key.time || 0),
          value: Number(key.value || 0), easing: key.easing || "ease_in_out",
          ...(key.curve ? { curve: key.curve.map(Number) } : {}),
          ...(key.spatialCurve ? { spatialCurve: [...key.spatialCurve] } : {}) })),
    })),
  };
};

export const assertStudioExportTimelineMatchesDocument = (document, renderSegments) => {
  const expected = compileStudioTimelineForRender(document);
  if (!Array.isArray(renderSegments) || renderSegments.length !== expected.length) {
    fail("RENDER_TIMELINE_MISMATCH", "Render clip count differs from the canonical edit document.");
  }
  expected.forEach((segment, index) => {
    const actual = renderSegments[index];
    const actualStart = Number(actual?.start_time);
    const actualEnd = Number(actual?.end_time);
    const actualDuration = Number(actual?.duration);
    // round(end - start) can differ from round(end) - round(start). Compare
    // canonical endpoints, then check duration against its own raw endpoints.
    if (
      String(actual?.id) !== segment.id ||
      String(actual?.source_clip_id) !== segment.source_clip_id ||
      !Number.isFinite(actualStart) || actualStart < 0 ||
      !Number.isFinite(actualEnd) || actualEnd <= actualStart ||
      !Number.isFinite(actualDuration) || actualDuration <= 0 ||
      secondsToTicks(actualStart) !== secondsToTicks(segment.start_time) ||
      secondsToTicks(actualEnd) !== secondsToTicks(segment.end_time) ||
      secondsToTicks(actualDuration) !== secondsToTicks(actualEnd - actualStart)
    ) {
      fail(
        "RENDER_TIMELINE_MISMATCH",
        `Render clip ${index + 1} differs from the canonical edit document.`
      );
    }
  });
  return true;
};

export const assertStudioSpeedPlanMatchesDocument = (document, renderSpeedSegments) => {
  validateStudioProjectDocument(document);
  if (
    !Array.isArray(renderSpeedSegments) ||
    (document.clipOccurrences.length > 0 && renderSpeedSegments.length === 0)
  ) {
    fail("RENDER_SPEED_MISMATCH", "Render speed plan is missing.");
  }
  const durationTick = document.clipOccurrences.at(-1)?.programmeRange.endTick || 0;
  let actual;
  try {
    actual = createOutputTimeMap(
      durationTick,
      renderSpeedSegments.map(segment => ({
        programmeRange: createTimeRange(
          "programme",
          secondsToTicks(Number(segment.startTime ?? segment.start_time)),
          secondsToTicks(Number(segment.endTime ?? segment.end_time))
        ),
        rate: Number(segment.rate),
      }))
    );
  } catch (error) {
    fail("RENDER_SPEED_MISMATCH", `Render speed plan is invalid: ${error.message}`);
  }
  const sameMap = actual.length === document.outputTimeMap.length && actual.every((segment, index) => {
    const expected = document.outputTimeMap[index];
    return segment.rateNumerator === expected.rateNumerator &&
      segment.rateDenominator === expected.rateDenominator &&
      ["programmeRange", "outputRange"].every(field =>
        ["space", "startTick", "endTick"].every(key => segment[field][key] === expected[field][key]));
  });
  if (!sameMap) {
    fail("RENDER_SPEED_MISMATCH", "Render speed plan differs from the canonical output time map.");
  }
  return true;
};
