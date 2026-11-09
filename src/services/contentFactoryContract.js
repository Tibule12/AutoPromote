const { digest, stableStringify } = require("./studioProjectIntelligenceContract");
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const SHA = /^[a-f0-9]{64}$/;
const TYPES = ["video", "image", "three_d", "ui", "audio", "motion"];
const STORY_FIELDS = ["about", "whyCare", "hook", "beginning", "development", "tension", "payoff", "ending", "withheld", "amplify", "remove"];
const error = (code, statusCode = 400, message = code) => Object.assign(new Error(message), { code, statusCode });
const text = (value, max = 8000) => typeof value === "string" && value.trim().length > 0 &&
  value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const bounded = value => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 120;
function normalizeBrief(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(k => !["requestId", "brief", "targets", "maxAssetAttempts"].includes(k)) ||
      !ID.test(input.requestId || "") || !text(input.brief) ||
      (input.targets !== undefined && (!Array.isArray(input.targets) || input.targets.length < 1 || input.targets.length > 7 ||
        input.targets.some(t => !["welcome_hero", "short_promo", "story_promo", "why", "making_of", "teaser", "before_after"].includes(t)))) ||
      (input.maxAssetAttempts !== undefined && ![1, 2, 3].includes(input.maxAssetAttempts))) throw error("CONTENT_FACTORY_BRIEF_INVALID");
  return { brief: input.brief.trim(), targets: [...new Set(input.targets || ["welcome_hero", "short_promo", "story_promo"])],
    maxAssetAttempts: input.maxAssetAttempts || 2 };
}
function validateDirection(plan) {
  const sceneMode = plan?.mode === 'screenplay_scene';
  if(plan?.mode != null && !sceneMode) throw error('CONTENT_FACTORY_DIRECTION_MODE_INVALID');
  if (!plan || plan.schemaVersion !== 1 || !text(plan.title, 160) || !plan.story ||
      STORY_FIELDS.some(k => Array.isArray(plan.story[k]) ? !plan.story[k].length || plan.story[k].some(v => !text(v, 1024)) : !text(plan.story[k], 3000)) ||
      !Array.isArray(plan.script) || plan.script.length < (sceneMode ? 1 : 3) || plan.script.length > 24 ||
      plan.script.some(s => !ID.test(s.beatId || "") || !text(s.action, 1500) || !text(s.sound, 1000)) ||
      !Array.isArray(plan.assets) || !plan.assets.length || plan.assets.length > 40 ||
      new Set(plan.assets.map(a => a.assetId)).size !== plan.assets.length ||
      !Array.isArray(plan.outputs) || !plan.outputs.length || plan.outputs.length > 7 ||
      Buffer.byteLength(stableStringify(plan)) > 256 * 1024) throw error("CONTENT_FACTORY_DIRECTION_INVALID");
  const beats = new Set(plan.script.map(s => s.beatId));
  if (beats.size !== plan.script.length) throw error("CONTENT_FACTORY_DUPLICATE_BEAT");
  const priorVisualAssets = new Map();
  for (const asset of plan.assets) {
    if (!ID.test(asset.assetId || "") || !TYPES.includes(asset.type) || !beats.has(asset.beatId) ||
        !text(asset.prompt, 6000) || !text(asset.reason, 1500) || !bounded(asset.duration) ||
        !["wan", "wan_video_refine", "blender", "brand_ident", "ui_capture", "motion", "original_audio", "ace_step", "kokoro", "sdxl", "reuse"].includes(asset.provider) ||
        (asset.provider === "ace_step" && (asset.type !== "audio" || asset.duration < 10 || asset.duration > 60)) ||
        (asset.provider === "reuse" && !ID.test(asset.libraryRef || "")) ||
        (asset.provider === "brand_ident" && (!['cinematic','compute','minimal','creator'].includes(asset.identStyle) || !['three_d','motion'].includes(asset.type) || asset.duration<2 || asset.duration>6)) ||
        !Array.isArray(asset.acceptanceCriteria) || !asset.acceptanceCriteria.length ||
        asset.acceptanceCriteria.some(v => !text(v, 500)) || !Number.isSafeInteger(asset.seed) || asset.seed < 0)
      throw error("CONTENT_FACTORY_ASSET_REQUIREMENT_INVALID");
    if(asset.videoModel != null && (asset.provider!=="wan" ||
        !['wan_ti2v_5b','wan_i2v_a14b'].includes(asset.videoModel) ||
        (asset.videoModel==='wan_i2v_a14b' && !asset.referenceAssetId)))
      throw error('CONTENT_FACTORY_VIDEO_MODEL_INVALID');
    if(asset.negativePrompt != null && (!['wan','wan_video_refine'].includes(asset.provider) || !text(asset.negativePrompt,2000)))
      throw error('CONTENT_FACTORY_NEGATIVE_PROMPT_INVALID');
    if (asset.creativeScene != null) {
      if (!['video', 'three_d', 'motion'].includes(asset.type)) throw error('CONTENT_FACTORY_CREATIVE_SCENE_INVALID');
      require('./contentFactoryScenePerformance').validateCreativeScene(asset.creativeScene);
    }
    if(asset.provider==='wan_video_refine') {
      const reference=priorVisualAssets.get(asset.referenceVideoAssetId);
      if(asset.type!=='video' || !reference || !['video','three_d','motion'].includes(reference.type) ||
         !Number.isFinite(asset.refinementStrength) || asset.refinementStrength<.2 || asset.refinementStrength>.85 ||
         asset.duration>121/24 || asset.duration<3 || asset.referenceAssetId || asset.lastReferenceAssetId)
        throw error('CONTENT_FACTORY_VIDEO_REFINEMENT_INVALID');
    } else if(asset.referenceVideoAssetId!=null || asset.refinementStrength!=null)
      throw error('CONTENT_FACTORY_VIDEO_REFINEMENT_INVALID');
    if(asset.blenderScene != null && (asset.provider!=='blender' || asset.type!=='three_d' ||
        asset.blenderScene!=='paper_to_yacht' || asset.duration<4 || asset.duration>8))
      throw error('CONTENT_FACTORY_BLENDER_SCENE_INVALID');
    if (asset.referenceAssetId != null) {
      const reference=priorVisualAssets.get(asset.referenceAssetId);
      if(asset.provider!=="wan" || !reference || !['video','image'].includes(reference.type) ||
          !Number.isFinite(asset.referenceTime ?? 0) || (asset.referenceTime ?? 0)<0 || (asset.referenceTime ?? 0)>=reference.duration)
        throw error("CONTENT_FACTORY_REFERENCE_INVALID");
    }
    if(asset.lastReferenceAssetId != null){
      const end=priorVisualAssets.get(asset.lastReferenceAssetId);
      if(asset.videoModel!=='wan_i2v_a14b' || !asset.referenceAssetId || !end ||
          !['image','video'].includes(end.type) || !Number.isFinite(asset.lastReferenceTime ?? 0) ||
          (asset.lastReferenceTime ?? 0)<0 || (asset.lastReferenceTime ?? 0)>=end.duration)
        throw error('CONTENT_FACTORY_END_REFERENCE_INVALID');
    }
    priorVisualAssets.set(asset.assetId,asset);
  }
  const ids = new Set(plan.assets.map(a => a.assetId));
  for (const output of plan.outputs) {
    if ((output.captionStyle !== undefined && !['minimal','bold_pop','story_pop','wall_type','headline','boxed'].includes(output.captionStyle)) ||
        (output.captionScale !== undefined && (!Number.isFinite(output.captionScale) || output.captionScale < .5 || output.captionScale > 1.5)))
      throw error('CONTENT_FACTORY_CAPTION_PRESENTATION_INVALID');
    if (output.musicVolume !== undefined && (!Number.isFinite(output.musicVolume) || output.musicVolume < 0 || output.musicVolume > 1))
      throw error("CONTENT_FACTORY_AUDIO_VOLUME_INVALID");
    if (!ID.test(output.outputId || "") || !["16:9", "9:16", "1:1"].includes(output.aspect) ||
        !text(output.purpose, 1000) || !Array.isArray(output.sequence) || output.sequence.length < (sceneMode ? 1 : 2) || output.sequence.length > 40 ||
        output.sequence.some(s => !ids.has(s.assetId) || typeof s.start !== "number" || !Number.isFinite(s.start) || s.start < 0 ||
          !bounded(s.duration) || !text(s.reason, 1000))) throw error("CONTENT_FACTORY_EDIT_INVALID");
    if (output.sequence.reduce((s, x) => s + x.duration, 0) > 120) throw error("CONTENT_FACTORY_EDIT_TOO_LONG");
    if(output.sequence.some(s=>s.start+s.duration>plan.assets.find(a=>a.assetId===s.assetId).duration+1/24))
      throw error("CONTENT_FACTORY_SOURCE_RANGE_EXCEEDS_ASSET");
    if(output.musicAssetId && (!ids.has(output.musicAssetId) || plan.assets.find(a=>a.assetId===output.musicAssetId).type!=="audio" ||
       plan.assets.find(a=>a.assetId===output.musicAssetId).duration<output.sequence.reduce((s,x)=>s+x.duration,0)-1/24))
      throw error("CONTENT_FACTORY_SCORE_TOO_SHORT");
    if(output.sequence.some(s=>plan.assets.find(a=>a.assetId===s.assetId).type==="audio")) throw error("CONTENT_FACTORY_AUDIO_IN_PICTURE_SEQUENCE");
    if(output.audioCues !== undefined && (!Array.isArray(output.audioCues) || output.audioCues.length>40 || output.audioCues.some(c=>
      !ids.has(c.assetId) || plan.assets.find(a=>a.assetId===c.assetId).type!=="audio" ||
      !["voiceover","sfx"].includes(c.kind) || !Number.isFinite(c.startTime) || c.startTime<0 ||
      !bounded(c.duration) || c.duration>15 || !Number.isFinite(c.trimStart || 0) || (c.trimStart || 0)<0 ||
      !Number.isFinite(c.volume) || c.volume<0 || c.volume>1))) throw error("CONTENT_FACTORY_AUDIO_CUE_INVALID");
    const programmeDuration=output.sequence.reduce((n,s)=>n+s.duration,0);
    for(const cue of output.audioCues || [])if(cue.startTime+cue.duration>programmeDuration+1/24 ||
        (cue.trimStart || 0)+cue.duration>plan.assets.find(a=>a.assetId===cue.assetId).duration+1/24)
      throw error('CONTENT_FACTORY_AUDIO_RANGE_INVALID');
    const voices=(output.audioCues || []).filter(c=>c.kind==='voiceover').sort((a,b)=>a.startTime-b.startTime);
    for(let i=1;i<voices.length;i++)if(voices[i-1].startTime+voices[i-1].duration>voices[i].startTime+.02)
      throw error('CONTENT_FACTORY_NARRATION_OVERLAP');
  }
  return plan;
}
function validateReview(review, criteria) {
  if (!review || typeof review.accepted !== "boolean" || !text(review.reason, 4000) ||
      !text(review.reviewer, 200) || !text(review.modelRevision, 200) ||
      !SHA.test(review.evidenceSha256 || "") || !Array.isArray(review.criteria) ||
      review.criteria.length !== criteria.length || review.criteria.some((r, i) =>
        r.criterion !== criteria[i] || typeof r.passed !== "boolean" || !text(r.observation, 1500)) ||
      (review.accepted && review.criteria.some(r => !r.passed))) throw error("CONTENT_FACTORY_REVIEW_INVALID");
  if (!review.accepted && !text(review.revisionInstructions, 4000)) throw error("CONTENT_FACTORY_REJECTION_NEEDS_FIX");
  return review;
}
module.exports = { normalizeBrief, validateDirection, validateReview, digest, stableStringify, error, ID, SHA, STORY_FIELDS };
