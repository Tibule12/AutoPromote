import { interpolateAutomationValue } from "./studioAutomation";
import { STUDIO_EXPORT_BLEND_MODES } from "./studioBlendModes";

export const STUDIO_CREATIVE_CATEGORIES = Object.freeze([
  { id: "all", label: "All Effects" },
  { id: "paper_collage", label: "Paper & Collage" },
  { id: "drawing_doodles", label: "Drawing & Doodles" },
  { id: "vintage_film", label: "Vintage & Film" },
  { id: "glitch_distortion", label: "Glitch & Distortion" },
  { id: "comic_pop_art", label: "Comic & Pop Art" },
  { id: "text_typography", label: "Text & Typography" },
  { id: "motion_speed", label: "Motion & Speed" },
  { id: "camera_transitions", label: "Camera & Transitions" },
  { id: "particles_atmosphere", label: "Particles & Atmosphere" },
]);

export const STUDIO_CREATIVE_EFFECT_CATALOG = Object.freeze([
  {
    id: "ripped_paper",
    category: "paper_collage",
    name: "Ripped Paper",
    shortDescription: "Animated paper tear & deckled reveal transitions with textured edges.",
    kind: "frame_fx",
    available: true,
    defaultDuration: 3.0,
    defaultBlendMode: "normal",
    defaultOpacity: 1.0,
    defaultParams: {
      mode: "tear_video_open",
      direction: "vertical",
      tearProgress: 62,
      autoAnimate: true,
      tearPosition: 50,
      angle: -25,
      speed: 1.0,
      roughness: 55,
      paperColor: "#f3ecdf",
      fiberEdgeColor: "#fdfbf6",
      behindColor: "#141824",
      behindText: "",
      behindOverlayId: "",
      paperTexture: 60,
      shadow: 55,
      seed: 17,
    },
    paramsSchema: [
      {
        key: "mode",
        label: "Tear Mode",
        type: "select",
        options: [
          { value: "tear_video_open", label: "Tear Clip Open (Reveal Behind)" },
          { value: "tear_away_paper", label: "Tear Paper Cover (Reveal Clip)" },
          { value: "paper_border", label: "Deckled Paper Frame" },
        ],
      },
      {
        key: "direction",
        label: "Tear Direction",
        type: "select",
        options: [
          { value: "vertical", label: "Vertical Tear" },
          { value: "horizontal", label: "Horizontal Tear" },
          { value: "diagonal", label: "Diagonal Tear" },
          { value: "center_split", label: "Center Split" },
          { value: "custom", label: "Custom Angle" },
        ],
      },
      { key: "tearProgress", label: "Tear Progress", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "autoAnimate", label: "Auto Animate Tear", type: "boolean" },
      { key: "tearPosition", label: "Tear Position %", type: "range", min: 10, max: 90, step: 1, keyframable: true },
      { key: "angle", label: "Custom Angle", type: "range", min: -180, max: 180, step: 1, keyframable: true },
      { key: "speed", label: "Tear Speed", type: "range", min: 0.2, max: 3.0, step: 0.05, keyframable: true },
      { key: "roughness", label: "Edge Roughness", type: "range", min: 5, max: 100, step: 1, keyframable: true },
      { key: "paperTexture", label: "Paper Grain", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "shadow", label: "Edge Shadow", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "paperColor", label: "Paper Color", type: "color" },
      { key: "fiberEdgeColor", label: "Torn Fiber Color", type: "color" },
      { key: "behindColor", label: "Backing Color", type: "color" },
      { key: "behindText", label: "Reveal Text Behind Tear", type: "text" },
    ],
  },
  {
    id: "scrapbook",
    category: "paper_collage",
    name: "Scrapbook & Collage",
    shortDescription: "Polaroids, deckled cutouts, masking tape, layered paper and multi-clip grids.",
    kind: "hybrid",
    available: true,
    defaultDuration: 4.0,
    defaultBlendMode: "normal",
    defaultOpacity: 1.0,
    defaultParams: {
      frameStyle: "polaroid",
      borderColor: "#f7f3eb",
      borderWidth: 28,
      paperTexture: 55,
      shadow: 60,
      tiltAngle: -4,
      tapeTop: true,
      tapeColor: "#e6cfa2",
      captionText: "STUDIO MEMORIES",
      roughness: 38,
      scalePercent: 86,
      backingColor: "#c8b090",
      seed: 23,
    },
    paramsSchema: [
      {
        key: "frameStyle",
        label: "Scrapbook Frame",
        type: "select",
        options: [
          { value: "polaroid", label: "Polaroid Frame + Caption" },
          { value: "torn_edge", label: "Deckled Photo Cutout" },
          { value: "film_strip", label: "Analog Contact Frame" },
          { value: "layered_paper", label: "Layered Kraft Paper Mat" },
        ],
      },
      { key: "scalePercent", label: "Card Scale %", type: "range", min: 45, max: 100, step: 1, keyframable: true },
      { key: "tiltAngle", label: "Card Tilt Angle", type: "range", min: -25, max: 25, step: 0.5, keyframable: true },
      { key: "borderWidth", label: "Border Width", type: "range", min: 6, max: 60, step: 1, keyframable: true },
      { key: "paperTexture", label: "Paper Texture", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "shadow", label: "Drop Shadow", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "roughness", label: "Edge Roughness", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "tapeTop", label: "Masking Tape Strip", type: "boolean" },
      { key: "borderColor", label: "Paper Color", type: "color" },
      { key: "backingColor", label: "Collage Mat Color", type: "color" },
      { key: "tapeColor", label: "Tape Color", type: "color" },
      { key: "captionText", label: "Polaroid Caption", type: "text" },
    ],
  },
  {
    id: "doodles",
    category: "drawing_doodles",
    name: "Hand-Drawn Doodles",
    shortDescription: "Animated arrows, circles, stars, hearts, underlines, scribbles and highlights.",
    kind: "frame_fx",
    available: true,
    defaultDuration: 3.0,
    defaultBlendMode: "normal",
    defaultOpacity: 1.0,
    defaultParams: {
      shape: "arrow",
      color: "#ffde59",
      strokeWidth: 7,
      drawDuration: 0.9,
      drawProgress: 100,
      autoAnimate: true,
      direction: "forward",
      speed: 1.0,
      wobble: 40,
      x: 50,
      y: 45,
      scale: 1.0,
      rotation: 0,
      seed: 11,
    },
    paramsSchema: [
      {
        key: "shape",
        label: "Doodle Shape",
        type: "select",
        options: [
          { value: "arrow", label: "Hand-Drawn Arrow" },
          { value: "curved_arrow", label: "Curved Pointer Arrow" },
          { value: "circle", label: "Highlight Circle" },
          { value: "underline", label: "Brush Underline" },
          { value: "double_underline", label: "Double Underline" },
          { value: "star", label: "Drawn Star" },
          { value: "heart", label: "Drawn Heart" },
          { value: "scribble", label: "Expressive Scribble" },
          { value: "marker_highlight", label: "Marker Highlight Sweep" },
          { value: "checkmark", label: "Checkmark" },
        ],
      },
      { key: "color", label: "Stroke Color", type: "color" },
      { key: "strokeWidth", label: "Stroke Width", type: "range", min: 2, max: 30, step: 0.5, keyframable: true },
      { key: "drawProgress", label: "Draw Progress %", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "autoAnimate", label: "Auto Draw-On", type: "boolean" },
      { key: "drawDuration", label: "Draw Duration (s)", type: "range", min: 0.2, max: 5.0, step: 0.05 },
      {
        key: "direction",
        label: "Draw Direction",
        type: "select",
        options: [
          { value: "forward", label: "Draw On (Forward)" },
          { value: "reverse", label: "Unwind / Reverse" },
        ],
      },
      { key: "speed", label: "Draw Speed", type: "range", min: 0.2, max: 3.0, step: 0.05, keyframable: true },
      { key: "wobble", label: "Hand Wobble", type: "range", min: 0, max: 100, step: 1 },
      { key: "x", label: "Position X %", type: "range", min: 5, max: 95, step: 0.5, keyframable: true },
      { key: "y", label: "Position Y %", type: "range", min: 5, max: 95, step: 0.5, keyframable: true },
      { key: "scale", label: "Scale", type: "range", min: 0.2, max: 3.0, step: 0.02, keyframable: true },
      { key: "rotation", label: "Rotation", type: "range", min: -180, max: 180, step: 1, keyframable: true },
    ],
  },
  {
    id: "film_grain",
    category: "vintage_film",
    name: "Film Grain & Vintage Film",
    shortDescription: "Authentic 8mm, 16mm and vintage film grain, dust, scratches, flicker and gates.",
    kind: "frame_fx",
    available: true,
    defaultDuration: 6.0,
    defaultBlendMode: "normal",
    defaultOpacity: 1.0,
    defaultParams: {
      preset: "16mm_docu",
      intensity: 52,
      grainSize: 1.8,
      colorMode: "color",
      dustAmount: 35,
      scratchesAmount: 24,
      flicker: 22,
      vignette: 34,
      borderStyle: "none",
      motion: "organic",
    },
    paramsSchema: [
      {
        key: "preset",
        label: "Film Stock",
        type: "select",
        options: [
          { value: "8mm_kodachrome", label: "8mm Kodachrome" },
          { value: "16mm_docu", label: "16mm Cinema Stock" },
          { value: "vintage_sepia", label: "Vintage Sepia Archive" },
          { value: "clean_35mm", label: "Clean 35mm Fine Grain" },
        ],
      },
      { key: "intensity", label: "Grain Intensity", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "grainSize", label: "Grain Size", type: "range", min: 1.0, max: 5.0, step: 0.1, keyframable: true },
      {
        key: "colorMode",
        label: "Grain Color",
        type: "select",
        options: [
          { value: "color", label: "Color Emulsion" },
          { value: "monochrome", label: "Silver Halide Mono" },
          { value: "warm_sepia", label: "Warm Archival Tint" },
        ],
      },
      { key: "dustAmount", label: "Dust & Fibers", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "scratchesAmount", label: "Film Scratches", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "flicker", label: "Gate Flicker", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "vignette", label: "Lens Vignette", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      {
        key: "borderStyle",
        label: "Film Border",
        type: "select",
        options: [
          { value: "none", label: "Full Frame" },
          { value: "8mm_sprocket", label: "8mm Sprocket Gate" },
          { value: "16mm_gate", label: "16mm Rounded Gate" },
          { value: "rounded_matte", label: "Classic Rounded Matte" },
        ],
      },
      {
        key: "motion",
        label: "Frame Motion",
        type: "select",
        options: [
          { value: "organic", label: "Organic Grain Drift" },
          { value: "heavy_gate", label: "Gate Weave + Jitter" },
        ],
      },
    ],
  },
  {
    id: "light_leaks",
    category: "vintage_film",
    name: "Light Leaks & Film Burns",
    shortDescription: "Warm, cool and prismatic film light leaks that bloom without obscuring footage.",
    kind: "frame_fx",
    available: true,
    defaultDuration: 2.5,
    defaultBlendMode: "screen",
    defaultOpacity: 0.8,
    defaultParams: {
      style: "warm_amber",
      mode: "overlay",
      direction: "left_to_right",
      intensity: 68,
      speed: 1.0,
      softness: 65,
      primaryColor: "#ff6b1a",
      secondaryColor: "#ffd166",
    },
    paramsSchema: [
      {
        key: "style",
        label: "Leak Palette",
        type: "select",
        options: [
          { value: "warm_amber", label: "Warm Amber Leak" },
          { value: "cool_cyan", label: "Cool Cyan Edge" },
          { value: "prismatic_rainbow", label: "Prismatic Flare" },
          { value: "film_burn_orange", label: "Cinema Film Burn" },
          { value: "custom", label: "Custom Dual Tone" },
        ],
      },
      {
        key: "mode",
        label: "Behavior Mode",
        type: "select",
        options: [
          { value: "overlay", label: "Continuous Atmospheric" },
          { value: "clip_transition", label: "Transition Pulse (Bell Curve)" },
        ],
      },
      {
        key: "direction",
        label: "Sweep Direction",
        type: "select",
        options: [
          { value: "left_to_right", label: "Left -> Right" },
          { value: "right_to_left", label: "Right -> Left" },
          { value: "top_down", label: "Top -> Bottom" },
          { value: "diagonal", label: "Diagonal Sweep" },
          { value: "corner_pulse", label: "Corner Glow Pulse" },
        ],
      },
      { key: "intensity", label: "Leak Intensity", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "softness", label: "Spread & Softness", type: "range", min: 15, max: 100, step: 1, keyframable: true },
      { key: "speed", label: "Drift Speed", type: "range", min: 0.2, max: 3.0, step: 0.05, keyframable: true },
      { key: "primaryColor", label: "Primary Color", type: "color" },
      { key: "secondaryColor", label: "Secondary Color", type: "color" },
    ],
  },
  {
    id: "vhs_glitch",
    category: "glitch_distortion",
    name: "VHS & Glitch",
    shortDescription: "VHS scanlines, RGB separation, tape static, tracking errors and digital glitches.",
    kind: "frame_fx",
    available: true,
    defaultDuration: 2.5,
    defaultBlendMode: "normal",
    defaultOpacity: 1.0,
    defaultParams: {
      style: "vhs_tape",
      intensity: 58,
      glitchFrequency: 48,
      rgbSeparation: 10,
      scanlines: 50,
      trackingNoise: 45,
      displacement: 42,
      beatSync: false,
      seed: 31,
    },
    paramsSchema: [
      {
        key: "style",
        label: "Glitch Mode",
        type: "select",
        options: [
          { value: "vhs_tape", label: "Analog VHS Tape" },
          { value: "digital_glitch", label: "Digital Block Glitch" },
          { value: "tracking_error", label: "Heavy Tracking Error" },
          { value: "rgb_split", label: "Chromatic RGB Split" },
        ],
      },
      { key: "intensity", label: "Master Intensity", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "glitchFrequency", label: "Glitch Frequency", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "rgbSeparation", label: "RGB Split (px)", type: "range", min: 0, max: 40, step: 0.5, keyframable: true },
      { key: "scanlines", label: "Scanlines", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "trackingNoise", label: "Tracking Static", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "displacement", label: "Slice Shift", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "beatSync", label: "Beat-Sync Glitches", type: "boolean" },
    ],
  },
  {
    id: "comic_pop_art",
    category: "comic_pop_art",
    name: "Comic Book & Pop Art",
    shortDescription: "Ink outlines, halftone dots, comic gutters and tracked speech bubbles.",
    kind: "frame_fx",
    available: true,
    defaultDuration: 3.5,
    defaultBlendMode: "normal",
    defaultOpacity: 1.0,
    defaultParams: {
      style: "classic_comic",
      outlineStrength: 68,
      halftoneDensity: 56,
      posterizeLevels: 5,
      borderStyle: "comic_gutter",
      borderColor: "#ffffff",
      panelColor: "#facc15",
      speechText: "POW!",
      bubbleStyle: "burst",
      bubbleX: 74,
      bubbleY: 24,
      transitionMode: "none",
      seed: 41,
    },
    paramsSchema: [
      {
        key: "style",
        label: "Comic Style",
        type: "select",
        options: [
          { value: "classic_comic", label: "Classic Color Comic" },
          { value: "pop_art_warhol", label: "Vibrant Pop Art" },
          { value: "noir_ink", label: "Noir Graphic Ink" },
          { value: "action_panel", label: "Action Panel Lines" },
        ],
      },
      { key: "outlineStrength", label: "Ink Outlines", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "halftoneDensity", label: "Halftone Dots", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "posterizeLevels", label: "Color Bands", type: "range", min: 2, max: 10, step: 1, keyframable: true },
      {
        key: "borderStyle",
        label: "Panel Frame",
        type: "select",
        options: [
          { value: "comic_gutter", label: "Classic Gutter Border" },
          { value: "action_burst", label: "Speed-Line Frame" },
          { value: "panel_split", label: "Split Diagonal Gutter" },
          { value: "none", label: "No Border" },
        ],
      },
      {
        key: "bubbleStyle",
        label: "Speech / SFX Bubble",
        type: "select",
        options: [
          { value: "burst", label: "Action Starburst" },
          { value: "speech", label: "Speech Bubble" },
          { value: "caption_box", label: "Comic Caption Box" },
          { value: "none", label: "No Bubble" },
        ],
      },
      { key: "speechText", label: "Bubble Text", type: "text" },
      { key: "bubbleX", label: "Bubble X %", type: "range", min: 10, max: 90, step: 0.5, keyframable: true },
      { key: "bubbleY", label: "Bubble Y %", type: "range", min: 10, max: 90, step: 0.5, keyframable: true },
      { key: "borderColor", label: "Border Color", type: "color" },
      { key: "panelColor", label: "Bubble Accent Color", type: "color" },
      {
        key: "transitionMode",
        label: "Panel Transition",
        type: "select",
        options: [
          { value: "none", label: "Direct Cut" },
          { value: "whip_panel_in", label: "Panel Slide Wipe" },
        ],
      },
    ],
  },
  {
    id: "freeze_cutout",
    category: "camera_transitions",
    name: "Freeze-Frame Cutout",
    shortDescription: "Freeze and isolate a subject with outlines, glow and animated backgrounds.",
    kind: "frame_fx",
    available: true,
    defaultDuration: 2.5,
    defaultBlendMode: "normal",
    defaultOpacity: 1.0,
    defaultParams: {
      freezeTime: 0.5,
      maskMode: "auto_subject",
      subjectX: 50,
      subjectY: 50,
      subjectRadius: 34,
      feather: 14,
      outlineWidth: 8,
      outlineColor: "#facc15",
      glow: 48,
      shadow: 60,
      animatedBg: "live_video",
      cutoutX: 50,
      cutoutY: 50,
      cutoutScale: 1.08,
      cutoutRotation: -2,
      autoPop: true,
      labelText: "FROZEN",
      labelColor: "#111827",
    },
    paramsSchema: [
      { key: "freezeTime", label: "Freeze Frame At (s)", type: "range", min: 0, max: 600, step: 0.05 },
      {
        key: "maskMode",
        label: "Subject Isolation",
        type: "select",
        options: [
          { value: "auto_subject", label: "Auto Foreground Subject" },
          { value: "oval_portrait", label: "Center Subject Vignette" },
          { value: "chroma_backdrop", label: "Color Contrast Isolation" },
        ],
      },
      {
        key: "animatedBg",
        label: "Background Behind Cutout",
        type: "select",
        options: [
          { value: "live_video", label: "Continue Live Video Motion" },
          { value: "halftone_pulse", label: "Animated Halftone Pulse" },
          { value: "neon_grid", label: "Animated Neon Grid" },
          { value: "dark_blur", label: "Darkened Studio Backdrop" },
        ],
      },
      { key: "subjectX", label: "Mask Center X %", type: "range", min: 15, max: 85, step: 0.5, keyframable: true },
      { key: "subjectY", label: "Mask Center Y %", type: "range", min: 15, max: 85, step: 0.5, keyframable: true },
      { key: "subjectRadius", label: "Mask Size %", type: "range", min: 15, max: 65, step: 0.5, keyframable: true },
      { key: "feather", label: "Edge Feather", type: "range", min: 0, max: 40, step: 1 },
      { key: "outlineWidth", label: "Outline Width", type: "range", min: 0, max: 24, step: 0.5, keyframable: true },
      { key: "outlineColor", label: "Outline Color", type: "color" },
      { key: "glow", label: "Edge Glow", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "shadow", label: "Drop Shadow", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "cutoutX", label: "Cutout X %", type: "range", min: 10, max: 90, step: 0.5, keyframable: true },
      { key: "cutoutY", label: "Cutout Y %", type: "range", min: 10, max: 90, step: 0.5, keyframable: true },
      { key: "cutoutScale", label: "Cutout Scale", type: "range", min: 0.3, max: 2.5, step: 0.02, keyframable: true },
      { key: "cutoutRotation", label: "Cutout Rotation", type: "range", min: -45, max: 45, step: 0.5, keyframable: true },
      { key: "autoPop", label: "Pop-In Motion", type: "boolean" },
      { key: "labelText", label: "Cutout Label Badge", type: "text" },
      { key: "labelColor", label: "Label Badge Color", type: "color" },
    ],
  },
  {
    id: "kinetic_typography",
    category: "text_typography",
    name: "Kinetic Typography",
    shortDescription: "Speech-synced animated titles & word-by-word highlights, bounce, slide & typewriter.",
    kind: "frame_fx",
    available: true,
    defaultDuration: 3.0,
    defaultBlendMode: "normal",
    defaultOpacity: 1.0,
    defaultParams: {
      text: "MAKE EVERY WORD COUNT",
      style: "bounce",
      fontFamily: "Inter",
      fontSize: 54,
      color: "#ffffff",
      highlightColor: "#facc15",
      bgColor: "#0f172a",
      showBg: true,
      x: 50,
      y: 72,
      scale: 1.0,
      rotation: 0,
      staggerMs: 220,
      easing: "bounce",
      wordTimings: [],
    },
    paramsSchema: [
      { key: "text", label: "Display Text", type: "text" },
      {
        key: "style",
        label: "Animation Style",
        type: "select",
        options: [
          { value: "bounce", label: "Word Bounce Pop" },
          { value: "slide_up", label: "Slide Up & Settle" },
          { value: "scale_pop", label: "Scale Punch-In" },
          { value: "rotate_in", label: "Kinetic Tilt Reveal" },
          { value: "typewriter", label: "Typewriter Keys" },
          { value: "reveal_wipe", label: "Mask Reveal Wipe" },
          { value: "karaoke_highlight", label: "Speech Word Highlight" },
        ],
      },
      {
        key: "fontFamily",
        label: "Typeface",
        type: "select",
        options: [
          { value: "Inter", label: "Inter Bold (Studio)" },
          { value: "DejaVuSans", label: "Sans Bold Clean" },
          { value: "DejaVuSerif", label: "Editorial Serif" },
          { value: "DejaVuSansMono", label: "Mono Technical" },
        ],
      },
      { key: "fontSize", label: "Font Size", type: "range", min: 20, max: 120, step: 1, keyframable: true },
      { key: "staggerMs", label: "Word Pace (ms)", type: "range", min: 40, max: 600, step: 10, keyframable: true },
      { key: "x", label: "Position X %", type: "range", min: 10, max: 90, step: 0.5, keyframable: true },
      { key: "y", label: "Position Y %", type: "range", min: 10, max: 90, step: 0.5, keyframable: true },
      { key: "scale", label: "Scale", type: "range", min: 0.4, max: 2.5, step: 0.02, keyframable: true },
      { key: "rotation", label: "Rotation", type: "range", min: -45, max: 45, step: 0.5, keyframable: true },
      {
        key: "easing",
        label: "Motion Curve",
        type: "select",
        options: [
          { value: "bounce", label: "Overshoot Bounce" },
          { value: "spring", label: "Snappy Spring" },
          { value: "ease_out", label: "Smooth Ease Out" },
          { value: "linear", label: "Linear" },
        ],
      },
      { key: "color", label: "Base Text Color", type: "color" },
      { key: "highlightColor", label: "Active Word Color", type: "color" },
      { key: "bgColor", label: "Pill Background", type: "color" },
      { key: "showBg", label: "Active Word Pill", type: "boolean" },
    ],
  },
  {
    id: "speed_ramping",
    category: "motion_speed",
    name: "Speed Ramping",
    shortDescription: "Variable speed curves, slow-mo/fast-mo transitions, reverse and motion interpolation.",
    kind: "speed_ramp",
    available: true,
    defaultDuration: 3.0,
    defaultBlendMode: "normal",
    defaultOpacity: 1.0,
    defaultParams: {
      preset: "hero_slow_mo",
      startRate: 1.8,
      midRate: 0.4,
      endRate: 1.6,
      reverse: false,
      opticalFlow: false,
    },
    paramsSchema: [
      {
        key: "preset",
        label: "Speed Curve Preset",
        type: "select",
        options: [
          { value: "hero_slow_mo", label: "Fast -> Slow -> Fast (Hero)" },
          { value: "montage_burst", label: "Montage Speed Burst" },
          { value: "bullet_time", label: "Extreme Bullet Time" },
          { value: "ramp_in", label: "Smooth Slow Ramp In" },
          { value: "ramp_out", label: "Ramp Out Speedup" },
          { value: "custom", label: "Custom Curve" },
        ],
      },
      { key: "startRate", label: "Entry Speed (×)", type: "range", min: 0.25, max: 4.0, step: 0.05, keyframable: true },
      { key: "midRate", label: "Midpoint Speed (×)", type: "range", min: 0.2, max: 4.0, step: 0.05, keyframable: true },
      { key: "endRate", label: "Exit Speed (×)", type: "range", min: 0.25, max: 4.0, step: 0.05, keyframable: true },
      { key: "reverse", label: "Reverse Playback", type: "boolean" },
      { key: "opticalFlow", label: "Motion Interpolation Slow-Mo", type: "boolean" },
    ],
  },
  {
    id: "zoom_motion_blur",
    category: "camera_transitions",
    name: "Zoom & Motion Blur",
    shortDescription: "Animated punch-in/zoom-out, pan/tilt, subject-tracked zooms & optical blur.",
    kind: "frame_fx",
    available: true,
    defaultDuration: 2.0,
    defaultBlendMode: "normal",
    defaultOpacity: 1.0,
    defaultParams: {
      mode: "punch_in",
      zoomScale: 1.45,
      autoAnimate: true,
      focusX: 50,
      focusY: 50,
      panX: 0,
      panY: 0,
      rotation: 0,
      easing: "ease_in_out",
      motionBlurStrength: 55,
    },
    paramsSchema: [
      {
        key: "mode",
        label: "Zoom Mode",
        type: "select",
        options: [
          { value: "punch_in", label: "Smooth Punch-In" },
          { value: "zoom_out", label: "Dramatic Zoom-Out" },
          { value: "pan_zoom", label: "Pan & Whip Zoom" },
          { value: "tracked_zoom", label: "Subject-Focused Zoom" },
        ],
      },
      { key: "zoomScale", label: "Target Zoom (×)", type: "range", min: 1.0, max: 2.8, step: 0.02, keyframable: true },
      { key: "autoAnimate", label: "Auto Ease Envelope", type: "boolean" },
      { key: "focusX", label: "Focus Point X %", type: "range", min: 10, max: 90, step: 0.5, keyframable: true },
      { key: "focusY", label: "Focus Point Y %", type: "range", min: 10, max: 90, step: 0.5, keyframable: true },
      { key: "panX", label: "Camera Pan X %", type: "range", min: -30, max: 30, step: 0.5, keyframable: true },
      { key: "panY", label: "Camera Pan Y %", type: "range", min: -30, max: 30, step: 0.5, keyframable: true },
      { key: "rotation", label: "Camera Dutch Tilt", type: "range", min: -30, max: 30, step: 0.5, keyframable: true },
      {
        key: "easing",
        label: "Easing Curve",
        type: "select",
        options: [
          { value: "ease_in_out", label: "Smooth Ease In/Out" },
          { value: "punch", label: "Snappy Punch" },
          { value: "ease_out", label: "Fast Ease Out" },
          { value: "linear", label: "Linear" },
        ],
      },
      { key: "motionBlurStrength", label: "Motion Blur Strength", type: "range", min: 0, max: 100, step: 1, keyframable: true },
    ],
  },
  {
    id: "flash_camera_shake",
    category: "camera_transitions",
    name: "Flash & Camera Shake",
    shortDescription: "Impact shake, exposure pulses, color flashes & beat sync with edge protection.",
    kind: "frame_fx",
    available: true,
    defaultDuration: 1.5,
    defaultBlendMode: "normal",
    defaultOpacity: 1.0,
    defaultParams: {
      mode: "impact_shake",
      shakeStrength: 58,
      shakeFrequency: 14,
      directionalAngle: 20,
      flashIntensity: 68,
      flashColor: "#ffffff",
      beatSync: false,
      seed: 47,
    },
    paramsSchema: [
      {
        key: "mode",
        label: "Impact Style",
        type: "select",
        options: [
          { value: "impact_shake", label: "Impact Shake + Flash" },
          { value: "handheld_shake", label: "Organic Handheld Shake" },
          { value: "directional_whip", label: "Directional Shake" },
          { value: "exposure_flash", label: "White Exposure Flash" },
          { value: "strobe_pulse", label: "Rhythmic Strobe Pulse" },
        ],
      },
      { key: "shakeStrength", label: "Shake Strength", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "shakeFrequency", label: "Shake Frequency (Hz)", type: "range", min: 1, max: 30, step: 0.5, keyframable: true },
      { key: "directionalAngle", label: "Shake Angle (deg)", type: "range", min: -180, max: 180, step: 1 },
      { key: "flashIntensity", label: "Flash Exposure %", type: "range", min: 0, max: 100, step: 1, keyframable: true },
      { key: "flashColor", label: "Flash Color", type: "color" },
      { key: "beatSync", label: "Audio Beat Synchronisation", type: "boolean" },
    ],
  },
  {
    id: "particle_overlays",
    category: "particles_atmosphere",
    name: "Particle Overlays",
    shortDescription: "Animated dust, sparks, smoke, snow, glitter and confetti with subject masking.",
    kind: "frame_fx",
    available: true,
    defaultDuration: 4.0,
    defaultBlendMode: "screen",
    defaultOpacity: 0.9,
    defaultParams: {
      particleType: "sparks",
      particleCount: 75,
      speed: 1.0,
      size: 8,
      direction: "up",
      color: "#ffd166",
      secondaryColor: "#ff5e7e",
      maskMode: "full_frame",
      subjectX: 50,
      subjectY: 50,
      subjectRadius: 34,
      seed: 53,
    },
    paramsSchema: [
      {
        key: "particleType",
        label: "Particle Type",
        type: "select",
        options: [
          { value: "sparks", label: "Glowing Sparks" },
          { value: "dust", label: "Floating Atmosphere Dust" },
          { value: "snow", label: "Winter Snowfall" },
          { value: "confetti", label: "Celebration Confetti" },
          { value: "glitter", label: "Sparkle Glitter" },
          { value: "smoke", label: "Soft Drift Smoke" },
        ],
      },
      { key: "particleCount", label: "Particle Count", type: "range", min: 10, max: 200, step: 1, keyframable: true },
      { key: "speed", label: "Motion Speed", type: "range", min: 0.2, max: 3.0, step: 0.05, keyframable: true },
      { key: "size", label: "Particle Size", type: "range", min: 2, max: 24, step: 0.5, keyframable: true },
      {
        key: "direction",
        label: "Flow Direction",
        type: "select",
        options: [
          { value: "up", label: "Rise Upward" },
          { value: "down", label: "Fall Downward" },
          { value: "left", label: "Drift Left" },
          { value: "right", label: "Drift Right" },
          { value: "radial_float", label: "Floating Ambient" },
        ],
      },
      {
        key: "maskMode",
        label: "Subject Mask Depth",
        type: "select",
        options: [
          { value: "full_frame", label: "In Front (Full Frame)" },
          { value: "behind_subject", label: "Behind Tracked Subject" },
          { value: "front_of_subject", label: "Front of Subject" },
        ],
      },
      { key: "subjectX", label: "Mask Subject X %", type: "range", min: 15, max: 85, step: 0.5, keyframable: true },
      { key: "subjectY", label: "Mask Subject Y %", type: "range", min: 15, max: 85, step: 0.5, keyframable: true },
      { key: "subjectRadius", label: "Mask Radius %", type: "range", min: 15, max: 65, step: 0.5 },
      { key: "color", label: "Primary Color", type: "color" },
      { key: "secondaryColor", label: "Secondary Color", type: "color" },
    ],
  },
]);

export const getCreativeEffectCatalogEntry = effectId =>
  STUDIO_CREATIVE_EFFECT_CATALOG.find(item => item.id === effectId && item.available) || null;

export const getAvailableCreativeCategories = () => {
  const activeCatIds = new Set(STUDIO_CREATIVE_EFFECT_CATALOG.filter(e => e.available).map(e => e.category));
  return STUDIO_CREATIVE_CATEGORIES.filter(cat => cat.id === "all" || activeCatIds.has(cat.id));
};

export function hashSeed(input) {
  const str = String(input ?? "studio-fx");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clampNum(val, min, max, fallback = min) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function hexToRgb(hex, fallback = [255, 255, 255]) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || "").trim());
  if (!m) return fallback;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

