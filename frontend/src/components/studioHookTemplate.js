// Hook recipes resolve to the same ordinary Studio adapter as launch edits.
// This module selects authored decisions; it never draws or renders a movie.
const fail = message => { throw Object.assign(new Error(message), { code: 'TEMPLATE_HOOK_INVALID' }); };
const clone = value => JSON.parse(JSON.stringify(value));
export function resolveStudioTemplateRecipe(template, variationId) {
  const base = template.executionDefinition;
  if (!base?.hook) return base;
  const variants = base.variations || [];
  const variation = variants.find(row => row.id === (variationId || base.defaultVariation));
  if (!variation) fail('Choose a supported hook variation.');
  const recipe = { ...base, ...clone(variation.overrides || {}) };
  if (!Array.isArray(recipe.sequence) || recipe.sequence.length < 2 || recipe.sequence.length > 48)
    fail('A hook needs an editable footage sequence.');
  const duration = recipe.sequence.reduce((sum, shot) => sum + shot.duration, 0);
  if (Math.abs(duration * 90000 - template.durationTicks) > 1 ||
      recipe.sequence.some(shot => !Number.isFinite(shot.offset) || shot.offset < 0 ||
        !Number.isFinite(shot.duration) || shot.duration < 1 / 24 || shot.duration > 30 ||
        !template.inputSlots.some(slot => slot.id === shot.slot && slot.type === 'video')))
    fail('The authored hook has invalid source ranges or duration.');
  return { ...recipe, variationId: variation.id };
}

// Bind supplied source captions, not invented speech, to the actual footage.
// The shared source/occurrence projection handles reordered/repeated shots.
export function studioTemplateCaptions(transcripts, bindings, template, projectId) {
  const rows = [];
  if (!transcripts) return rows;
  if (typeof transcripts !== 'object' || Array.isArray(transcripts) || Object.keys(transcripts).length > 16)
    fail('Caption input must be grouped by a bound footage slot.');
  for (const [slot, cues] of Object.entries(transcripts)) {
    const asset = bindings[slot];
    if (!template.inputSlots.some(input => input.id === slot && input.type === 'video') || !asset ||
        !Array.isArray(cues) || cues.length > 500) fail('Captions need their bound source footage.');
    for (const [index, cue] of cues.entries()) {
      if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start ||
          cue.end > asset.duration || typeof cue.text !== 'string' || !cue.text.trim() || cue.text.length > 240 ||
          (/[<>]/.test(cue.text) || [...cue.text].some(character => character.charCodeAt(0) < 9))) fail('Check caption words and source timing.');
      rows.push({ id: `${projectId}:caption:${slot}:${index}`, sourceClipId: asset.id,
        start: cue.start, end: cue.end, text: cue.text.trim(),
        textReviewed: cue.textReviewed === true, textReviewRequired: cue.textReviewed !== true, reviewRequired: cue.reviewRequired === true,
        speaker: typeof cue.speaker === 'string' && /^[A-Za-z0-9 _-]{1,64}$/.test(cue.speaker) ? cue.speaker : 'unknown',
        translatedToEnglish: cue.translatedToEnglish === true,
        ...(cue.language ? { language: String(cue.language).slice(0, 32) } : {}) });
    }
  }
  if (rows.length > 1000) fail('Use at most 1000 source captions in one hook.');
  return rows;
}

export function studioTemplateVoiceClips(recipe, bindings, projectId) {
  return (recipe.voiceClips || []).flatMap((cue, index) => {
    const asset = bindings[cue.slot];
    if (!asset) return [];
    const sourceStart = Number(asset.trimStart || 0) + cue.sourceStart;
    const duration = cue.duration;
    if (!Number.isFinite(sourceStart) || sourceStart < 0 || !Number.isFinite(duration) || duration <= 0 ||
        sourceStart + duration > asset.duration || !Number.isFinite(cue.start) || cue.start < 0)
      fail('Narration needs the full selected source range.');
    return [{ id: `${projectId}:voice:${index}`, name: asset.name || 'Narration',
      enabled: true, url: asset.url, storagePath: asset.storagePath, sourceStoragePath: asset.storagePath,
      sourceMediaId: asset.id, contentHash: asset.contentHash, ownerUid: asset.ownerUid,
      trimStart: sourceStart, sourceDuration: asset.duration,
      startTime: cue.start, duration, volume: cue.volume ?? 1,
      fadeIn: cue.fadeIn ?? .015, fadeOut: cue.fadeOut ?? .04, playbackRate: 1 }];
  });
}

