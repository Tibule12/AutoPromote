import { validateStudioPerspective } from "./studioPerspective";

const fullMask = { enabled: false, shape: "rectangle", feather: 0, inverted: false };
const finite = (v, a, b) => typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
export function directorCompositionContext(snapshot, brief, duration) {
  const doc = snapshot.studioDocument,
    seconds = (doc?.outputTimeMap?.at(-1)?.outputRange.endTick || 0) / 90000;
  if (!doc || !finite(duration, 2, Math.min(30, seconds)))
    throw Error("Choose 2–30 seconds within this project.");
  if (typeof brief !== "string" || !brief.trim() || brief.length > 1200)
    throw Error("Describe the edit in at most 1,200 characters.");
  const media = (snapshot.projectMedia || [])
    .filter(
      m =>
        m.status === "ready" &&
        m.storagePath &&
        m.url &&
        m.duration >= 0.5 &&
        /^[a-f0-9]{64}$/.test(m.contentHash || "") &&
        m.type !== "image"
    )
    .slice(0, 12)
    .map(m => ({
      id: m.id,
      name: String(m.name || "Project clip").slice(0, 160),
      duration: Number(m.duration),
      contentHash: m.contentHash,
    }));
  if (!media.length) throw Error("Save a project video before asking the Director.");
  return {
    compositionVersion: 2,
    brief: brief.trim(),
    projectId: doc.projectId,
    baseRevision: doc.revision,
    duration,
    media,
  };
}

// Small, hash-bound decoded samples, not semantic recognition. URLs and source
// bytes remain in the browser; only measured descriptors go to the local model.
export async function measureDirectorSources(context, snapshot, signal) {
  const evidence = [];
  let inspectedBytes = 0;
  for (const source of context.media) {
    signal?.throwIfAborted();
    const media = snapshot.projectMedia.find(m => m.id === source.id),
      response = await fetch(media.url, { signal });
    if (!response.ok) throw Error("Could not inspect a saved clip. No plan was requested.");
    const declared = Number(response.headers.get("content-length"));
    if (declared > 128 * 1024 * 1024)
      throw Error("Director inspection currently supports clips up to 128 MiB.");
    const reader = response.body.getReader(),
      chunks = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (inspectedBytes + length > 256 * 1024 * 1024)
          throw Error("Director inspection currently supports up to 256 MiB per project.");
        if (length > 128 * 1024 * 1024)
          throw Error("Director inspection currently supports clips up to 128 MiB.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    inspectedBytes += length;
    const blob = new Blob(chunks),
      bytes = await blob.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), v =>
      v.toString(16).padStart(2, "0")
    ).join("");
    if (digest !== source.contentHash)
      throw Error("Saved clip bytes changed. Save the source again before directing.");
    const url = URL.createObjectURL(blob),
      video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    const wait = (event, action) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(Error("Source sample decode timed out.")), 15000);
        const stop = () => finish(signal.reason || Error("Inspection cancelled."));
        const done = () => finish();
        const failed = () => finish(Error("A saved source could not be decoded."));
        function finish(error) {
          clearTimeout(timer);
          video.removeEventListener(event, done);
          video.removeEventListener("error", failed);
          signal?.removeEventListener("abort", stop);
          error ? reject(error) : resolve();
        }
        video.addEventListener(event, done, { once: true });
        video.addEventListener("error", failed, { once: true });
        signal?.addEventListener("abort", stop, { once: true });
        action();
      });
    try {
      await wait("loadeddata", () => {
        video.src = url;
        video.load();
      });
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 54;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      let previous = null;
      const samples = [];
      for (const fraction of [0.15, 0.5, 0.85]) {
        signal?.throwIfAborted();
        const time = Math.min(video.duration - 0.05, source.duration * fraction);
        await wait("seeked", () => {
          video.currentTime = time;
        });
        ctx.drawImage(video, 0, 0, 96, 54);
        const pixels = ctx.getImageData(0, 0, 96, 54).data;
        const rgb = [0, 0, 0],
          bins = new Array(16).fill(0);
        let luma = 0,
          change = 0,
          wx = 0,
          wy = 0;
        for (let p = 0; p < pixels.length; p += 4) {
          const y = 0.2126 * pixels[p] + 0.7152 * pixels[p + 1] + 0.0722 * pixels[p + 2];
          luma += y;
          for (let c = 0; c < 3; c++) rgb[c] += pixels[p + c];
          bins[Math.min(15, Math.floor(y / 16))]++;
          if (previous) {
            const d = Math.abs(y - previous[p / 4]);
            change += d;
            wx += (d * ((p / 4) % 96)) / 96;
            wy += (d * Math.floor(p / 4 / 96)) / 54;
          }
        }
        const count = 96 * 54,
          mean = rgb.map(v => Math.round(v / count)),
          entropy = -bins.reduce((n, b) => (b ? n + (b / count) * Math.log2(b / count) : n), 0);
        samples.push({
          time: Math.round(time * 1000) / 1000,
          meanRgb: mean,
          luma: Math.round(luma / count),
          tonalEntropy: Number(entropy.toFixed(2)),
          frameDifference: previous ? Number((change / count).toFixed(2)) : 0,
          motionCentroid: change
            ? [Number(((100 * wx) / change).toFixed(1)), Number(((100 * wy) / change).toFixed(1))]
            : [50, 50],
        });
        previous = Array.from(
          { length: count },
          (_, p) => 0.2126 * pixels[p * 4] + 0.7152 * pixels[p * 4 + 1] + 0.0722 * pixels[p * 4 + 2]
        );
      }
      evidence.push({
        id: source.id,
        contentHash: digest,
        method: "decoded_rgb_96x54_three_samples_v1",
        samples,
      });
    } finally {
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    }
  }
  return { ...context, pixelEvidence: evidence };
}

