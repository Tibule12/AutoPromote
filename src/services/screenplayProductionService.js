const crypto = require('crypto');
const { importScreenplay, validateScenePlan, compileSceneDirection, sourceHash } = require('./screenplayProductionContract');
const { digest, SHA, error } = require('./contentFactoryContract');
const { ownerRequestJobId } = require('./studioJobIdentity');
const { compileFactoryEdit } = require('./contentFactoryStudioAdapter');
const { buildFactoryIntelligence } = require('./contentFactoryIntelligenceAdapter');
const uidValid = uid => typeof uid === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,159}$/.test(uid);
const LEASE = 15 * 60 * 1000;

// The same private store, owner/request identity and Factory scene jobs. Scene
// outputs feed the existing canonical compiler; this is not a second editor.
function createScreenplayProductionService({ store, factory, providers, clock = Date.now }) {
  async function get(uid, productionId) {
    if (!uidValid(uid) || !SHA.test(productionId || '')) throw error('SCREENPLAY_SCOPE_INVALID');
    const row = await store.get(productionId);
    if (!row || row.ownerUid !== uid || row.workflow !== 'screenplay_production') throw error('SCREENPLAY_PRODUCTION_MISSING', 404);
    if (sourceHash(row.screenplay.source.text) !== row.screenplay.source.sha256) throw error('SCREENPLAY_SOURCE_CHANGED', 409);
    return row;
  }
  async function create({ uid, input }) {
    if (!uidValid(uid)) throw error('SCREENPLAY_SCOPE_INVALID');
    const screenplay = importScreenplay(input), fingerprint = digest({ screenplay, requestId: input.requestId });
    const productionId = ownerRequestJobId(uid, `screenplay:${input.requestId}`); let duplicate = false;
    const job = await store.transaction(productionId, prior => {
      if (prior) {
        if (prior.ownerUid !== uid || prior.fingerprint !== fingerprint) throw error('SCREENPLAY_IDEMPOTENCY_CONFLICT', 409);
        duplicate = true; return prior;
      }
      return { schemaVersion: 1, workflow: 'screenplay_production', jobId: productionId, productionId, ownerUid: uid,
        requestId: input.requestId, fingerprint, private: true, status: 'screenplay_ready', stage: 'screenplay_breakdown',
        screenplay, sceneJobs: [], assets: [], outputs: [], events: [], lease: null, failure: null,
        createdAt: new Date(clock()).toISOString(), updatedAt: new Date(clock()).toISOString() };
    });
    return { job, duplicate };
  }
  async function exclusive(uid, productionId, work) {
    await get(uid, productionId); const token = crypto.randomUUID();
    let row = await store.transaction(productionId, prior => {
      if (prior.lease?.expiresAt > clock()) throw error('SCREENPLAY_PRODUCTION_BUSY', 409);
      return { ...prior, lease: { token, expiresAt: clock() + LEASE } };
    });
    const save = async mutate => {
      row = await store.transaction(productionId, prior => {
        if (prior.lease?.token !== token || prior.lease.expiresAt <= clock()) throw error('SCREENPLAY_LEASE_LOST', 409);
        return { ...mutate(structuredClone(prior)), lease: { token, expiresAt: clock() + LEASE }, updatedAt: new Date(clock()).toISOString() };
      }); return row;
    };
    const controller = new AbortController();
    const timer = setInterval(() => save(r => r).catch(() => controller.abort()), 30000); timer.unref?.();
    try { return await work(row, save, controller.signal); }
    finally {
      clearInterval(timer); controller.abort();
      await store.transaction(productionId, prior => prior?.lease?.token === token ? { ...prior, lease: null } : prior);
    }
  }
  async function planScene({ uid, productionId, sceneId }) {
    return exclusive(uid, productionId, async (row, save, signal) => {
      const scene = row.screenplay.scenes.find(s => s.sceneId === sceneId);
      if (!scene) throw error('SCREENPLAY_SCENE_MISSING', 404);
      if (scene.plan) return row;
      if (row.screenplay.scenes.some(s=>s.ordinal<scene.ordinal && s.planReview?.accepted===false)) throw error('SCREENPLAY_PRIOR_PLAN_REJECTED',409);
      if (row.screenplay.scenes.some(s => s.ordinal < scene.ordinal && !s.plan)) throw error('SCREENPLAY_PLAN_ORDER_REQUIRED', 409);
      if (!providers?.planScreenplayScene) throw error('SCREENPLAY_PLANNER_UNCONFIGURED', 503);
      await save(r => ({ ...r, status: 'planning_scene', stage: sceneId }));
      try {
        const generated = await providers.planScreenplayScene({ productionId, ownerUid: uid, screenplay: row.screenplay, scene, signal,
          previousFailure: row.failure?.sceneId === sceneId ? row.failure : null });
        const validated = validateScenePlan(row.screenplay, scene, generated.plan || generated);
        const { entities, ...plan } = validated;
        return save(r => {
          const states = new Map(r.screenplay.continuity.map(s => [`${s.entityId}:${s.key}`, s]));
          plan.continuity.forEach(s => states.set(`${s.entityId}:${s.key}`, s));
          const screenplay = { ...r.screenplay, entities, continuity: [...states.values()],
            scenes: r.screenplay.scenes.map(s => s.sceneId === sceneId ? { ...s, plan, status: 'shot_plan_ready',
              plannerProvenance: generated.provenance || { origin: 'supplied_private_scene_plan' } } : s) };
          return { ...r, screenplay, failure: null, status: screenplay.scenes.every(s => s.plan) ? 'scene_plans_ready' : 'screenplay_ready',
            events: [...r.events, { stage: 'scene_plan', sceneId, planHash: plan.planHash, at: new Date(clock()).toISOString() }] };
        });
      } catch (failure) {
        await save(r => ({ ...r, status: 'needs_scene_revision', failure: { sceneId, code: failure.code || 'SCENE_PLANNER_FAILED', message: String(failure.message).slice(0,1500) } }));
        throw failure;
      }
    });
  }
  async function queueScene({ uid, productionId, sceneId }) {
    return exclusive(uid, productionId, async (row, save) => {
      const scene = row.screenplay.scenes.find(s => s.sceneId === sceneId);
      if (!scene?.plan) throw error('SCREENPLAY_SCENE_PLAN_REQUIRED', 409);
      if (scene.planReview?.accepted===false) throw error('SCREENPLAY_SCENE_PLAN_REJECTED',409);
      if (row.screenplay.scenes.some(s=>s.ordinal<scene.ordinal && s.planReview?.accepted===false)) throw error('SCREENPLAY_PRIOR_PLAN_REJECTED',409);
      const direction = compileSceneDirection({ screenplay: row.screenplay, scene, plan: scene.plan });
      const sourceLineage = { workflow: 'screenplay_scene', productionId, sceneId, sourceSha256: row.screenplay.source.sha256,
        sourceRef: scene.sourceRef, scenePlanHash: scene.plan.planHash, continuityBibleHash: digest(row.screenplay.entities),
        plannedContinuity: scene.plan.continuity };
      const result = await factory.create({ uid, input: { requestId: `film-${productionId.slice(0,12)}-${sceneId}-${scene.plan.planHash.slice(0,8)}`,
        brief: `Screenplay: ${row.screenplay.title}. Scene: ${scene.heading}. Source SHA: ${row.screenplay.source.sha256}. ${scene.plan.summary}`.slice(0,8000), targets: ['story_promo'] },
        creativeDirection: direction, sourceLineage });
      await save(r => ({ ...r, status: 'generating_scenes', sceneJobs: [...r.sceneJobs.filter(s => s.sceneId !== sceneId),
        { sceneId, planHash: scene.plan.planHash, jobId: result.job.jobId }] }));
      return result;
    });
  }
  async function reviewScenePlan({uid,productionId,sceneId,planHash,review}) {
    if (!SHA.test(planHash||'') || !review || typeof review.accepted!=='boolean' ||
        typeof review.reason!=='string' || !review.reason.trim() || review.reason.length>4000 ||
        typeof review.reviewer!=='string' || !review.reviewer.trim() || review.reviewer.length>160)
      throw error('SCREENPLAY_PLAN_REVIEW_INVALID');
    return exclusive(uid,productionId,async(row,save)=>{
      const scene=row.screenplay.scenes.find(s=>s.sceneId===sceneId);
      if(!scene?.plan)throw error('SCREENPLAY_SCENE_PLAN_REQUIRED',409);
      if(scene.plan.planHash!==planHash)throw error('SCREENPLAY_PLAN_REVIEW_STALE',409);
      const recorded={accepted:review.accepted,reason:review.reason.trim(),reviewer:review.reviewer.trim(),planHash,at:new Date(clock()).toISOString(),
        scope:'Creative inspection of a written scene plan; not generated-pixel or human listening evidence.'};
      return save(r=>({...r,status:review.accepted?r.status:'needs_scene_revision',
        screenplay:{...r.screenplay,scenes:r.screenplay.scenes.map(s=>s.sceneId===sceneId?{...s,planReview:recorded,status:review.accepted?'shot_plan_ready':'needs_plan_revision'}:s)},
        events:[...r.events,{stage:'scene_plan_review',sceneId,...recorded}]}));
    });
  }
  async function prepareAssembly({ uid, productionId }) {
    const row = await get(uid, productionId);
    if (!providers?.verifyArtifact || !providers?.urlFor) throw error('SCREENPLAY_RENDERER_UNCONFIGURED', 503);
    const assets = [], sequence = [];
    for (const scene of row.screenplay.scenes) {
      if(scene.planReview?.accepted===false)throw error('SCREENPLAY_SCENE_PLAN_REJECTED',409);
      const link = row.sceneJobs.find(s => s.sceneId === scene.sceneId && s.planHash === scene.plan?.planHash);
      if (!link) throw error('SCREENPLAY_SCENE_OUTPUT_REQUIRED', 409);
      const child = await factory.get(uid, link.jobId), latest = child.outputs.filter(o => o.outputId === scene.sceneId).at(-1);
      if (child.sourceLineage?.productionId !== productionId || child.sourceLineage?.scenePlanHash !== scene.plan.planHash ||
          !latest || !['ready_for_founder_review','founder_accepted'].includes(latest.status) || !latest.review?.accepted)
        throw error('SCREENPLAY_SCENE_NOT_ACCEPTED', 409);
      const artifact = await providers.verifyArtifact(latest.artifact);
      if(latest.review.artifactSha256!==artifact.sha256)throw error('SCREENPLAY_SCENE_REVIEW_STALE',409);
      if (!artifact.hasAudio) throw error('SCREENPLAY_SCENE_SOUND_REQUIRED', 409);
      const assetId = scene.sceneId;
      assets.push({ assetId, beatId: assetId, type: 'video', audioRole: 'scene_mix', status: 'accepted', artifact, review: latest.review,
        provenance: { model: 'AutoPromote rendered scene', modelRevision: latest.documentHash, tool: 'Existing Director and renderer',
          sourceBrief: child.brief.brief, sourceBriefHash: digest(child.brief), directionHash: child.directionHash,
          settings: { sourceLineage: child.sourceLineage, sceneJobId: child.jobId, sceneOutputSha256: artifact.sha256 } } });
      sequence.push({ assetId, start: 0, duration: artifact.duration, reason: `Screenplay scene ${scene.ordinal}: ${scene.plan.summary}`.slice(0,1000) });
    }
    if (sequence.reduce((n,s) => n+s.duration,0) > 7200) throw error('SCREENPLAY_FILM_DURATION_LIMIT');
    const output = { outputId: 'screenplay-film', aspect: '16:9', purpose: `Automatically assemble ${row.screenplay.title} in screenplay scene order, preserving each reviewed scene soundtrack.`, sequence };
    const edit = compileFactoryEdit({ jobId: productionId, ownerUid: uid, assets, output, urlFor: providers.urlFor });
    edit.intelligence = buildFactoryIntelligence({ projectId: edit.projectId, ownerUid: uid, assets,
      direction: { script: row.screenplay.scenes.map(s => ({ beatId: s.sceneId, action: s.plan.summary })) } });
    return { stage: 'prepared_for_existing_renderer', productionId, sourceSha256: row.screenplay.source.sha256, output, edit,
      limitation: 'Canonical editorial assembly only. Final render and whole-film visual/audio review remain required; no release or founder approval is implied.' };
  }
  return { create, get, planScene, reviewScenePlan, queueScene, prepareAssembly };
}
module.exports = { createScreenplayProductionService };
