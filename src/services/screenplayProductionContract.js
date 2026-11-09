const crypto = require('crypto');
const { ID, SHA, STORY_FIELDS, digest, error, validateDirection } = require('./contentFactoryContract');
const text = (value, max = 4000) => typeof value === 'string' && value.trim() && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const canonical = value => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
const sourceHash = value => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const entityId = (kind, name) => `${kind}_${sourceHash(canonical(name)).slice(0, 20)}`;

function importScreenplay(input) {
  if (!input || typeof input !== 'object' || Object.keys(input).some(k => !['requestId', 'title', 'format', 'text'].includes(k)) ||
      !ID.test(input.requestId || '') || !['fountain', 'plain_text'].includes(input.format) ||
      !text(input.text, 256000) || Buffer.byteLength(input.text, 'utf8') > 256000 ||
      (input.title !== undefined && !text(input.title, 160))) throw error('SCREENPLAY_INPUT_INVALID');
  const source = { text: input.text, sha256: sourceHash(input.text), format: input.format, offsetUnit: 'utf16_code_units' };
  const lines = [...input.text.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)].filter(m => m.index < input.text.length)
    .map(m => ({ text: m[1], start: m.index, end: m.index + m[0].length }));
  const headings = [];
  lines.forEach((line, index) => {
    const m = line.text.trim().match(/^\.?((?:INT\.?\s*\/\s*EXT\.?|I\/E\.?|INT\.?|EXT\.?))\s+(.+?)(?:\s+-\s+([^\n]+))?\s*(?:#[^#]+#)?$/i);
    if (m) headings.push({ index, line, interiorExterior: m[1].toUpperCase(), location: m[2].replace(/\s*#[^#]+#\s*$/, '').trim(), timeOfDay: (m[3] || 'UNSPECIFIED').replace(/\s*#[^#]+#\s*$/, '').trim() });
  });
  if (!headings.length || headings.length > 180) throw error('SCREENPLAY_SCENE_HEADINGS_REQUIRED');
  const characters = new Map(), locations = new Map();
  const scenes = headings.map((heading, i) => {
    const start = heading.line.start, end = headings[i + 1]?.line.start ?? input.text.length;
    if (end - start > 16000) throw error('SCREENPLAY_SCENE_TOO_LARGE');
    const sceneId = `scene_${String(i + 1).padStart(3, '0')}_${sourceHash(heading.line.text).slice(0, 8)}`;
    const locationId = entityId('location', heading.location);
    locations.set(locationId, { entityId: locationId, kind: 'location', name: heading.location, origin: 'script_heading', sourceSha256: source.sha256 });
    const rows = lines.slice(heading.index + 1, headings[i + 1]?.index ?? lines.length);
    const blocks = [], dialogueUnits = [];
    let omittedBlock = null;
    for (let at = 0; at < rows.length; at++) {
      const line = rows[at], content = line.text.trim();
      if (omittedBlock) { if(content.includes(omittedBlock))omittedBlock=null; continue; }
      if(content.startsWith('[[')||content.startsWith('/*')) {
        const endMarker=content.startsWith('[[')?']]':'*/';
        if(!content.includes(endMarker))omittedBlock=endMarker;
        continue;
      }
      if (!content) continue;
      const forced = content.startsWith('@');
      const cue = content.replace(/^@/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      const next = rows[at + 1]?.text.trim();
      const isCue = forced || (cue.length <= 50 && /\p{L}/u.test(cue) && cue === cue.toUpperCase() &&
        !/[!?:]|\.$/.test(cue) && next && (at === 0 || !rows[at - 1].text.trim()));
      if (isCue && cue) {
        const characterId = entityId('character', cue);
        characters.set(characterId, { entityId: characterId, kind: 'character', name: cue, origin: 'script_dialogue_cue', sourceSha256: source.sha256 });
        const first = at + 1; let last = first;
        while (last < rows.length && rows[last].text.trim()) last++;
        const spoken = rows.slice(first, last).filter(r => !/^\([^)]*\)$/.test(r.text.trim()));
        if (!spoken.length) throw error('SCREENPLAY_EMPTY_DIALOGUE');
        const unit = { dialogueUnitId: `${sceneId}_dialogue_${dialogueUnits.length + 1}`, characterId, speaker: cue,
          text: spoken.map(r => r.text.trim()).join('\n'), sourceRef: { sourceSha256: source.sha256, start: rows[first].start, end: rows[last - 1].end },
          lineRefs: spoken.map(r => ({ start: r.start, end: r.start + r.text.length, quote: r.text })), origin: 'scripted', status: 'requires_generated_audio' };
        dialogueUnits.push(unit); blocks.push({ kind: 'dialogue', ...unit }); at = last - 1;
      } else blocks.push({ kind: /TO:\s*$/.test(content) ? 'transition' : 'action', text: content.replace(/^!/, ''),
        sourceRef: { sourceSha256: source.sha256, start: line.start, end: line.start + line.text.length } });
    }
    return { sceneId, ordinal: i + 1, heading: heading.line.text.trim(), locationId, interiorExterior: heading.interiorExterior,
      timeOfDay: heading.timeOfDay, sourceRef: { sourceSha256: source.sha256, start, end }, blocks, dialogueUnits, status: 'needs_scene_analysis' };
  });
  return { schemaVersion: 1, title: input.title?.trim() || 'Untitled screenplay', source, scenes,
    entities: [...characters.values(), ...locations.values()], continuity: [],
    warnings: headings[0].line.start ? ['Text before the first scene heading is retained in the source; verify title-page or unassigned action.'] : [],
    goal: 'Generate and automatically assemble scenes from the screenplay. Recorded or multicamera footage is not required.' };
}

function quoteRef(screenplay, scene, quote) {
  if (!text(quote, 2000)) throw error('SCREENPLAY_SOURCE_QUOTE_INVALID');
  const part = screenplay.source.text.slice(scene.sourceRef.start, scene.sourceRef.end), offset = part.indexOf(quote);
  if (offset < 0) throw error('SCREENPLAY_UNGROUNDED_SOURCE');
  return { sourceSha256: screenplay.source.sha256, start: scene.sourceRef.start + offset, end: scene.sourceRef.start + offset + quote.length, quote };
}

function validateScenePlan(screenplay, scene, plan) {
  if (!plan || plan.sceneId !== scene.sceneId || plan.sourceSha256 !== screenplay.source.sha256 || !text(plan.summary, 2000) ||
      STORY_FIELDS.some(k => Array.isArray(plan.story?.[k]) ? !plan.story[k].length || plan.story[k].some(v => !text(v, 1024)) : !text(plan.story?.[k], 3000)) ||
      !Array.isArray(plan.shots) || !plan.shots.length || plan.shots.length > 20 || !Array.isArray(plan.props) || plan.props.length > 30 ||
      !Array.isArray(plan.characterDesigns) || plan.characterDesigns.length > 20 || !Array.isArray(plan.continuity) || plan.continuity.length > 60)
    throw error('SCREENPLAY_SCENE_PLAN_INVALID');
  const entities = new Map(screenplay.entities.map(e => [e.entityId, { ...e }]));
  for (const prop of plan.props) {
    if (!text(prop.name, 160)) throw error('SCREENPLAY_PROP_INVALID');
    const evidence = quoteRef(screenplay, scene, prop.sourceQuote);
    if (!entities.has(entityId('prop', prop.name)) && !canonical(prop.sourceQuote).includes(canonical(prop.name))) throw error('SCREENPLAY_UNGROUNDED_PROP');
    const id = entityId('prop', prop.name); entities.set(id, { entityId: id, kind: 'prop', name: prop.name, sourceRef: evidence, origin: 'script_grounded_model_breakdown' });
  }
  for (const design of plan.characterDesigns) {
    const id = entityId('character', design.name || ''); let existing = entities.get(id);
    if (!text(design.name, 80) || !text(design.description, 1200) || !['script_fact', 'creative_choice'].includes(design.origin)) throw error('SCREENPLAY_CHARACTER_DESIGN_INVALID');
    if(!existing) {
      if(!text(design.sourceQuote,2000) || !canonical(design.sourceQuote).includes(canonical(design.name))) throw error('SCREENPLAY_UNGROUNDED_CHARACTER');
      existing={entityId:id,kind:'character',name:design.name,origin:'script_grounded_model_breakdown'};
    }
    if (existing.designHash && existing.designHash !== digest(design.description)) throw error('SCREENPLAY_CHARACTER_DESIGN_CHANGED', 409);
    const sourceRef = quoteRef(screenplay, scene, design.sourceQuote);
    entities.set(id, { ...existing, design: design.description, designHash: digest(design.description), designOrigin: design.origin, designSourceRef: sourceRef });
  }
  const names = new Map();
  for(const entity of entities.values()){
    const name=canonical(entity.name);
    if(names.has(name)&&names.get(name)!==entity.entityId)throw error('SCREENPLAY_ENTITY_NAME_AMBIGUOUS');
    names.set(name,entity.entityId);
  }
  const shotIds = new Set(), dialogueSeen = new Set(), dialogue = new Map(scene.dialogueUnits.map(d => [d.dialogueUnitId, d]));
  const shots = plan.shots.map(shot => {
    if (!ID.test(shot.shotId || '') || shotIds.has(shot.shotId) || !text(shot.action, 2000) || !text(shot.reason, 1000) ||
        !text(shot.camera, 400) || !text(shot.framing, 200) || !Number.isFinite(shot.duration) || shot.duration < .5 || shot.duration > 121 / 24 ||
        !Array.isArray(shot.entityNames) || shot.entityNames.length > 16 || !Array.isArray(shot.dialogueUnitIds)) throw error('SCREENPLAY_SHOT_INVALID');
    shotIds.add(shot.shotId); const entityIds = shot.entityNames.map(name => names.get(canonical(name)));
    if (entityIds.some(id => !id)) throw error('SCREENPLAY_SHOT_UNKNOWN_ENTITY');
    for (const id of shot.dialogueUnitIds) {
      if (!dialogue.has(id) || dialogueSeen.has(id) || !entityIds.includes(dialogue.get(id).characterId)) throw error('SCREENPLAY_DIALOGUE_ASSIGNMENT_INVALID');
      dialogueSeen.add(id);
    }
    return { ...shot, entityIds, sourceRef: quoteRef(screenplay, scene, shot.sourceQuote), origin: 'creative_shot_plan', status: 'requires_generation',
      requiredAssets: [{ kind: 'video', status: 'requires_generation' }, ...shot.dialogueUnitIds.map(id => ({ kind: 'dialogue_audio', dialogueUnitId: id, text: dialogue.get(id).text, status: 'requires_generation_and_alignment' }))] };
  });
  if (dialogueSeen.size !== dialogue.size) throw error('SCREENPLAY_DIALOGUE_OMITTED');
  if (shots.reduce((n, s) => n + s.duration, 0) > 120) throw error('SCREENPLAY_SCENE_EDIT_TOO_LONG');
  const states = new Map((screenplay.continuity || []).map(s => [`${s.entityId}:${s.key}`, s]));
  const continuity = plan.continuity.map(state => {
    const id = names.get(canonical(state.entityName || ''));
    if (!id || !['appearance', 'wardrobe', 'prop_material', 'prop_state', 'screen_direction', 'time_of_day'].includes(state.key) ||
        !text(state.value, 300) || typeof state.intentionalChange !== 'boolean') throw error('SCREENPLAY_CONTINUITY_INVALID');
    const prior = states.get(`${id}:${state.key}`), sourceRef = quoteRef(screenplay, scene, state.sourceQuote);
    if (prior && canonical(prior.value) !== canonical(state.value) && !state.intentionalChange) throw error('SCREENPLAY_CONTINUITY_CONFLICT', 409);
    const result = { ...state, entityId: id, sceneId: scene.sceneId, sourceRef, origin: 'planned_requirement',
      previousValue: prior?.value || null, status: 'requires_visual_verification' };
    states.set(`${id}:${state.key}`, result); return result;
  });
  const normalized = { ...plan, shots, continuity, entityBibleHash: digest([...entities.values()]), dialogueUnits: scene.dialogueUnits, origin: 'model_generated_scene_plan',
    limitation: 'A plan establishes intended continuity. Generated pixels and dialogue audio require separate verification; planning is not a finished movie.' };
  return { ...normalized, planHash: digest(normalized), entities: [...entities.values()] };
}

function compileSceneDirection({ screenplay, scene, plan }) {
  // The first execution qualification is deliberately dialogue-free. Dialogue
  // remains explicit in the plan rather than being dropped or given guessed
  // timings. A later audio-alignment stage must qualify those scene jobs.
  if (scene.dialogueUnits.length) throw error('SCREENPLAY_DIALOGUE_ALIGNMENT_REQUIRED', 409);
  if (plan.shots.some(s => s.entityIds.some(id => id.startsWith('character_')))) throw error('SCREENPLAY_CHARACTER_REFERENCES_REQUIRED', 409);
  const assets = plan.shots.map((shot, i) => ({ assetId: `${scene.sceneId}_shot_${i + 1}`, type: 'video', beatId: `shot_${i + 1}`,
    provider: 'wan', duration: 121 / 24, seed: parseInt(plan.planHash.slice(0, 8), 16) + i, prompt: `${shot.action}\nFraming: ${shot.framing}. Camera: ${shot.camera}.\nStory reason: ${shot.reason}.\nContinuity: ${JSON.stringify(plan.continuity)}.`,
    reason: shot.reason, acceptanceCriteria: ['The assigned scripted action and entities are visible.', 'Geometry and motion remain coherent.', 'The image satisfies the stated continuity requirements.'] }));
  const length=plan.shots.reduce((n,s)=>n+s.duration,0),scoreId=`${scene.sceneId}_score`;
  assets.push({assetId:scoreId,type:'audio',beatId:'shot_1',provider:'original_audio',duration:length,seed:parseInt(plan.planHash.slice(0,8),16),
    prompt:'A private baseline original score; final scene sound must earn its place in review.',reason:'Ensure the assembled scene has a separately editable audio source.',acceptanceCriteria:['Audible non-clipped stereo audio.']});
  return validateDirection({ schemaVersion: 1, mode: 'screenplay_scene', title: `${screenplay.title}: ${scene.heading}`.slice(0,160), story: plan.story,
    script: plan.shots.map((s, i) => ({ beatId: `shot_${i + 1}`, action: s.action, sound: 'Generate and qualify scene sound in a separate asset stage.' })), assets,
    outputs: [{ outputId: scene.sceneId, aspect: '16:9', purpose: plan.summary.slice(0,1000), musicAssetId:scoreId,musicVolume:.4,
      sequence: plan.shots.map((s, i) => ({ assetId: assets[i].assetId, start: 0, duration: Math.min(s.duration, 121 / 24), reason: s.reason })) }] });
}

module.exports = { importScreenplay, validateScenePlan, compileSceneDirection, quoteRef, entityId, sourceHash };
