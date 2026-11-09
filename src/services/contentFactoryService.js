const crypto = require("crypto");
const { normalizeBrief, validateDirection, validateReview, digest, error, SHA } = require("./contentFactoryContract");
const { validateScenePerformanceReview } = require('./contentFactoryScenePerformance');
const { ownerRequestJobId, requestFingerprint } = require("./studioJobIdentity");
const { compileFactoryEdit } = require("./contentFactoryStudioAdapter");
const { buildFactoryIntelligence } = require("./contentFactoryIntelligenceAdapter");
const LEASE_MS = 15 * 60 * 1000;
const FINAL_CRITERIA = ["Opening gives a stranger a reason to keep watching", "Story develops rather than listing features",
  "Tension leads to a clear payoff", "Every shot and effect serves a story beat", "Ending resolves the opening",
  "Typography is readable and pacing allows understanding", "Designed audio is present, correctly timed and has measurable headroom"];
const SCENE_CRITERIA = ['The generated scene depicts its screenplay action and intended dramatic change',
  'Shot choices and pacing serve the assigned scene rather than adding unrelated spectacle',
  'The scene preserves its story intent and information intended to remain withheld',
  'Generated entities, geometry and motion are coherent across the scene',
  'Stated planned continuity requirements are supported by the actual generated pictures',
  'The scene has correctly timed audible sound with measurable headroom'];
const validUid = uid => typeof uid === "string" && /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,159}$/.test(uid);

