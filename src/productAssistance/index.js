'use strict';
// Bounded documentation assistance. Deliberately has no model, project, billing,
// render, publication or worker adapters. All answer facts come from public truth.
const { randomUUID } = require('node:crypto');
const { loadKnowledge, projectPublic, sha, textRecords } = require('../productKnowledge');
const MODES = ['EXPLAIN', 'GUIDE', 'DIAGNOSE'];
const PRIVATE = /(?:https?:\/\/|gs:\/\/|\/home\/|\/Users\/|C:\\|Bearer\s|(?:token|secret|password|api[_ -]?key)\s*[:=]|eyJ[a-zA-Z0-9_-]{15,}|-----BEGIN|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i;
const fail = code => Object.assign(new Error(code), { code, status: 400 });
const slug = id => id.replaceAll('.', '-');
const doc = p => `/api/product-assistance/docs/${p}`;
const AREA_PATH = { Studio: 'studio', Director: 'director', 'Cam Combiner': 'cam-combiner', 'Generated media': 'generated-media', Templates: 'templates', Publishing: 'publishing', Troubleshooting: 'troubleshooting' };
const featurePath = f => doc(['studio.keyframes', 'studio.transforms', 'studio.easing'].includes(f.feature_id) ? 'studio/motion-keyframes.md' :
  ['studio.three_d', 'studio.blender', 'creative.three_d'].includes(f.feature_id) ? '3d/index.md' : `${AREA_PATH[f.area] || 'studio'}/index.md`);
const taskPath = id => doc(`task-guides/${slug(id)}.md`);
const LOCATIONS = {
  'studio.keyframes': 'Studio → Motion → Transform keyframes',
  'studio.transforms': 'Studio → Motion → Transform keyframes',
  'studio.easing': 'Studio → Motion → Transform keyframes → select a key',
  'studio.compositing.text_behind_subject': 'Studio → Compositing → Subject effects',
  'studio.creator.text_behind_subject': 'Studio → Creator FX (placement study)',
  'studio.creator.tracking': 'Studio → Creator FX (placement study)',
  'studio.creator.object_cleanup': 'Studio → Creator FX (patch placement study)',
  'studio.captions': 'Studio → Captions',
  'studio.three_d': 'Studio → Motion → 3D Motion',
  'studio.blender': 'Studio → Motion → 3D Motion',
  'studio.templates': 'Studio → Media → creative template library',
  'generation.idea_to_video': 'Dashboard → Idea-to-Video',
};
const STATUS = {
  FUNCTIONAL: 'FUNCTIONAL: a scoped working path exists; this does not certify every combination or production readiness.',
  PARTIAL: 'PARTIAL: a supported subset exists, with missing or unqualified pieces. Check the limits before relying on it.',
  PROXY_ONLY: 'PROXY_ONLY: the visible control is a browser preview/placement study. It does not perform the real operation.',
  BROKEN: 'BROKEN: the documented automatic workflow has a known blocking defect. Do not treat it as working.',
  UNIMPLEMENTED: 'UNIMPLEMENTED: this capability is not currently available as a qualified product workflow.',
  PRO_READY: 'PRO_READY: use only the documented qualified scope.',
  PRODUCTION_READY: 'PRODUCTION_READY: use only the documented qualified scope.',
};
// Topic routing is independent of the evaluation questions. Aliases + weighted
// lexical retrieval handle other wording; graph expansion supplies dependencies.
const TOPICS = [
  [/\b(text|words?|typography)\b.*\b(behind|occlud)|\bbehind\b.*\b(person|someone|subject)/i, ['studio.compositing.text_behind_subject', 'studio.creator.text_behind_subject'], ['task.text_behind']],
  [/\b(cleanup|clean up|remove|erase|replace)\b.*\b(object|thing)|\bobject\b.*\b(cleanup|remov|eras|replac)/i, ['studio.creator.object_cleanup'], ['task.remove_object']],
  [/\b(track|tracking|tracked)\b/i, ['studio.tracking', 'studio.creator.tracking'], ['task.tracked_text']],
  [/\b(depth|parallax)\b/i, ['studio.compositing.depth_estimation', 'studio.compositing.mask_depth'], []],
  [/\b(revers|swapp|wrong speaker|other speaker)|\b(speaker|channel)\b.*\b(mapping|reversed|swapped)/i, ['cam_combiner.channel_mapping'], ['task.reversed_channels']],
  [/\b(cam combiner|podcast cameras?|switch.*cameras?|multicam|multi.camera)\b/i, ['cam_combiner.switching', 'cam_combiner.synchronization'], ['task.cam_combiner']],
  [/\bdirector\b/i, ['director.proposals', 'director.review'], ['task.director_manual']],
  [/\b(captions?|subtitles?|transcri)/i, ['studio.captions'], ['task.captions_correct']],
  [/\b(keyframes?|transform)\b/i, ['studio.keyframes'], []],
  [/\b(easing|bezier|acceleration)\b/i, ['studio.easing', 'studio.keyframes'], []],
  [/\b(image|photo|picture)\b.*\b(video|moving|motion|animate|animation)|\banimat\w*\b.*\b(image|photo|picture)\b/i, ['generation.image_to_video'], ['task.image_cinematic']],
  [/\b(idea.to.video|idea.*video)\b/i, ['generation.idea_to_video'], []],
  [/\b(logo|brand reveal)\b/i, ['creative.logo_brand', 'studio.three_d'], ['task.cinematic_logo']],
  [/\b3d\b/i, ['studio.three_d', 'studio.blender'], ['task.three_d_title']],
  [/\b(templates?|product launch)\b/i, ['studio.templates', 'creative.shared_templates'], ['task.use_template', 'task.product_launch']],
  [/\b(publish|post|schedule|tiktok|instagram|youtube|reddit|linkedin|facebook)\b/i, ['publishing.publish', 'publishing.connections', 'publishing.schedule'], []],
];
// Actual emitted codes, mapped to existing public documentation. No invented
// diagnosis: responses quote requirements/limits, not a claimed account cause.
const ERRORS = {
  MODEL_CAPABILITY_UNAVAILABLE: ['system.model_runtime', 'src/modelRuntime/contract.js'],
  MODEL_SUBJECT_MASK_REQUIRED: ['studio.masks', 'src/modelRuntime/studioAdapter.js'],
  MODEL_TRACK_MASK_REQUIRED: ['studio.tracking', 'src/modelRuntime/router.js'],
  TEMPLATE_IDENTITY_MISMATCH: ['studio.templates', 'frontend/src/components/studioCreativeTemplate.js'],
  TEMPLATE_OWNED_MEDIA_REQUIRED: ['studio.templates', 'frontend/src/components/studioCreativeTemplate.js'],
  TEMPLATE_FOOTAGE_TOO_SHORT: ['studio.templates', 'frontend/src/components/studioCreativeTemplate.js'],
  CREATIVE_TEMPLATE_VERSION_UNAVAILABLE: ['studio.templates', 'src/creativeTemplates/contract.js'],
  RENDER_TIMELINE_MISMATCH: ['studio.revision', 'frontend/src/components/studioRenderCompiler.js'],
  unsupported_platform: ['publishing.publish', 'src/services/platformPoster.js'],
  disabled_by_feature_flag: ['publishing.publish', 'src/services/platformPoster.js'],
};
// Existing legacy paths emit these exact safe messages rather than stable codes.
const BLOCK_MESSAGES = {
  'Generate an HQ 3D preview for every active 3D scene before exporting.': ['studio.blender', 'frontend/src/components/ViralClipStudio.js'],
  '3D preview is missing': ['studio.blender', 'src/services/studio3DService.js'],
  '3D preview is stale or not owned by this project': ['studio.blender', 'src/services/studio3DService.js'],
  '3D preview aspect ratio changed; generate a new preview': ['studio.blender', 'src/services/studio3DService.js'],
  'Generate and review captions before rendering.': ['studio.captions', 'frontend/src/components/ViralClipStudio.js'],
  'Review every flagged caption line before rendering.': ['studio.captions', 'frontend/src/components/ViralClipStudio.js'],
};
function validateRequest(input, book) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['question', 'mode', 'context'].includes(k))) throw fail('HELP_INPUT_INVALID');
  const { question, mode = 'EXPLAIN', context = {} } = input;
  if (typeof question !== 'string' || !question.trim() || question.length > 1000 || PRIVATE.test(question) || /[\x00-\x08]/.test(question)) throw fail('HELP_QUESTION_UNSAFE');
  if (!MODES.includes(mode)) throw fail('HELP_MODE_UNSUPPORTED');
  if (!context || typeof context !== 'object' || Array.isArray(context) || Object.keys(context).length > 8 || Object.keys(context).some(k => !['active_workspace_id', 'workspace_type', 'selected_feature_id', 'selected_tool', 'selected_media_type', 'capability_availability', 'error_code', 'error_message'].includes(k))) throw fail('HELP_CONTEXT_UNSAFE');
  for (const [key, value] of Object.entries(context)) {
    if (key === 'error_message') {
      if (typeof value !== 'string' || !value.trim() || value.length > 160 || !/^[a-zA-Z0-9 .;,'!?():_-]+$/.test(value) || PRIVATE.test(value)) throw fail('HELP_CONTEXT_UNSAFE');
    } else if (key === 'capability_availability') {
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 12 || Object.entries(value).some(([id, state]) => !book.features.some(f => f.feature_id === id) || !['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN'].includes(state))) throw fail('HELP_CONTEXT_UNSAFE');
    } else if (typeof value !== 'string' || value.length > 100 || !/^[a-zA-Z0-9_. -]+$/.test(value) || PRIVATE.test(value)) throw fail('HELP_CONTEXT_UNSAFE');
  }
  if (context.selected_feature_id && !book.features.some(f => f.feature_id === context.selected_feature_id)) throw fail('HELP_FEATURE_UNKNOWN');
  if (context.workspace_type && !['STUDIO', 'CAM_COMBINER', 'IDEA_VIDEO', 'PUBLISHING', 'DASHBOARD'].includes(context.workspace_type)) throw fail('HELP_CONTEXT_UNSAFE');
  if (context.selected_tool && !['motion', 'transform', 'composite', 'captions', '3d', 'templates', 'creatorfx', 'director', 'cam_combiner'].includes(context.selected_tool)) throw fail('HELP_CONTEXT_UNSAFE');
  if (context.selected_media_type && !['image', 'video', 'audio', 'none'].includes(context.selected_media_type)) throw fail('HELP_CONTEXT_UNSAFE');
  if (context.error_code && !/^[A-Za-z][A-Za-z0-9_]{1,79}$/.test(context.error_code)) throw fail('HELP_CONTEXT_UNSAFE');
  return { question: question.trim(), mode, context };
}
const STOP = new Set('how do i can what is the a an my to of for in on it this that does why me about auto promote autopromote please now next'.split(' '));
const tokens = text => [...new Set((text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(t => t.length > 2 && !STOP.has(t)))];
function lexical(question, book) {
  const qs = tokens(question);
  const records = textRecords(book);
  return records.map(r => {
    const title = (r.entry.name || r.entry.title || r.entry.label).toLowerCase();
    const all = tokens(r.text); const titleWords = tokens(title);
    const matches = qs.filter(t => all.some(w => w === t));
    const score = matches.reduce((n, t) => n + Math.log(1 + records.length / (1 + records.filter(x => tokens(x.text).includes(t)).length)) * (titleWords.includes(t) ? 5 : 1), 0);
    return { ...r, score, matches: matches.length };
  }).filter(r => r.score >= 5 && r.matches >= Math.min(2, qs.length)).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 5);
}
function resolve(question, context, book) {
  const features = [], tasks = [], controls = [];
  const add = (list, id) => { if (!list.includes(id)) list.push(id); };
  for (const [pattern, fs, ts] of TOPICS) if (pattern.test(question)) { fs.forEach(id => add(features, id)); ts.forEach(id => add(tasks, id)); }
  if (context.selected_feature_id && (!features.length || /^(what (do i do next|is this)|help|explain|guide me)[?!. ]*$/i.test(question))) {
    features.unshift(context.selected_feature_id);
  }
  if (!features.length) for (const r of lexical(question, book)) {
    if (r.kind === 'feature') add(features, r.id);
    if (r.kind === 'task') { add(tasks, r.id); r.entry.feature_ids.slice(0, 2).forEach(id => add(features, id)); }
    if (r.kind === 'control') { add(controls, r.id); r.entry.feature_ids.slice(0, 2).forEach(id => add(features, id)); }
  }
  const possibleCode = question.match(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/)?.[0];
  const error = context.error_code || context.error_message || Object.keys(BLOCK_MESSAGES).find(message => question === message) ||
    Object.keys(ERRORS).find(code => question.split(/\s+/).includes(code)) || (possibleCode && !Object.keys(STATUS).includes(possibleCode) ? possibleCode : null);
  const diagnostic = ERRORS[error] || BLOCK_MESSAGES[error];
  if (diagnostic) features.unshift(diagnostic[0]);
  const unique = [...new Set(features)].slice(0, 5);
  if (!tasks.length) book.tasks.filter(t => t.feature_ids.some(id => unique.includes(id))).slice(0, 3).forEach(t => add(tasks, t.task_id));
  tasks.forEach(id => book.tasks.find(t => t.task_id === id)?.control_ids.forEach(id => add(controls, id)));
  unique.forEach(id => book.features.find(f => f.feature_id === id)?.controls.forEach(id => add(controls, id)));
  return { features: unique, tasks: tasks.slice(0, 3), controls: controls.slice(0, 30), error };
}
function createAssistance({ internalBook, now = () => Date.now(), capacity = 256, journal } = {}) {
  internalBook ||= loadKnowledge().book;
  // Apply public projection even for injected test catalogues. The service never
  // retrieves from internal implementation evidence or internal-only features.
  const book = projectPublic(internalBook);
  const sourceHash = sha(Buffer.from(JSON.stringify(internalBook)));
  const receipts = new Map(), gaps = new Map();
  if (journal) {
    const retained = journal.read();
    for (const record of retained.receipts.slice(-capacity)) receipts.set(record.receipt_id, record);
    for (const record of retained.gaps.slice(-capacity)) gaps.set(record.gap_id, record);
  }
  const expire = map => { for (const [key, record] of map) if (now() - Date.parse(record.created_at) > 86400000) map.delete(key); };
  const retain = (map, id, value) => {
    expire(map);
    map.set(id, structuredClone(value));
    while (map.size > capacity) map.delete(map.keys().next().value);
  };
  function answer(input) {
    expire(receipts); expire(gaps);
    const { question, mode, context } = validateRequest(input, book);
    const matched = resolve(question, context, book);
    const unknownError = matched.error && !ERRORS[matched.error] && !BLOCK_MESSAGES[matched.error];
    const featureIds = matched.features;
    const primary = book.features.filter(f => featureIds.includes(f.feature_id)).sort((a, b) => featureIds.indexOf(a.feature_id) - featureIds.indexOf(b.feature_id));
    const dependencies = book.features.filter(f => primary.some(p => p.requires.includes(f.feature_id)));
    const gapReason = unknownError ? 'unknown_error_code' : !primary.length ? 'missing_or_ambiguous_feature_documentation' : null;
    const gap = gapReason ? { gap_id: randomUUID(), question, reason: gapReason, candidate_area: context.workspace_type || primary[0]?.area || 'unknown', product_knowledge_version: book.knowledge_version, error_code: unknownError ? matched.error : null, review_status: 'PENDING_REVIEW', created_at: new Date(now()).toISOString() } : null;
    if (gap) retain(gaps, gap.gap_id, gap);
    const selectedTasks = book.tasks.filter(t => matched.tasks.includes(t.task_id));
    const selectedControls = book.controls.filter(c => matched.controls.includes(c.control_id));
    const features = primary.map(f => {
      const reportedUnavailable = context.capability_availability?.[f.feature_id] === 'UNAVAILABLE' || f.requires.some(id => context.capability_availability?.[id] === 'UNAVAILABLE');
      const blocked = ['PROXY_ONLY', 'BROKEN', 'UNIMPLEMENTED'].includes(f.status);
      return {
        feature_id: f.feature_id, name: f.name, status: f.status, summary: f.summary,
        readiness_note: STATUS[f.status], location: LOCATIONS[f.feature_id] || `${f.area} workspace`,
        how_to_use: blocked || reportedUnavailable || unknownError ? [] : f.workflow,
        next_step: unknownError ? 'Share the error code with support; no documented cause is available.' : reportedUnavailable ? 'The supplied context reports a required capability unavailable. Check availability in the normal product workflow before continuing.' : f.status === 'PROXY_ONLY' ? 'Use this control only as a placement study; it cannot produce the real operation.' : f.status === 'UNIMPLEMENTED' ? 'This workflow is unavailable. Check related documented supported alternatives.' : f.status === 'BROKEN' ? 'Use the related guide only for its explicitly reviewed workaround; do not rely on the broken automatic result.' : f.workflow[0] || 'Review the documented prerequisites and limitations.',
        preview_behavior: f.preview_behavior, render_behavior: f.render_behavior,
        limitations: f.limitations, common_errors: mode === 'DIAGNOSE' && !unknownError && (!blocked || matched.error) ? f.common_errors.filter(e => !matched.error || e.condition === matched.error) : [],
        dependencies: dependencies.filter(d => f.requires.includes(d.feature_id)).map(d => ({ feature_id: d.feature_id, name: d.name, status: d.status })),
        reported_unavailable: reportedUnavailable, documentation_url: featurePath(f),
      };
    });
    const relatedTasks = selectedTasks.map(t => ({ task_id: t.task_id, title: t.title, status: t.status, mode: t.mode, summary: t.summary, limitations: t.limitations, documentation_url: taskPath(t.task_id),
      steps: unknownError || features.some(f => f.reported_unavailable) || t.mode === 'UNAVAILABLE' || primary.every(f => ['UNIMPLEMENTED', 'PROXY_ONLY'].includes(f.status)) ? [] : t.steps.map(s => ({ ...s, status: book.features.find(f => f.feature_id === s.feature_id)?.status })),
    }));
    const used = [...primary, ...dependencies, ...selectedControls, ...selectedTasks];
    for (const t of relatedTasks) for (const s of t.steps) { const f = book.features.find(f => f.feature_id === s.feature_id); if (f) used.push(f); }
    const receipt = { receipt_id: randomUUID(), question, mode, matched_feature_ids: featureIds, matched_control_ids: selectedControls.map(c => c.control_id), matched_task_guide_ids: selectedTasks.map(t => t.task_id), product_knowledge_version: book.knowledge_version, product_version: book.product_version, source_catalogue_hash: sourceHash, source_catalogue_version: book.knowledge_version, source_schema_version: book.schema_version,
      readiness_values_used: Object.fromEntries(used.map(e => [e.feature_id || e.control_id || e.task_id, e.status])),
      safe_context: Object.fromEntries(Object.entries(context).filter(([key]) => key !== 'active_workspace_id')),
      created_at: new Date(now()).toISOString(), gap_id: gap?.gap_id || null };
    retain(receipts, receipt.receipt_id, receipt);
    if (journal) journal.write({ receipts: [...receipts.values()], gaps: [...gaps.values()] });
    return { mode, read_only: true, execution_authority: 'NONE', actions: [], receipt_id: receipt.receipt_id,
      answer: unknownError ? 'This error is not documented yet.' : !features.length ? 'I could not resolve this question confidently from AutoPromote documentation. Name the feature or open its contextual Help.' : features.map(f => `${f.name} — ${f.readiness_note} ${f.summary}`).join('\n\n'),
      features, controls: selectedControls.map(c => ({ ...c, documentation_url: doc(`control-reference/index.md#${slug(c.control_id)}`) })), tasks: relatedTasks,
      relationships: book.relationships.filter(e => used.some(u => (u.feature_id || u.control_id || u.task_id) === e.from) && used.some(u => (u.feature_id || u.control_id || u.task_id) === e.to)),
      sources: { label: 'Based on AutoPromote documentation', knowledge_version: book.knowledge_version, product_version: book.product_version, updated_at: book.updated_at, documentation_url: doc('README.md') },
      documentation_gap: gap ? { gap_id: gap.gap_id, reason: gap.reason, review_status: gap.review_status } : null,
    };
  }
  return { answer, receipt: id => { expire(receipts); return structuredClone(receipts.get(id) || null); }, documentationGaps: () => { expire(gaps); return [...gaps.values()].map(g => structuredClone(g)); }, book };
}
module.exports = { createAssistance, validateRequest, ERRORS, BLOCK_MESSAGES, MODES };