export function createCreativeEffectInstance(effectId, overrides = {}) {
  const spec = getCreativeEffectCatalogEntry(effectId);
  if (!spec) throw new Error(`Creative effect "${effectId}" is not available.`);
  const startTime = clampNum(overrides.startTime, 0, 36000, 0);
  const duration = clampNum(overrides.duration, 0.1, 36000, spec.defaultDuration);
  const blendMode = STUDIO_EXPORT_BLEND_MODES.includes(overrides.blendMode)
    ? overrides.blendMode
    : spec.defaultBlendMode;
  return {
    id: overrides.id || `fx-${effectId}-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999)}`,
    effectId: spec.id,
    category: spec.category,
    name: String(overrides.name || spec.name),
    enabled: overrides.enabled !== false,
    clipId: overrides.clipId ? String(overrides.clipId) : null,
    layerTargetId: overrides.layerTargetId ? String(overrides.layerTargetId) : null,
    startTime: Number(startTime.toFixed(3)),
    duration: Number(duration.toFixed(3)),
    blendMode,
    opacity: clampNum(overrides.opacity, 0, 1, spec.defaultOpacity),
    order: Number.isFinite(Number(overrides.order)) ? Number(overrides.order) : 0,
    tracking: {
      enabled: Boolean(overrides.tracking?.enabled),
      sourceLayerId: overrides.tracking?.sourceLayerId ? String(overrides.tracking.sourceLayerId) : null,
      offsetX: clampNum(overrides.tracking?.offsetX, -50, 50, 0),
      offsetY: clampNum(overrides.tracking?.offsetY, -50, 50, 0),
    },
    beatSync: {
      enabled: Boolean(overrides.beatSync?.enabled),
      strength: clampNum(overrides.beatSync?.strength, 0, 1, 0.5),
    },
    params: {
      ...spec.defaultParams,
      ...(overrides.params && typeof overrides.params === "object" ? overrides.params : {}),
    },
    linkedOverlayIds: Array.isArray(overrides.linkedOverlayIds) ? overrides.linkedOverlayIds.map(String) : [],
    linkedGroupId: overrides.linkedGroupId ? String(overrides.linkedGroupId) : null,
  };
}