// Store transactions follow the existing Studio job identity/lease pattern.
// Providers do not receive auth tokens and cannot publish or modify customers.
function createContentFactoryService({ store, providers, clock = Date.now }) {
  const scoped = async (uid, jobId) => {
    if (!validUid(uid) || !SHA.test(jobId || "")) throw error("CONTENT_FACTORY_SCOPE_INVALID");
    const job = await store.get(jobId);
    if (!job || job.ownerUid !== uid || (job.workflow && job.workflow !== 'content_factory')) throw error("CONTENT_FACTORY_JOB_MISSING", 404);
    return job;
  };
  async function create({ uid, input, creativeDirection = null, sourceLineage = null }) {
    if (!validUid(uid)) throw error("CONTENT_FACTORY_SCOPE_INVALID");
    const brief = normalizeBrief(input), jobId = ownerRequestJobId(uid, input.requestId);
    let direction = null, lineage = null;
    if (creativeDirection || sourceLineage) {
      const { compileSceneDirection, sourceHash } = require('./screenplayProductionContract');
      const parent = SHA.test(sourceLineage?.productionId || '') ? await store.get(sourceLineage.productionId) : null;
      const scene = parent?.screenplay?.scenes.find(s => s.sceneId === sourceLineage?.sceneId);
      if (!parent || parent.ownerUid !== uid || parent.workflow !== 'screenplay_production' || !scene?.plan ||
          parent.screenplay.source.sha256 !== sourceLineage.sourceSha256 || sourceHash(parent.screenplay.source.text)!==parent.screenplay.source.sha256 || scene.plan.planHash !== sourceLineage.scenePlanHash)
        throw error('CONTENT_FACTORY_SCREENPLAY_LINEAGE_INVALID', 409);
      if(scene.planReview?.accepted===false || parent.screenplay.scenes.some(s=>s.ordinal<scene.ordinal && s.planReview?.accepted===false))
        throw error('CONTENT_FACTORY_SCREENPLAY_PLAN_REJECTED',409);
      direction = validateDirection(creativeDirection);
      if (digest(direction) !== digest(compileSceneDirection({ screenplay: parent.screenplay, scene, plan: scene.plan })))
        throw error('CONTENT_FACTORY_SCREENPLAY_DIRECTION_CHANGED', 409);
      lineage = { workflow: 'screenplay_scene', productionId: parent.productionId, sceneId: scene.sceneId,
        sourceSha256: parent.screenplay.source.sha256, sourceRef: scene.sourceRef, scenePlanHash: scene.plan.planHash,
        continuityBibleHash: scene.plan.entityBibleHash, plannedContinuity: scene.plan.continuity };
    }
    const fingerprint = direction ? digest({ brief, direction, sourceLineage: lineage }) : requestFingerprint(brief);
    let duplicate = false;
    const job = await store.transaction(jobId, prior => {
      if (prior) {
        if (prior.ownerUid !== uid || prior.fingerprint !== fingerprint) throw error("CONTENT_FACTORY_IDEMPOTENCY_CONFLICT", 409);
        duplicate = true; return prior;
      }
      return { schemaVersion: 1, workflow: 'content_factory', jobId, ownerUid: uid, fingerprint, requestId: input.requestId,
        brief, status: "queued", stage: "brief", attempts: 0, createdAt: new Date(clock()).toISOString(),
        updatedAt: new Date(clock()).toISOString(), lease: null, cancelled: false, direction,
        ...(direction ? { directionHash: digest(direction), sourceLineage: lineage } : {}),
        assets: [], outputs: [], events: [], failure: null, private: true };
    });
    return { job, duplicate };
  }
  async function cancel({ uid, jobId }) {
    await scoped(uid, jobId);
    return store.transaction(jobId, prior => ({ ...prior, cancelled: true,
      status: prior.status === "running" ? "cancelling" : "cancelled", updatedAt: new Date(clock()).toISOString() }));
  }
  async function retry({ uid, jobId }) {
    await scoped(uid, jobId);
    return store.transaction(jobId, prior => {
      if (!["failed", "needs_configuration", "needs_creative_revision"].includes(prior.status) || prior.lease?.expiresAt > clock())
        throw error("CONTENT_FACTORY_RETRY_CONFLICT", 409);
      if (prior.attempts >= 3) throw error("CONTENT_FACTORY_ATTEMPTS_EXHAUSTED", 409);
      return { ...prior, status: "queued", failure: null, cancelled: false, updatedAt: new Date(clock()).toISOString() };
    });
  }
  async function process(jobId) {
    const token = crypto.randomUUID(), controller = new AbortController();
    let heartbeat, job;
    job = await store.transaction(jobId, prior => {
      if (!prior || !["queued", "running"].includes(prior.status) || prior.cancelled || prior.lease?.expiresAt > clock()) return prior;
      return { ...prior, status: "running", attempts: prior.attempts + 1,
        lease: { token, expiresAt: clock() + LEASE_MS }, updatedAt: new Date(clock()).toISOString() };
    });
    if (!job || job.lease?.token !== token) return null;
    const checkpoint = async mutate => {
      job = await store.transaction(jobId, prior => {
        if (!prior || prior.lease?.token !== token || prior.lease.expiresAt <= clock()) throw error("CONTENT_FACTORY_LEASE_LOST", 409);
        if (prior.cancelled) throw error("CONTENT_FACTORY_CANCELLED", 409);
        const next = mutate(structuredClone(prior));
        return { ...next, updatedAt: new Date(clock()).toISOString(), lease: { token, expiresAt: clock() + LEASE_MS } };
      });
      return job;
    };
    const event = (record, stage, detail) => ({ ...record, stage,
      events: [...record.events, { at: new Date(clock()).toISOString(), stage, detail }].slice(-500) });
    const context = () => ({ jobId, ownerUid: job.ownerUid, sourceBrief: job.brief.brief,
      sourceBriefHash: digest(job.brief), sourceLineage: job.sourceLineage || null, mode: job.direction?.mode || 'marketing', signal: controller.signal });
    const assertCurrentScenePlan = async () => {
      if(!job.sourceLineage)return;
      const parent=await store.get(job.sourceLineage.productionId),scene=parent?.screenplay?.scenes.find(s=>s.sceneId===job.sourceLineage.sceneId);
      const {sourceHash}=require('./screenplayProductionContract');
      if(parent?.ownerUid!==job.ownerUid || parent.workflow!=='screenplay_production' || !scene?.plan ||
          sourceHash(parent.screenplay.source.text)!==job.sourceLineage.sourceSha256 || scene.plan.planHash!==job.sourceLineage.scenePlanHash)
        throw error('CONTENT_FACTORY_SCREENPLAY_LINEAGE_INVALID',409);
      if(scene.planReview?.accepted===false || parent.screenplay.scenes.some(s=>s.ordinal<scene.ordinal && s.planReview?.accepted===false))
        throw error('CONTENT_FACTORY_SCREENPLAY_PLAN_REJECTED',409);
    };
    heartbeat = setInterval(() => checkpoint(j => j).catch(() => controller.abort()), 30_000);
    heartbeat.unref?.();
    try {
      await assertCurrentScenePlan();
      if (!providers?.plan || !providers?.generate || !providers?.review || !providers?.verifyArtifact || !providers?.render || !providers?.urlFor)
        throw error("CONTENT_FACTORY_PROVIDERS_UNCONFIGURED", 503);
      if (!job.direction) {
        const direction = validateDirection(await providers.plan({ ...context(), targets: job.brief.targets }));
        await checkpoint(j => event({ ...j, direction, directionHash: digest(direction) }, "creative_direction", direction.title));
      }
      const finalCriteria = job.direction.mode === 'screenplay_scene' ? SCENE_CRITERIA : FINAL_CRITERIA;
      for (const requirement of job.direction.assets) {
        const acceptedAsset = job.assets.findLast(a => a.assetId === requirement.assetId && a.status === "accepted");
        if (acceptedAsset) {
          validateScenePerformanceReview({ scene: requirement.creativeScene, artifact: acceptedAsset.artifact, review: acceptedAsset.review });
          continue;
        }
        let accepted = false;
        const pending = job.assets.filter(a => a.assetId === requirement.assetId && ["pending_review", "review_failed"].includes(a.status)).at(-1);
        if (pending) {
          const artifact = await providers.verifyArtifact(pending.artifact, context());
          const review = validateReview(await providers.review({ ...context(), artifact, story: job.direction.story,
            requirement, criteria: requirement.acceptanceCriteria }), requirement.acceptanceCriteria);
          validateScenePerformanceReview({ scene: requirement.creativeScene, artifact, review });
          const resumed = { ...pending, status: review.accepted ? "accepted" : "rejected", review };
          await checkpoint(j => event({ ...j, assets: j.assets.map(a => a.attemptId === pending.attemptId ? resumed : a) }, "asset_review", `${requirement.assetId}: resumed saved asset review`));
          if (review.accepted) continue;
        }
        const priorAttempts = job.assets.filter(a => a.assetId === requirement.assetId);
        if (requirement.provider === "reuse" && priorAttempts.some(a => a.status === "rejected"))
          throw error("CONTENT_FACTORY_ASSET_REJECTED", 422, "Rejected reused material requires a different source or revised assignment; copying identical bytes is not regeneration.");
        for (let attempt = priorAttempts.length + 1; attempt <= job.brief.maxAssetAttempts; attempt++) {
          const latest = job.assets.filter(a => a.assetId === requirement.assetId).at(-1);
          const prompt = requirement.prompt + (latest?.review?.revisionInstructions ? `\nRequired correction: ${latest.review.revisionInstructions}` : "");
          const attemptId = `${jobId.slice(0, 16)}-${requirement.assetId}-a${attempt}`;
          await checkpoint(j => event(j, "generating", attemptId));
          let asset;
          try {
            await assertCurrentScenePlan();
            const generated = await providers.generate({ ...context(), requirement: { ...requirement, prompt }, priorAssets:job.assets.filter(a=>a.status==='accepted'), attempt, attemptId });
            const artifact = await providers.verifyArtifact(generated.artifact, context());
            if (!SHA.test(artifact.sha256 || "") || typeof artifact.path !== "string" || !Number.isFinite(artifact.duration) || artifact.duration <= 0 ||
                !generated.model || !generated.modelRevision || !generated.settings || !generated.tool)
              throw error("CONTENT_FACTORY_PROVENANCE_INVALID");
            asset = { assetId: requirement.assetId, attempt, attemptId, type: requirement.type, beatId: requirement.beatId,
              status: "pending_review", artifact, audioRole: generated.audioRole || null,
              reusableArtifacts: generated.reusableArtifacts || [], provenance: { sourceBrief: job.brief.brief, sourceBriefHash: digest(job.brief),
                directionHash: job.directionHash, prompt, model: generated.model, modelRevision: generated.modelRevision,
                tool: generated.tool, settings: generated.settings, seed: generated.seed ?? requirement.seed + attempt - 1,
                generatedAt: new Date(clock()).toISOString(), origin: generated.origin || "server_generated",
                ...(job.sourceLineage ? { sourceLineage: job.sourceLineage } : {}),
                ...(generated.parentProvenance ? { parentProvenance: generated.parentProvenance } : {}) }, usedIn: [], review: null };
            if (requirement.creativeScene) asset.provenance.creativeScene = structuredClone(requirement.creativeScene);
            // Persist the artifact before review so a failed critic cannot lose it.
            await checkpoint(j => ({ ...j, assets: [...j.assets, asset] }));
            const review = validateReview(await providers.review({ ...context(), artifact, story: job.direction.story,
              requirement, criteria: requirement.acceptanceCriteria }), requirement.acceptanceCriteria);
            validateScenePerformanceReview({ scene: requirement.creativeScene, artifact, review });
            asset = { ...asset, status: review.accepted ? "accepted" : "rejected", review };
            await checkpoint(j => event({ ...j, assets: j.assets.map(a => a.attemptId === attemptId ? asset : a) },
              "asset_review", `${requirement.assetId}: ${asset.status}; ${review.reason}`));
            if (review.accepted) { accepted = true; break; }
            if (requirement.provider === "reuse") break;
          } catch (failure) {
            if (controller.signal.aborted || failure.code === "CONTENT_FACTORY_CANCELLED") throw failure;
            if (!asset && ["CONTENT_FACTORY_GPU_BUSY", "CONTENT_FACTORY_GPU_WINDOW_EXPIRED", "CONTENT_FACTORY_NVIDIA_DEVICE_MISMATCH", "CONTENT_FACTORY_PROVIDER_UNAVAILABLE"].includes(failure.code)) throw failure;
            const failed = asset ? { ...asset, status: "review_failed", failure: { code: failure.code || "PROVIDER_FAILED", message: String(failure.message).slice(0, 1500) } } :
              { assetId: requirement.assetId, attemptId, attempt, status: "generation_failed", usedIn: [], failure: { code: failure.code || "PROVIDER_FAILED", message: String(failure.message).slice(0, 1500) } };
            await checkpoint(j => event({ ...j, assets: [...j.assets.filter(a => a.attemptId !== attemptId), failed] }, "asset_failed", failed.failure.code));
            if (asset) throw failure; // Retry the critic against these bytes, not another costly generation.
          }
        }
        if (!accepted) throw error("CONTENT_FACTORY_ASSET_REJECTED", 422);
      }
      for (const initialOutput of job.direction.outputs) {
        let output = initialOutput;
        let finalAccepted = false;
        const priorVersions = job.outputs.filter(o => o.outputId === output.outputId);
        const last = priorVersions.at(-1);
        if (["ready_for_founder_review", "founder_accepted"].includes(last?.status)) continue;
        if (last?.status === "pending_review") {
          const artifact = await providers.verifyArtifact(last.artifact, context());
          const review = validateReview(await providers.review({ ...context(), artifact, story: job.direction.story,
            output: last.editPlan, criteria: finalCriteria }), finalCriteria);
          await checkpoint(j => ({ ...j, outputs: j.outputs.map(o => o.outputId === last.outputId && o.attempt === last.attempt ?
            { ...o, review, status: review.accepted ? "ready_for_founder_review" : "rejected" } : o) }));
          if (review.accepted) continue;
          last.review = review; last.status = "rejected";
        }
        if (["rejected", "founder_rejected"].includes(last?.status)) {
          if (!providers.reviseEdit || priorVersions.length >= 3) throw error("CONTENT_FACTORY_FINAL_REJECTED", 422);
          const rejection = last.status === "founder_rejected" ? { accepted: false,
            reviewer: last.founderReview.reviewerUid, reason: last.founderReview.note,
            revisionInstructions: last.founderReview.note, artifactSha256: last.founderReview.artifactSha256 } : last.review;
          output = await providers.reviseEdit({ ...context(), output: last.editPlan,
            review: rejection, story: job.direction.story, assets: job.assets, attempt: priorVersions.length + 1 });
          validateDirection({ ...job.direction, outputs: [output] });
          if (digest(output.sequence) === digest(last.editPlan.sequence)) throw error("CONTENT_FACTORY_REVISION_UNCHANGED", 422);
        }
        for (let attempt = priorVersions.length + 1; attempt <= 3; attempt++) {
        const edit = compileFactoryEdit({ jobId, ownerUid: job.ownerUid, assets: job.assets, output, urlFor: providers.urlFor });
        edit.intelligence = buildFactoryIntelligence({ projectId: edit.projectId, ownerUid: job.ownerUid, assets: job.assets, direction: job.direction });
        await checkpoint(j => event(j, "editing", output.outputId));
        await assertCurrentScenePlan();
        const rendered = await providers.render({ ...context(), edit, output, attempt });
        const artifact = await providers.verifyArtifact(rendered.artifact, context());
        await checkpoint(j => ({ ...j, outputs: [...j.outputs,
          { outputId: output.outputId, attempt, status: "pending_review", artifact, editPlan: output,
            editArtifact: rendered.editArtifact || null, projectId: edit.projectId, documentHash: edit.documentHash, review: null }] }));
        const review = validateReview(await providers.review({ ...context(), artifact, story: job.direction.story,
          output, criteria: finalCriteria }), finalCriteria);
        const status = review.accepted ? "ready_for_founder_review" : "rejected";
        await checkpoint(j => event({ ...j, outputs: j.outputs.map(o => o.outputId === output.outputId && o.attempt === attempt ? { ...o, status, review } : o),
          assets: j.assets.map(a => a.status === "accepted" && edit.sourceEvidence.some(s => s.assetId === a.assetId) ?
            { ...a, usedIn: [...new Set([...a.usedIn, output.outputId])] } : a) }, "self_review", `${output.outputId}: ${review.reason}`));
        if (review.accepted) { finalAccepted = true; break; }
        if (!providers.reviseEdit || attempt >= 3) break;
        const revised = await providers.reviseEdit({ ...context(), output, review, story: job.direction.story, assets: job.assets, attempt: attempt + 1 });
        validateDirection({ ...job.direction, outputs: [revised] });
        if (digest(revised.sequence) === digest(output.sequence)) throw error("CONTENT_FACTORY_REVISION_UNCHANGED", 422);
        output = revised;
        }
        if (!finalAccepted) throw error("CONTENT_FACTORY_FINAL_REJECTED", 422);
      }
      await checkpoint(j => event({ ...j, status: "awaiting_founder_review", failure: null }, "finished", "Private outputs ready for founder review; nothing published."));
    } catch (failure) {
      await store.transaction(jobId, prior => {
        if (prior?.lease?.token !== token) return prior;
        const status = prior.cancelled ? "cancelled" : failure.code === "CONTENT_FACTORY_PROVIDERS_UNCONFIGURED" ? "needs_configuration" :
          ["CONTENT_FACTORY_ASSET_REJECTED", "CONTENT_FACTORY_FINAL_REJECTED"].includes(failure.code) ? "needs_creative_revision" : "failed";
        return event({ ...prior, status, failure: { code: failure.code || "CONTENT_FACTORY_FAILED", message: String(failure.message).slice(0, 1500) } }, "stopped", status);
      });
    } finally {
      clearInterval(heartbeat); controller.abort();
      await store.transaction(jobId, prior => prior?.lease?.token === token ? { ...prior, lease: null } : prior);
    }
    return store.get(jobId);
  }
  async function reviewOutput({ uid, jobId, outputId, artifactSha256, accepted, note }) {
    await scoped(uid,jobId);
    if(typeof accepted!=="boolean" || !SHA.test(artifactSha256 || "") || typeof note!=="string" || !note.trim() || note.length>4000)
      throw error("CONTENT_FACTORY_FOUNDER_REVIEW_INVALID");
    return store.transaction(jobId,prior=>{
      if(prior.lease || !["awaiting_founder_review","needs_creative_revision"].includes(prior.status))throw error("CONTENT_FACTORY_FOUNDER_REVIEW_CONFLICT",409);
      const target=prior.outputs.filter(o=>o.outputId===outputId).at(-1);
      if(!target || target.artifact.sha256!==artifactSha256 || !["ready_for_founder_review","founder_accepted","founder_rejected"].includes(target.status))
        throw error("CONTENT_FACTORY_REVIEW_STALE",409);
      const outputs=prior.outputs.map(o=>o===target?{...o,status:accepted?"founder_accepted":"founder_rejected",
        founderReview:{reviewerUid:uid,reviewedAt:new Date(clock()).toISOString(),artifactSha256,note:note.trim()}}:o);
      const latest=new Map(outputs.map(o=>[o.outputId,o]));
      const status=!accepted?"needs_creative_revision":[...latest.values()].every(o=>o.status==="founder_accepted")?"founder_approved":"awaiting_founder_review";
      return {...prior,outputs,status,updatedAt:new Date(clock()).toISOString()};
    });
  }
  return { create, get: scoped, cancel, retry, reviewOutput, process, listQueued: async uid => {
    if (!validUid(uid)) throw error("CONTENT_FACTORY_SCOPE_INVALID");
    const ids = await store.listQueued(), owned = [];
    for (const id of ids) if ((await store.get(id))?.ownerUid === uid) owned.push(id);
    return owned;
  } };
}
module.exports = { createContentFactoryService, FINAL_CRITERIA };
