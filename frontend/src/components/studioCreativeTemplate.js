import definition from "../templates/product_launch_cinematic_v1.json";
import cyclingDefinition from "../templates/cycling_rhythm_v1.json";
import cyclingSecondDefinition from "../templates/cycling_rhythm_v1.0.1.json";
import cyclingInitialDefinition from "../templates/cycling_rhythm_v1.0.0.json";
import { adaptStudioSnapshotToDocument, projectStudioEditableStateToSnapshot } from "./studioProjectDocument";

export const PRODUCT_LAUNCH_TEMPLATE = definition;
export const STUDIO_CREATIVE_TEMPLATES = [definition, cyclingDefinition, cyclingSecondDefinition, cyclingInitialDefinition];
export const stableTemplateJson = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

export async function studioTemplateReference(template = definition) {
  const bytes = new TextEncoder().encode(stableTemplateJson(template));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return { templateId: template.templateId, version: template.version,
    definitionHash: [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("") };
}

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const copy = value => JSON.parse(JSON.stringify(value));

// Select the authored edit from explicit intent, without claiming perception.
export async function proposeStudioDirectorTemplate({ intent, ...options }) {
  const selected = options.template || definition;
  if (!selected.categoryIds.includes(intent)) fail("TEMPLATE_INTENT_UNSUPPORTED", "Choose a brief supported by this template.");
  const result = await instantiateStudioCreativeTemplate({ ...options, actor: "director" });
  return { templateRef: result.templateRef,
    selectionReason: selected.templateId === "cycling_rhythm_v1"
      ? "Cycling brief: continuous source shots, authored rhythm cuts, animated type and a brand ending in 20 seconds."
      : "Product-launch brief: hook, product action, two benefits and a brand ending in 20 seconds.",
    sourceEvidence: result.document.assets.map(asset => ({ assetId: asset.assetId, contentHash: asset.contentHash })),
    startsModelJob: false, result };
}

// The adapter creates ordinary editable Studio decisions. It draws no frames,
// starts no jobs and shares the browser's canonical projection with Director.
export async function instantiateStudioCreativeTemplate({ template = definition, templateRef, ownerUid,
  projectId, bindings, aspect = "16:9", resolution = "720p", actor = "manual", intensity = 1 }) {
  const exactReference = await studioTemplateReference(template);
  const registered = STUDIO_CREATIVE_TEMPLATES.find(item => item.templateId === template.templateId && item.version === template.version);
  if (templateRef?.definitionHash !== exactReference.definitionHash ||
      !registered || stableTemplateJson(template) !== stableTemplateJson(registered) ||
      templateRef?.templateId !== template.templateId || templateRef?.version !== template.version ||
      !/^[a-f0-9]{64}$/.test(templateRef?.definitionHash || ""))
    fail("TEMPLATE_IDENTITY_MISMATCH", "The selected template definition is unavailable.");
  if (!ownerUid || !projectId || !template.supportedAspects.includes(aspect) ||
      !Number.isFinite(intensity) || intensity < .5 || intensity > 1.25)
    fail("TEMPLATE_INPUT_INVALID", "Choose an owner, project, aspect and supported motion intensity.");
  if (!bindings || Object.keys(bindings).some(key => !template.inputSlots.some(slot => slot.id === key)))
    fail("TEMPLATE_INPUT_INVALID", "Unknown template input.");
  for (const slot of template.inputSlots) {
    const binding = bindings[slot.id];
    if (slot.type === "text") {
      if (typeof binding !== "string" || !binding.trim() || binding.length > 64 || /[<>]/.test(binding) ||
          [...binding].some(character => character.charCodeAt(0) <= 8))
        fail("TEMPLATE_COPY_INVALID", `Provide readable ${slot.id} copy (at most 64 characters).`);
      // Keep the authored hierarchy. Overlong copy is a visible correction,
      // never silently shrunk or truncated to fit.
      if (binding.split("\n").length > 2 || binding.split("\n").some(line => line.length > (slot.id === "headline" ? 16 : 24)))
        fail("TEMPLATE_COPY_TOO_LONG", `Use at most two short lines for ${slot.id}.`);
    } else if (slot.type === "colour") {
      if (!/^#[a-f0-9]{6}$/i.test(binding || "")) fail("TEMPLATE_COLOUR_INVALID", "Choose a six-digit brand colour.");
    } else if (!binding || binding.ownerUid !== ownerUid || !binding.id || !binding.url ||
        !binding.storagePath || !/^[a-f0-9]{64}$/.test(binding.contentHash || "") ||
        (binding.mediaType || binding.type) !== slot.type || (slot.type !== "image" && !(binding.duration > 0))) {
      fail("TEMPLATE_OWNED_MEDIA_REQUIRED", `Save an owned ${slot.type} asset for ${slot.id} first.`);
    }
  }
  if (bindings.headline.split("\n").length !== 2)
    fail("TEMPLATE_COPY_INVALID", "The launch headline needs two lines.");
  const recipe = template.executionDefinition;
  const timeline = recipe.sequence.map((shot, index) => {
    const asset = bindings[shot.slot];
    const start = Number(asset.trimStart || 0) + shot.offset;
    if (!Number.isFinite(start) || start < 0 || start + shot.duration > asset.duration + 1 / 90000)
      fail("TEMPLATE_FOOTAGE_TOO_SHORT", `${shot.slot} needs ${shot.offset + shot.duration}s after its selected in-point.`);
    return { id: `${projectId}:shot:${index + 1}`, sourceClipId: asset.id, name: asset.name || shot.slot,
      contentHash: asset.contentHash, storagePath: asset.storagePath, url: asset.url,
      startRequest: start, endRequest: start + shot.duration, duration: shot.duration, sourceDuration: asset.duration,
      transitionIn: index === recipe.sequence.length - 1 ? "soft_dip" : "clean_cut",
      transitionOut: "clean_cut", transitionDuration: index === recipe.sequence.length - 1 ? .125 : .04 };
  });
  const portrait = aspect === "9:16";
  const overlays = recipe.titles.flatMap(title => {
    const words = title.slot ? bindings[title.slot] : title.literal;
    const text = title.line === undefined ? words : words.split("\n")[title.line];
    if (!text) return [];
    return [{ id: `${projectId}:${title.id}`, type: "text", name: title.id, text,
      x: title.x, y: title.y, anchorX: title.align === "center" ? 50 : 0, anchorY: 50,
      width: portrait ? 80 : 36, fontFamily: "Inter", fontWeight: title.weight || 900,
      textAlign: title.align || "left", color: title.colour === "brand" ? bindings.brandColour : "#ffffff",
      bg: "transparent", shadow: "strong", scale: title.scale * (portrait ? (title.portraitScale ?? .52) : 1), opacity: 1,
      rotation: 0, startTime: title.start, duration: title.duration,
      animation: { enter: "none", exit: "none" } }];
  });
  const logo = bindings.logo;
  overlays.push({ id: `${projectId}:logo`, type: "image", name: "Brand logo", src: logo.url,
    sourceMediaId: logo.id, storagePath: logo.storagePath, contentHash: logo.contentHash,
    mediaFit: "contain", opacity: 1, scale: 1, rotation: 0, ...recipe.logo });
  overlays[overlays.length - 1].startTime = recipe.logo.start;
  delete overlays[overlays.length - 1].start;
  const motionKeyframes = overlays.flatMap(layer => {
    const start = layer.startTime, end = start + layer.duration;
    const key = (property, time, value, easing = "bezier") => ({
      id: `${layer.id}:${property}:${Math.round(time * 90000)}`, targetId: layer.id,
      property, time, value, easing, curve: recipe.animation.curve });
    return [key("opacity", start, 0), key("opacity", start + recipe.animation.enterSeconds, 1),
      key("opacity", end - recipe.animation.exitSeconds, 1, "linear"), key("opacity", end, 0, "linear"),
      key("scale", start, layer.scale * (1 + .12 * intensity)),
      key("scale", start + recipe.animation.settleSeconds, layer.scale),
      key("y", start, layer.y + 1.6 * intensity), key("y", start + recipe.animation.enterSeconds, layer.y)];
  });
  let programmeTime = 0;
  recipe.sequence.forEach((shot, index) => {
    if (shot.scale !== undefined) motionKeyframes.push({
      id: `${projectId}:shot-scale:${index}`, targetId: "main-video", property: "scale",
      time: programmeTime, value: shot.scale, easing: "hold",
    });
    programmeTime += shot.duration;
  });
  const media = [...new Map([...template.inputSlots].sort((a, b) =>
    Number(b.type === "video") - Number(a.type === "video")).filter(slot => ["video", "image", "audio"].includes(slot.type))
    .map(slot => [bindings[slot.id].id, copy(bindings[slot.id])])).values()];
  const metadata = { schemaVersion: 1, templateRef: copy(templateRef), ownerUid,
    instantiatedBy: actor, bindings: Object.fromEntries(template.inputSlots.map(slot => [slot.id,
      typeof bindings[slot.id] === "string" ? bindings[slot.id]
        : { assetId: bindings[slot.id].id, contentHash: bindings[slot.id].contentHash,
          storagePath: bindings[slot.id].storagePath, trimStart: Number(bindings[slot.id].trimStart || 0) }])),
    intensity, aspect, qualified: false };
  const snapshot = { projectMedia: media, timeline, orderedClips: timeline.map(clip => ({ ...clip,
    start: clip.startRequest, end: clip.endRequest })), selectedClipId: timeline[0].id,
    reframeAspect: aspect, smartCrop: portrait && !!recipe.framing,
    smartCropMode: portrait && recipe.framing ? recipe.framing.mode : "off",
    ...(portrait && recipe.framing ? { reframeKeyframes: copy(recipe.framing.positions) } : {}), videoFit: "cover",
    mainTransform: { id: "main-video", type: "video", x: 50, y: 50, scale: 1, rotation: 0, opacity: 1 },
    mainFrame: { enabled: false }, overlays, motionKeyframes, motionScenes: [], threeDScenes: [],
    speedKeyframes: [], previewSpeed: 1, autoCaptions: false, captionSegments: [],
    addHook: false, brandWatermark: false, muteOriginalAudio: true,
    addMusic: true, musicTrack: { ...copy(bindings.music), volume: recipe.music.volume,
      fadeIn: recipe.music.fadeIn, fadeOut: recipe.music.fadeOut, loop: false }, musicVolume: recipe.music.volume,
    musicLoop: false, musicFadeIn: recipe.music.fadeIn, musicFadeOut: recipe.music.fadeOut,
    musicDucking: false, musicDuckingStrength: 0,
    soundEffects: recipe.soundCues.map((cue, index) => ({ id: `${projectId}:sound:${index}`,
      builtIn: true, enabled: true, kind: "sfx", tone: cue.tone, name: cue.tone,
      startTime: cue.time, duration: cue.duration, volume: cue.volume, fadeIn: .01, fadeOut: .04 })),
    audioKeyframes: {}, trackStates: {}, creativeTemplateInstance: metadata,
    exportSettings: { resolution, fps: 24, codec: "h264", audioCodec: "aac", audioBitrate: "256" } };
  const document = adaptStudioSnapshotToDocument({ snapshot, projectId });
  return { projectId, ownerUid, templateRef: copy(templateRef), document,
    snapshot: { ...projectStudioEditableStateToSnapshot(document, snapshot), studioDocument: document } };
}
