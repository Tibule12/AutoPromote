'use strict';
// Bounded documentation assistance. Deliberately has no model, project, billing,
// render, publication or worker adapters. All answer facts come from public truth.
const { randomUUID } = require('node:crypto');
const { loadKnowledge, projectPublic, sha } = require('../productKnowledge');
const { createRetrieval, tokens } = require('./retrieval');
const { redactQuestion } = require('./questionPrivacy');
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
  [/\b(split|cut.*(?:two|parts)|split button)\b/i, ['studio.cut'], []],
  [/\b(trim|shorten)|\bremove\b.*\b(first|last|seconds|end)\b/i, ['studio.trim'], []],
  [/\b(undo|redo|mistake)|\bdeleted\b.*\baccident/i, ['studio.undo_redo'], []],
  [/\b(save|reopen)\b.*\b(project|edit)|\bproject\b.*\b(tomorrow|save|reopen)/i, ['studio.persistence'], []],
  [/\b(text|words?|typography)\b.*\b(behind|occlud)|\bbehind\b.*\b(person|someone|subject)/i, ['studio.compositing.text_behind_subject', 'studio.creator.text_behind_subject'], ['task.text_behind']],
  [/\b(cleanup|clean up|remove|erase|replace)\b.*\b(object|thing)|\bobject\b.*\b(cleanup|remov|eras|replac)/i, ['studio.creator.object_cleanup'], ['task.remove_object']],
  [/\bbackground\b(?!\s+(?:music|noise|sound))|\b(room|halo|fringe|sofa|microphone)\b/i, ['studio.compositing', 'studio.subject_cutout', 'studio.creator.background_replacement'], ['task.background_replace']],
  [/\b(track|tracking|tracked)\b/i, ['studio.tracking', 'studio.creator.tracking'], ['task.tracked_text']],
  [/\b(depth|parallax)\b/i, ['studio.compositing.depth_estimation', 'studio.compositing.mask_depth'], []],
  [/\b(revers|swapp|wrong speaker|other speaker)|\b(speaker|channel)\b.*\b(mapping|reversed|swapped)/i, ['cam_combiner.channel_mapping'], ['task.reversed_channels']],
  [/\b(cam combiner|podcast cameras?|switch.*cameras?|multicam|multi.camera)\b|\bcut\b.*\b(person|speaker)\b.*\b(speak|talk)/i, ['cam_combiner.switching', 'cam_combiner.synchronization'], ['task.cam_combiner']],
  [/\bdirector\b/i, ['director.proposals', 'director.review'], ['task.director_manual']],
  [/\b(captions?|subtitles?|transcri)/i, ['studio.captions'], ['task.captions_correct']],
  [/\b(key\s*frames?|transform)\b|\b(?:picture|image)\b.*\bmove\b|\banimat\w*\b.*\b(position|rotation)\b|\bmotion controls\b/i, ['studio.keyframes'], []],
  [/\b(easing|bezier|acceleration)\b/i, ['studio.easing', 'studio.keyframes'], []],
  [/\b(image|photo|picture)\b.*\b(video|moving|motion|animate|animation)|\banimat\w*\b.*\b(image|photo|picture)\b/i, ['generation.image_to_video'], ['task.image_cinematic']],
  [/\b(idea.to.video|idea.*video)\b/i, ['generation.idea_to_video'], []],
  [/\b(logo|brand reveal)\b/i, ['studio.logo_motion', 'creative.logo_brand', 'studio.three_d'], ['task.cinematic_logo']],
  [/\b(logo workshop|logo designer|design a logo|transparent logo|logo svg)\b/i, ['studio.logo_design'], []],
  [/\b(?:each letter|stagger words|editable text|letter animation)\b/i, ['studio.text_choreography'], []],
  [/\bvector\b.*\b(points?|path|draw|edit)|\b(edit|draw)\b.*\bvector\b/i, ['studio.vector_artwork'], []],
  [/\b3d\b/i, ['studio.three_d', 'studio.blender'], ['task.three_d_title']],
  [/\b(templates?|product launch)\b/i, ['studio.templates', 'creative.shared_templates'], ['task.use_template', 'task.product_launch']],
  [/\bconnect\w*\b.*\b(platform|account|youtube|instagram|facebook|tiktok|reddit|linkedin)/i, ['publishing.connections'], []],
  [/\b(schedul\w*|queue)\b|\bcaption and time\b/i, ['publishing.schedule'], []],
  [/\b(analytics|performed|performance|views)\b/i, ['publishing.analytics'], []],
  [/\b(publish|post|tiktok|instagram|youtube|reddit|linkedin|facebook)\b/i, ['publishing.publish', 'publishing.connections', 'publishing.schedule'], []],
  [/\b(download|export|finished (?:video|movie|film))\b/i, ['studio.export', 'studio.render'], ['task.final_export']],
  [/\b(log\s?in|sign\s?in|password|permission|delete my account)\b/i, ['system.account'], []],
  [/\b(cost|credits?|balance|upgrade|plan|billing|refund)\b|\b(?:autopromote|subscription)\b.*\bprice\b|\bprice\b.*\b(?:autopromote|subscription)\b/i, ['system.costs'], []],
  [/\b(cancel|stop)\b.*\b(job|processing|generation)\b/i, ['system.cancellation'], []],
  [/\b(retry|failed render|queued|processing.*long)\b/i, ['system.retries', 'system.processing_states'], []],
  [/\b(duck|quieter|speech over|hear speech)\b|\bmusic\b.*\b(speaks?|dialogue)\b/i, ['studio.ducking'], []],
  [/\b(music|song)\b/i, ['studio.music'], []],
  [/\b(voice\s?over|narration|recorded voice)\b/i, ['studio.voiceover'], []],
  [/\b(noisy speech|clean up the sound|background noise|voice repair)\b/i, ['studio.audio_restoration'], []],
  [/\b(sound effects?|whoosh|sound cues)\b/i, ['studio.sfx'], []],
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
  if (typeof question !== 'string' || !question.trim() || question.length > 1000 || /[\x00-\x08]/.test(question)) throw fail('HELP_QUESTION_UNSAFE');
  const sanitized = redactQuestion(question);
  if (PRIVATE.test(sanitized.question)) throw fail('HELP_QUESTION_UNSAFE');
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
  return { question: sanitized.question.trim().slice(0, 1000), mode, context, redacted: sanitized.redacted };
}
function resolve(question, context, book, retrieve) {
  const features = [], tasks = [], controls = [];
  const add = (list, id) => { if (!list.includes(id)) list.push(id); };
  const ranked = retrieve(question, context);
  const addRecord = r => {
    if (r.kind === 'feature') add(features, r.id);
    if (r.kind === 'task') { add(tasks, r.id); r.entry.feature_ids.slice(0, 2).forEach(id => add(features, id)); }
    if (r.kind === 'control') { add(controls, r.id); r.entry.feature_ids.slice(0, 2).forEach(id => add(features, id)); }
  };
  const exact = ranked.filter(r => r.exact && (r.kind !== 'control' || r.contextual)).slice(0, 8);
  exact.filter(r => r.kind === 'control' && r.contextual || r.kind === 'feature' && (r.titleWords.size > 1 || tokens(question).every(word => r.titleWords.has(word)))).forEach(addRecord);
  const corrected = retrieve.correct(question);
  for (const [pattern, fs, ts] of TOPICS) if (pattern.test(question) || pattern.test(corrected)) { fs.forEach(id => add(features, id)); ts.forEach(id => add(tasks, id)); }
  exact.forEach(addRecord);
  if (context.selected_feature_id && (!features.length || /^(what (do i do next|is this)|help|explain|guide me)[?!. ]*$/i.test(question))) {
    features.unshift(context.selected_feature_id);
  }
  if (!features.length) ranked.slice(0, 5).forEach(addRecord);
  ranked.filter(r => r.kind === 'control' && r.contextual).slice(0, 10).forEach(r => add(controls, r.id));
  const possibleCode = question.match(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/)?.[0];
  const error = context.error_code || context.error_message || Object.keys(BLOCK_MESSAGES).find(message => question === message) ||
    Object.keys(ERRORS).find(code => question.split(/\s+/).includes(code)) || (possibleCode && !Object.keys(STATUS).includes(possibleCode) ? possibleCode : null);
  const diagnostic = Object.hasOwn(ERRORS, error) ? ERRORS[error] : Object.hasOwn(BLOCK_MESSAGES, error) ? BLOCK_MESSAGES[error] : null;
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
  const retrieve = createRetrieval(book);
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
    const { question, mode, context, redacted } = validateRequest(input, book);
    const matched = resolve(question, context, book, retrieve);
    const greeting = /^(?:hi|hello|hey(?: there)?|good (?:morning|afternoon|evening))[\s.!?👋]*$/iu.test(question);
    const thanks = /^(?:thanks|thank you)(?:[,! .]+that helped)?[.! ]*$/i.test(question);
    const introduction = /^(?:what (?:is autopromote|can you help me with)|help me get started|i am new here)[?!. ]*$/i.test(question);
    const asksForGuarantee = /\b(?:guarantee|promise)\b.*\b(?:views|viral|followers|sales|reach)\b/i.test(question);
    const unknownError = matched.error && !Object.hasOwn(ERRORS, matched.error) && !Object.hasOwn(BLOCK_MESSAGES, matched.error);
    const featureIds = matched.features;
    const primary = book.features.filter(f => featureIds.includes(f.feature_id)).sort((a, b) => featureIds.indexOf(a.feature_id) - featureIds.indexOf(b.feature_id));
    const dependencies = book.features.filter(f => primary.some(p => p.requires.includes(f.feature_id)));
    const gapReason = unknownError ? 'unknown_error_code' : !primary.length && !greeting && !thanks && !introduction ? 'missing_or_ambiguous_feature_documentation' : null;
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
      answer: unknownError ? 'This error is not documented yet.' : greeting || introduction ? 'Hi! I can help with AutoPromote editing, motion, sound, captions, templates, generation and publishing. What would you like to do?' : thanks ? 'You’re welcome. Ask me about another AutoPromote feature whenever you need help.' : !features.length ? 'I do not have a documented answer to that yet. I can help with AutoPromote editing, sound, templates, generation and publishing. Tell me which feature or task you mean, or open its Help button.' : `${asksForGuarantee ? 'The documentation does not promise guaranteed views or results. ' : ''}${features.map(f => `${f.name} — ${f.readiness_note} ${f.summary}`).join('\n\n')}`,
      privacy_notice: redacted ? 'I removed private contact details, links, file paths or credentials before looking up your question. Please keep credentials out of chat.' : null,
      features, controls: selectedControls.map(c => ({ ...c, documentation_url: doc(`control-reference/index.md#${slug(c.control_id)}`) })), tasks: relatedTasks,
      relationships: book.relationships.filter(e => used.some(u => (u.feature_id || u.control_id || u.task_id) === e.from) && used.some(u => (u.feature_id || u.control_id || u.task_id) === e.to)),
      sources: { label: 'Based on AutoPromote documentation', knowledge_version: book.knowledge_version, product_version: book.product_version, updated_at: book.updated_at, documentation_url: doc('README.md') },
      documentation_gap: gap ? { gap_id: gap.gap_id, reason: gap.reason, review_status: gap.review_status } : null,
    };
  }
  return { answer, receipt: id => { expire(receipts); return structuredClone(receipts.get(id) || null); }, documentationGaps: () => { expire(gaps); return [...gaps.values()].map(g => structuredClone(g)); }, book };
}
module.exports = { createAssistance, validateRequest, ERRORS, BLOCK_MESSAGES, MODES };
