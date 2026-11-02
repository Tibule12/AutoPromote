// Private local CPU transport for the same router, immutable artifacts and
// authorization. The real Docker base digest and read-only host dependency
// overlay are both attested; this is explicitly not a hermetic Cloud Run image.
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { hash, stable, fail } = require('./contract');
const { CloudRunCapabilityWorker } = require('./cloudRunWorker');
const { immutableJson } = require('./stores');
const root = path.resolve(__dirname, '../..');
const codeFiles = ['model_workers/common.py', 'model_workers/local_cpu.py', 'model_workers/adapters/cpu_matting.py',
  'model_workers/adapters/segmentation.py', 'model_workers/adapters/cpu_segmentation.py',
  'python_media_worker/studio_subject_matte.py', 'config/model-runtime/registry.v1.json', 'contracts/model-capabilities-v1.json'];

class LocalCpuCapabilityWorker {
  constructor({ bucket, image, directory, modelDirectory, refinementModelDirectory, artifacts, dependenciesDirectory, baseDependencies }) {
    if (process.env.NODE_ENV === 'production' || process.env.STUDIO_MODEL_LOCAL_CPU_ENABLED !== 'true' ||
        !/^.+@sha256:[a-f0-9]{64}$/.test(image)) throw fail('MODEL_LOCAL_CPU_OFFLINE', 503);
    for (const value of [directory, modelDirectory, dependenciesDirectory, baseDependencies])
      if (!path.isAbsolute(value) || value.includes(',')) throw fail('MODEL_LOCAL_CPU_PATH_INVALID', 503);
    if(refinementModelDirectory && !path.isAbsolute(refinementModelDirectory))throw fail('MODEL_LOCAL_CPU_PATH_INVALID',503);
    Object.assign(this, { bucket, image, directory, modelDirectory, refinementModelDirectory, artifacts, dependenciesDirectory, baseDependencies });
    this.resultPrefix = 'studio/model-runtime/executions';
  }
  prefix(job) { return `${this.resultPrefix}/${job.ownerUid}/${job.id}/${job.attemptToken}`; }
  name(job) { return `autopromote-cpu-${hash(job.id+job.attemptToken).slice(0,32)}`; }
  work(job) { return path.join(this.directory, this.name(job)); }
  async inspect(job) {
    try { return JSON.parse((await run('docker', ['inspect', this.name(job)], { timeout: 15000 })).stdout)[0]; }
    catch (error) { if (error.code === 1 && /no such/i.test(error.stderr || '')) return null; throw error; }
  }
  async dispatch(job) {
    if (!['sam21-small-cpu-v1','vitmatte-small-cpu-v1'].includes(job.model.id) || job.model.requiredDevice !== 'cpu' || job.workerImage !== this.image)
      throw Object.assign(fail('MODEL_LOCAL_CPU_MODEL_INVALID', 503), { definitelyNotStarted: true });
    const previous = await this.inspect(job);
    if (previous) return { name: `local-docker:${previous.Id}` }; // Never start again after an uncertain acknowledgement.
    const available = await fs.statfs(this.directory);
    if (available.bavail*available.bsize < 5*1024**3)
      throw Object.assign(fail('MODEL_LOCAL_CPU_STORAGE_RESERVE', 503), { definitelyNotStarted: true });
    let spec;
    const modelDirectory=job.model.id==='vitmatte-small-cpu-v1'?this.refinementModelDirectory:this.modelDirectory;
    try {
      const inspected = JSON.parse((await run('docker', ['image', 'inspect', this.image], { timeout: 15000 })).stdout)[0];
      if (!(inspected.RepoDigests || []).includes(this.image)) throw fail('MODEL_LOCAL_CPU_IMAGE_UNVERIFIED', 503);
      for (const file of job.model.weights) {
        const bytes = await fs.readFile(path.join(modelDirectory, file.path));
        if (hash(bytes) !== file.sha256 || bytes.length !== file.size) throw fail('MODEL_LOCAL_CPU_CHECKPOINT_CHANGED', 503);
      }
      const work = this.work(job);
      await fs.mkdir(path.join(work, 'runtime'), { recursive: true, mode: 0o700 });
      const implementationFiles = {};
      for (const name of codeFiles) {
        const bytes = await fs.readFile(path.join(root, name));
        const dest = path.join(work, 'runtime', name);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        try { await fs.writeFile(dest, bytes, { flag: 'wx', mode: 0o600 }); }
        catch (error) { if (error.code !== 'EEXIST' || !bytes.equals(await fs.readFile(dest))) throw error; }
        implementationFiles[name] = hash(bytes);
      }
      const runtimeOverlay = { hermetic: false, scope: 'private_local_CPU_only', packageFiles: {} };
      for (const [base, names] of [[this.dependenciesDirectory, ['transformers/__init__.py', 'transformers/models/sam2_video/modeling_sam2_video.py',
        'transformers/models/sam2_video/processing_sam2_video.py', 'safetensors/__init__.py']],
        [this.baseDependencies, ['torch/__init__.py', 'torch/version.py', 'numpy/__init__.py', 'PIL/__init__.py']]])
        for (const name of names) runtimeOverlay.packageFiles[name] = hash(await fs.readFile(path.join(base, name)));
      runtimeOverlay.contractDependencyLock = JSON.parse(await fs.readFile(path.join(this.dependenciesDirectory,'cpu-contract-dependencies.lock.json'),'utf8'));
      const [sourceUrl] = await this.bucket.file(job.source.storagePath).getSignedUrl({ action: 'read',
        expires: Date.now()+20*60000, queryParams: { generation: job.source.generation } });
      let maskDependency;
      if(job.request.parameters.refinement){
        const {verifyArtifact}=require('./artifacts');
        const artifact=verifyArtifact(await this.artifacts.get(job.request.parameters.refinement.maskArtifactHash),
          {ownerUid:job.ownerUid,projectId:job.request.projectId,sourceSha256:job.request.sourceSha256});
        if(artifact.capability!=='segment_subject'||hash(artifact.sourceRange)!==hash(job.request.sourceRange)||
          artifact.sourceAssetId!==job.request.sourceAssetId||artifact.provenance.sourceGeneration!==job.source.generation)
          throw fail('MODEL_MASK_REFINEMENT_SOURCE_MISMATCH',409);
        const file=artifact.files.find(f=>f.name===artifact.output.maskBundle.name);
        const expected=`${this.resultPrefix}/${job.ownerUid}/${artifact.provenance.jobId}/${artifact.provenance.attemptToken}/outputs/${file?.name}`;
        if(!file||file.storagePath!==expected||file.bytes>75*1024**2||!/^[0-9]+$/.test(file.generation))throw fail('MODEL_MASK_REFINEMENT_FILE_INVALID',409);
        const [url]=await this.bucket.file(file.storagePath).getSignedUrl({action:'read',expires:Date.now()+20*60000,queryParams:{generation:file.generation}});
        maskDependency={artifact,file:{...file,url}};
      }
      spec = { ...job, sourceUrl, codeFiles, implementationFiles, runtimeOverlay, ...(maskDependency?{maskDependency}:{}) };
      await immutableJson(path.join(work, 'spec.json'), spec);
      // Persist the credential-free request identity in the ordinary immutable store.
      await this.bucket.file(`${this.prefix(job)}/request.json`).save(stable({ ...job, runtimeOverlay, implementationFiles }), {
        resumable: false, preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: 'application/json', metadata: { ownerUid: job.ownerUid, purpose: 'model_capability_request' } } });
    } catch (error) { error.definitelyNotStarted = true; throw error; }
    const args = ['create', '--name', this.name(job), '--label', `autopromote.request=${job.requestHash}`,
      '--cpus', '4', '--memory', '6g', '--pids-limit', '256', '--read-only', '--tmpfs', '/tmp:rw,size=134217728',
      '--user', `${process.getuid()}:${process.getgid()}`, '--entrypoint', '/opt/renderer-venv/bin/python',
      '-e', 'CUDA_VISIBLE_DEVICES=', '-e', 'NVIDIA_VISIBLE_DEVICES=void', '-e', 'OMP_NUM_THREADS=4',
      '-e', 'OPENBLAS_NUM_THREADS=4', '-e', 'PYTHONDONTWRITEBYTECODE=1',
      '-e', 'PYTHONPATH=/opt/cpu-eval:/opt/cpu-base:/opt/autopromote',
      '--mount', `type=bind,source=${path.join(this.work(job), 'runtime')},target=/opt/autopromote,readonly`,
      '--mount', `type=bind,source=${this.dependenciesDirectory},target=/opt/cpu-eval,readonly`,
      '--mount', `type=bind,source=${this.baseDependencies},target=/opt/cpu-base,readonly`,
      '--mount', `type=bind,source=${modelDirectory},target=/opt/model,readonly`,
      '--mount', `type=bind,source=${this.work(job)},target=/work`, this.image,
      '-m', 'model_workers.local_cpu', '--spec', '/work/spec.json'];
    // A failed create definitely did not execute inference. A lost start response
    // is reconciled by this exact container identity, never another create/start.
    try { await run('docker', args, { timeout: 30000, maxBuffer: 1024**2 }); }
    catch (error) { error.definitelyNotStarted = true; throw error; }
    await run('docker', ['start', this.name(job)], { timeout: 15000 });
    const container = await this.inspect(job);
    return { name: `local-docker:${container.Id}` };
  }
  async poll(job) {
    const container = await this.inspect(job);
    // Docker confirmed the exact local container is absent. No local process
    // can still be billing/running under that identity; never start a replacement.
    if (!container) return { terminal: true, result: { status: 'failed' } };
    if (container.Config.Labels?.['autopromote.request'] !== job.requestHash ||
        container.Config.Image !== job.workerImage || (container.HostConfig.DeviceRequests || []).length ||
        (container.HostConfig.Devices || []).length) throw fail('MODEL_LOCAL_CPU_ISOLATION_INVALID', 502);
    if (container.State.Running) {
      if (Date.now()-Date.parse(container.State.StartedAt) > job.model.timeoutSeconds*1000)
        await run('docker', ['stop', '--time', '5', this.name(job)], { timeout: 15000 });
      return { terminal: false };
    }
    const executionName = `local-docker:${container.Id}`;
    if (container.State.Status === 'created') return { terminal: true, executionName, result: { status: 'failed' } };
    if (!container.State.FinishedAt) return { terminal: false };
    if (container.State.ExitCode !== 0) return { terminal: true, executionName, result: { status: 'failed' } };
    const work = this.work(job), result = JSON.parse(await fs.readFile(path.join(work, 'result.json'), 'utf8'));
    if (result.jobId !== job.id || result.attemptToken !== job.attemptToken || result.requestHash !== job.requestHash ||
        result.provenance?.runtimeImage !== job.workerImage || result.metrics?.gpuCount !== 0)
      throw fail('MODEL_LOCAL_CPU_RECEIPT_INVALID', 502);
    const spec = JSON.parse(await fs.readFile(path.join(work, 'spec.json'), 'utf8'));
    if (stable(result.provenance.implementationFiles) !== stable(spec.implementationFiles) ||
        stable(result.provenance.runtimeOverlay) !== stable(spec.runtimeOverlay)) throw fail('MODEL_LOCAL_CPU_IMPLEMENTATION_INVALID', 502);
    for (const file of result.files) {
      if (!/^[a-zA-Z0-9_.-]+$/.test(file.name)) throw fail('MODEL_LOCAL_CPU_PATH_INVALID', 502);
      const local = path.join(work, 'outputs', file.name), stat = await fs.lstat(local);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.bytes || stat.size > 75*1024**2 ||
          hash(await fs.readFile(local)) !== file.sha256) throw fail('MODEL_LOCAL_CPU_BLOB_INVALID', 502);
      const remote = this.bucket.file(`${this.prefix(job)}/outputs/${file.name}`);
      try { await remote.save(await fs.readFile(local), { resumable: false, preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: file.mediaType, metadata: { ownerUid: job.ownerUid, sha256: file.sha256, purpose: 'model_capability_artifact' } } }); }
      catch (error) { if (Number(error.code) !== 412) throw error; }
      const [metadata] = await remote.getMetadata();
      if (metadata.metadata?.ownerUid !== job.ownerUid || metadata.metadata?.sha256 !== file.sha256 ||
          Number(metadata.size) !== file.bytes) throw fail('MODEL_LOCAL_CPU_STORED_BLOB_INVALID', 502);
      Object.assign(file, { storagePath: remote.name, generation: String(metadata.generation) });
    }
    result.provenance.executionName = executionName;
    result.provenance.containerLimits = { memoryBytes:container.HostConfig.Memory,nanoCpus:container.HostConfig.NanoCpus,
      gpuDeviceRequests:(container.HostConfig.DeviceRequests || []).length };
    await immutableJson(path.join(work, 'published-result.json'), result);
    return { terminal: true, executionName, result };
  }
  async cancel(job) {
    const container = await this.inspect(job);
    if (!container) return;
    if (container.State.Running) await run('docker', ['stop', '--time', '5', this.name(job)], { timeout: 15000 });
  }
  verifyFiles(job, result) { return CloudRunCapabilityWorker.prototype.verifyFiles.call(this, job, result); }
}
module.exports = { LocalCpuCapabilityWorker };