export function studioTemplateFraming(recipe, bindings, projectId) {
  if (!recipe.framing) return undefined;
  if (!recipe.hook) return clone(recipe.framing.positions);
  let time = 0;
  return recipe.sequence.map((shot, index) => {
    const position = [...recipe.framing.positions].reverse().find(row => row.time <= time) || { x: 50, y: 50, zoom: 1 };
    const focus = bindings[shot.slot]?.focus || {};
    if (Object.keys(focus).some(key => !['x', 'y', 'zoom'].includes(key))) fail('Use only source focus X/Y and zoom.');
    for (const [key, low, high] of [['x', 0, 100], ['y', 0, 100], ['zoom', 1, 3]])
      if (focus[key] !== undefined && (!Number.isFinite(focus[key]) || focus[key] < low || focus[key] > high))
        fail('Keep source focus inside the frame and zoom between 1 and 3.');
    const row = { ...clone(position), ...focus, id: `${projectId}:hook-frame:${index}`,
      time, cut: true, origin: 'manual' };
    time += shot.duration;
    return row;
  });
}

// A selected sentence may be longer or shorter than the authored example.
// Change its source interval, then move the existing editable downstream beats.
// This does not time-stretch dialogue or introduce another timeline engine.
export function materializeStudioHookRanges(recipe, bindings) {
  if (!recipe.hook || !recipe.sequence.some(shot => shot.fitRange && bindings[shot.slot]?.selectedEnd !== undefined)) return recipe;
  let before = 0, after = 0;
  const map = [], sequence = recipe.sequence.map(shot => {
    const asset = bindings[shot.slot]; let duration = shot.duration;
    if (shot.fitRange && asset?.selectedEnd !== undefined) {
      duration = asset.selectedEnd - Number(asset.trimStart || 0) - shot.offset;
      if (!Number.isFinite(duration) || duration < .25 || duration > 30 || asset.selectedEnd > asset.duration)
        fail('Choose a complete source range between 0.25 and 30 seconds.');
      // The existing renderer delivers a 24 fps template. Quantize each
      // selected sentence duration once so independent segment rounding
      // cannot accumulate into a missing final picture.
      duration = Math.round(duration * 24) / 24;
    }
    map.push({ start: before, end: before + shot.duration, target: after, duration });
    before += shot.duration; after += duration;
    return { ...shot, duration };
  });
  if (after > 90) fail('Keep the opening sequence within 90 seconds.');
  const at = time => {
    const row = map.find(item => time < item.end) || map.at(-1);
    return row.target + (time - row.start) / (row.end - row.start) * row.duration;
  };
  const range = row => ({ ...row, start: at(row.start), duration: at(row.start + row.duration) - at(row.start) });
  return { ...recipe, sequence, titles: recipe.titles.map(range), soundCues: recipe.soundCues.map(cue => ({ ...cue,
    time: at(cue.time), duration: at(cue.time + cue.duration) - at(cue.time) })),
    framing: { ...recipe.framing, positions: recipe.framing.positions.map(row => ({ ...row, time: at(row.time) })) },
    ...(recipe.sourceKeyframes ? { sourceKeyframes: recipe.sourceKeyframes.map(row => ({ ...row, time: at(row.time) })) } : {}),
    audioKeyframes: Object.fromEntries(Object.entries(recipe.audioKeyframes || {}).map(([bus, keys]) => [bus, keys.map(key => ({ ...key, time: at(key.time) }))])) };
}