export function normalizeCreativeEffects(list, timelineDuration = null) {
  if (!Array.isArray(list)) return [];
  const maxDur = Number.isFinite(Number(timelineDuration)) && Number(timelineDuration) > 0
    ? Number(timelineDuration)
    : 36000;
  return list
    .map((item, idx) => {
      const spec = getCreativeEffectCatalogEntry(item?.effectId);
      if (!spec) return null;
      const normalized = createCreativeEffectInstance(spec.id, {
        ...item,
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : idx,
      });
      if (normalized.startTime > maxDur) normalized.startTime = Math.max(0, Number((maxDur - 0.1).toFixed(3)));
      return normalized;
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order)
    .map((item, idx) => ({ ...item, order: idx }));
}

export function creativeEffectPropertiesForTarget(effect) {
  const spec = getCreativeEffectCatalogEntry(effect?.effectId);
  if (!spec) return [];
  const props = [{ id: "opacity", label: "Opacity", min: 0, max: 1, step: 0.01 }];
  for (const field of spec.paramsSchema) {
    if (field.type === "range" && field.keyframable) {
      props.push({
        id: field.key,
        label: field.label,
        min: field.min,
        max: field.max,
        step: field.step,
      });
    }
  }
  return props;
}

export function evaluateCreativeEffectParams(effect, motionKeyframes = [], time = 0) {
  const spec = getCreativeEffectCatalogEntry(effect?.effectId);
  if (!spec) return { opacity: 1, params: { ...(effect?.params || {}) } };
  const targetKeys = (motionKeyframes || []).filter(k => String(k.targetId) === String(effect.id));
  const opacity = clampNum(
    interpolateAutomationValue({
      keyframes: targetKeys,
      property: "opacity",
      time,
      fallback: effect.opacity ?? spec.defaultOpacity,
    }),
    0,
    1,
    spec.defaultOpacity
  );
  const resolved = { ...spec.defaultParams, ...(effect.params || {}) };
  for (const field of spec.paramsSchema) {
    if (field.type === "range") {
      const hasKeys = targetKeys.some(k => k.property === field.key);
      if (hasKeys) {
        resolved[field.key] = clampNum(
          interpolateAutomationValue({
            keyframes: targetKeys,
            property: field.key,
            time,
            fallback: resolved[field.key],
          }),
          field.min,
          field.max,
          spec.defaultParams[field.key]
        );
      } else {
        resolved[field.key] = clampNum(resolved[field.key], field.min, field.max, spec.defaultParams[field.key]);
      }
    }
  }
  return { opacity, params: resolved, targetKeys };
}

function interpolateNoiseTable(table, tNorm) {
  const n = table.length;
  const scaled = (((tNorm % 1) + 1) % 1) * (n - 1);
  const i0 = Math.floor(scaled);
  const i1 = Math.min(n - 1, i0 + 1);
  const frac = scaled - i0;
  const s = frac * frac * (3 - 2 * frac);
  return table[i0] * (1 - s) + table[i1] * s;
}

export function generateTornEdgePolyline({ width, height, progress, positionPct, direction, angleDeg, roughness, seed }) {
  let theta = 0;
  if (direction === "horizontal") theta = Math.PI / 2;
  else if (direction === "diagonal") theta = -Math.PI / 4;
  else if (direction === "custom") theta = (Number(angleDeg || 0) * Math.PI) / 180;
  else theta = 0; // vertical or center_split defaults to vertical seam

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  // Tangent along the tear line, normal across which it opens
  const tx = -sinT;
  const ty = cosT;
  const nx = cosT;
  const ny = sinT;

  const diag = Math.hypot(width, height);
  const cx = width * 0.5 + nx * (((positionPct - 50) / 100) * width * 0.8);
  const cy = height * 0.5 + ny * (((positionPct - 50) / 100) * height * 0.8);

  const rand = mulberry32(hashSeed(`torn-${seed}`));
  const macroNoise = Array.from({ length: 24 }, () => (rand() - 0.5) * 2);
  const microNoise = Array.from({ length: 120 }, () => (rand() - 0.5) * 2);
  const amp = (roughness / 100) * diag * 0.048;

  const steps = 96;
  const seam = [];
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const along = (u - 0.5) * diag * 1.4;
    const offset =
      interpolateNoiseTable(macroNoise, u) * amp * 0.68 +
      interpolateNoiseTable(microNoise, u) * amp * 0.42;
    seam.push([cx + tx * along + nx * offset, cy + ty * along + ny * offset]);
  }
  const openDist = (clampNum(progress, 0, 100, 0) / 100) * diag * 0.42;
  return { seam, nx, ny, tx, ty, openDist, diag };
}

function drawPolygonPath(ctx, pts) {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) {
    ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.closePath();
}