export function compileDirectorComposition(result, snapshot) {
  const context = directorCompositionContext(snapshot, result.brief, result.duration);
  if (
    result.version !== 2 ||
    result.projectId !== context.projectId ||
    result.baseRevision !== context.baseRevision ||
    !/^[a-f0-9]{64}$/.test(result.fingerprint || "") ||
    result.provenance?.automaticModelPlanning !== true
  )
    throw Error("The project changed or the Director proposal is invalid. Ask for a new plan.");
  if (
    result.sourceEvidence?.length !== context.media.length ||
    new Set(result.sourceEvidence.map(s => s.id)).size !== context.media.length ||
    result.sourceEvidence.some(
      s => !context.media.some(m => m.id === s.id && m.contentHash === s.contentHash)
    )
  )
    throw Error("The project footage changed after planning.");
  const graph = result.composition;
  if (
    !graph ||
    !Array.isArray(graph.layers) ||
    graph.layers.length < 1 ||
    graph.layers.length > 16 ||
    typeof graph.name !== "string" ||
    !graph.name.trim() ||
    graph.name.length > 100
  )
    throw Error("Invalid Director composition.");
  const ids = new Set(),
    actions = [],
    graphics = [],
    reports = [];
  let actionCount = 0;
  const add = a => {
    actions.push(a);
    if (++actionCount > 64) throw Error("Director composition exceeds the scene action limit.");
  };
  for (const node of graph.layers) {
    if (
      typeof node.id !== "string" ||
      !/^[a-zA-Z][\w-]{0,39}$/.test(node.id) ||
      ids.has(node.id) ||
      !["video", "shape", "rig"].includes(node.kind) ||
      !finite(node.start, 0, context.duration) ||
      !finite(node.end, node.start + 0.05, context.duration)
    )
      throw Error("Invalid Director layer or timing.");
    ids.add(node.id);
    if (!Array.isArray(node.poses) || !node.poses.length || node.poses.length > 10)
      throw Error("Director layer needs bounded motion poses.");
    const properties = ["x", "y", "scale", "rotation", "opacity"];
    let previous = -1;
    const keys = [];
    for (const pose of node.poses) {
      if (
        !finite(pose.at, node.start, node.end) ||
        pose.at <= previous ||
        !finite(pose.x, -100, 200) ||
        !finite(pose.y, -100, 200) ||
        !finite(pose.scale, node.kind === "shape" ? 0.1 : 0.02, 4) ||
        !finite(pose.rotation, -360, 360) ||
        !finite(pose.opacity, 0, 1)
      )
        throw Error("Invalid Director motion pose.");
      previous = pose.at;
      for (const p of properties)
        keys.push({
          property: p,
          time: pose.at,
          value: pose[p] * (p === "scale" && node.kind === "video" ? 10 / 7 : 1),
          easing: "bezier",
          curve: [0.65, 0, 0.35, 1],
        });
    }
    const pose = node.poses[0],
      transform = Object.fromEntries(
        properties.map(p => [p, pose[p] * (p === "scale" && node.kind === "video" ? 10 / 7 : 1)])
      );
    const mask =
      node.shape === "ellipse"
        ? { enabled: true, shape: "ellipse", feather: 0, inverted: false }
        : node.shape === "polygon"
          ? { enabled: true, shape: "polygon", path: node.polygon, feather: 0, inverted: false }
          : fullMask;
    if (node.kind === "video") {
      const media = context.media.find(m => m.id === node.sourceMediaId);
      if (
        !media ||
        !finite(node.sourceStart, 0, media.duration) ||
        node.sourceStart + node.end - node.start > media.duration + 0.001
      )
        throw Error("Director layer runs past its saved source.");
      if (node.perspective) {
        validateStudioPerspective(node.perspective);
        if (mask.enabled) throw Error("A perspective plane cannot also have a shape mask.");
      }
      add({
        type: "media_plane",
        id: node.id,
        name: node.name || node.id,
        sourceMediaId: media.id,
        sourceStart: node.sourceStart,
        startTime: node.start,
        duration: node.end - node.start,
        transform,
        mask,
        ...(node.perspective ? { perspective: node.perspective } : {}),
      });
      reports.push({
        startTime: node.start,
        endTime: node.end,
        sourceName: media.name,
        treatment: node.name || "Video layer",
        reason: node.reason || graph.concept || "",
      });
    } else if (node.kind === "rig")
      add({
        type: "null",
        id: node.id,
        name: node.name || node.id,
        startTime: node.start,
        duration: node.end - node.start,
        transform,
      });
    else {
      if (!/^#[\da-f]{6}$/i.test(node.color || ""))
        throw Error("Director shape colour is invalid.");
      const shape =
        node.shape === "ellipse"
          ? `<ellipse cx="640" cy="360" rx="360" ry="360" fill="${node.color}"/>`
          : `<rect width="1280" height="720" fill="${node.color}"/>`;
      graphics.push({
        id: node.id,
        name: node.name || node.id,
        type: "artwork",
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">${shape}</svg>`,
        startTime: node.start,
        duration: node.end - node.start,
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        scale: 1,
        rotation: 0,
        opacity: 1,
        ...(node.shape === "polygon" ? { mask } : {}),
        keys,
      });
    }
    if (node.kind !== "shape") add({ type: "keys", targetId: node.id, keys });
  }
  // Resolve edges only after every node exists. Shared scene actions validate
  // cycles, matte ownership/coverage and supported masks before any mutation.
  for (const node of graph.layers) {
    if (node.parentId) {
      if (!ids.has(node.parentId)) throw Error("Missing Director parent.");
      add({ type: "parent", targetId: node.id, parentId: node.parentId });
    }
    if (node.matteId) {
      if (
        !ids.has(node.matteId) ||
        !["alpha", "alpha_inverted", "luma", "luma_inverted"].includes(node.matteMode)
      )
        throw Error("Invalid Director matte.");
      add({ type: "matte", targetId: node.id, matteSourceId: node.matteId, mode: node.matteMode });
    }
  }
  // Graphics are prepared before video actions; restore the model's declared
  // back-to-front ordering through the same ordinary composition-order action.
  for (let i = graph.layers.length - 2; i >= 0; i--)
    add({ type: "move_layer", targetId: graph.layers[i].id, beforeId: graph.layers[i + 1].id });
  const plan = {
    format: "autopromote-scene-actions",
    version: 1,
    projectId: context.projectId,
    baseRevision: context.baseRevision,
    name: graph.name,
    actions,
  };
  if (graphics.length)
    plan.graphics = {
      format: "autopromote-graphics",
      version: 1,
      name: graph.name,
      width: 1280,
      height: 720,
      duration: context.duration,
      layers: graphics,
      groups: [],
    };
  return { plan, shots: reports, concept: graph.concept };
}
