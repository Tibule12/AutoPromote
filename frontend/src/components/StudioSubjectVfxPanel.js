import { applySafeMediaSource, getSafeMediaSource } from "../utils/security";
import { useEffect, useRef, useState } from "react";
import {
  validateSubjectVfxScene,
  subjectVfxRevision,
  TEXT_BEHIND_PRESETS,
  TEXT_BEHIND_FONTS,
  TEXT_BEHIND_ANIMATIONS,
} from "./studioSubjectVfxContract";
import StudioSubjectMaskControls from "./StudioSubjectMaskControls";
import { correctSubjectItem } from "./studioSubjectCorrections";
import ProductHelpButton from "./ProductHelpButton";
import { uploadSourceFileViaBackend } from "../utils/sourceUpload";
import "./StudioSubjectVfxPanel.css";

const TEXT_BEHIND_PRESET_LABELS = {
  classic: "Classic (DejaVu)",
  hero_poster: "Hero Poster (Inter Black + Spring)",
  neon_backlit: "Neon Backlit (Back-Glow)",
  caption_punch: "Caption Punch (Word Pop)",
  editorial_depth: "Editorial Depth (Rise + Track)",
};
const TEXT_BEHIND_PRESET_DEFAULTS = {
  classic: { font: "dejavu_bold", animation: "fade", shadow: 0, glow: 0, tracking: 0 },
  hero_poster: { font: "inter_black", animation: "spring_pop", shadow: 0.65, glow: 0.18, tracking: 1.5 },
  neon_backlit: { font: "inter_black", animation: "fade", shadow: 0.55, glow: 0.78, tracking: 2 },
  caption_punch: { font: "inter_extrabold", animation: "word_pop", shadow: 0.72, glow: 0.24, tracking: 0.5 },
  editorial_depth: { font: "inter_semibold", animation: "rise_reveal", shadow: 0.45, glow: 0, tracking: 3.5 },
};
const TEXT_BEHIND_FONT_LABELS = {
  inter_black: "Inter Black (Heavy Display)",
  inter_extrabold: "Inter ExtraBold",
  inter_semibold: "Inter SemiBold",
  dejavu_bold: "DejaVu Sans Bold",
};
const TEXT_BEHIND_ANIMATION_LABELS = {
  fade: "Soft Fade",
  spring_pop: "Spring Overshoot",
  rise_reveal: "Rise Reveal + Motion Blur",
  word_pop: "Speech Word Pop",
};

const normalizeHexColor = value =>
  typeof value === "string" && /^#[a-fA-F0-9]{6}$/.test(value.trim()) ? value.trim() : "#ffb33d";

function stripControlChars(value) {
  return Array.from(String(value || ""), ch => (ch.charCodeAt(0) < 32 ? " " : ch)).join("");
}

export function buildBehindSubjectCaptionLayers({
  captions = [],
  sourceRange,
  existingEffects = [],
  accentColor = "#ffb33d",
  preset = "caption_punch",
  hideForegroundCaptions = true,
  createId = prefix => `${prefix}-${Date.now()}`,
}) {
  const rangeStart = Number(sourceRange?.start || 0);
  const rangeEnd = Number(sourceRange?.end || 0);
  const duration = Math.max(0, rangeEnd - rangeStart);
  if (duration < 0.25) return { layers: [], message: "Choose a source range of at least 0.25 seconds." };

  const preservedEffects = (existingEffects || []).filter(
    effect => !(effect?.type === "text_behind" && String(effect.id || "").startsWith("behind-caption-"))
  );
  const maxCaptionLayers = Math.max(0, 12 - preservedEffects.length);
  if (maxCaptionLayers < 1) {
    return {
      layers: [],
      message: "Remove a layer first to leave room for behind-subject speech captions (12 max).",
    };
  }

  const normalizedSegments = (Array.isArray(captions) ? captions : [])
    .map(segment => {
      const start = Number(segment?.start ?? segment?.start_time ?? 0);
      const end = Number(segment?.end ?? segment?.end_time ?? 0);
      const text = stripControlChars(segment?.text).replace(/\s+/g, " ").trim();
      const rawWords = Array.isArray(segment?.wordTimestamps || segment?.words)
        ? segment.wordTimestamps || segment.words
        : null;
      return { start, end, text, rawWords, accent: segment?.captionAccent };
    })
    .filter(seg => seg.text && seg.end > seg.start && seg.end > rangeStart + 0.02 && seg.start < rangeEnd - 0.02)
    .sort((a, b) => a.start - b.start);

  if (!normalizedSegments.length) {
    return {
      layers: [],
      message: "Generate or add transcript lines in Captions for this clip range first.",
    };
  }

  // Split long segments into punchy 2-4 word phrases if room inside layer budget allows
  const phrases = [];
  for (const seg of normalizedSegments) {
    const clStart = Math.max(0, seg.start - rangeStart);
    const clEnd = Math.min(duration, seg.end - rangeStart);
    if (clEnd - clStart < 0.06) continue;
    const wordsList = seg.rawWords?.length
      ? seg.rawWords
          .map(w => ({
            word: stripControlChars(w.word || w.text).trim().slice(0, 40),
            start: Math.max(clStart, Number(w.start ?? w.start_time ?? seg.start) - rangeStart),
            end: Math.min(clEnd, Number(w.end ?? w.end_time ?? seg.end) - rangeStart),
          }))
          .filter(w => w.word && w.end > w.start + 0.01)
      : (() => {
          const tokens = seg.text.split(" ").filter(Boolean).slice(0, 32);
          const step = (clEnd - clStart) / Math.max(1, tokens.length);
          return tokens.map((word, idx) => ({
            word: word.slice(0, 40),
            start: Number((clStart + idx * step).toFixed(3)),
            end: Number((idx === tokens.length - 1 ? clEnd : clStart + (idx + 1) * step).toFixed(3)),
          }));
        })();

    const wordsPerPhrase = wordsList.length > 5 && phrases.length + Math.ceil(wordsList.length / 3) <= maxCaptionLayers ? 3 : wordsList.length;
    const frameCount = Math.floor(duration * 24 + 0.5);
    for (let i = 0; i < wordsList.length && phrases.length < maxCaptionLayers; i += wordsPerPhrase) {
      const slice = wordsList.slice(i, i + wordsPerPhrase).slice(0, 32);
      if (!slice.length) continue;
      let pStart = Number(Math.max(0, slice[0].start).toFixed(3));
      const pEnd = Number(Math.min(duration, slice[slice.length - 1].end).toFixed(3));
      if (pEnd <= pStart + 0.05) continue;
      if (Math.ceil(pStart * 24) >= Math.min(frameCount, Math.ceil(pEnd * 24))) {
        pStart = Number(Math.max(0, pEnd - 0.06).toFixed(3));
      }
      if (Math.ceil(pStart * 24) >= Math.min(frameCount, Math.ceil(pEnd * 24))) continue;
      const phraseText = slice.map(item => item.word).join(" ").slice(0, 120);
      phrases.push({
        start: pStart,
        end: pEnd,
        text: phraseText,
        accent: normalizeHexColor(seg.accent || accentColor),
        words: slice.map(item => ({
          word: item.word,
          start: Number(Math.max(pStart, Math.min(pEnd, item.start)).toFixed(3)),
          end: Number(Math.max(pStart + 0.01, Math.min(pEnd, item.end)).toFixed(3)),
        })),
      });
    }
    if (phrases.length >= maxCaptionLayers) break;
  }

  const defaults = TEXT_BEHIND_PRESET_DEFAULTS[preset] || TEXT_BEHIND_PRESET_DEFAULTS.caption_punch;
  const captionLayers = phrases.map((phrase, idx) => {
    const layer = {
      id: `behind-caption-${idx + 1}-${String(createId("seg")).replace(/[^A-Za-z0-9_-]/g, "").slice(-10) || idx}`,
      type: "text_behind",
      start: phrase.start,
      end: phrase.end,
      text: phrase.text,
      x: 50,
      y: 44,
      font_size: 86,
      color: "#f8fafc",
      preset,
      font: defaults.font,
      animation: phrase.words.length ? "word_pop" : defaults.animation,
      accent_color: phrase.accent,
      shadow: defaults.shadow,
      glow: defaults.glow,
      tracking: defaults.tracking,
      words: phrase.words,
      hide_fg_captions: Boolean(hideForegroundCaptions),
    };
    return layer;
  });

  if (!captionLayers.length) {
    return {
      layers: [],
      message: "No transcript phrases overlap this clip range yet.",
    };
  }
  return {
    layers: [...preservedEffects, ...captionLayers],
    syncedCount: captionLayers.length,
    message: `Synced ${captionLayers.length} behind-subject caption phrase${captionLayers.length === 1 ? "" : "s"} behind the mask.`,
  };
}