export function renderRippedPaperFrame(ctx, width, height, effect, resolved, time, options = {}) {
  const { params, opacity, targetKeys } = resolved;
  const localTime = Math.max(0, time - effect.startTime);
  const duration = Math.max(0.1, effect.duration);
  const hasProgressKeys = targetKeys.some(k => k.property === "tearProgress");
  let progress = params.tearProgress;
  if (!hasProgressKeys && params.autoAnimate) {
    const cycle = Math.min(1, (localTime / duration) * params.speed);
    progress = Math.sin(cycle * Math.PI * 0.5) * 100;
  }

  const { seam, nx, ny, openDist, diag } = generateTornEdgePolyline({
    width,
    height,
    progress,
    positionPct: params.tearPosition,
    direction: params.direction,
    angleDeg: params.angle,
    roughness: params.roughness,
    seed: params.seed,
  });

  const shift = openDist;
  const leftSeam = seam.map(([x, y]) => [x - nx * shift, y - ny * shift]);
  const rightSeam = seam.map(([x, y]) => [x + nx * shift, y + ny * shift]);
  const farLeftPoly = [...leftSeam, [leftSeam[leftSeam.length - 1][0] - nx * diag * 1.6, leftSeam[leftSeam.length - 1][1] - ny * diag * 1.6], [leftSeam[0][0] - nx * diag * 1.6, leftSeam[0][1] - ny * diag * 1.6]];
  const farRightPoly = [...rightSeam, [rightSeam[rightSeam.length - 1][0] + nx * diag * 1.6, rightSeam[rightSeam.length - 1][1] + ny * diag * 1.6], [rightSeam[0][0] + nx * diag * 1.6, rightSeam[0][1] + ny * diag * 1.6]];

  // Capture current canvas frame before overwriting so we can reconstruct flaps cleanly
  const sourceSnap = document.createElement("canvas");
  sourceSnap.width = width;
  sourceSnap.height = height;
  sourceSnap.getContext("2d").drawImage(ctx.canvas, 0, 0, width, height);

  const fiberW = Math.max(3, Math.round(height * (0.008 + (params.roughness / 100) * 0.01)));
  const shadowBlurPx = Math.max(2, Math.round((params.shadow / 100) * height * 0.03));

  ctx.save();
  ctx.globalAlpha = opacity;

  const paintPaperFill = (fillHex) => {
    ctx.fillStyle = fillHex;
    ctx.fillRect(0, 0, width, height);
    if (params.paperTexture > 2) {
      const rand = mulberry32(hashSeed(`paper-${params.seed}`));
      const alpha = (params.paperTexture / 100) * 0.14;
      ctx.fillStyle = `rgba(92, 72, 48, ${alpha.toFixed(3)})`;
      const speckCount = Math.min(900, Math.round((width * height) / 1400));
      for (let i = 0; i < speckCount; i += 1) {
        ctx.fillRect(rand() * width, rand() * height, 1.5, 1.5);
      }
    }
  };

  if (params.mode === "tear_away_paper") {
    // Paper sheet flaps sit above the video, revealing video in the torn gap
    const drawFlap = (poly, seamEdge, edgeNormalSign) => {
      ctx.save();
      if (params.shadow > 0) {
        ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
        ctx.shadowBlur = shadowBlurPx;
        ctx.shadowOffsetX = nx * edgeNormalSign * 3;
        ctx.shadowOffsetY = ny * edgeNormalSign * 3 + 2;
      }
      // Fiber deckled outer edge slightly shifted into gap
      const fiberSeam = seamEdge.map(([x, y]) => [x + nx * edgeNormalSign * fiberW, y + ny * edgeNormalSign * fiberW]);
      const fiberPoly = [...fiberSeam, poly[poly.length - 2], poly[poly.length - 1]];
      drawPolygonPath(ctx, fiberPoly);
      ctx.fillStyle = params.fiberEdgeColor;
      ctx.fill();
      ctx.restore();

      ctx.save();
      drawPolygonPath(ctx, poly);
      ctx.clip();
      paintPaperFill(params.paperColor);
      ctx.restore();
    };
    drawFlap(farLeftPoly, leftSeam, 1);
    drawFlap(farRightPoly, rightSeam, -1);
  } else if (params.mode === "paper_border") {
    // Deckled paper frame border along all 4 perimeter sides
    const margin = Math.max(height, width) * (0.04 + (progress / 100) * 0.08);
    const rand = mulberry32(hashSeed(`border-${params.seed}`));
    const jitter = (params.roughness / 100) * height * 0.025;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    // Counter-clockwise inner hole
    const pts = [];
    const segs = 28;
    for (let i = 0; i < segs; i += 1) pts.push([margin + (i / segs) * (width - 2 * margin), margin + (rand() - 0.5) * jitter]);
    for (let i = 0; i < segs; i += 1) pts.push([width - margin + (rand() - 0.5) * jitter, margin + (i / segs) * (height - 2 * margin)]);
    for (let i = 0; i < segs; i += 1) pts.push([width - margin - (i / segs) * (width - 2 * margin), height - margin + (rand() - 0.5) * jitter]);
    for (let i = 0; i < segs; i += 1) pts.push([margin + (rand() - 0.5) * jitter, height - margin - (i / segs) * (height - 2 * margin)]);
    // Winding inner cutout
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = pts.length - 1; i >= 0; i -= 1) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (params.shadow > 0) {
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = shadowBlurPx;
    }
    ctx.fillStyle = params.fiberEdgeColor;
    ctx.fill();
    ctx.clip();
    paintPaperFill(params.paperColor);
    ctx.restore();
  } else {
    // tear_video_open: gap exposes backing + optional behind-tear layer/text; video sits on torn flaps
    paintPaperFill(params.behindColor);
    if (typeof options.drawBehindLayer === "function") {
      options.drawBehindLayer(ctx, width, height, time);
    }
    if (params.behindText && String(params.behindText).trim()) {
      ctx.save();
      ctx.fillStyle = params.paperColor || "#f8fafc";
      ctx.font = `800 ${Math.max(18, Math.round(height * 0.068))}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(params.behindText).trim(), width * 0.5, height * 0.5, width * 0.86);
      ctx.restore();
    }
    const drawVideoFlap = (poly, seamEdge, edgeNormalSign) => {
      ctx.save();
      if (params.shadow > 0) {
        ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
        ctx.shadowBlur = shadowBlurPx;
        ctx.shadowOffsetX = nx * edgeNormalSign * 3;
        ctx.shadowOffsetY = ny * edgeNormalSign * 3 + 2;
      }
      const fiberSeam = seamEdge.map(([x, y]) => [x + nx * edgeNormalSign * fiberW, y + ny * edgeNormalSign * fiberW]);
      const fiberPoly = [...fiberSeam, poly[poly.length - 2], poly[poly.length - 1]];
      drawPolygonPath(ctx, fiberPoly);
      ctx.fillStyle = params.fiberEdgeColor;
      ctx.fill();
      ctx.restore();

      ctx.save();
      drawPolygonPath(ctx, poly);
      ctx.clip();
      ctx.drawImage(sourceSnap, 0, 0, width, height);
      ctx.restore();
    };
    drawVideoFlap(farLeftPoly, leftSeam, 1);
    drawVideoFlap(farRightPoly, rightSeam, -1);
  }
  ctx.restore();
}

export function generateDoodlePaths(shape, seed = 11, wobble = 40) {
  const rand = mulberry32(hashSeed(`doodle-${shape}-${seed}`));
  const j = (wobble / 100) * 0.025;
  const wobblePt = (x, y) => [x + (rand() - 0.5) * j, y + (rand() - 0.5) * j];

  if (shape === "circle") {
    const pts = [];
    for (let i = 0; i <= 48; i += 1) {
      const a = (i / 48) * Math.PI * 2.08 - 0.3;
      const rx = 0.42 + (rand() - 0.5) * j;
      const ry = 0.34 + (rand() - 0.5) * j;
      pts.push([Math.cos(a) * rx, Math.sin(a) * ry]);
    }
    return [pts];
  }
  if (shape === "underline" || shape === "marker_highlight") {
    const count = 24;
    const pts = [];
    for (let i = 0; i <= count; i += 1) {
      const u = i / count;
      pts.push(wobblePt(-0.45 + u * 0.9, Math.sin(u * Math.PI) * -0.025));
    }
    return [pts];
  }
  if (shape === "double_underline") {
    const s1 = [];
    const s2 = [];
    for (let i = 0; i <= 20; i += 1) {
      const u = i / 20;
      s1.push(wobblePt(-0.44 + u * 0.88, -0.045));
      s2.push(wobblePt(-0.38 + u * 0.8, 0.065));
    }
    return [s1, s2];
  }
  if (shape === "star") {
    const verts = [];
    for (let i = 0; i <= 10; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 0.44 : 0.19;
      verts.push(wobblePt(Math.cos(a) * r, Math.sin(a) * r));
    }
    return [verts];
  }
  if (shape === "heart") {
    const pts = [];
    for (let i = 0; i <= 48; i += 1) {
      const t = (i / 48) * Math.PI * 2;
      const hx = (16 * Math.sin(t) ** 3) / 40;
      const hy = -((13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 40);
      pts.push(wobblePt(hx, hy));
    }
    return [pts];
  }
  if (shape === "scribble") {
    const pts = [];
    for (let i = 0; i <= 44; i += 1) {
      const u = i / 44;
      const x = -0.44 + u * 0.88;
      const y = Math.sin(u * Math.PI * 5.2) * 0.16 + (rand() - 0.5) * j;
      pts.push([x, y]);
    }
    return [pts];
  }
  if (shape === "checkmark") {
    return [
      [wobblePt(-0.35, 0.02), wobblePt(-0.08, 0.30), wobblePt(0.38, -0.30)],
    ];
  }
  if (shape === "curved_arrow") {
    const shaft = [];
    for (let i = 0; i <= 24; i += 1) {
      const u = i / 24;
      const x = -0.38 + u * 0.74;
      const y = 0.24 - Math.sin(u * Math.PI * 0.85) * 0.36;
      shaft.push(wobblePt(x, y));
    }
    const head = [wobblePt(0.18, -0.18), wobblePt(0.36, 0.02), wobblePt(0.14, 0.14)];
    return [shaft, head];
  }
  // default arrow
  const shaft = [];
  for (let i = 0; i <= 18; i += 1) {
    const u = i / 18;
    shaft.push(wobblePt(-0.42 + u * 0.82, Math.sin(u * Math.PI) * -0.04));
  }
  const head = [wobblePt(0.18, -0.19), wobblePt(0.42, 0.0), wobblePt(0.18, 0.19)];
  return [shaft, head];
}

export function renderDoodleFrame(ctx, width, height, effect, resolved, time, poseOverride = null) {
  const { params, opacity, targetKeys } = resolved;
  const localTime = Math.max(0, time - effect.startTime);
  const hasProgressKeys = targetKeys.some(k => k.property === "drawProgress");
  let progress = params.drawProgress;
  if (!hasProgressKeys && params.autoAnimate) {
    const raw = clampNum((localTime / Math.max(0.15, params.drawDuration)) * params.speed, 0, 1, 1);
    progress = params.direction === "reverse" ? (1 - raw) * 100 : raw * 100;
  } else if (params.direction === "reverse" && !hasProgressKeys) {
    progress = 100 - progress;
  }
  if (progress <= 0.1) return;

  const px = poseOverride?.x ?? params.x;
  const py = poseOverride?.y ?? params.y;
  const scale = poseOverride?.scale ?? params.scale;
  const rot = ((poseOverride?.rotation ?? params.rotation) * Math.PI) / 180;
  const boxSize = height * 0.36 * scale;

  const paths = generateDoodlePaths(params.shape, params.seed, params.wobble);
  let totalLen = 0;
  paths.forEach(poly => {
    for (let i = 1; i < poly.length; i += 1) {
      totalLen += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
    }
  });
  let targetLen = (clampNum(progress, 0, 100, 100) / 100) * totalLen;

  ctx.save();
  ctx.translate((px / 100) * width, (py / 100) * height);
  ctx.rotate(rot);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const isMarker = params.shape === "marker_highlight";
  ctx.globalAlpha = opacity * (isMarker ? 0.45 : 1.0);
  ctx.strokeStyle = params.color || "#ffde59";
  ctx.lineWidth = Math.max(2, params.strokeWidth * (height / 720) * (isMarker ? 3.2 : 1));
  if (isMarker) ctx.globalCompositeOperation = "multiply";

  for (let pIdx = 0; pIdx < paths.length; pIdx += 1) {
    if (targetLen <= 0) break;
    const poly = paths[pIdx];
    if (poly.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(poly[0][0] * boxSize, poly[0][1] * boxSize);
    for (let i = 1; i < poly.length; i += 1) {
      const seg = Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
      if (targetLen >= seg) {
        ctx.lineTo(poly[i][0] * boxSize, poly[i][1] * boxSize);
        targetLen -= seg;
      } else {
        const ratio = seg > 0 ? targetLen / seg : 0;
        const ix = poly[i - 1][0] + (poly[i][0] - poly[i - 1][0]) * ratio;
        const iy = poly[i - 1][1] + (poly[i][1] - poly[i - 1][1]) * ratio;
        ctx.lineTo(ix * boxSize, iy * boxSize);
        targetLen = 0;
        break;
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function renderFilmGrainFrame(ctx, width, height, effect, resolved, time, fps = 30) {
  const { params, opacity } = resolved;
  const frameIdx = Math.max(0, Math.floor(time * Math.max(1, fps)));
  const intensity = clampNum(params.intensity, 0, 100, 50) / 100;
  const grainScale = Math.max(1, Math.round(params.grainSize * Math.max(0.5, height / 720)));
  const rand = mulberry32(hashSeed(`grain-${frameIdx}-${params.preset}`));

  // Optional gate weave shift
  if (params.motion === "heavy_gate") {
    const weaveX = (rand() - 0.5) * 4 * (height / 720);
    const weaveY = (rand() - 0.5) * 4 * (height / 720);
    if (Math.abs(weaveX) > 0.2 || Math.abs(weaveY) > 0.2) {
      const copy = document.createElement("canvas");
      copy.width = width;
      copy.height = height;
      copy.getContext("2d").drawImage(ctx.canvas, 0, 0);
      ctx.drawImage(copy, weaveX, weaveY);
    }
  }

  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;
  const flickerMul = 1 + (params.flicker / 100) * 0.14 * (Math.sin(frameIdx * 1.7) * 0.55 + (rand() - 0.5));
  const noiseAmp = intensity * 58 * opacity;
  const isSepia = params.preset === "vintage_sepia" || params.colorMode === "warm_sepia";
  const is8mm = params.preset === "8mm_kodachrome";
  const isColorGrain = params.colorMode === "color";
  const seedShift = (frameIdx * 747796405) | 0;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const invRadSq = 1 / Math.max(1, cx * cx + cy * cy);
  const vigStrength = (params.vignette / 100) * 0.72 * opacity;

  for (let y = 0; y < height; y += 1) {
    const gy = (y / grainScale) | 0;
    const dy = y - cy;
    const dySq = dy * dy;
    const rowSeed = Math.imul(gy ^ (seedShift << 1), 0x9e3779b1) | 0;
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const gx = (x / grainScale) | 0;
      let h = (Math.imul(gx ^ (gx >>> 13), 0x85ebca6b) + rowSeed) | 0;
      h ^= h >>> 16;
      h = Math.imul(h, 0xc2b2ae35) | 0;
      h ^= h >>> 13;
      const g1 = (((h >>> 24) & 255) / 127.5 - 1.0) * noiseAmp;
      let r = d[idx] * flickerMul;
      let g = d[idx + 1] * flickerMul;
      let b = d[idx + 2] * flickerMul;

      if (isSepia) {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const mix = 0.65 * opacity;
        r = r * (1 - mix) + Math.min(255, lum * 1.18 + 14) * mix;
        g = g * (1 - mix) + Math.min(255, lum * 0.98 + 6) * mix;
        b = b * (1 - mix) + Math.min(255, lum * 0.74) * mix;
      } else if (is8mm) {
        const mix = 0.25 * opacity;
        r = r * (1 - mix) + Math.min(255, r * 1.08 + 8) * mix;
        g = g * (1 - mix) + Math.min(255, g * 1.01 + 3) * mix;
        b = b * (1 - mix) + Math.max(0, b * 0.90) * mix;
      }

      if (isColorGrain) {
        const h2 = Math.imul(h ^ 0x9e3779b9, 1597334677) | 0;
        const cg = (((h2 >>> 8) & 255) / 127.5 - 1.0) * noiseAmp * 0.65;
        r += g1 + cg * 0.45;
        g += g1 - cg * 0.25;
        b += g1 + cg * 0.55;
      } else {
        r += g1;
        g += g1;
        b += g1;
      }

      if (vigStrength > 0.005) {
        const dx = x - cx;
        const distNorm = (dx * dx + dySq) * invRadSq;
        const vFactor = Math.max(0.18, 1 - distNorm * vigStrength);
        r *= vFactor;
        g *= vFactor;
        b *= vFactor;
      }

      d[idx] = r < 0 ? 0 : r > 255 ? 255 : r;
      d[idx + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      d[idx + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Scratches & Dust (vector crisp pass synced to frameIdx)
  ctx.save();
  ctx.globalAlpha = opacity;
  const dustCount = Math.round((params.dustAmount / 100) * 32);
  for (let i = 0; i < dustCount; i += 1) {
    const sx = rand() * width;
    const sy = rand() * height;
    const sr = 0.8 + rand() * 2.2 * (height / 720);
    ctx.fillStyle = rand() > 0.45 ? "rgba(255,250,240,0.45)" : "rgba(18,16,14,0.42)";
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }
  const scratchCount = Math.round((params.scratchesAmount / 100) * 8);
  for (let i = 0; i < scratchCount; i += 1) {
    const sx = rand() * width;
    const sy0 = rand() * height * 0.4;
    const len = height * (0.25 + rand() * 0.65);
    ctx.strokeStyle = rand() > 0.5 ? "rgba(255,255,255,0.24)" : "rgba(10,10,10,0.28)";
    ctx.lineWidth = Math.max(1, (height / 720) * (0.7 + rand() * 1.1));
    ctx.beginPath();
    ctx.moveTo(sx, sy0);
    ctx.lineTo(sx + (rand() - 0.5) * 4, sy0 + len);
    ctx.stroke();
  }

  // Film borders (8mm sprocket / 16mm gate / rounded matte)
  if (params.borderStyle !== "none") {
    ctx.fillStyle = "#08080a";
    const barW = Math.max(8, Math.round(width * 0.065));
    const padY = Math.max(6, Math.round(height * 0.035));
    ctx.fillRect(0, 0, barW, height);
    ctx.fillRect(width - barW, 0, barW, height);
    ctx.fillRect(0, 0, width, padY);
    ctx.fillRect(0, height - padY, width, padY);
    if (params.borderStyle === "8mm_sprocket") {
      ctx.fillStyle = "#f2f0e8";
      const holeH = Math.max(10, Math.round(height * 0.055));
      const holeW = Math.max(6, Math.round(barW * 0.52));
      const holeStep = Math.round(height * 0.14);
      const yOffset = ((frameIdx * 12) % holeStep) - holeStep;
      for (let y = yOffset; y < height; y += holeStep) {
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(barW * 0.24, y, holeW, holeH, 3) : ctx.rect(barW * 0.24, y, holeW, holeH);
        ctx.fill();
      }
    } else if (params.borderStyle === "16mm_gate" || params.borderStyle === "rounded_matte") {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2;
      ctx.strokeRect(barW, padY, width - 2 * barW, height - 2 * padY);
    }
  }
  ctx.restore();
}

export function resolveLightLeakPalette(params) {
  switch (params.style) {
    case "cool_cyan":
      return [hexToRgb("#38bdf8"), hexToRgb("#a855f7")];
    case "prismatic_rainbow":
      return [hexToRgb("#ff5e7e"), hexToRgb("#38bdf8")];
    case "film_burn_orange":
      return [hexToRgb("#ff3d00"), hexToRgb("#ffd54f")];
    case "custom":
      return [hexToRgb(params.primaryColor, [255, 107, 26]), hexToRgb(params.secondaryColor, [255, 209, 102])];
    default:
      return [hexToRgb("#ff6b1a"), hexToRgb("#ffd166")];
  }
}

export function renderLightLeakFrame(ctx, width, height, effect, resolved, time) {
  const { params, opacity } = resolved;
  const localFrac = clampNum((time - effect.startTime) / Math.max(0.1, effect.duration), 0, 1, 0);
  const phase = localFrac * params.speed;
  const envelope =
    params.mode === "clip_transition"
      ? Math.pow(Math.sin(Math.PI * localFrac), 1.15)
      : 0.72 + 0.28 * Math.sin(phase * Math.PI * 2);
  const alpha = clampNum((params.intensity / 100) * opacity * envelope, 0, 1, 0);
  if (alpha <= 0.005) return;

  const [c1, c2] = resolveLightLeakPalette(params);
  let p1 = [0.2 + phase * 0.65, 0.45];
  let p2 = [0.45 + phase * 0.4, 0.72];
  if (params.direction === "right_to_left") {
    p1 = [0.85 - phase * 0.7, 0.4];
    p2 = [0.65 - phase * 0.45, 0.68];
  } else if (params.direction === "top_down") {
    p1 = [0.45, 0.15 + phase * 0.65];
    p2 = [0.62, 0.3 + phase * 0.45];
  } else if (params.direction === "diagonal") {
    p1 = [0.15 + phase * 0.7, 0.18 + phase * 0.62];
    p2 = [0.32 + phase * 0.5, 0.42 + phase * 0.42];
  } else if (params.direction === "corner_pulse") {
    p1 = [0.12 + 0.06 * Math.sin(phase * Math.PI * 2), 0.18];
    p2 = [0.88 - 0.06 * Math.cos(phase * Math.PI * 2), 0.82];
  }

  const rad = Math.hypot(width, height) * (0.28 + (params.softness / 100) * 0.52);
  const compMode =
    effect.blendMode === "color-dodge"
      ? "color-dodge"
      : effect.blendMode === "overlay"
        ? "overlay"
        : effect.blendMode === "soft-light"
          ? "soft-light"
          : effect.blendMode === "normal"
            ? "lighter"
            : "screen";

  ctx.save();
  ctx.globalCompositeOperation = compMode;
  ctx.globalAlpha = alpha;

  const drawLobe = (pt, rgb, scaleR, peakAlpha) => {
    const cx = (((pt[0] % 1.4) + 1.4) % 1.4 - 0.2) * width;
    const cy = (((pt[1] % 1.4) + 1.4) % 1.4 - 0.2) * height;
    const r = rad * scaleR;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${peakAlpha})`);
    grad.addColorStop(0.45, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(peakAlpha * 0.42).toFixed(3)})`);
    grad.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  };

  drawLobe(p1, c1, 1.0, 0.85);
  drawLobe(p2, c2, 0.82, 0.68);
  drawLobe([p1[0] + 0.12, p2[1] - 0.15], c1, 0.55, 0.52);
  ctx.restore();
}

export function renderScrapbookOverlayEffect(ctx, width, height, effect, resolved) {
  const { params, opacity } = resolved;
  const scale = clampNum(params.scalePercent, 45, 100, 86) / 100;
  const rot = (clampNum(params.tiltAngle, -25, 25, -4) * Math.PI) / 180;
  const border = Math.max(4, params.borderWidth * (height / 720));
  const bottomExtra = params.frameStyle === "polaroid" ? border * 2.2 : border;

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = width;
  srcCanvas.height = height;
  srcCanvas.getContext("2d").drawImage(ctx.canvas, 0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = opacity;
  // Textured collage backing behind tilted photo card
  ctx.fillStyle = params.backingColor || "#c8b090";
  ctx.fillRect(0, 0, width, height);
  if (params.paperTexture > 2) {
    const rand = mulberry32(hashSeed(`sb-${params.seed}`));
    ctx.fillStyle = `rgba(60, 40, 20, ${((params.paperTexture / 100) * 0.1).toFixed(3)})`;
    const specks = Math.min(800, Math.round((width * height) / 1600));
    for (let i = 0; i < specks; i += 1) ctx.fillRect(rand() * width, rand() * height, 1.5, 1.5);
  }

  ctx.translate(width * 0.5, height * 0.5);
  ctx.rotate(rot);
  const innerW = width * scale;
  const innerH = height * scale * (params.frameStyle === "polaroid" ? 0.84 : 0.92);
  const cardW = innerW + border * 2;
  const cardH = innerH + border + bottomExtra;
  const cardX = -cardW * 0.5;
  const cardY = -cardH * 0.5;

  if (params.shadow > 0) {
    ctx.shadowColor = "rgba(0,0,0,0.48)";
    ctx.shadowBlur = Math.max(4, (params.shadow / 100) * height * 0.045);
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 8;
  }

  if (params.frameStyle === "torn_edge") {
    const rand = mulberry32(hashSeed(`sbt-${params.seed}`));
    const jitter = (params.roughness / 100) * border * 0.55;
    ctx.beginPath();
    const pts = [];
    for (let i = 0; i <= 20; i += 1) pts.push([cardX + (i / 20) * cardW, cardY + (rand() - 0.5) * jitter]);
    for (let i = 0; i <= 20; i += 1) pts.push([cardX + cardW + (rand() - 0.5) * jitter, cardY + (i / 20) * cardH]);
    for (let i = 20; i >= 0; i -= 1) pts.push([cardX + (i / 20) * cardW, cardY + cardH + (rand() - 0.5) * jitter]);
    for (let i = 20; i >= 0; i -= 1) pts.push([cardX + (rand() - 0.5) * jitter, cardY + (i / 20) * cardH]);
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = params.borderColor || "#f7f3eb";
    ctx.fill();
  } else {
    ctx.fillStyle = params.borderColor || "#f7f3eb";
    ctx.fillRect(cardX, cardY, cardW, cardH);
  }

  ctx.shadowColor = "transparent";
  ctx.drawImage(srcCanvas, -innerW * 0.5, cardY + border, innerW, innerH);

  if (params.frameStyle === "polaroid" && String(params.captionText || "").trim()) {
    ctx.fillStyle = "#1f2937";
    ctx.font = `700 ${Math.max(12, Math.round(bottomExtra * 0.42))}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(params.captionText).trim(), 0, cardY + border + innerH + bottomExtra * 0.5, innerW);
  }

  if (params.tapeTop) {
    ctx.save();
    ctx.translate(0, cardY + 2);
    ctx.rotate(-0.06);
    const tapeW = cardW * 0.34;
    const tapeH = Math.max(12, border * 0.78);
    ctx.globalAlpha = opacity * 0.78;
    ctx.fillStyle = params.tapeColor || "#e6cfa2";
    ctx.fillRect(-tapeW * 0.5, -tapeH * 0.5, tapeW, tapeH);
    ctx.restore();
  }
  ctx.restore();
}

