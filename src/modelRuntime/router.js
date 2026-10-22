const crypto = require('crypto');
const { request, selectModel, hash, fail, registry, evidenceFor } = require('./contract');
const { buildArtifact, verifyArtifact } = require('./artifacts');
// The router knows capability contracts and trusted worker classes. It never
// imports a model, accepts a client model name, or invents a successful result.
class ModelCapabilityRuntime {
  constructor({ jobs, artifacts, authorize, workers, models = registry }) {
    Object.assign(this, { jobs, artifacts, authorize, workers, models });
  }
  workerFor(model) { return this.workers[`${model.workerClass}:${model.requiredDevice}`] || this.workers[model.workerClass]; }
  resolvedRegistry() {
    // Internal deployment view; never returned by the feature request API.
    // Container digests cannot be baked into their own image's registry bytes.
    return {...structuredClone(this.models),models:this.models.models.map(model=>({
      ...structuredClone(model),workerImage:this.workerFor(model)?.image || null,
      deploymentConfigured:!!this.workerFor(model),
    }))};
  }
  async submit({ ownerUid, input }) {
    if (typeof ownerUid !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,159}$/.test(ownerUid)) throw fail('MODEL_OWNER_INVALID', 403);
    const r = request(input), model = selectModel(r.capability, { models: this.models,
      ...(r.capability==='segment_subject' && r.parameters.refinement ? {modelId:this.models.refinementDefaults?.segment_subject || 'unconfigured'} : {}) });
    if(r.parameters.refinement && !model.limits?.requiresSegmentationDependency)throw fail('MODEL_MASK_REFINEMENT_UNAVAILABLE',503);
    if (r.capability==='segment_subject' && r.parameters.components?.length && !model.limits?.supportsComponents)
      throw fail('MODEL_COMPONENT_WORKER_UNAVAILABLE',503);
    const source = await this.authorize({ ownerUid, request: r, requireCurrentRevision: true });
    if (!source || source.sha256 !== r.sourceSha256 || !source.generation) throw fail('MODEL_SOURCE_UNVERIFIED', 409);
    for (const artifactHash of r.dependencyHashes) {
      const dep = verifyArtifact(await this.artifacts.get(artifactHash), { ownerUid, projectId: r.projectId, sourceSha256: r.sourceSha256 });
      if(r.capability==='segment_subject' && r.parameters.refinement?.maskArtifactHash===artifactHash &&
        (dep.capability!=='segment_subject' || dep.sourceAssetId!==r.sourceAssetId || hash(dep.sourceRange)!==hash(r.sourceRange)))
        throw fail('MODEL_MASK_REFINEMENT_SOURCE_MISMATCH',409);
      if (r.capability === 'track_object' && artifactHash === r.parameters.maskArtifactHash && dep.capability !== 'segment_subject')
        throw fail('MODEL_TRACK_MASK_REQUIRED', 409);
      if (r.capability === 'track_object' && (hash(dep.sourceRange)!==hash(r.sourceRange) || dep.output.subjectId!==r.parameters.subjectId))
        throw fail('MODEL_TRACK_MASK_RANGE_MISMATCH',409);
    }
    const worker = this.workerFor(model);
    if (!worker || !/^.+@sha256:[a-f0-9]{64}$/.test(worker.image)) throw fail('MODEL_WORKER_UNCONFIGURED', 503);
    const id = hash(`${ownerUid}\0${r.requestId}`), requestHash = hash({ request: r, model, sourceGeneration: source.generation });
    const job = { id, ownerUid, request: r, requestHash, model, source,
      registryVersion: this.models.registryVersion, workerImage: worker.image,
      attemptToken: crypto.randomUUID(), status: 'queued', executionName: null,
      createdAt: new Date().toISOString(), artifactHash: null };
    const saved = await this.jobs.create(job);
    if (saved.requestHash !== requestHash) throw fail('MODEL_REQUEST_ID_CONFLICT', 409);
    if (saved.attemptToken !== job.attemptToken) return this.present(saved);
    return this.dispatch(saved);
  }
  async dispatch(job) {
    // A queued request can outlive the edit/asset that authorized it. Recheck
    // before claiming capacity and starting paid inference.
    try {
      const source=await this.authorize({ownerUid:job.ownerUid,request:job.request,requireCurrentRevision:true});
      if(source.generation!==job.source.generation || source.sha256!==job.request.sourceSha256)throw fail('MODEL_SOURCE_CHANGED',409);
    } catch(error) {
      if(![403,404,409].includes(error.statusCode))throw error;
      await this.jobs.transition(job.id,job.attemptToken,['queued'],{status:'failed',error:'MODEL_SOURCE_OR_REVISION_STALE'});
      return this.present(await this.jobs.get(job.id));
    }
    const gpu = job.model.requiredDevice === 'cuda';
    if (!await this.jobs.claim(job.id, job.attemptToken, { gpu })) return this.present(await this.jobs.get(job.id));
    try {
      // Set before the side effect. A crash/lost response cannot invite a second
      // paid generation. Reconciliation is required for dispatching jobs.
      if (!await this.jobs.transition(job.id, job.attemptToken, ['queued'], { status: 'dispatching' })) {
        await this.jobs.release(job.id,job.attemptToken);return this.present(await this.jobs.get(job.id));
      }
      const execution = await this.workerFor(job.model).dispatch(job);
      await this.jobs.transition(job.id, job.attemptToken, ['dispatching'], { status: 'running', executionName: execution.name });
    } catch (cause) {
      const definitelyNotStarted = cause.definitelyNotStarted === true;
      await this.jobs.transition(job.id, job.attemptToken, ['queued','dispatching'], {
        status: definitelyNotStarted ? 'failed' : 'dispatch_uncertain',
        // Keep a bounded machine code for diagnosis, never worker stderr, URLs,
        // credentials or filesystem paths. The public error remains generic.
        ...(typeof cause.code === 'string' && /^[A-Z][A-Z0-9_]{1,95}$/.test(cause.code) ? { workerErrorCode: cause.code } : {}),
        error: definitelyNotStarted ? 'MODEL_DISPATCH_REJECTED' : 'MODEL_DISPATCH_RECONCILIATION_REQUIRED' });
      if (definitelyNotStarted) await this.jobs.release(job.id, job.attemptToken);
    }
    return this.present(await this.jobs.get(job.id));
  }
  async reconcile({ ownerUid, jobId }) {
    let job = await this.owned(ownerUid, jobId);
    if (job.status === 'queued') return this.dispatch(job);
    if (['completed','stale','failed','cancelled'].includes(job.status)) return this.present(job);
    const worker = this.workerFor(job.model);
    const state = await worker.poll(job); // Driver must attest cloud task termination.
    if (!state.terminal) return this.present(job);
    if (state.executionName && !job.executionName) {
      await this.jobs.transition(job.id, job.attemptToken, ['dispatch_uncertain','dispatching'], { executionName: state.executionName });
      job = await this.owned(ownerUid, jobId);
    }
    const cancelling = job.status === 'cancelling';
    try {
      if (cancelling) {
        await this.jobs.transition(job.id, job.attemptToken, ['cancelling'], { status: 'cancelled' });
      } else if (state.result?.status === 'completed') {
        // Verify actual returned bytes, not just the hash claimed by the model.
        await worker.verifyFiles(job, state.result);
        const artifact = buildArtifact({ job, result: state.result });
        let current = true;
        try { await this.authorize({ ownerUid, request: job.request, requireCurrentRevision: true }); }
        catch (e) { if (e.statusCode === 409) current = false; else throw e; }
        // Publication and job state share a transaction. A concurrent cancel
        // cannot leave an apparently usable orphan artifact in the evidence store.
        await this.jobs.finalize(job,artifact,this.artifacts,current ? 'completed' : 'stale');
      } else {
        await this.jobs.transition(job.id, job.attemptToken, ['running','dispatching','dispatch_uncertain'], { status: 'failed', error: 'MODEL_EXECUTION_FAILED' });
      }
    } catch(error) {
      if(/^MODEL_.*(?:INVALID|TOO_LARGE)$/.test(error.code || ''))
        await this.jobs.transition(job.id,job.attemptToken,['running','dispatching','dispatch_uncertain'],
          {status:'failed',error:error.code});
      throw error;
    } finally {
      // Cloud terminal, not lease expiry, is the authority for releasing GPU
      // capacity. A verification/storage failure can safely be reconciled again.
      await this.jobs.release(job.id, job.attemptToken);
    }
    return this.present(await this.jobs.get(job.id));
  }
  async cancel({ ownerUid, jobId }) {
    const job = await this.owned(ownerUid, jobId);
    if (['completed','stale','failed','cancelled'].includes(job.status)) return this.present(job);
    if (job.status === 'queued') {
      await this.jobs.transition(job.id, job.attemptToken, ['queued'], { status: 'cancelled' });
      await this.jobs.release(job.id, job.attemptToken);
    } else {
      await this.jobs.transition(job.id, job.attemptToken, ['running','dispatching','dispatch_uncertain'], { status: 'cancelling' });
      await this.workerFor(job.model).cancel(job);
    }
    return this.present(await this.jobs.get(job.id));
  }
  async owned(ownerUid, jobId) {
    if (!/^[a-f0-9]{64}$/.test(jobId)) throw fail('MODEL_JOB_MISSING', 404);
    const job = await this.jobs.get(jobId);
    if (!job || job.ownerUid !== ownerUid) throw fail('MODEL_JOB_MISSING', 404);
    return job;
  }
  async getArtifact({ ownerUid, jobId }) {
    const job = await this.owned(ownerUid, jobId);
    if (!['completed','stale'].includes(job.status) || !job.artifactHash) throw fail('MODEL_ARTIFACT_NOT_AVAILABLE', 409);
    const artifact = verifyArtifact(await this.artifacts.get(job.artifactHash), { ownerUid, projectId: job.request.projectId });
    return { artifact, evidence: evidenceFor(artifact), applicable: job.status === 'completed' };
  }
  present(job) {
    return { jobId: job.id, projectId: job.request.projectId, capability: job.request.capability,
      status: job.status, artifactHash: job.artifactHash, error: job.error || null };
  }
}
module.exports = { ModelCapabilityRuntime };