const presets = {
  foreground_holdout: duration => ({id:"foreground-holdout",type:"foreground_holdout",start:0,end:duration,
    corners:[[.4,.4],[.6,.4],[.6,.6],[.4,.6]],feather:.25}),
  foreground_grade: duration => ({id:"foreground-grade",type:"foreground_grade",start:0,end:duration,exposure:0,saturation:1,contrast:1}),
  foreground_refine: duration => ({id:"matte-refine",type:"foreground_refine",start:0,end:duration,
    edge_radius:0,decontaminate:0,
    choke:1,feather:.4,recover_box:[0,0,0,0],recover_hue:210,hue_tolerance:30,saturation_min:.25,
    detail_box:[0,0,0,0],dark_max:.24,clear_box:[0,0,0,0],reject_hue:15,reject_tolerance:25,reject_saturation:.7,reject_value:.6}),
  text_behind: duration => ({
    id: "title",
    type: "text_behind",
    start: 0,
    end: duration,
    text: "YOUR STORY",
    x: 50,
    y: 43,
    font_size: 100,
    color: "#f5f1ed",
  }),
  background_grade: duration => ({
    id: "grade",
    type: "background_grade",
    start: 0,
    end: duration,
    exposure: -0.4,
    saturation: 0.7,
    contrast: 1.05,
  }),
  background_replace: duration => ({
    id: "background", type: "background_replace", start: 0, end: duration,
    asset_id: "", asset_sha256: "", blur: 2, exposure: 0, saturation: 1, reveal_seconds: 0,
  }),
  kinetic_type: duration => ({
    id: "type",
    type: "kinetic_type",
    start: 0,
    end: duration,
    text: "YOUR VOICE",
    x: 7,
    y: 75,
    font_size: 72,
    color: "#c1a8ff",
    tracking: 2,
    travel: 35,
    align: "left",
  }),
  tracked_callout: duration => ({
    id: "callout",
    type: "tracked_callout",
    start: 0,
    end: duration,
    text: "THE STORY",
    offset_x: -150,
    offset_y: -130,
    font_size: 24,
    color: "#c1a8ff",
    avoid_subject: true,
  }),
  glow: duration => ({
    id: "rim",
    type: "glow",
    start: 0,
    end: duration,
    color: "#b397f5",
    strength: 0.05,
    radius: 14,
  }),
  depth: duration => ({ id: "depth", type: "depth", start: 0, end: duration, amount: 0.015 }),
  particles: duration => ({
    id: "particles",
    type: "particles",
    start: 0,
    end: duration,
    seed: 73,
    count: 18,
    color: "#b397f5",
    opacity: 0.18,
    speed: 12,
  }),
};
const names = {
  foreground_holdout: "Foreground holdout",
  foreground_grade: "Foreground light and colour",
  foreground_refine: "Foreground matte refinement",
  text_behind: "Text behind subject",
  background_grade: "Background grade",
  background_replace: "Replace background",
  kinetic_type: "Kinetic typography",
  tracked_callout: "Tracked callout",
  glow: "Subject glow",
  depth: "Background parallax",
  particles: "Particles",
};

export const SUBJECT_VFX_COMPOSITE_RECIPES = Object.freeze([
  {
    id: "hero_depth_title_stack",
    label: "Hero Depth Title + Rim Glow",
    build: duration => [
      {
        ...presets.foreground_refine(duration),
        id: "recipe-matte-refine",
        choke: 1,
        feather: 0.45,
      },
      {
        id: "recipe-bg-grade",
        type: "background_grade",
        start: 0,
        end: duration,
        exposure: -0.45,
        saturation: 0.72,
        contrast: 1.12,
      },
      {
        id: "recipe-text-behind",
        type: "text_behind",
        start: 0,
        end: duration,
        text: "HEADLINE",
        x: 50,
        y: 42,
        font_size: 112,
        color: "#f8fafc",
      },
      {
        id: "recipe-rim-glow",
        type: "glow",
        start: 0,
        end: duration,
        color: "#38bdf8",
        strength: 0.14,
        radius: 18,
      },
      {
        id: "recipe-depth",
        type: "depth",
        start: 0,
        end: duration,
        amount: 0.024,
      },
    ],
  },
  {
    id: "cyberpunk_neon_isolation",
    label: "Cyberpunk Neon Isolation",
    build: duration => [
      {
        id: "recipe-bg-grade",
        type: "background_grade",
        start: 0,
        end: duration,
        exposure: -0.65,
        saturation: 0.35,
        contrast: 1.25,
      },
      {
        id: "recipe-fg-grade",
        type: "foreground_grade",
        start: 0,
        end: duration,
        exposure: 0.12,
        saturation: 1.18,
        contrast: 1.15,
      },
      {
        id: "recipe-rim-glow",
        type: "glow",
        start: 0,
        end: duration,
        color: "#ec4899",
        strength: 0.22,
        radius: 22,
      },
      {
        id: "recipe-particles",
        type: "particles",
        start: 0,
        end: duration,
        seed: 73,
        count: 32,
        color: "#22d3ee",
        opacity: 0.28,
        speed: 18,
      },
      {
        id: "recipe-depth",
        type: "depth",
        start: 0,
        end: duration,
        amount: 0.03,
      },
    ],
  },
  {
    id: "editorial_spotlight_callout",
    label: "Editorial Spotlight & Callout",
    build: duration => [
      {
        ...presets.foreground_refine(duration),
        id: "recipe-matte-refine",
        choke: 1,
        feather: 0.5,
      },
      {
        id: "recipe-bg-grade",
        type: "background_grade",
        start: 0,
        end: duration,
        exposure: -0.55,
        saturation: 0.6,
        contrast: 1.08,
      },
      {
        id: "recipe-fg-grade",
        type: "foreground_grade",
        start: 0,
        end: duration,
        exposure: 0.15,
        saturation: 1.1,
        contrast: 1.1,
      },
      {
        id: "recipe-callout",
        type: "tracked_callout",
        start: 0,
        end: duration,
        text: "FEATURED SUBJECT",
        offset_x: -140,
        offset_y: -120,
        font_size: 26,
        color: "#fde047",
        avoid_subject: true,
      },
      {
        id: "recipe-rim-glow",
        type: "glow",
        start: 0,
        end: duration,
        color: "#fde047",
        strength: 0.08,
        radius: 12,
      },
    ],
  },
  {
    id: "kinetic_story_stage",
    label: "Kinetic Story Stage",
    build: duration => [
      {
        id: "recipe-bg-grade",
        type: "background_grade",
        start: 0,
        end: duration,
        exposure: -0.35,
        saturation: 0.8,
        contrast: 1.1,
      },
      {
        id: "recipe-text-behind",
        type: "text_behind",
        start: 0,
        end: duration,
        text: "UNSTOPPABLE",
        x: 50,
        y: 38,
        font_size: 108,
        color: "#e2e8f0",
      },
      {
        id: "recipe-kinetic-type",
        type: "kinetic_type",
        start: 0,
        end: duration,
        text: "NEW ERA",
        x: 8,
        y: 76,
        font_size: 68,
        color: "#c084fc",
        tracking: 4,
        travel: 42,
        align: "left",
      },
      {
        id: "recipe-particles",
        type: "particles",
        start: 0,
        end: duration,
        seed: 108,
        count: 24,
        color: "#c084fc",
        opacity: 0.22,
        speed: 14,
      },
    ],
  },
  {
    id: "behind_subject_captions",
    label: "Behind-Subject Captions + Depth",
    build: duration => [
      {
        ...presets.foreground_refine(duration),
        id: "recipe-matte-refine",
        choke: 1,
        feather: 0.45,
      },
      {
        id: "recipe-bg-grade",
        type: "background_grade",
        start: 0,
        end: duration,
        exposure: -0.32,
        saturation: 0.78,
        contrast: 1.08,
      },
      {
        id: "recipe-caption-behind",
        type: "text_behind",
        start: 0,
        end: duration,
        text: "SAY IT LOUD",
        x: 50,
        y: 44,
        font_size: 88,
        color: "#f8fafc",
        preset: "caption_punch",
        font: "inter_black",
        animation: "spring_pop",
        accent_color: "#ffb33d",
        shadow: 0.72,
        glow: 0.24,
        tracking: 1,
        hide_fg_captions: true,
      },
      {
        id: "recipe-depth",
        type: "depth",
        start: 0,
        end: duration,
        amount: 0.02,
      },
    ],
  },
]);