export function renderVhsGlitchFrame(ctx, width, height, effect, resolved, time, fps = 30, options = {}) {
  const { params, opacity } = resolved;
  const frameIdx = Math.max(0, Math.floor(time * Math.max(1, fps)));
  const intensity = clampNum(params.intensity, 0, 100, 58) / 100;
  if (intensity <= 0.01) return;

  const beatMarkers = options.beatMarkers || [];
  const onBeat =
    Boolean(params.beatSync) &&
    beatMarkers.some(bm => Math.abs(Number(bm?.time ?? bm) - time) <= 0.14);
  const beatMult = onBeat ? 1.85 : 1.0;

  const rand = mulberry32(hashSeed(`vhs-${params.seed}-${frameIdx}`));
  const imgData = ctx.getImageData(0, 0, width, height);
  const src = new Uint8ClampedArray(imgData.data);
  const dst = imgData.data;

  const shiftPx = Math.round(clampNum(params.rgbSeparation, 0, 40, 10) * intensity * beatMult * (width / 1280));
  const rowDx = new Int16Array(height);

  // Seeded horizontal glitch slice tearing
  const burstProb = clampNum(params.glitchFrequency, 0, 100, 48) / 100 * 0.65 * beatMult;
  const isDigital = params.style === "digital_glitch";
  const isTracking = params.style === "tracking_error";
  if (rand() < burstProb || isDigital || isTracking) {
    const sliceCount = Math.round((4 + rand() * 8) * clampNum(params.displacement, 0, 100, 42) / 100);
    const maxShift = Math.round(width * 0.08 * intensity * beatMult);
    for (let s = 0; s < sliceCount; s += 1) {
      const y0 = Math.floor(rand() * height);
      const sh = Math.max(2, Math.floor(height * (0.01 + rand() * 0.06)));
      const dx = Math.round((rand() - 0.5) * 2 * maxShift);
      for (let y = y0; y < Math.min(height, y0 + sh); y += 1) {
        rowDx[y] += dx;
      }
    }
  }

  // Rolling VHS tracking static band
  const trackNoise = clampNum(params.trackingNoise, 0, 100, 45) / 100;
  const bandCenter = (((time * 0.28 + 0.15) % 1) * height) | 0;
  const bandHalf = Math.max(4, Math.round(height * 0.045));
  const scanStr = (clampNum(params.scanlines, 0, 100, 50) / 100) * 0.38 * opacity;

  for (let y = 0; y < height; y += 1) {
    const inTrackBand = trackNoise > 0.04 && (params.style === "vhs_tape" || isTracking) && Math.abs(y - bandCenter) <= bandHalf;
    const bandJit = inTrackBand ? Math.round(Math.sin((y - bandCenter) * 0.6) * width * 0.025 * trackNoise) : 0;
    const baseDx = rowDx[y] + bandJit;
    const scanMul = (y & 1) === 1 ? 1.0 - scanStr : 1.0;

    for (let x = 0; x < width; x += 1) {
      const outIdx = (y * width + x) * 4;
      const sxCenter = Math.max(0, Math.min(width - 1, x - baseDx));
      const sxR = Math.max(0, Math.min(width - 1, sxCenter - shiftPx));
      const sxB = Math.max(0, Math.min(width - 1, sxCenter + shiftPx));

      let r = src[(y * width + sxR) * 4] * scanMul;
      let g = src[(y * width + sxCenter) * 4 + 1] * scanMul;
      let b = src[(y * width + sxB) * 4 + 2] * scanMul;

      if (inTrackBand && (((x * 37 + y * 97 + frameIdx * 17) & 7) === 0)) {
        const snow = 160 * trackNoise;
        r += snow;
        g += snow;
        b += snow;
      }
      dst[outIdx] = dst[outIdx] * (1 - opacity) + Math.min(255, r) * opacity;
      dst[outIdx + 1] = dst[outIdx + 1] * (1 - opacity) + Math.min(255, g) * opacity;
      dst[outIdx + 2] = dst[outIdx + 2] * (1 - opacity) + Math.min(255, b) * opacity;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

export function renderComicPopArtFrame(ctx, width, height, effect, resolved, time, poseOverride = null) {
  const { params, opacity } = resolved;
  const imgData = ctx.getImageData(0, 0, width, height);
  const src = new Uint8ClampedArray(imgData.data);
  const dst = imgData.data;

  const levels = Math.max(2, Math.min(10, Math.round(params.posterizeLevels || 5)));
  const outlineStr = clampNum(params.outlineStrength, 0, 100, 68) / 100;
  const halftoneStr = clampNum(params.halftoneDensity, 0, 100, 56) / 100;
  const edgeThreshold = 205 - outlineStr * 155;
  const isNoir = params.style === "noir_ink";
  const isPopArt = params.style === "pop_art_warhol";

  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < luma.length; i += 1, p += 4) {
    luma[i] = 0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2];
  }

  const cell = Math.max(5, Math.round((1.15 - halftoneStr * 0.72) * 14 * Math.max(0.5, height / 720)));
  const stepQ = 255 / (levels - 1);

  for (let y = 0; y < height; y += 1) {
    const cy = Math.floor(y / cell) * cell + cell * 0.5;
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const pIdx = idx * 4;
      let r = Math.round(src[pIdx] / stepQ) * stepQ;
      let g = Math.round(src[pIdx + 1] / stepQ) * stepQ;
      let b = Math.round(src[pIdx + 2] / stepQ) * stepQ;
      const lum = luma[idx];

      if (isNoir) {
        const bw = lum > 138 ? 242 : lum > 78 ? 132 : 18;
        r = bw;
        g = bw;
        b = bw;
      } else if (isPopArt) {
        const nr = Math.min(255, r * 1.25 + (g < 100 ? 45 : 0));
        const ng = Math.min(255, g * 1.12);
        const nb = Math.min(255, b * 1.25 + (r > 140 ? 35 : 0));
        r = nr;
        g = ng;
        b = nb;
      }

      if (halftoneStr > 0.05) {
        const cx = Math.floor(x / cell) * cell + cell * 0.5;
        const dist = Math.hypot(x - cx, y - cy);
        const dotR = (1.0 - lum / 255) * (cell * 0.45) * halftoneStr;
        if (dist < dotR) {
          r *= 0.62;
          g *= 0.62;
          b *= 0.68;
        }
      }

      if (outlineStr > 0.05 && x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const gx = luma[idx + 1] - luma[idx - 1];
        const gy = luma[idx + width] - luma[idx - width];
        if (Math.abs(gx) + Math.abs(gy) > edgeThreshold) {
          r = 16;
          g = 16;
          b = 20;
        }
      }

      dst[pIdx] = dst[pIdx] * (1 - opacity) + r * opacity;
      dst[pIdx + 1] = dst[pIdx + 1] * (1 - opacity) + g * opacity;
      dst[pIdx + 2] = dst[pIdx + 2] * (1 - opacity) + b * opacity;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  ctx.save();
  ctx.globalAlpha = opacity;
  if (params.transitionMode === "whip_panel_in") {
    const localT = Math.max(0, time - effect.startTime);
    if (localT < 0.45) {
      const p = localT / 0.45;
      ctx.fillStyle = params.borderColor || "#ffffff";
      ctx.fillRect(0, 0, width * (1 - p), height);
    }
  }

  const bw = Math.max(4, Math.round(height * 0.018));
  if (params.borderStyle === "comic_gutter" || params.borderStyle === "panel_split") {
    ctx.strokeStyle = params.borderColor || "#ffffff";
    ctx.lineWidth = bw * 2;
    ctx.strokeRect(0, 0, width, height);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = Math.max(2, bw * 0.5);
    ctx.strokeRect(bw, bw, width - 2 * bw, height - 2 * bw);
    if (params.borderStyle === "panel_split") {
      ctx.beginPath();
      ctx.moveTo(width * 0.54, 0);
      ctx.lineTo(width * 0.46, height);
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = bw * 1.4;
      ctx.stroke();
      ctx.strokeStyle = params.borderColor || "#ffffff";
      ctx.lineWidth = bw * 0.8;
      ctx.stroke();
    }
  } else if (params.borderStyle === "action_burst") {
    ctx.strokeStyle = "rgba(17,17,17,0.72)";
    ctx.lineWidth = Math.max(2, height * 0.004);
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(width * 0.5 + Math.cos(a) * width * 0.36, height * 0.5 + Math.sin(a) * height * 0.36);
      ctx.lineTo(width * 0.5 + Math.cos(a) * width * 0.72, height * 0.5 + Math.sin(a) * height * 0.72);
      ctx.stroke();
    }
  }

  const speech = String(params.speechText || "").trim();
  if (speech && params.bubbleStyle !== "none") {
    const bx = ((poseOverride?.x ?? params.bubbleX) / 100) * width;
    const by = ((poseOverride?.y ?? params.bubbleY) / 100) * height;
    const rad = Math.max(38, Math.round(height * 0.11));
    ctx.fillStyle = params.panelColor || "#facc15";
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = Math.max(2, Math.round(height * 0.006));
    if (params.bubbleStyle === "burst") {
      ctx.beginPath();
      for (let i = 0; i < 16; i += 1) {
        const a = (i / 16) * Math.PI * 2;
        const rr = i % 2 === 0 ? rad * 1.25 : rad * 0.78;
        const px = bx + Math.cos(a) * rr * 1.35;
        const py = by + Math.sin(a) * rr * 0.92;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (params.bubbleStyle === "caption_box") {
      ctx.fillRect(bx - rad * 1.3, by - rad * 0.55, rad * 2.6, rad * 1.1);
      ctx.strokeRect(bx - rad * 1.3, by - rad * 0.55, rad * 2.6, rad * 1.1);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(bx, by, rad * 1.3, rad * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = "#111111";
    ctx.font = `900 ${Math.max(14, Math.round(height * 0.044))}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(speech, bx, by, rad * 2.1);
  }
  ctx.restore();
}

export function computeFreezeCutoutMask(srcRgbaData, width, height, params) {
  // Border perimeter mean color model
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;
  const padY = Math.max(2, Math.round(height * 0.05));
  const padX = Math.max(2, Math.round(width * 0.05));
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (y < padY || y >= height - padY || x < padX || x >= width - padX) {
        const idx = (y * width + x) * 4;
        rSum += srcRgbaData[idx];
        gSum += srcRgbaData[idx + 1];
        bSum += srcRgbaData[idx + 2];
        count += 1;
      }
    }
  }
  const bgR = count ? rSum / count : 20;
  const bgG = count ? gSum / count : 24;
  const bgB = count ? bSum / count : 36;

  const cx = (clampNum(params.subjectX, 10, 90, 50) / 100) * width;
  const cy = (clampNum(params.subjectY, 10, 90, 50) / 100) * height;
  const rx = Math.max(10, (clampNum(params.subjectRadius, 12, 70, 34) / 100) * width * 0.68);
  const ry = Math.max(10, (clampNum(params.subjectRadius, 12, 70, 34) / 100) * height * 1.18);
  const feather = clampNum(params.feather, 0, 40, 14) / 100;
  const mask = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y += 1) {
    const dy = (y - cy) / ry;
    const dy2 = dy * dy;
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) / rx;
      const spatial = Math.sqrt(dx * dx + dy2);
      const idx = y * width + x;
      if (params.maskMode === "oval_portrait") {
        const a = Math.max(0, Math.min(1, (1.0 - spatial) / Math.max(0.05, feather + 0.08)));
        mask[idx] = Math.round(a * 255);
      } else {
        const p = idx * 4;
        const colorDist = Math.hypot(srcRgbaData[p] - bgR, srcRgbaData[p + 1] - bgG, srcRgbaData[p + 2] - bgB) / 441.67;
        const score = (1.1 - spatial) * 0.62 + (colorDist * (params.maskMode === "chroma_backdrop" ? 1.35 : 0.72));
        const a = Math.max(0, Math.min(1, (score - 0.36) / Math.max(0.05, feather + 0.14)));
        mask[idx] = spatial > 1.35 ? 0 : Math.round(a * 255);
      }
    }
  }
  return mask;
}

export function renderFreezeCutoutFrame(ctx, width, height, effect, resolved, time, options = {}) {
  const { params, opacity } = resolved;
  const freezeSrc = options.getFreezeSourceCanvas ? options.getFreezeSourceCanvas(effect, width, height) : null;
  // Build cutout RGBA from frozen frame (or current frame fallback)
  const freezeCanvas = document.createElement("canvas");
  freezeCanvas.width = width;
  freezeCanvas.height = height;
  const fCtx = freezeCanvas.getContext("2d");
  fCtx.drawImage(freezeSrc || ctx.canvas, 0, 0, width, height);
  const fData = fCtx.getImageData(0, 0, width, height);
  const mask = computeFreezeCutoutMask(fData.data, width, height, params);
  for (let i = 0; i < mask.length; i += 1) {
    fData.data[i * 4 + 3] = mask[i];
  }
  fCtx.putImageData(fData, 0, 0);

  // Render selected animated background (if live_video, keep playing canvas underneath!)
  ctx.save();
  ctx.globalAlpha = opacity;
  if (params.animatedBg === "dark_blur") {
    ctx.fillStyle = "rgba(8, 12, 22, 0.78)";
    ctx.fillRect(0, 0, width, height);
  } else if (params.animatedBg === "halftone_pulse") {
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, width, height);
    const pulse = 0.5 + 0.5 * Math.sin(time * 5.0);
    ctx.fillStyle = `rgba(250, 204, 21, ${(0.2 + 0.18 * pulse).toFixed(2)})`;
    const step = Math.max(16, Math.round(height * 0.05));
    for (let y = step / 2; y < height; y += step) {
      for (let x = step / 2; x < width; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, step * (0.18 + 0.14 * pulse), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (params.animatedBg === "neon_grid") {
    ctx.fillStyle = "#090b18";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
    ctx.lineWidth = Math.max(1, height * 0.003);
    const shift = ((time * 40) % 40) * (height / 720);
    for (let x = 0; x < width; x += Math.max(24, width / 12)) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = shift; y < height; y += Math.max(24, height / 8)) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  const localT = Math.max(0, time - effect.startTime);
  const pop = params.autoPop ? Math.min(1.0, localT / 0.25) : 1.0;
  const popScale = 1.0 + Math.sin(pop * Math.PI) * 0.08;
  const scale = clampNum(params.cutoutScale, 0.3, 2.5, 1.08) * popScale;
  const cx = (clampNum(params.cutoutX, 10, 90, 50) / 100) * width;
  const cy = (clampNum(params.cutoutY, 10, 90, 50) / 100) * height;
  const rot = (clampNum(params.cutoutRotation, -45, 45, 0) * Math.PI) / 180;
  const srcCx = (clampNum(params.subjectX, 10, 90, 50) / 100) * width;
  const srcCy = (clampNum(params.subjectY, 10, 90, 50) / 100) * height;

  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(scale, scale);

  const outlineW = clampNum(params.outlineWidth, 0, 24, 8) * (height / 720);
  if (outlineW > 0.5) {
    const outCvs = document.createElement("canvas");
    outCvs.width = width;
    outCvs.height = height;
    const oCtx = outCvs.getContext("2d");
    oCtx.drawImage(freezeCanvas, 0, 0);
    oCtx.globalCompositeOperation = "source-in";
    oCtx.fillStyle = params.outlineColor || "#facc15";
    oCtx.fillRect(0, 0, width, height);
    for (let a = 0; a < 8; a += 1) {
      const ang = (a / 8) * Math.PI * 2;
      ctx.drawImage(outCvs, -srcCx + Math.cos(ang) * outlineW, -srcCy + Math.sin(ang) * outlineW);
    }
  }
  if (params.glow > 2 || params.shadow > 2) {
    ctx.shadowColor = params.glow > params.shadow ? (params.outlineColor || "#facc15") : "rgba(0,0,0,0.65)";
    ctx.shadowBlur = Math.max(4, Math.max(params.glow, params.shadow) / 100 * height * 0.045);
  }
  ctx.drawImage(freezeCanvas, -srcCx, -srcCy);
  ctx.shadowColor = "transparent";

  const label = String(params.labelText || "").trim();
  if (label) {
    ctx.font = `800 ${Math.max(14, Math.round(height * 0.036))}px Inter, sans-serif`;
    const tw = ctx.measureText(label).width + 24;
    const th = Math.max(24, Math.round(height * 0.06));
    const ly = height * 0.24;
    ctx.fillStyle = params.outlineColor || "#facc15";
    ctx.fillRect(-tw * 0.5, ly - th * 0.5, tw, th);
    ctx.fillStyle = params.labelColor || "#111827";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, ly);
  }
  ctx.restore();
}

export function renderKineticTypographyFrame(ctx, width, height, effect, resolved, time) {
  const { params, opacity } = resolved;
  const rawWords = Array.isArray(params.wordTimings) && params.wordTimings.length
    ? params.wordTimings
    : String(params.text || "MAKE EVERY WORD COUNT")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word, idx) => {
          const s = (idx * clampNum(params.staggerMs, 40, 600, 220)) / 1000;
          return { word, start: s, end: s + clampNum(params.staggerMs, 40, 600, 220) / 1000 };
        });
  if (!rawWords.length) return;

  const localTime = Math.max(0, time - effect.startTime);
  const px = (clampNum(params.x, 10, 90, 50) / 100) * width;
  const py = (clampNum(params.y, 10, 90, 72) / 100) * height;
  const scale = clampNum(params.scale, 0.4, 2.5, 1.0);
  const rot = (clampNum(params.rotation, -45, 45, 0) * Math.PI) / 180;
  const fontSize = Math.max(16, Math.round(clampNum(params.fontSize, 20, 120, 54) * (height / 720) * scale));
  const cssFont = params.fontFamily === "DejaVuSerif" ? "Georgia, serif" : params.fontFamily === "DejaVuSansMono" ? "monospace" : "Inter, sans-serif";

  ctx.save();
  ctx.font = `900 ${fontSize}px ${cssFont}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  const spaceW = fontSize * 0.32;
  const widths = rawWords.map(item => ctx.measureText(String(item.word || "")).width);
  const totalW = widths.reduce((a, b) => a + b, 0) + Math.max(0, rawWords.length - 1) * spaceW;

  ctx.translate(px, py);
  ctx.rotate(rot);

  let curX = -totalW * 0.5;
  for (let i = 0; i < rawWords.length; i += 1) {
    const wObj = rawWords[i];
    const wText = String(wObj.word || "");
    const wW = widths[i];
    const centerWordX = curX + wW * 0.5;
    curX += wW + spaceW;

    const wStart = Number(wObj.start ?? 0);
    const wEnd = Number(wObj.end ?? (wStart + 0.3));
    const animDur = Math.max(0.12, Math.min(0.4, wEnd - wStart || 0.22));
    const rawProg = Math.max(0, Math.min(1, (localTime - wStart) / animDur));
    if (localTime < wStart && params.style !== "karaoke_highlight") continue;

    const isSpokenNow = localTime >= wStart && localTime <= wEnd;
    let wAlpha = opacity;
    let dy = 0;
    let wScale = 1.0;
    let wRot = 0;
    let shownText = wText;

    if (params.style === "bounce") {
      const b = rawProg < 1 ? Math.sin(rawProg * Math.PI * 1.15) * 1.18 : 1.0;
      wScale = Math.max(0.2, b);
      wAlpha *= Math.min(1, rawProg * 2.2);
    } else if (params.style === "slide_up") {
      const ease = 1 - Math.pow(1 - rawProg, 3);
      dy = (1 - ease) * fontSize * 0.75;
      wAlpha *= ease;
    } else if (params.style === "scale_pop") {
      wScale = 0.35 + 0.65 * (1 - Math.pow(1 - rawProg, 3));
      wAlpha *= Math.min(1, rawProg * 1.8);
    } else if (params.style === "rotate_in") {
      const ease = 1 - Math.pow(1 - rawProg, 3);
      wRot = (1 - ease) * -0.45;
      dy = (1 - ease) * fontSize * 0.4;
      wAlpha *= ease;
    } else if (params.style === "typewriter") {
      const chars = Math.max(1, Math.ceil(rawProg * wText.length));
      shownText = wText.slice(0, chars);
    } else if (params.style === "karaoke_highlight") {
      wScale = isSpokenNow ? 1.12 : 1.0;
    }

    ctx.save();
    ctx.translate(centerWordX, dy);
    ctx.rotate(wRot);
    ctx.scale(wScale, wScale);
    ctx.globalAlpha = wAlpha;

    if (isSpokenNow && params.showBg) {
      const padX = fontSize * 0.22;
      const padY = fontSize * 0.16;
      ctx.fillStyle = params.bgColor || "#0f172a";
      ctx.beginPath();
      ctx.roundRect
        ? ctx.roundRect(-wW * 0.5 - padX, -fontSize * 0.55 - padY * 0.5, wW + padX * 2, fontSize * 1.1 + padY, 6)
        : ctx.rect(-wW * 0.5 - padX, -fontSize * 0.55 - padY * 0.5, wW + padX * 2, fontSize * 1.1 + padY);
      ctx.fill();
    }
    ctx.fillStyle = isSpokenNow ? (params.highlightColor || "#facc15") : (params.color || "#ffffff");
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.lineWidth = Math.max(2, fontSize * 0.08);
    ctx.strokeText(shownText, 0, 0);
    ctx.fillText(shownText, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

export function buildSpeedRampingKeyframes(effect, createId) {
  const mkId = () => (createId ? createId("spd-kf") : `spd-kf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  const start = Number(effect.startTime || 0);
  const dur = Math.max(0.3, Number(effect.duration || 3));
  const p = effect.params || {};
  const preset = p.preset || "hero_slow_mo";
  let pts;
  if (preset === "montage_burst") {
    pts = [[0, 1.0], [0.22, 2.4], [0.58, 0.45], [1.0, 1.0]];
  } else if (preset === "bullet_time") {
    pts = [[0, 1.0], [0.25, 0.25], [0.75, 0.25], [1.0, 1.0]];
  } else if (preset === "ramp_in") {
    pts = [[0, 0.35], [0.6, 1.0], [1.0, 1.0]];
  } else if (preset === "ramp_out") {
    pts = [[0, 1.0], [0.6, 1.0], [1.0, 2.2]];
  } else {
    const r0 = clampNum(p.startRate, 0.25, 4.0, 1.8);
    const r1 = clampNum(p.midRate, 0.2, 4.0, 0.4);
    const r2 = clampNum(p.endRate, 0.25, 4.0, 1.6);
    pts = [[0, r0], [0.5, r1], [1.0, r2]];
  }
  return pts.map(([frac, value]) => ({
    id: mkId(),
    targetId: "main",
    property: "speed",
    time: Number((start + frac * dur).toFixed(3)),
    value: Number(value.toFixed(2)),
    easing: "bezier",
    curve: [0.22, 1, 0.36, 1],
  }));
}

function evalZoomCurve(frac, params) {
  let u = Math.max(0, Math.min(1, frac));
  if (params.easing === "punch") u = 1 - Math.pow(1 - u, 4);
  else if (params.easing === "ease_out") u = 1 - Math.pow(1 - u, 2);
  else if (params.easing === "ease_in_out") u = u * u * (3 - 2 * u);
  const target = clampNum(params.zoomScale, 1.0, 2.8, 1.45);
  if (params.mode === "zoom_out") return target - (target - 1.0) * u;
  if (params.mode === "punch_in") {
    // Smooth peak at middle then settle back nicely or hold
    return 1.0 + (target - 1.0) * Math.sin(u * Math.PI * 0.5);
  }
  return 1.0 + (target - 1.0) * u;
}

export function renderZoomMotionBlurFrame(ctx, width, height, effect, resolved, time, trackedPose = null) {
  const { params, opacity, targetKeys } = resolved;
  const dur = Math.max(0.1, Number(effect.duration || 2.0));
  const localFrac = clampNum((time - effect.startTime) / dur, 0, 1, 0);
  const hasZoomKeys = targetKeys.some(k => k.property === "zoomScale");

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = width;
  srcCanvas.height = height;
  srcCanvas.getContext("2d").drawImage(ctx.canvas, 0, 0, width, height);

  const focusX = trackedPose?.x ?? params.focusX;
  const focusY = trackedPose?.y ?? params.focusY;
  const blurStr = clampNum(params.motionBlurStrength, 0, 100, 55) / 100;
  const samples = blurStr > 0.04 ? 5 : 1;

  ctx.save();
  ctx.fillStyle = "#000";
  ctx.globalAlpha = 1;

  const accum = document.createElement("canvas");
  accum.width = width;
  accum.height = height;
  const aCtx = accum.getContext("2d");

  for (let s = 0; s < samples; s += 1) {
    const dtFrac = samples > 1 ? (s / (samples - 1) - 0.5) * 0.06 * blurStr : 0;
    const sFrac = Math.max(0, Math.min(1, localFrac - dtFrac));
    const zoom = !hasZoomKeys && params.autoAnimate ? evalZoomCurve(sFrac, params) : clampNum(params.zoomScale, 1.0, 2.8, 1.45);
    const rotRad = (clampNum(params.rotation, -30, 30, 0) * Math.PI) / 180 * sFrac;
    const absCos = Math.abs(Math.cos(rotRad));
    const absSin = Math.abs(Math.sin(rotRad));
    const minCoverZoom = Math.max((width * absCos + height * absSin) / Math.max(1, width), (width * absSin + height * absCos) / Math.max(1, height));
    const safeZoom = Math.max(zoom, minCoverZoom + 0.01);

    const coverW = (width * absCos + height * absSin) / safeZoom;
    const coverH = (width * absSin + height * absCos) / safeZoom;
    const reqFx = (clampNum(focusX, 10, 90, 50) / 100) * width - (clampNum(params.panX, -30, 30, 0) / 100) * width * sFrac;
    const reqFy = (clampNum(focusY, 10, 90, 50) / 100) * height - (clampNum(params.panY, -30, 30, 0) / 100) * height * sFrac;
    const blendAlpha = Math.min(1, (safeZoom - 1.0) / 0.35);
    const idealSrcX = width * 0.5 * (1 - blendAlpha) + reqFx * blendAlpha;
    const idealSrcY = height * 0.5 * (1 - blendAlpha) + reqFy * blendAlpha;
    const srcCx = Math.max(coverW * 0.5, Math.min(width - coverW * 0.5, idealSrcX));
    const srcCy = Math.max(coverH * 0.5, Math.min(height - coverH * 0.5, idealSrcY));

    aCtx.save();
    aCtx.globalAlpha = s === 0 ? 1.0 : 1.0 / (s + 1);
    aCtx.translate(width * 0.5, height * 0.5);
    aCtx.rotate(rotRad);
    aCtx.scale(safeZoom, safeZoom);
    aCtx.drawImage(srcCanvas, -srcCx, -srcCy, width, height);
    aCtx.restore();
  }
  ctx.globalAlpha = opacity;
  ctx.drawImage(accum, 0, 0, width, height);
  ctx.restore();
}

export function renderFlashCameraShakeFrame(ctx, width, height, effect, resolved, time, options = {}) {
  const { params, opacity } = resolved;
  const localT = Math.max(0, time - effect.startTime);
  const dur = Math.max(0.1, Number(effect.duration || 1.5));
  const beatMarkers = options.beatMarkers || [];
  const nearBeatDist = beatMarkers.reduce((best, bm) => {
    const bt = Number(bm?.time ?? bm);
    return Number.isFinite(bt) ? Math.min(best, Math.abs(bt - time)) : best;
  }, Infinity);
  const beatBoost = Boolean(params.beatSync) && nearBeatDist <= 0.16 ? 1.0 + (1.0 - nearBeatDist / 0.16) * 0.9 : 1.0;

  const decay = params.mode === "impact_shake" ? Math.exp(-localT * 3.2) : params.mode === "strobe_pulse" ? Math.max(0, Math.sin(localT * params.shakeFrequency * Math.PI)) : 1.0;
  const shakeAmt = (clampNum(params.shakeStrength, 0, 100, 58) / 100) * decay * beatBoost * opacity;

  if (shakeAmt > 0.01 && !["exposure_flash", "strobe_pulse"].includes(params.mode)) {
    const freq = clampNum(params.shakeFrequency, 1, 30, 14);
    const maxPx = Math.min(width, height) * 0.045 * shakeAmt;
    let dx = 0;
    let dy = 0;
    if (params.mode === "directional_whip") {
      const ang = (clampNum(params.directionalAngle, -180, 180, 20) * Math.PI) / 180;
      const osc = Math.sin(localT * freq * Math.PI * 2);
      dx = Math.cos(ang) * maxPx * osc;
      dy = Math.sin(ang) * maxPx * osc;
    } else {
      dx = (Math.sin(localT * freq * 6.283 + 0.5) * 0.7 + Math.cos(localT * freq * 11.1) * 0.3) * maxPx;
      dy = (Math.cos(localT * freq * 5.71 + 1.2) * 0.7 + Math.sin(localT * freq * 9.8) * 0.3) * maxPx;
    }
    const rotRad = Math.sin(localT * freq * 4.3) * 0.025 * shakeAmt;
    // Guaranteed zero border exposure via dynamic safe crop zoom + center clamp
    const absCos = Math.abs(Math.cos(rotRad));
    const absSin = Math.abs(Math.sin(rotRad));
    const minCoverZoom = Math.max((width * absCos + height * absSin) / Math.max(1, width), (width * absSin + height * absCos) / Math.max(1, height));
    const safeZoom = Math.max(minCoverZoom + 0.01, 1.0 + (Math.abs(dx) * 2.1) / Math.max(1, width) + (Math.abs(dy) * 2.1) / Math.max(1, height));
    const coverW = (width * absCos + height * absSin) / safeZoom;
    const coverH = (width * absSin + height * absCos) / safeZoom;
    const srcCx = Math.max(coverW * 0.5, Math.min(width - coverW * 0.5, width * 0.5 - dx));
    const srcCy = Math.max(coverH * 0.5, Math.min(height - coverH * 0.5, height * 0.5 - dy));
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = width;
    srcCanvas.height = height;
    srcCanvas.getContext("2d").drawImage(ctx.canvas, 0, 0, width, height);
    ctx.save();
    ctx.translate(width * 0.5, height * 0.5);
    ctx.rotate(rotRad);
    ctx.scale(safeZoom, safeZoom);
    ctx.drawImage(srcCanvas, -srcCx, -srcCy, width, height);
    ctx.restore();
  }

  let flashAlpha = 0;
  const flashBase = clampNum(params.flashIntensity, 0, 100, 68) / 100;
  if (flashBase > 0.01) {
    if (params.mode === "strobe_pulse") {
      flashAlpha = flashBase * 0.65 * Math.pow(Math.max(0, Math.sin(localT * clampNum(params.shakeFrequency, 1, 30, 14) * Math.PI)), 2);
    } else if (params.mode === "exposure_flash" || params.mode === "impact_shake") {
      const fPulse = Math.max(0, 1 - localT / Math.min(0.45, dur * 0.5));
      flashAlpha = flashBase * 0.78 * fPulse * beatBoost;
    } else if (Boolean(params.beatSync) && nearBeatDist <= 0.16) {
      flashAlpha = flashBase * 0.55 * (1 - nearBeatDist / 0.16);
    }
  }
  flashAlpha = Math.max(0, Math.min(0.9, flashAlpha * opacity));
  if (flashAlpha > 0.005) {
    ctx.save();
    ctx.globalAlpha = flashAlpha;
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = params.flashColor || "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

export function renderParticleOverlaysFrame(ctx, width, height, effect, resolved, time) {
  const { params, opacity } = resolved;
  const count = Math.max(10, Math.min(200, Math.round(params.particleCount || 75)));
  const speed = clampNum(params.speed, 0.2, 3.0, 1.0);
  const localT = Math.max(0, time - effect.startTime) * speed;
  const pSize = clampNum(params.size, 2, 24, 8) * Math.max(0.5, height / 720);
  const c1 = hexToRgb(params.color, [255, 209, 102]);
  const c2 = hexToRgb(params.secondaryColor, [255, 94, 126]);
  const confettiColors = [[255, 94, 126], [56, 189, 248], [250, 204, 21], [74, 222, 128], [192, 132, 252]];

  const pLayer = document.createElement("canvas");
  pLayer.width = width;
  pLayer.height = height;
  const pCtx = pLayer.getContext("2d");

  const rand = mulberry32(hashSeed(`pt-${params.seed}`));
  for (let i = 0; i < count; i += 1) {
    const x0 = rand();
    const y0 = rand();
    const pScale = 0.55 + rand() * 0.9;
    const phase = rand() * 6.283;
    const vJitter = 0.65 + rand() * 0.7;

    let vx = (rand() - 0.5) * 0.14;
    let vy = -0.35 * vJitter;
    if (params.direction === "down") vy = 0.35 * vJitter;
    else if (params.direction === "left") { vx = -0.38 * vJitter; vy = (rand() - 0.5) * 0.12; }
    else if (params.direction === "right") { vx = 0.38 * vJitter; vy = (rand() - 0.5) * 0.12; }
    else if (params.direction === "radial_float") { vx = Math.cos(phase) * 0.18; vy = Math.sin(phase) * 0.18; }

    const wx = (((x0 + vx * localT + Math.sin(localT * 2.2 + phase) * 0.025) % 1.12) + 1.12) % 1.12 - 0.06;
    const wy = (((y0 + vy * localT) % 1.12) + 1.12) % 1.12 - 0.06;
    const px = wx * width;
    const py = wy * height;
    const r = Math.max(1.5, pSize * pScale * (params.particleType === "smoke" ? 3.2 : 0.65));
    const col = params.particleType === "confetti"
      ? confettiColors[i % confettiColors.length]
      : i % 3 === 0 ? c2 : c1;
    const pAlpha = opacity * (params.particleType === "glitter" ? (0.4 + 0.6 * Math.abs(Math.sin(localT * 6 + phase))) : params.particleType === "smoke" ? 0.24 : 0.85);

    pCtx.save();
    pCtx.globalAlpha = pAlpha;
    if (params.particleType === "confetti") {
      pCtx.translate(px, py);
      pCtx.rotate(localT * 3.5 + phase);
      pCtx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      pCtx.fillRect(-r, -r * 0.5, r * 2, r);
    } else if (params.particleType === "sparks" || params.particleType === "glitter") {
      const grad = pCtx.createRadialGradient(px, py, 0, px, py, r * 1.8);
      grad.addColorStop(0, `rgba(255,255,255,0.95)`);
      grad.addColorStop(0.45, `rgba(${col[0]},${col[1]},${col[2]},0.8)`);
      grad.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      pCtx.fillStyle = grad;
      pCtx.beginPath();
      pCtx.arc(px, py, r * 1.8, 0, Math.PI * 2);
      pCtx.fill();
    } else if (params.particleType === "smoke" || params.particleType === "dust") {
      const grad = pCtx.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0.65)`);
      grad.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      pCtx.fillStyle = grad;
      pCtx.beginPath();
      pCtx.arc(px, py, r, 0, Math.PI * 2);
      pCtx.fill();
    } else {
      pCtx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      pCtx.beginPath();
      pCtx.arc(px, py, r, 0, Math.PI * 2);
      pCtx.fill();
    }
    pCtx.restore();
  }

  // If masking particles behind tracked subject, cut out subject alpha silhouette!
  if (params.maskMode === "behind_subject") {
    const frameData = ctx.getImageData(0, 0, width, height);
    const subjMask = computeFreezeCutoutMask(frameData.data, width, height, {
      maskMode: "auto_subject",
      subjectX: params.subjectX,
      subjectY: params.subjectY,
      subjectRadius: params.subjectRadius,
      feather: 14,
    });
    const pData = pCtx.getImageData(0, 0, width, height);
    for (let i = 0; i < subjMask.length; i += 1) {
      const keepBg = 1.0 - subjMask[i] / 255.0;
      pData.data[i * 4 + 3] = Math.round(pData.data[i * 4 + 3] * keepBg);
    }
    pCtx.putImageData(pData, 0, 0);
  }

  ctx.save();
  ctx.globalCompositeOperation = effect.blendMode === "normal" ? "source-over" : effect.blendMode || "screen";
  ctx.drawImage(pLayer, 0, 0, width, height);
  ctx.restore();
}

export function renderCreativeEffectsToCanvas(ctx, width, height, creativeEffects = [], motionKeyframes = [], time = 0, options = {}) {
  const fps = Math.max(1, Number(options.fps) || 30);
  const active = normalizeCreativeEffects(creativeEffects)
    .filter(effect => effect.enabled !== false && time >= effect.startTime && time <= effect.startTime + effect.duration);
  if (!active.length) return false;

  for (const effect of active) {
    const resolved = evaluateCreativeEffectParams(effect, motionKeyframes, time);
    if (resolved.opacity <= 0.001) continue;
    const trackedPose = options.resolveTrackedPose ? options.resolveTrackedPose(effect, time) : null;
    if (effect.effectId === "scrapbook") {
      renderScrapbookOverlayEffect(ctx, width, height, effect, resolved);
    } else if (effect.effectId === "ripped_paper") {
      renderRippedPaperFrame(ctx, width, height, effect, resolved, time, options);
    } else if (effect.effectId === "doodles") {
      renderDoodleFrame(ctx, width, height, effect, resolved, time, trackedPose);
    } else if (effect.effectId === "film_grain") {
      renderFilmGrainFrame(ctx, width, height, effect, resolved, time, fps);
    } else if (effect.effectId === "light_leaks") {
      renderLightLeakFrame(ctx, width, height, effect, resolved, time);
    } else if (effect.effectId === "vhs_glitch") {
      renderVhsGlitchFrame(ctx, width, height, effect, resolved, time, fps, options);
    } else if (effect.effectId === "comic_pop_art") {
      renderComicPopArtFrame(ctx, width, height, effect, resolved, time, trackedPose);
    } else if (effect.effectId === "freeze_cutout") {
      renderFreezeCutoutFrame(ctx, width, height, effect, resolved, time, options);
    } else if (effect.effectId === "kinetic_typography") {
      renderKineticTypographyFrame(ctx, width, height, effect, resolved, time);
    } else if (effect.effectId === "zoom_motion_blur") {
      renderZoomMotionBlurFrame(ctx, width, height, effect, resolved, time, trackedPose);
    } else if (effect.effectId === "flash_camera_shake") {
      renderFlashCameraShakeFrame(ctx, width, height, effect, resolved, time, options);
    } else if (effect.effectId === "particle_overlays") {
      renderParticleOverlaysFrame(ctx, width, height, effect, resolved, time);
    }
  }
  return true;
}

function makeInlineSvgPngOverlay(id, name, svgMarkup, box) {
  const encoded = typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(svgMarkup)))
    : Buffer.from(svgMarkup, "utf8").toString("base64");
  return {
    id,
    name,
    type: "image",
    src: `data:image/svg+xml;base64,${encoded}`,
    isLocal: true,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    rotation: box.rotation ?? 0,
    scale: box.scale ?? 1,
    opacity: box.opacity ?? 1,
    startTime: box.startTime ?? 0,
    duration: box.duration ?? 4,
    blendMode: box.blendMode || "normal",
    layerShadow: box.layerShadow,
    scrapbookFrame: box.scrapbookFrame || null,
  };
}

export function buildScrapbookElementLayer({ kind = "tape", startTime = 0, duration = 4, color = "#e6cfa2", seed = 11, label = "NOTE", createId } = {}) {
  const id = createId ? createId(`sb-${kind}`) : `sb-${kind}-${Date.now().toString(36)}`;
  if (kind === "tape") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 70"><polygon points="8,8 212,4 206,20 215,35 204,50 212,64 6,62 14,46 5,32 13,18" fill="${color}" fill-opacity="0.78" stroke="rgba(120,90,45,0.22)" stroke-width="2"/></svg>`;
    return makeInlineSvgPngOverlay(id, "Masking Tape", svg, { x: 50, y: 18, width: 28, height: 10, rotation: -6, startTime, duration, opacity: 0.9 });
  }
  if (kind === "paper_sheet") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><polygon points="10,12 120,8 250,15 388,10 392,180 385,340 390,488 240,492 90,485 12,490 8,320 14,150" fill="${color}" stroke="#d6ccb8" stroke-width="4"/></svg>`;
    return makeInlineSvgPngOverlay(id, "Layered Paper Sheet", svg, { x: 50, y: 50, width: 52, height: 58, rotation: -3, startTime, duration, opacity: 0.94, layerShadow: { enabled: true, color: "#000000", opacity: 0.35, blur: 14, x: 3, y: 8 } });
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" fill="${color}" stroke="#ffffff" stroke-width="10"/><text x="100" y="112" text-anchor="middle" font-family="Inter, sans-serif" font-weight="900" font-size="34" fill="#18181b">${String(label || "STAR").slice(0, 8)}</text></svg>`;
  return makeInlineSvgPngOverlay(id, `Sticker · ${label}`, svg, { x: 74, y: 26, width: 18, height: 18, rotation: 12, startTime, duration, layerShadow: { enabled: true, color: "#000000", opacity: 0.35, blur: 10, x: 2, y: 5 } });
}

export function buildScrapbookCollagePreset({ preset = "polaroid_duo", startTime = 0, duration = 4, createId } = {}) {
  const mkId = prefix => (createId ? createId(prefix) : `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 999)}`);
  const paper = buildScrapbookElementLayer({ kind: "paper_sheet", startTime, duration, color: "#e5d5bc", label: "", createId: mkId });
  const tapeA = { ...buildScrapbookElementLayer({ kind: "tape", startTime, duration, color: "#e8d29c", createId: mkId }), x: 36, y: 24, rotation: -14 };
  const tapeB = { ...buildScrapbookElementLayer({ kind: "tape", startTime, duration, color: "#e8d29c", createId: mkId }), x: 68, y: 60, rotation: 11 };
  const sticker = { ...buildScrapbookElementLayer({ kind: "sticker", startTime, duration, color: "#ffd166", label: preset === "pinboard_trio" ? "BTS" : "NEW", createId: mkId }), x: 76, y: 22 };
  const layers = [paper, tapeA, tapeB, sticker];
  const keyframes = layers.flatMap((layer, idx) => [
    { id: mkId("sb-kf"), targetId: layer.id, property: "scale", time: Number(startTime.toFixed(3)), value: 0.65, easing: "bezier", curve: [0.22, 1, 0.36, 1] },
    { id: mkId("sb-kf"), targetId: layer.id, property: "scale", time: Number((startTime + 0.35 + idx * 0.06).toFixed(3)), value: 1.0, easing: "bezier", curve: [0.22, 1, 0.36, 1] },
  ]);
  const fx = createCreativeEffectInstance("scrapbook", {
    id: mkId("fx-sb"),
    startTime,
    duration,
    params: {
      frameStyle: preset === "torn_zine" ? "torn_edge" : "polaroid",
      scalePercent: preset === "pinboard_trio" ? 78 : 84,
      tiltAngle: preset === "torn_zine" ? 3 : -4,
      tapeTop: true,
    },
  });
  return { fx, layers, keyframes };
}

// Client-side deterministic patch block-matching point tracker for Doodles/Labels on real video elements.
export async function trackSubjectOnVideoFrames({
  videoElement,
  startTime = 0,
  duration = 2.0,
  initialX = 50,
  initialY = 50,
  targetId,
  fps = 8,
  createId,
} = {}) {
  if (!videoElement || !videoElement.videoWidth || !videoElement.videoHeight) {
    throw new Error("Load a real video before tracking a subject.");
  }
  const prevTime = videoElement.currentTime;
  const wasPaused = videoElement.paused;
  videoElement.pause?.();
  const w = 160;
  const h = Math.max(90, Math.round((160 * videoElement.videoHeight) / Math.max(1, videoElement.videoWidth)));
  const offscreen = document.createElement("canvas");
  offscreen.width = w;
  offscreen.height = h;
  const offCtx = offscreen.getContext("2d", { willReadFrequently: true });

  const sampleLumaAt = async seekTime => {
    await new Promise(resolve => {
      const done = () => {
        videoElement.removeEventListener("seeked", done);
        resolve();
      };
      videoElement.addEventListener("seeked", done);
      videoElement.currentTime = Math.max(0, Math.min(videoElement.duration || seekTime, seekTime));
      window.setTimeout(done, 250);
    });
    offCtx.drawImage(videoElement, 0, 0, w, h);
    const data = offCtx.getImageData(0, 0, w, h).data;
    const luma = new Float32Array(w * h);
    for (let i = 0, j = 0; i < luma.length; i += 1, j += 4) {
      luma[i] = data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114;
    }
    return luma;
  };

  const step = 1 / Math.max(2, Math.min(15, fps));
  const totalSteps = Math.max(2, Math.min(36, Math.round(duration / step) + 1));
  const halfPatch = 8;
  const searchRadius = 12;

  let curPx = Math.round((clampNum(initialX, 5, 95, 50) / 100) * w);
  let curPy = Math.round((clampNum(initialY, 5, 95, 50) / 100) * h);
  let prevLuma = await sampleLumaAt(startTime);

  const trackKeyframes = [];
  const mkId = () => (createId ? createId("trk") : `trk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  trackKeyframes.push({ id: mkId(), targetId: String(targetId), property: "x", time: Number(startTime.toFixed(3)), value: Number(((curPx / w) * 100).toFixed(2)), easing: "linear" });
  trackKeyframes.push({ id: mkId(), targetId: String(targetId), property: "y", time: Number(startTime.toFixed(3)), value: Number(((curPy / h) * 100).toFixed(2)), easing: "linear" });

  for (let s = 1; s < totalSteps; s += 1) {
    const t = startTime + (s / (totalSteps - 1)) * duration;
    const nextLuma = await sampleLumaAt(t);
    let bestDx = 0;
    let bestDy = 0;
    let bestSad = Infinity;
    for (let dy = -searchRadius; dy <= searchRadius; dy += 2) {
      for (let dx = -searchRadius; dx <= searchRadius; dx += 2) {
        let sad = 0;
        let samples = 0;
        for (let py = -halfPatch; py <= halfPatch; py += 2) {
          const sy = curPy + py;
          const ty = sy + dy;
          if (sy < 0 || sy >= h || ty < 0 || ty >= h) continue;
          for (let px = -halfPatch; px <= halfPatch; px += 2) {
            const sx = curPx + px;
            const tx = sx + dx;
            if (sx < 0 || sx >= w || tx < 0 || tx >= w) continue;
            sad += Math.abs(prevLuma[sy * w + sx] - nextLuma[ty * w + tx]);
            samples += 1;
          }
        }
        if (samples > 0 && sad / samples < bestSad) {
          bestSad = sad / samples;
          bestDx = dx;
          bestDy = dy;
        }
      }
    }
    curPx = Math.max(halfPatch, Math.min(w - halfPatch, curPx + bestDx));
    curPy = Math.max(halfPatch, Math.min(h - halfPatch, curPy + bestDy));
    prevLuma = nextLuma;
    trackKeyframes.push({ id: mkId(), targetId: String(targetId), property: "x", time: Number(t.toFixed(3)), value: Number(((curPx / w) * 100).toFixed(2)), easing: "linear" });
    trackKeyframes.push({ id: mkId(), targetId: String(targetId), property: "y", time: Number(t.toFixed(3)), value: Number(((curPy / h) * 100).toFixed(2)), easing: "linear" });
  }

  videoElement.currentTime = prevTime;
  if (!wasPaused) videoElement.play?.().catch(() => {});
  return trackKeyframes;
}