export function buildSubjectVfxCompositeRecipe(recipeId, duration = 4) {
  const recipe = SUBJECT_VFX_COMPOSITE_RECIPES.find(item => item.id === recipeId);
  if (!recipe) throw new Error(`Unknown subject composite recipe: ${recipeId}`);
  return recipe.build(Math.max(0.25, Number(duration) || 4));
}
const limits = {
  x: [0, 100],
  y: [0, 100],
  font_size: [12, 320],
  tracking: [0, 40],
  travel: [0, 150],
  shadow: [0, 1],
  glow: [0, 1],
  exposure: [-3, 1],
  saturation: [0, 2],
  contrast: [0.5, 2],
  reveal_seconds: [0, 2],
  offset_x: [-500, 500],
  offset_y: [-500, 500],
  strength: [0, 0.6],
  radius: [0, 40],
  blur: [0, 40],
  blue_spill: [0, 1],
  choke:[0,3],feather:[0,3],recover_hue:[0,360],hue_tolerance:[0,60],saturation_min:[0,1],
  edge_radius:[0,8],decontaminate:[0,1],
  dark_max:[0,1],reject_hue:[0,360],reject_tolerance:[0,60],reject_saturation:[0,1],reject_value:[0,1],
  amount: [0, 0.06],
  seed: [0, 2147483647],
  count: [1, 80],
  opacity: [0, 0.6],
  speed: [0, 100],
};
const sourceSelectionKey = source => JSON.stringify([source.id, source.start, source.end]);

export default function StudioSubjectVfxPanel({
  items,
  onChange,
  sources,
  getToken,
  apiBase,
  createId,
  proposal,
  media = [],
  onMediaAdded,
  getDocument,
  captions = [],
  defaultCaptionAccent = "#ffb33d",
}) {
  const backgrounds = media.filter(asset => asset.storagePath && /^[a-f0-9]{64}$/.test(asset.contentHash || "") &&
    ["image", "video"].includes(asset.mediaType || asset.type));
  const [selected, setSelected] = useState(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("idle");
  const [frameTime, setFrameTime] = useState(0),
    [pointLabel, setPointLabel] = useState(1),
    [layerType, setLayerType] = useState("text_behind");
  const [correctionTarget, setCorrectionTarget] = useState('person');
  const [played, setPlayed] = useState(false),
    [pictureBox, setPictureBox] = useState(null);
  const video = useRef(null),
    pointX = useRef(null),
    pointY = useRef(null),
    latest = useRef(items),
    poll = useRef(null),
    mounted = useRef(true),
    operation = useRef(false),
    attemptedPreviewRefresh = useRef(new Set()),
    controller = useRef(null),
    activeJob = useRef(null),
    attempt = useRef(0);
  latest.current = items;
  const item = items.find(value => value.scene.id === selected) || items[0];
  const source = sources.find(value => value.id === item?.scene.sourceId &&
    value.start === item?.scene.sourceRange.start && value.end === item?.scene.sourceRange.end) ||
    sources.find(value => value.id === item?.scene.sourceId);
  useEffect(() => { applySafeMediaSource(video.current, source?.url); }, [source?.url]);
  const revision = (() => {
    try {
      return item && subjectVfxRevision(item.scene);
    } catch {
      return null;
    }
  })();
  const ready = !!item?.preview?.url && revision === item.preview.revision;
  useEffect(() => {
    setPlayed(false);
  }, [revision, item?.preview?.jobId]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      attempt.current += 1;
      clearTimeout(poll.current);
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    // Stop observing the previous scene without cancelling its saved job.
    // Its request stays recoverable when the user returns to that scene.
    attempt.current += 1;
    clearTimeout(poll.current);
    controller.current?.abort();
    operation.current = false;
    activeJob.current = null;
    setBusy(false);
    setStatus("idle");
    setMessage("");
    setCorrectionTarget('person');
  }, [item?.scene.id]);
  const measurePicture = () => {
    const element = video.current;
    if (!element?.videoWidth) return;
    const scale = Math.min(
      element.clientWidth / element.videoWidth,
      element.clientHeight / element.videoHeight
    );
    const width = element.videoWidth * scale,
      height = element.videoHeight * scale;
    setPictureBox({
      left: (element.clientWidth - width) / 2,
      top: (element.clientHeight - height) / 2,
      width,
      height,
    });
  };
  useEffect(() => {
    if (video.current?.readyState >= 1) video.current.currentTime = item.scene.sourceRange.start;
    measurePicture();
    if (typeof ResizeObserver === "undefined" || !video.current) return;
    const observer = new ResizeObserver(measurePicture);
    observer.observe(video.current);
    return () => observer.disconnect();
  }, [item?.scene.id, item?.scene.sourceRange.start]);
  const update = scene =>
    onChange(
      items.map(value => (value === item ? { ...value, scene, preview: undefined } : value))
    );
  const uploadBackground = async event => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || !onMediaAdded || !item) return;
    const sceneId = item.scene.id;
    try {
      if (!item.scene.effects.some(effect => effect.type === "background_replace") && item.scene.effects.length >= 12)
        throw new Error("Remove an effect layer before adding background replacement.");
      if (file.size > 32 * 1024 ** 2 || !["image/png", "image/jpeg", "image/webp"].includes(file.type))
        throw new Error("Choose a PNG, JPEG or WebP background up to 32 MB.");
      setMessage("Saving the background to this project…");
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const contentHash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
      const uploaded = await uploadSourceFileViaBackend({ file, token: await getToken(), getToken,
        mediaType: "image", fileName: file.name, purpose: "studio_project" });
      if (!mounted.current) return;
      const asset = { id: `background-${contentHash.slice(0, 24)}`, name: file.name, type: "image", mediaType: "image",
        contentHash, storagePath: uploaded.storagePath, url: uploaded.url, status: "ready", isLocal: false };
      onMediaAdded(asset);
      let full = false;
      onChange(latest.current.map(value => {
        if (value.scene.id !== sceneId) return value;
        const existing = value.scene.effects.find(effect => effect.type === "background_replace");
        if (!existing && value.scene.effects.length >= 12) { full = true; return value; }
        const replacement = { ...(existing || presets.background_replace(value.scene.sourceRange.end - value.scene.sourceRange.start)),
          asset_id: asset.id, asset_sha256: contentHash };
        return { ...value, preview: undefined, scene: { ...value.scene,
          effects: existing ? value.scene.effects.map(effect => effect === existing ? replacement : effect)
            : [...value.scene.effects, replacement] } };
      }));
      setMessage(full ? "Background saved to project media. Remove an effect layer, then choose it as the background."
        : "Background saved. Create or reuse the subject mask, then render the replacement preview.");
    } catch (error) { if (mounted.current) setMessage(error.message); }
  };
  const request = async (method, path, body, signal) => {
    const token = await getToken();
    if (!token)
      throw Object.assign(new Error("Sign in to render and save subject effects."), {
        statusCode: 401,
      });
    const response = await fetch(`${apiBase}/api/media/studio-subject-vfx${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw Object.assign(new Error(data.message || "Subject renderer is unavailable."), {
        statusCode: response.status,
      });
    return data;
  };
  const add = source => {
    if (!source) return;
    if (items.length >= 8) {
      setMessage("Use up to eight subject scenes per project.");
      return;
    }
    const duration = source.end - source.start;
    if (duration > 10 || duration < 0.25) {
      setMessage("Split or trim this clip to 0.25–10 seconds before adding subject effects.");
      return;
    }
    const scene = {
      version: 1,
      id: createId("subject-vfx"),
      sourceId: source.id,
      sourceStoragePath: source.storagePath || "",
      sourceRange: { start: source.start, end: source.end },
      prompt: { points: [], labels: [], shotPrompts: [] },
      effects: [presets.text_behind(duration)],
    };
    onChange([...items, { scene, enabled: true }]);
    setSelected(scene.id);
    setFrameTime(0);
    setMessage(
      "Pause on the first frame and select the subject. Add another prompt at every camera cut."
    );
  };
  const choosePoint = event => {
    if (!item || !video.current?.videoWidth) return;
    const element = video.current,
      rect = element.getBoundingClientRect(),
      scale = Math.min(rect.width / element.videoWidth, rect.height / element.videoHeight);
    const width = element.videoWidth * scale,
      height = element.videoHeight * scale;
    const x = (event.clientX - rect.left - (rect.width - width) / 2) / width,
      y = (event.clientY - rect.top - (rect.height - height) / 2) / height;
    if (x < 0 || x >= 1 || y < 0 || y >= 1) return;
    addCorrection([x,y]);
  };
  const addCorrection = (point, clear=false) => {
    try {
      const corrected=correctSubjectItem(item,correctionTarget,Math.round(frameTime*24),point,pointLabel,clear);
      onChange(items.map(value=>value===item?corrected:value));
      setMessage('Selection updated. Recreate the mask and refine its edges; later-frame corrections propagate forward within this shot.');
    } catch(error) { setMessage(error.message); }
  };
  const render = async (options = {}) => {
    if (operation.current) return;
    const recoveryOnly = options.recoveryOnly === true;
    let scene;
    try {
      scene = validateSubjectVfxScene(item.scene);
      if (recoveryOnly) {
        if (!/^[-A-Za-z0-9_]{8,128}$/.test(options.savedJobId || ""))
          throw new Error("This saved preview has no recoverable job. Use Render subject preview when you want a new render.");
        const current = latest.current.find(value => value.scene.id === scene.id);
        if (current?.preview?.jobId !== options.savedJobId ||
            current.preview.revision !== subjectVfxRevision(scene) ||
            subjectVfxRevision(current.scene) !== subjectVfxRevision(scene)) return;
      }
      if (!scene.sourceStoragePath)
        throw new Error(
          "Save or upload this source to your Studio project before rendering subject effects."
        );
      if (!recoveryOnly && !ready && scene.effects.some(effect => effect.type === "background_replace") && !item.modelArtifactRef)
        throw new Error("Create a subject mask first, then render the replacement preview.");
    } catch (error) {
      setMessage(error.message);
      return;
    }
    operation.current = true;
    setBusy(true);
    setStatus("queued");
    setMessage("Submitting the source-bound subject render…");
    controller.current = new AbortController();
    const run = ++attempt.current,
      signal = controller.current.signal,
      isCurrent = () => mounted.current && attempt.current === run;
    const initialRevision = subjectVfxRevision(scene),
      deadline = Date.now() + 20 * 60000;
    const clientRequestId =
      item.pending?.revision === initialRevision
        ? item.pending.clientRequestId
        : createId("subject-render");
    onChange(
      latest.current.map(value =>
        value.scene.id === scene.id
          ? { ...value, pending: { clientRequestId, revision: initialRevision } }
          : value
      )
    );
    try {
      if (item.modelArtifactRef && getDocument) {
        const document = getDocument(), token = await getToken();
        if (!document || !token) throw new Error("Save this project before rendering the subject layers.");
        const response = await fetch(`${apiBase}/api/studio/director/projects/revisions`, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ document }), signal,
        });
        const saved = await response.json();
        if (!response.ok || saved.projectId !== document.projectId || saved.revision !== document.revision)
          throw new Error("The project version could not be saved. Your subject settings are preserved.");
        if (!isCurrent()) return;
      }
      const savedJobId = recoveryOnly ? options.savedJobId :
        item.pending?.jobId && item.pending.revision === initialRevision
          ? item.pending.jobId
          : ready
            ? item.preview.jobId
            : null;
      const created = savedJobId
        ? { jobId: savedJobId }
        : await request("POST", "", { scene, clientRequestId,
            ...(item.modelArtifactRef?{modelArtifactRef:item.modelArtifactRef}:{}) }, signal);
      if (!isCurrent()) return;
      if (typeof created.jobId !== "string" || !/^[-A-Za-z0-9_]{8,128}$/.test(created.jobId))
        throw new Error("The renderer did not confirm this job. Retry the saved request.");
      activeJob.current = created.jobId;
      onChange(
        latest.current.map(value =>
          value.scene.id === scene.id
            ? {
                ...value,
                pending: { clientRequestId, revision: initialRevision, jobId: created.jobId },
              }
            : value
        )
      );
      const tick = async () => {
        let finished = false;
        poll.current = null;
        try {
          if (!isCurrent()) return;
          if (Date.now() > deadline)
            throw new Error("Subject render timed out. Check the saved job before retrying.");
          const state = await request("GET", `/${created.jobId}`, undefined, signal);
          if (!isCurrent()) return;
          if (state.jobId !== created.jobId)
            throw new Error("The renderer returned a different job. Check the saved request.");
          setStatus(state.status);
          if (state.status === "completed") {
            finished = true;
            const current = latest.current.find(value => value.scene.id === scene.id);
            let same = false;
            try {
              same = current && subjectVfxRevision(current.scene) === initialRevision;
            } catch {
              /* Invalid edits cannot receive old rendered frames. */
            }
            if (!same) {
              setMessage(
                "The render finished, but the scene changed. Render the current settings before exporting."
              );
              setStatus("stale");
              activeJob.current = null;
              return;
            }
            if (!state.url || !state.receipt?.pixel_sha256)
              throw new Error("The worker returned no verified subject frames.");
            onChange(
              latest.current.map(value =>
                value.scene.id === scene.id
                  ? {
                      ...value,
                      pending: undefined,
                      preview: {
                        jobId: created.jobId,
                        url: state.url,
                        revision: initialRevision,
                        reviewed: current.preview?.reviewed === true &&
                          current.preview?.jobId === created.jobId &&
                          current.preview?.receipt?.pixel_sha256 === state.receipt.pixel_sha256,
                        receipt: state.receipt,
                      },
                    }
                  : value
              )
            );
            setMessage(
              "Play the rendered clip with sound. Inspect the subject edges and camera cuts, then approve it for export."
            );
            activeJob.current = null;
          } else if (["failed", "cancelled"].includes(state.status)) {
            finished = true;
            activeJob.current = null;
            onChange(
              latest.current.map(value =>
                value.scene.id === scene.id ? { ...value, pending: undefined } : value
              )
            );
            throw new Error(state.error || `Subject render ${state.status}.`);
          } else if (["queued", "processing", "dispatch_uncertain"].includes(state.status)) {
            setMessage(item.modelArtifactRef ? "Rendering your layers with the saved subject mask…" :
              "Tracking the subject and rendering your layers…");
            poll.current = setTimeout(tick, 3000);
            return;
          } else
            throw new Error("The renderer returned an unknown job state. Check the saved request.");
        } catch (error) {
          finished = true;
          if (error.name !== "AbortError" && isCurrent()) {
            setStatus("error");
            setMessage(error.message);
          }
        } finally {
          if (finished && isCurrent()) {
            operation.current = false;
            setBusy(false);
          }
        }
      };
      await tick();
    } catch (error) {
      if (isCurrent()) {
        operation.current = false;
        setBusy(false);
        setStatus("error");
        setMessage(error.message);
        if ([400, 401, 403, 409, 422, 429, 503].includes(error.statusCode))
          onChange(
            latest.current.map(value =>
              value.scene.id === scene.id ? { ...value, pending: undefined } : value
            )
          );
      }
    }
  };
  const cancel = async () => {
    const savedJobId = activeJob.current || item?.pending?.jobId;
    if (!savedJobId) return;
    attempt.current += 1;
    clearTimeout(poll.current);
    controller.current?.abort();
    controller.current = new AbortController();
    operation.current = true;
    setBusy(true);
    try {
      const id = savedJobId;
      const response = await request("DELETE", `/${id}`, undefined, controller.current.signal);
      if (!mounted.current) return;
      if (response.jobId !== id || response.status !== "cancelled")
        throw new Error("Cancellation was not confirmed. Check the saved render before retrying.");
      onChange(
        latest.current.map(value =>
          value.pending?.jobId === id ? { ...value, pending: undefined } : value
        )
      );
      activeJob.current = null;
      setStatus("cancelled");
      setMessage("Subject render cancelled. Your effect settings are saved.");
    } catch (error) {
      if (mounted.current) setMessage(error.message);
    } finally {
      if (mounted.current) {
        operation.current = false;
        setBusy(false);
      }
    }
  };
  const proposalValid =
    proposal &&
    proposal.sourceId === source?.id &&
    proposal.sourceStoragePath === source?.storagePath &&
    proposal.sourceRange?.start === item?.scene.sourceRange.start &&
    proposal.sourceRange?.end === item?.scene.sourceRange.end;
  const objectPrompt=item?.maskComponents?.find(c=>c.id===correctionTarget);
  const selectedObjectPrompt=frameTime<.001?objectPrompt:objectPrompt?.shotPrompts?.find(p=>p.frameIndex===Math.round(frameTime*24));
  const currentPrompt = correctionTarget==='person' ? (frameTime<.001?item?.scene.prompt:
    item?.scene.prompt.shotPrompts.find(shot=>Math.abs(shot.time-frameTime)<1/48)) :
    (selectedObjectPrompt?{points:selectedObjectPrompt.points.map(p=>p.position),labels:selectedObjectPrompt.points.map(p=>p.label)}:null);
  return (
    <section className="studio-subject-vfx" aria-labelledby="subject-vfx-heading">
      <header>
        <span>SUBJECT & COMPOSITING</span>
        <h4 id="subject-vfx-heading">Make effects part of the shot.</h4>
        <p>
          Select the subject, build your layers, and review the rendered result with the original
          sound.
        </p>
      </header>
      <div className="subject-vfx-actions">
        <select
          aria-label="Subject effect source clip"
          defaultValue=""
          onChange={event => {
            add(sources.find(value => sourceSelectionKey(value) === event.target.value));
            event.target.value = "";
          }}
        >
          <option value="">Add effects to a clip…</option>
          {sources.map(value => (
            <option key={sourceSelectionKey(value)} value={sourceSelectionKey(value)}>
              {value.name} · {(value.end - value.start).toFixed(1)}s · {value.start.toFixed(1)}–{value.end.toFixed(1)}s
            </option>
          ))}
        </select>
      </div>
      {items.length > 0 && (
        <select
          aria-label="Subject effect scene"
          value={item.scene.id}
          onChange={event => {
            setSelected(event.target.value);
            setFrameTime(0);
          }}
        >
          {items.map(value => (
            <option key={value.scene.id} value={value.scene.id}>
              {sources.find(source => source.id === value.scene.sourceId)?.name ||
                value.scene.sourceId}
            </option>
          ))}
        </select>
      )}
      {item && (
        <>
          <label className="subject-vfx-toggle">
            <input
              type="checkbox"
              checked={item.enabled !== false}
              onChange={event =>
                onChange(
                  items.map(value =>
                    value === item ? { ...value, enabled: event.target.checked } : value
                  )
                )
              }
            />
            Apply these subject effects
          </label>
          <fieldset>
            <legend>Background replacement</legend>
            <p>Keep the original background, or choose an image to replace it. Select the person to keep; additional objects are optional.</p>
            <ProductHelpButton featureId="studio.compositing" label="Background replacement" workspaceType="STUDIO" />
            <label>Background choice
              <select aria-label="Background choice"
                value={item.scene.effects.find(effect=>effect.type==='background_replace')?.asset_id || ''}
                onChange={event=>{
                  const asset=backgrounds.find(candidate=>candidate.id===event.target.value);
                  const existing=item.scene.effects.find(effect=>effect.type==='background_replace');
                  if(asset&&!existing&&item.scene.effects.length>=12){setMessage('Remove an effect layer before adding background replacement.');return;}
                  const replacement=asset&&{...(existing||presets.background_replace(item.scene.sourceRange.end-item.scene.sourceRange.start)),asset_id:asset.id,asset_sha256:asset.contentHash};
                  const effects=!asset?item.scene.effects.filter(effect=>effect.type!=='background_replace'):
                    existing?item.scene.effects.map(effect=>effect===existing?replacement:effect):[...item.scene.effects,replacement];
                  update({...item.scene,effects});
                }}>
                <option value="">Keep original background</option>
                {backgrounds.map(asset=><option key={asset.id} value={asset.id}>{asset.name || 'Replacement background'}</option>)}
              </select>
            </label>
            {item.scene.effects.some(effect=>effect.type==='background_replace') && (()=>{
              const edge=item.scene.effects.find(effect=>effect.type==='foreground_refine' && (effect.edge_radius>0 || effect.decontaminate>0 || effect.id==='background-edge-cleanup'));
              const changeEdge=(field,value)=>update({...item.scene,effects:item.scene.effects.map(effect=>effect===edge?{...effect,[field]:value}:effect)});
              return <div className="subject-vfx-background-edges">
                {!edge ? <button type="button" disabled={item.scene.effects.length>=12}
                  onClick={()=>update({...item.scene,effects:[...item.scene.effects,{
                    ...presets.foreground_refine(item.scene.sourceRange.end-item.scene.sourceRange.start),
                    // Keep the model's fractional hair, skin and motion edges.
                    // A nonzero radius thresholds that alpha before re-solving
                    // it; use the explicit width control when that is needed.
                    id:'background-edge-cleanup',choke:0,feather:0,edge_radius:0,decontaminate:1,
                  }]})}>Clean background edges</button> : <>
                  <label>Edge detail width
                    <input aria-label="Background edge detail width" type="number" min="0" max="8" step="1"
                      value={edge.edge_radius || 0} onChange={event=>{
                        const value=Number(event.target.value);if(Number.isInteger(value)&&value>=0&&value<=8)changeEdge('edge_radius',value);
                      }} />
                  </label>
                  <label>Remove old background colour
                    <input aria-label="Remove old background colour" type="number" min="0" max="1" step=".05"
                      value={edge.decontaminate || 0} onChange={event=>{
                        const value=Number(event.target.value);if(Number.isFinite(value)&&value>=0&&value<=1)changeEdge('decontaminate',value);
                      }} />
                  </label>
                </>}
                <p>Refine hair and object edges from the original picture. Render a preview and check movement; missing objects need to be selected in the subject mask.</p>
              </div>;
            })()}
            {onMediaAdded && <label>Upload background image
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadBackground} />
            </label>}
          </fieldset>
          <label>Correct foreground selection
            <select aria-label="Correction target" value={correctionTarget} onChange={event=>setCorrectionTarget(event.target.value)}>
              <option value="person">Person</option>
              {(item.maskComponents||[]).map((component,index)=><option key={component.id} value={component.id}>Foreground object {index+1}</option>)}
            </select>
          </label>
          <div className="subject-vfx-source">
            <video
              key={source?.url}
              ref={video}
              preload="metadata"
              playsInline
              aria-label="Select subject in source footage"
              onClick={choosePoint}
              onLoadedMetadata={() => {
                video.current.currentTime = item.scene.sourceRange.start + frameTime;
                measurePicture();
              }}
            />
            {pictureBox &&
              currentPrompt?.points.map(([x, y], index) => (
                <i
                  key={index}
                  className={`subject-vfx-point ${currentPrompt.labels[index] ? "is-subject" : "is-background"}`}
                  aria-hidden="true"
                  style={{
                    left: pictureBox.left + x * pictureBox.width,
                    top: pictureBox.top + y * pictureBox.height,
                  }}
                >
                  {currentPrompt.labels[index] ? "+" : "−"}
                </i>
              ))}
            <span>Click the paused picture to select a point</span>
          </div>
          <label>
            Prompt frame{" "}
            <input
              type="range"
              aria-label="Subject prompt frame"
              min="0"
              max={Math.max(0, item.scene.sourceRange.end - item.scene.sourceRange.start - 1 / 24)}
              step={1 / 24}
              value={frameTime}
              onChange={event => {
                const value = Number(event.target.value);
                setFrameTime(value);
                if (video.current) video.current.currentTime = item.scene.sourceRange.start + value;
              }}
            />
            <small>{frameTime.toFixed(2)}s from clip start</small>
          </label>
          <div className="subject-vfx-actions">
            <button type="button" aria-pressed={pointLabel === 1} onClick={() => setPointLabel(1)}>
              Subject point
            </button>
            <button type="button" aria-pressed={pointLabel === 0} onClick={() => setPointLabel(0)}>
              Background point
            </button>
            <button
              type="button"
              onClick={() =>
                addCorrection(null,true)
              }
            >
              Clear points
            </button>
          </div>
          <p className="subject-vfx-point-count">
            {item.scene.prompt.points.length} first-frame points ·{" "}
            {item.scene.prompt.shotPrompts.length} shot resets
          </p>
          <label>
            Point X / Y{" "}
            <div className="subject-vfx-actions">
              <input
                ref={pointX}
                aria-label="Subject point X"
                type="number"
                min="0"
                max=".999999"
                step=".01"
                defaultValue=".5"
              />
              <input
                ref={pointY}
                aria-label="Subject point Y"
                type="number"
                min="0"
                max=".999999"
                step=".01"
                defaultValue=".5"
              />
              <button
                type="button"
                onClick={() => {
                  const x = Number(pointX.current.value),
                    y = Number(pointY.current.value);
                  if (
                    !Number.isFinite(x) ||
                    !Number.isFinite(y) ||
                    x < 0 ||
                    x >= 1 ||
                    y < 0 ||
                    y >= 1
                  ) {
                    setMessage("Points must be between zero and one, inside the frame.");
                    return;
                  }
                  addCorrection([x,y]);
                }}
              >
                Add point on selected frame
              </button>
            </div>
          </label>
          {item.scene.effects.map((effect, index) => (
            <fieldset key={effect.id}>
              <legend>{names[effect.type]}</legend>
              {effect.type === "background_replace" && <label>Fit replacement to a surface
                <input aria-label="Fit replacement to a surface" type="checkbox" checked={!!effect.surface_corners}
                  onChange={event=>{
                    const next={...effect};
                    if(event.target.checked){next.surface_corners=[[0,0],[1,0],[1,1],[0,1]];next.asset_crop=[0,0,1,1];}
                    else{delete next.surface_corners;delete next.asset_crop;}
                    update({...item.scene,effects:item.scene.effects.map((layer,i)=>i===index?next:layer)});
                  }} />
              </label>}
              {effect.type === "foreground_holdout" && <label>
                Additional holdout paths
                <textarea aria-label="Additional holdout paths" key={JSON.stringify(effect.paths || [])}
                  defaultValue={JSON.stringify(effect.paths || [])}
                  onBlur={event => {
                    try {
                      const paths = JSON.parse(event.target.value), next = {...effect};
                      if (Array.isArray(paths) && !paths.length) delete next.paths; else next.paths=paths;
                      const scene={...item.scene,effects:item.scene.effects.map((layer,i)=>i===index?next:layer)};
                      validateSubjectVfxScene(scene);update(scene);
                    } catch { setMessage("Use 1–32 holdout paths, each with 3–64 source-frame points, or [] to remove additional paths."); }
                  }} />
              </label>}
              {effect.type === "foreground_holdout" && <label>
                Colour treatment paths
                <small>Apply this object&apos;s saturation treatment inside these regions without keeping any additional background pixels.</small>
                <textarea aria-label="Colour treatment paths" key={JSON.stringify(effect.color_paths || [])}
                  defaultValue={JSON.stringify(effect.color_paths || [])}
                  onBlur={event => {
                    try {
                      const paths=JSON.parse(event.target.value),next={...effect};
                      if(Array.isArray(paths)&&!paths.length)delete next.color_paths;else next.color_paths=paths;
                      const scene={...item.scene,effects:item.scene.effects.map((layer,i)=>i===index?next:layer)};
                      validateSubjectVfxScene(scene);update(scene);
                    } catch { setMessage("Use 1–32 colour treatment paths with 3–64 source-frame points each, or [] to remove them."); }
                  }} />
              </label>}
              {effect.type === "foreground_holdout" && <label>
                Repair opaque detail from source
                <small>Copy a clean part of this source frame over a damaged object. Choose original source colour to retain photographed texture, with optional saturation. Coordinates stay fixed; use separate timed repairs for moving objects.</small>
                <textarea aria-label="Repair opaque detail from source" key={JSON.stringify(effect.source_patches || [])}
                  defaultValue={JSON.stringify(effect.source_patches || [])}
                  onBlur={event => {
                    try {
                      const patches=JSON.parse(event.target.value),next={...effect};
                      if(Array.isArray(patches) && !patches.length) delete next.source_patches;else next.source_patches=patches;
                      const scene={...item.scene,effects:item.scene.effects.map((layer,i)=>i===index?next:layer)};
                      validateSubjectVfxScene(scene);update(scene);
                    } catch { setMessage("Use up to 16 repairs with source and target four-corner paths, feather (0–3) and end_blend (0–32 pixels), or [] to remove repairs."); }
                  }} />
              </label>}
              {effect.type === "foreground_refine" && !effect.after_refine && !effect.after_holdout && <fieldset>
                <legend>Edge opacity</legend>
                <small>Adjust a translucent fringe while keeping a soft outline. Choose a region below to limit this correction.</small>
                {["Transparent edge level", "Opaque edge level"].map((label, coordinate) => <label key={label}>
                  {label}
                  <input aria-label={label} type="number" min="0" max="1" step="0.01"
                    value={(effect.alpha_levels || [0, 1])[coordinate]}
                    onChange={event => {
                      const levels=[...(effect.alpha_levels || [0,1])];levels[coordinate]=Number(event.target.value);
                      if (!levels.every(value=>Number.isFinite(value)&&value>=0&&value<=1) || levels[1]<levels[0]+.05) {
                        setMessage("Keep the opaque edge level at least 0.05 above the transparent edge level.");return;
                      }
                      const next={...effect};if(levels[0]===0&&levels[1]===1)delete next.alpha_levels;else next.alpha_levels=levels;
                      update({...item.scene,effects:item.scene.effects.map((layer,i)=>i===index?next:layer)});
                    }} />
                </label>)}
                <label>Edge opacity region points
                  <textarea aria-label="Edge opacity region points" key={JSON.stringify(effect.alpha_polygon || [])}
                    defaultValue={JSON.stringify(effect.alpha_polygon || [])}
                    onBlur={event=>{
                      try {
                        const points=JSON.parse(event.target.value),next={...effect};
                        if(Array.isArray(points)&&!points.length)delete next.alpha_polygon;else next.alpha_polygon=points;
                        const scene={...item.scene,effects:item.scene.effects.map((layer,i)=>i===index?next:layer)};
                        validateSubjectVfxScene(scene);update(scene);
                      } catch {setMessage("Use 3–64 source-frame points, or [] to adjust opacity across the whole subject.");}
                    }}/>
                </label>
              </fieldset>}
              {effect.type === "foreground_refine" && <label>
                Edge refinement region points
                <small>Limit edge refinement to this source-frame region. Set Edge detail width above zero first. Colour cleanup becomes a soft edge guide here; explicit removal paths stay excluded.</small>
                <textarea aria-label="Edge refinement region points" key={JSON.stringify(effect.edge_polygon || [])}
                  defaultValue={JSON.stringify(effect.edge_polygon || [])}
                  onBlur={event => {
                    try {
                      const points=JSON.parse(event.target.value),next={...effect};
                      if(Array.isArray(points) && !points.length) delete next.edge_polygon; else next.edge_polygon=points;
                      const scene={...item.scene,effects:item.scene.effects.map((layer,i)=>i===index?next:layer)};
                      validateSubjectVfxScene(scene);update(scene);
                    } catch { setMessage("Set a positive Edge detail width and use 3–64 source-frame points, or [] to refine the whole frame."); }
                  }} />
              </label>}
              {effect.type === "foreground_refine" && <label>
                Detail region points
                <textarea aria-label="Detail region points" key={JSON.stringify(effect.detail_polygon || [])}
                  defaultValue={JSON.stringify(effect.detail_polygon || [])}
                  onBlur={event => {
                    try {
                      const points = JSON.parse(event.target.value);
                      const next = {...effect};
                      if (Array.isArray(points) && !points.length) delete next.detail_polygon;
                      else next.detail_polygon = points;
                      const scene = {...item.scene,effects:item.scene.effects.map((layer,i)=>i===index?next:layer)};
                      validateSubjectVfxScene(scene);update(scene);
                    } catch { setMessage("Use 3–64 source-frame points such as [[0.1,0.5],[0.3,0.5],[0.2,0.9]], or [] for the rectangular region."); }
                  }} />
              </label>}
              {effect.type === "foreground_refine" && <label>
                Remove background fragments
                <textarea aria-label="Remove background fragments" key={JSON.stringify(effect.clear_paths || [])}
                  defaultValue={JSON.stringify(effect.clear_paths || [])}
                  onBlur={event => {
                    try {
                      const paths = JSON.parse(event.target.value), next = {...effect};
                      if (Array.isArray(paths) && !paths.length) delete next.clear_paths; else next.clear_paths=paths;
                      const scene={...item.scene,effects:item.scene.effects.map((layer,i)=>i===index?next:layer)};
                      validateSubjectVfxScene(scene);update(scene);
                    } catch { setMessage("Use 1–32 removal paths, each with 3–64 source-frame points, or [] to remove the correction."); }
                  }} />
              </label>}
              {Object.entries(
                effect.type === "foreground_refine"
                  ? { edge_radius: 0, decontaminate: 0, blue_spill: 0, after_refine: false, after_holdout: false, reject_connected: false, ...effect }
                  : effect.type === "foreground_holdout"
                    ? { after_refine: false, saturation: 1, ...effect }
                    : effect.type === "text_behind"
                      ? {
                          preset: "classic",
                          font: "dejavu_bold",
                          animation: "fade",
                          accent_color: normalizeHexColor(defaultCaptionAccent),
                          shadow: 0,
                          glow: 0,
                          tracking: 0,
                          hide_fg_captions: false,
                          ...effect,
                        }
                      : effect
              )
                .filter(([key]) => !["id", "type", "asset_sha256", "alpha_levels", "alpha_polygon", "detail_polygon", "edge_polygon", "paths", "color_paths", "clear_paths", "source_patches", "words"].includes(key))
                .map(([key, value]) => (
                  <label key={key}>
                    {key === "asset_id"
                      ? "Background media"
                      : key === "after_holdout"
                        ? "Clean protected object edges"
                        : key === "reject_connected"
                          ? "Limit colour cleanup to background edges"
                          : key === "after_refine"
                            ? effect.type === "foreground_refine"
                              ? "Apply colour cleanup after matting"
                              : "Keep thin detail through cleanup"
                            : key === "hide_fg_captions"
                              ? "Hide duplicate foreground captions"
                              : key.replaceAll("_", " ")}
                    {Array.isArray(value) && Array.isArray(value[0]) ? (
                      <span className="subject-vfx-actions">
                        {value.map((point, corner) => <span key={corner}>{point.map((coordinate, axis) =>
                          <input key={axis} type="number" min="0" max="1" step=".001"
                            aria-label={`${key === "surface_corners" ? "Surface" : "Holdout"} corner ${corner + 1} ${axis === 0 ? "X" : "Y"}`} value={coordinate}
                            onChange={event => update({...item.scene,effects:item.scene.effects.map((layer,i)=>i===index?
                              {...layer,[key]:value.map((p,j)=>j===corner?p.map((v,k)=>k===axis?Number(event.target.value):v):p)}:layer)})} />)}</span>)}
                      </span>
                    ) : Array.isArray(value) ? (
                      <span className="subject-vfx-actions">
                        {["left","top","right","bottom"].map((edge, coordinate) => <input key={edge} type="number"
                          aria-label={`${key.replaceAll("_", " ")} ${edge}`} min="0" max="1" step=".01" value={value[coordinate]}
                          onChange={event => update({...item.scene,effects:item.scene.effects.map((layer,i)=>i===index?
                            {...layer,[key]:value.map((v,j)=>j===coordinate?Number(event.target.value):v)}:layer)})} />)}
                      </span>
                    ) : key === "asset_id" ? (
                      <select value={value} onChange={event => {
                        const asset = backgrounds.find(candidate => candidate.id === event.target.value);
                        update({ ...item.scene, effects: item.scene.effects.map((layer, i) => i === index ?
                          { ...layer, asset_id: asset?.id || "", asset_sha256: asset?.contentHash || "" } : layer) });
                      }}>
                        <option value="">Choose project media…</option>
                        {backgrounds.map(asset => <option key={asset.id} value={asset.id}>{asset.name || "Background"}</option>)}
                      </select>
                    ) : key === "preset" && effect.type === "text_behind" ? (
                      <select
                        value={value}
                        onChange={event => {
                          const nextPreset = event.target.value;
                          const presetDefaults = TEXT_BEHIND_PRESET_DEFAULTS[nextPreset] || TEXT_BEHIND_PRESET_DEFAULTS.classic;
                          update({
                            ...item.scene,
                            effects: item.scene.effects.map((layer, i) =>
                              i === index
                                ? {
                                    ...layer,
                                    preset: nextPreset,
                                    ...presetDefaults,
                                    ...(nextPreset !== "classic" && !layer.accent_color
                                      ? { accent_color: normalizeHexColor(defaultCaptionAccent) }
                                      : {}),
                                  }
                                : layer
                            ),
                          });
                        }}
                      >
                        {TEXT_BEHIND_PRESETS.map(option => (
                          <option key={option} value={option}>
                            {TEXT_BEHIND_PRESET_LABELS[option] || option}
                          </option>
                        ))}
                      </select>
                    ) : key === "font" && effect.type === "text_behind" ? (
                      <select
                        value={value}
                        onChange={event =>
                          update({
                            ...item.scene,
                            effects: item.scene.effects.map((layer, i) =>
                              i === index ? { ...layer, font: event.target.value } : layer
                            ),
                          })
                        }
                      >
                        {TEXT_BEHIND_FONTS.map(option => (
                          <option key={option} value={option}>
                            {TEXT_BEHIND_FONT_LABELS[option] || option}
                          </option>
                        ))}
                      </select>
                    ) : key === "animation" && effect.type === "text_behind" ? (
                      <select
                        value={value}
                        onChange={event =>
                          update({
                            ...item.scene,
                            effects: item.scene.effects.map((layer, i) =>
                              i === index ? { ...layer, animation: event.target.value } : layer
                            ),
                          })
                        }
                      >
                        {TEXT_BEHIND_ANIMATIONS.map(option => (
                          <option key={option} value={option}>
                            {TEXT_BEHIND_ANIMATION_LABELS[option] || option}
                          </option>
                        ))}
                      </select>
                    ) : typeof value === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={event =>
                          update({
                            ...item.scene,
                            effects: item.scene.effects.map((layer, i) =>
                              i === index ? { ...layer, [key]: event.target.checked } : layer
                            ),
                          })
                        }
                      />
                    ) : key === "align" ? (
                      <select
                        value={value}
                        onChange={event =>
                          update({
                            ...item.scene,
                            effects: item.scene.effects.map((layer, i) =>
                              i === index ? { ...layer, align: event.target.value } : layer
                            ),
                          })
                        }
                      >
                        {["left", "center", "right"].map(align => (
                          <option key={align}>{align}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={
                          typeof value === "number"
                            ? "number"
                            : key === "color" || key === "accent_color"
                              ? "color"
                              : "text"
                        }
                        value={value}
                        min={limits[key]?.[0] ?? 0}
                        max={
                          limits[key]?.[1] ??
                          (typeof value === "number"
                            ? item.scene.sourceRange.end - item.scene.sourceRange.start
                            : undefined)
                        }
                        step={
                          ["count", "seed", "choke", "edge_radius", "tracking"].includes(key)
                            ? 1
                            : ["shadow", "glow"].includes(key)
                              ? 0.05
                              : 0.01
                        }
                        maxLength={key === "text" ? 120 : undefined}
                        onChange={event =>
                          update({
                            ...item.scene,
                            effects: item.scene.effects.map((layer, i) =>
                              i === index
                                ? {
                                    ...layer,
                                    [key]:
                                      typeof value === "number"
                                        ? Number(event.target.value)
                                        : event.target.value,
                                  }
                                : layer
                            ),
                          })
                        }
                      />
                    )}
                  </label>
                ))}
              {effect.type === "text_behind" && Array.isArray(effect.words) && effect.words.length > 0 && (
                <div className="subject-vfx-actions">
                  <small>{`Speech-synced: ${effect.words.length} timed word${effect.words.length === 1 ? "" : "s"}`}</small>
                  <button
                    type="button"
                    onClick={() => {
                      const nextLayer = { ...effect };
                      delete nextLayer.words;
                      update({
                        ...item.scene,
                        effects: item.scene.effects.map((layer, i) => (i === index ? nextLayer : layer)),
                      });
                    }}
                  >
                    Clear word timing
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() =>
                  update({
                    ...item.scene,
                    effects: item.scene.effects.filter((_, i) => i !== index),
                  })
                }
              >
                Remove layer
              </button>
            </fieldset>
          ))}
          {getDocument && <StudioSubjectMaskControls key={item.scene.id} item={item}
            onChange={next => onChange(latest.current.map(value => value.scene.id === next.scene.id ? next : value))}
            getDocument={getDocument} getToken={getToken} apiBase={apiBase} createId={createId} />}
          <div className="subject-vfx-actions" data-testid="subject-vfx-recipe-bar">
            <button
              type="button"
              disabled={busy || operation.current}
              data-testid="sync-behind-captions"
              onClick={() => {
                try {
                  const synced = buildBehindSubjectCaptionLayers({
                    captions,
                    sourceRange: item.scene.sourceRange,
                    existingEffects: item.scene.effects,
                    accentColor: defaultCaptionAccent,
                    createId,
                  });
                  if (!synced.layers.length) {
                    setMessage(synced.message);
                    return;
                  }
                  const nextScene = validateSubjectVfxScene({
                    ...item.scene,
                    effects: synced.layers,
                  });
                  update(nextScene);
                  setMessage(synced.message);
                } catch (err) {
                  setMessage(err.message);
                }
              }}
            >
              Sync speech captions behind subject
            </button>
            {SUBJECT_VFX_COMPOSITE_RECIPES.map(recipe => (
              <button
                key={recipe.id}
                type="button"
                disabled={busy || operation.current}
                data-testid={`subject-vfx-recipe-${recipe.id}`}
                onClick={() => {
                  try {
                    const duration = item.scene.sourceRange.end - item.scene.sourceRange.start;
                    const effects = buildSubjectVfxCompositeRecipe(recipe.id, duration);
                    const nextScene = validateSubjectVfxScene({
                      ...item.scene,
                      effects,
                    });
                    update(nextScene);
                    setMessage(`${recipe.label} composite recipe applied.`);
                  } catch (err) {
                    setMessage(err.message);
                  }
                }}
              >
                {recipe.label}
              </button>
            ))}
          </div>
          <div className="subject-vfx-actions">
            <select
              aria-label="Subject effect type"
              value={layerType}
              onChange={event => setLayerType(event.target.value)}
            >
              {Object.entries(names).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={item.scene.effects.length >= 12}
              onClick={() =>
                update({
                  ...item.scene,
                  effects: [
                    ...item.scene.effects,
                    {
                      ...presets[layerType](
                        item.scene.sourceRange.end - item.scene.sourceRange.start
                      ),
                      id: createId("subject-layer"),
                    },
                  ],
                })
              }
            >
              Add layer
            </button>
          </div>
          {proposal && (
            <div className="subject-vfx-proposal">
              <strong>Director subject suggestion</strong>
              <p>
                {proposal.reason || "Review these source-bound effect layers before applying them."}
              </p>
              <button
                type="button"
                disabled={!proposalValid}
                onClick={() => {
                  try {
                    const scene = validateSubjectVfxScene({
                      ...item.scene,
                      effects: proposal.effects,
                    });
                    update(scene);
                    setMessage(
                      "Director layers applied. Render and review the result before exporting."
                    );
                  } catch (error) {
                    setMessage(error.message);
                  }
                }}
              >
                Apply reviewed suggestion
              </button>
              {!proposalValid && <small>This suggestion targets another source or range.</small>}
            </div>
          )}
          <div className="subject-vfx-actions">
            <button type="button" disabled={busy || operation.current} onClick={render}>
              {item.pending?.jobId
                ? "Check saved render"
                : ready
                  ? "Refresh rendered preview"
                  : "Render subject preview"}
            </button>
            {(activeJob.current || item.pending?.jobId) && (
              <button type="button" onClick={cancel}>
                Cancel render
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => onChange(items.filter(value => value !== item))}
            >
              Remove scene
            </button>
          </div>
          {ready && (
            <div className="subject-vfx-result">
              <video
                controls
                playsInline
                preload="metadata"
                src={getSafeMediaSource(item.preview.url)}
                aria-label="Rendered subject effects with original audio"
                onPlaying={() => setPlayed(true)}
                onError={() => {
                  setPlayed(false);
                  const refreshKey = `${item.preview.jobId}:${revision}`;
                  if (!operation.current && !attemptedPreviewRefresh.current.has(refreshKey)) {
                    attemptedPreviewRefresh.current.add(refreshKey);
                    setMessage("Refreshing the saved subject preview link…");
                    void render({ recoveryOnly: true, savedJobId: item.preview.jobId });
                    return;
                  }
                  setMessage(
                    "The preview could not load. Refresh the rendered preview to get a new playback link."
                  );
                }}
              />
              <label>
                <input
                  type="checkbox"
                  disabled={!played}
                  checked={item.preview.reviewed === true}
                  onChange={event =>
                    onChange(
                      items.map(value =>
                        value === item
                          ? {
                              ...value,
                              preview: { ...value.preview, reviewed: event.target.checked },
                            }
                          : value
                      )
                    )
                  }
                />
                I reviewed the sound, subject edges and camera cuts
              </label>
            </div>
          )}
          <p className="subject-vfx-limit">
            Subject previews cover clips up to 10 seconds. The final export uses these rendered
            frames, then applies your framing, captions and other finishing choices.
          </p>
        </>
      )}
      {message && (
        <p role="status" data-state={status}>
          {message}
        </p>
      )}
    </section>
  );
}
