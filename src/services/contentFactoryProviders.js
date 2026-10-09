const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");
const execFile = promisify(require("child_process").execFile);
const { directionSchema, reviewSchema, revisionSchema } = require("./contentFactorySchemas");
const { error, ID, digest, validateDirection } = require("./contentFactoryContract");
const { createFactoryArtifactAccess } = require('./contentFactoryArtifactAccess');
const {visualSubjectsForCaption} = require('./studioBRollPlanGrounding');

// All commands, images and paths are administrator configuration. The brief
// supplies data files only. No public model endpoint or Google fallback exists.
function createNvidiaFactoryProviders({ root, host, remoteRoot, deadlineEpoch, sshPort,
  python = "python3", workerDirectory = path.resolve(__dirname, "../../python_media_worker"),
  scriptsDirectory = path.resolve(__dirname, "../../scripts"), suppliedDirection = null, renderDevice = "auto", uiCapture = null, assetLibrary = null,
  scenePerformanceReviewer = null }) {
  root = path.resolve(root);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(host || "") || !/^\/data\/[A-Za-z0-9/_-]{1,150}$/.test(remoteRoot || "") ||
      remoteRoot.includes("..") || !Number.isFinite(deadlineEpoch) || deadlineEpoch <= Date.now()/1000 ||
      (sshPort !== undefined && (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535)))
    throw error("CONTENT_FACTORY_NVIDIA_CONFIGURATION_REQUIRED", 503);
  const command = (file, args, signal, timeout = 20 * 60 * 1000) => execFile(file, args, { signal, timeout, maxBuffer: 8 * 1024 * 1024 });
  const sshOptions=["-o","RequestTTY=no","-o","ControlMaster=auto","-o","ControlPersist=600","-o",`ControlPath=/tmp/autopromote-factory-${process.getuid?.() || 0}-%C`,...(sshPort?["-o",`Port=${sshPort}`]:[])];
  const remote = (cmd, signal, timeout) => command("ssh", ["-n", "-T", ...sshOptions, "-o", "ConnectTimeout=15", host, cmd], signal, timeout);
  let remoteOwner;
  const transfer = async (from, to, signal) => {
    if(to.startsWith(`${host}:`)) {
      const target=to.slice(host.length+1);
      if(!target.startsWith(remoteRoot+"/") || !/^[A-Za-z0-9/_.-]+$/.test(target))throw error("CONTENT_FACTORY_TRANSFER_PATH_INVALID");
      if(!remoteOwner){
        const ids=(await remote("id -u && id -g",signal)).stdout.trim().split(/\s+/);
        if(ids.length!==2 || ids.some(id=>!/^\d+$/.test(id)))throw error("CONTENT_FACTORY_REMOTE_OWNER_INVALID");
        remoteOwner=ids.join(":");
      }
      // GPU containers may create root-owned nested artifact directories.
      // Restore only this private destination parent to the SSH operator.
      await remote(`sudo -n chown ${remoteOwner} ${path.posix.dirname(target)}`,signal);
      // Containers can produce root-owned artifacts. Upload a new private
      // sibling and rename atomically rather than truncate the existing file.
      const temp=`${target}.${crypto.randomUUID()}.upload`;
      await command("scp",["-q",...sshOptions,from,`${host}:${temp}`],signal);
      await remote(`chmod 600 ${temp} && mv -f ${temp} ${target}`,signal);
      return;
    }
    return command("scp",["-q",...sshOptions,from,to],signal);
  };
  const container = async (name, cmd, signal, needsGpu = true, timeout) => {
    try { return await remote(needsGpu ? `flock -n -E 75 /data/autopromote-l40s-20261006/content-factory-gpu.lock ${cmd}` : cmd, signal, timeout); }
    catch (failure) {
      if(failure.code===75) throw error("CONTENT_FACTORY_GPU_BUSY",503);
      // Closing SSH is not proof the GPU subprocess stopped. Stop only this
      // attempt's named container, including timeout/network-loss recovery.
      await command("ssh",["-T",...sshOptions,"-o","ConnectTimeout=10",host,`docker stop -t 10 ${name}`],undefined,30_000).catch(()=>{});
      throw failure;
    }
  };
  const {artifactPath,verifyArtifact,urlFor}=createFactoryArtifactAccess({root});
  const gpuIdle = async signal => {
    if (Date.now()/1000 + 90 >= deadlineEpoch) throw error("CONTENT_FACTORY_GPU_WINDOW_EXPIRED", 409);
    const result = await remote("nvidia-smi --query-gpu=name --format=csv,noheader && nvidia-smi --query-compute-apps=pid --format=csv,noheader", signal);
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    if (lines[0] !== "NVIDIA L40S") throw error("CONTENT_FACTORY_NVIDIA_DEVICE_MISMATCH", 409);
    if (lines.length > 1) throw error("CONTENT_FACTORY_GPU_BUSY", 503);
  };
  async function creative({ id, input, system, schema, signal, image, frames, requests }) {
    if (!ID.test(id)) throw error("CONTENT_FACTORY_TASK_ID_INVALID");
    const dir = path.join(root, "tasks"); await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const requestFile = path.join(dir, `${id}.json`), resultFile = path.join(dir, `${id}-result.json`);
    let remoteImage;
    if (image) remoteImage = `/work/${path.relative(root, image).split(path.sep).join("/")}`;
    const remoteFrames=[];
    for(const f of frames || []) {
      const real=await artifactPath({path:f.path});const rel=path.relative(root,real).split(path.sep).join('/');
      if(!/^[A-Za-z0-9/_.-]+$/.test(rel)||rel.includes('..'))throw error('CONTENT_FACTORY_EVIDENCE_PATH_INVALID');
      const sha=crypto.createHash('sha256').update(await fs.readFile(real)).digest('hex');
      if(sha!==f.sha256)throw error('CONTENT_FACTORY_EVIDENCE_HASH_MISMATCH',409);
      remoteFrames.push({...f,path:`/work/${rel}`});
    }
    const request = requests ? {deadlineEpoch,requests} : { deadlineEpoch, id, input, system, schema, ...(remoteImage ? { image: remoteImage } : {}),...(remoteFrames.length?{frames:remoteFrames,maxTokens:2400}:{}) };
    const fingerprint = digest({ id, ...(requests?{requests}:{input,system,schema}), frames:remoteFrames,image: image ? crypto.createHash("sha256").update(await fs.readFile(image)).digest("hex") : null });
    try {
      const prior = JSON.parse(await fs.readFile(resultFile, "utf8"));
      if (prior.fingerprint === fingerprint) return prior.result;
    } catch (e) { if (e.code !== "ENOENT") throw e; }
    await gpuIdle(signal);
    await fs.writeFile(requestFile, JSON.stringify(request), { mode: 0o600 });
    await remote(`mkdir -p ${remoteRoot}/tasks ${remoteRoot}/scripts/content-factory`, signal);
    await transfer(path.join(scriptsDirectory,"content-factory/nvidia-creative.py"), `${host}:${remoteRoot}/scripts/content-factory/nvidia-creative.py`, signal);
    await transfer(requestFile, `${host}:${remoteRoot}/tasks/${id}.json`, signal);
    if(remoteFrames.length){
      const bundle=path.join(dir,`${id}-frames.tar.gz`);const names=remoteFrames.map(f=>f.path.slice('/work/'.length));
      await command('tar',['-czf',bundle,'-C',root,...names],signal,60000);
      await transfer(bundle,`${host}:${remoteRoot}/tasks/${id}-frames.tar.gz`,signal);
      await remote(`tar -xzf ${remoteRoot}/tasks/${id}-frames.tar.gz -C ${remoteRoot}`,signal);
    }
    if (image) {
      const rel = path.relative(root,image).split(path.sep).join("/");
      if (!/^[A-Za-z0-9/_.-]+$/.test(rel) || rel.includes("..")) throw error("CONTENT_FACTORY_EVIDENCE_PATH_INVALID");
      await remote(`mkdir -p ${remoteRoot}/${path.posix.dirname(rel)}`, signal);
      await transfer(image, `${host}:${remoteRoot}/${rel}`, signal);
    }
    const seconds = Math.floor(Math.min(600, deadlineEpoch-Date.now()/1000-30));
    await container(`factory-creative-${id}`,`docker run --rm --name factory-creative-${id} --gpus all --network none --shm-size 2g -v ${remoteRoot}:/work -v /data/autopromote-l40s-20261006/models/browser-vision-qwen3:/models:ro --entrypoint timeout autopromote-browser-vision:20261006-portable ${seconds} python3 /work/scripts/content-factory/nvidia-creative.py --model-dir /models --request /work/tasks/${id}.json --output /work/tasks/${id}-response.json`, signal);
    const temp = `${resultFile}.download`;
    await transfer(`${host}:${remoteRoot}/tasks/${id}-response.json`, temp, signal);
    const results = JSON.parse(await fs.readFile(temp,"utf8")),result=requests?results:results[0];
    await fs.writeFile(resultFile,JSON.stringify({fingerprint,result},null,2),{mode:0o600});await fs.unlink(temp);
    return result;
  }
  async function plan(context) {
    if(assetLibrary && assetLibrary.ownerUid !== context.ownerUid) throw error("CONTENT_FACTORY_LIBRARY_SCOPE_INVALID",403);
    if(suppliedDirection)return suppliedDirection;
    const schema=structuredClone(directionSchema);
    schema.properties.assets.items.properties.provider.enum=assetLibrary?["reuse"]:["wan","motion","original_audio","kokoro","sdxl"];
    schema.properties.assets.items.properties.type.enum=["video","motion","audio","image","ui"];
    if(assetLibrary){schema.properties.assets.items.properties.libraryRef={enum:assetLibrary.assets.filter(a=>a.status==='accepted').map(a=>a.assetId)};schema.properties.assets.items.required.push("libraryRef");}
    for(const field of ["prompt","reason","assetId","beatId"])schema.properties.assets.items.properties[field].minLength=1;
    const object=properties=>({type:"object",additionalProperties:false,properties,required:Object.keys(properties)});
    const common={brief:context.sourceBrief,targets:context.targets,...(assetLibrary?{availableLibrary:assetLibrary.assets.filter(a=>a.status==="accepted").map(a=>({libraryRef:a.assetId,type:a.type,duration:a.artifact.duration,role:a.review.reason,audioRole:a.audioRole}))}:{})};
    let correction=null;
    for(let attempt=1;attempt<=3;attempt++) {
      await gpuIdle(context.signal);
      const id=`plan-stages-${context.jobId.slice(0,16)}-${attempt}`,dir=path.join(root,"tasks");
      await fs.mkdir(dir,{recursive:true,mode:0o700});
      const requests=[
        {id:"direction",input:{...common,correction},schema:object({title:schema.properties.title,story:schema.properties.story,script:schema.properties.script}),maxTokens:3200,
          system:"Create a coherent story and script for AutoPromote private founder marketing. Each story field is ONE concise sentence, at most 40 words. Use 3–6 script beats, at most 20 words per action/sound. State why a stranger cares, hook, beginning, escalation, problem, payoff, ending, withheld information, amplification and removal. Effects serve story. Do not imply the private factory is public. Do not repeat phrases or fill the available token budget."},
        {id:"assets",contextFrom:["direction"],input:{...common,correction},schema:object({assets:schema.properties.assets}),maxTokens:4500,
          system:"Turn the prior story/script into individual raw asset requirements. Wan: standalone 5.04-second cinematic video shots, no text or sound. Specify paper boat shape and lighting consistently, precise framing and visible physical action. Motion: clean animated white titles on dark background with amber detail, prompt ONLY literal screen wording (e.g. AutoPromote), duration 0.5-10 seconds. SDXL: a native image and timed still for 0.5-10 seconds, never claim it has generated video action. Kokoro: CPU synthetic brand narration, prompt ONLY spoken words, no person's identity. Original_audio: original restrained electronic instrumental tension-resolution score, full output length, prompt must be nonempty, acceptance criteria ONLY audible stereo instrumental score, no clipped samples, correct sample rate and duration. Give audio assets at least 20 seconds of score for a 15-second film. IDs are lowercase hyphenated filenames. Every beatId must match a prior script beat. Every asset needs a concrete nonempty prompt. At most eight assets; follow any smaller count specified in the brief. Never ask a title card to depict an ocean or moving boat."},
        {id:"edits",contextFrom:["direction","assets"],input:{...common,correction},schema:object({outputs:schema.properties.outputs}),maxTokens:2400,
          system:"Assemble the prior raw assets into complete outputs. Sequence start is SOURCE time in ONE asset, never output time. Correct example: shot-one start 0 duration 3, shot-two start 0 duration 3, end-card start 0 duration 2. Each source start+duration must fit that asset's duration. Usually use start 0. Audio may NOT appear in picture sequence: reference score by musicAssetId. Score duration must cover total output. Every output needs hook, development, visible tension, payoff and ending. Use 16:9 initially. Select assets by their exact IDs. Trim dead time and end-cards to maintain pacing."}
      ];
      if(assetLibrary){
        requests[1].system="Select reusable raw material from the administrator's private availableLibrary for the prior story. Provider is reuse with an exact libraryRef. Type matches that source; duration MUST equal the full RAW library duration, never the edited shot length. Assign distinct asset IDs and current script beat IDs. Every prompt and criterion is concise. Use matching boat shots, moving wave, actual Studio UI, identity, score and narration as appropriate, up to twelve assets. Audio criteria ONLY audible stereo audio, no clipped samples, 48000 Hz sample rate and duration. Visual acceptance criteria must describe the WHOLE RAW TAKE and its usable trim; do not reject useful material for an intentionally omitted lead-in. Native provenance and exact libraryRef are verified separately: do not put them in visual criteria. No fresh generation is claimed.";
      }
      const file=path.join(dir,`${id}.json`),response=path.join(dir,`${id}-response.json`);
      await fs.writeFile(file,JSON.stringify({deadlineEpoch,requests}),{mode:0o600});
      await remote(`mkdir -p ${remoteRoot}/tasks ${remoteRoot}/scripts/content-factory`,context.signal);
      await transfer(file,`${host}:${remoteRoot}/tasks/${id}.json`,context.signal);
      await transfer(path.join(scriptsDirectory,"content-factory/nvidia-creative.py"),`${host}:${remoteRoot}/scripts/content-factory/nvidia-creative.py`,context.signal);
      await container(`factory-creative-${id}`,`docker run --rm --name factory-creative-${id} --gpus all --network none --shm-size 2g -v ${remoteRoot}:/work -v /data/autopromote-l40s-20261006/models/browser-vision-qwen3:/models:ro --entrypoint timeout autopromote-browser-vision:20261006-portable 600 python3 /work/scripts/content-factory/nvidia-creative.py --model-dir /models --request /work/tasks/${id}.json --output /work/tasks/${id}-response.json`,context.signal);
      await transfer(`${host}:${remoteRoot}/tasks/${id}-response.json`,response,context.signal);
      const results=JSON.parse(await fs.readFile(response,"utf8"));
      const value={schemaVersion:1,...results[0].value,...results[1].value,...results[2].value,
        plannerProvenance:{model:results[0].model,modelRevision:results[0].modelRevision,settings:results.map(r=>r.settings),stages:results.map(r=>({id:r.id,seconds:r.seconds}))}};
      // A cumulative programme position cannot be a trim in a five-second
      // source. Correct only that unambiguous representation error; preserve
      // shot order/duration and reject every other out-of-range trim.
      const repairs=results.flatMap(r=>r.contractRepairs || []);
      for(const output of value.outputs){let programmeTime=0;
        for(const shot of output.sequence){const asset=value.assets.find(a=>a.assetId===shot.assetId);
          if(asset && shot.start+shot.duration>asset.duration+1/24 && Math.abs(shot.start-programmeTime)<1/24 && shot.duration<=asset.duration+1/24){
            repairs.push({outputId:output.outputId,assetId:shot.assetId,from:shot.start,to:0,reason:"Programme position converted to individual source trim"});shot.start=0;
          }
          programmeTime+=shot.duration;
        }
      }
      value.plannerProvenance.contractRepairs=repairs;
      if(assetLibrary)for(const asset of value.assets){
        const parent=assetLibrary.assets.find(a=>a.assetId===asset.libraryRef);
        if(parent && asset.provider==='reuse' && asset.duration!==parent.artifact.duration){repairs.push({assetId:asset.assetId,from:asset.duration,to:parent.artifact.duration,reason:'Raw source duration measured from immutable library artifact'});asset.duration=parent.artifact.duration;}
      }
      try {
        validateDirection(value);
        for(const a of value.assets)if((a.provider==="motion"&&(a.prompt.length>96||a.duration>10))||(a.provider==="wan"&&a.duration>(a.videoModel==='wan_i2v_a14b'?7.5625:5.05)))throw error("CONTENT_FACTORY_SUPPORTED_ASSET_LIMIT");
        return value;
      } catch(failure) {
        correction={error:failure.code || failure.message,previousPlan:value,
          instructions:"Repair the exact invalid fields. Every prompt must be nonempty. All sequence starts refer to local source time, usually zero; do not carry cumulative timeline times into source trims. Keep score long enough. Preserve the story's actual payoff."};
      }
    }
    throw error("CONTENT_FACTORY_DIRECTION_REJECTED",422);
  }
  async function generate(context) {
    const {requirement,attemptId,signal}=context;
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,140}$/.test(attemptId || ''))throw error('CONTENT_FACTORY_ATTEMPT_ID_INVALID');
    const out=path.join(root,"assets",attemptId);await fs.mkdir(out,{recursive:true,mode:0o700});
    if(requirement.provider==="reuse"){
      if(!assetLibrary || assetLibrary.ownerUid!==context.ownerUid)throw error("CONTENT_FACTORY_LIBRARY_SCOPE_INVALID",403);
      const parent=assetLibrary.assets.find(a=>a.assetId===requirement.libraryRef && a.status==="accepted" && a.review?.accepted);
      if(!parent || parent.type!==requirement.type || requirement.duration>parent.artifact.duration+1/24)throw error("CONTENT_FACTORY_LIBRARY_REFERENCE_INVALID");
      const verified=await verifyArtifact(parent.artifact,{signal});
      const file=path.join(out,`source.${verified.container}`);await fs.copyFile(await artifactPath(verified),file);
      const receipt={origin:"reused_server_generated",parentArtifact:verified,parentProvenance:parent.provenance,parentReview:parent.review,
        sourceBrief:context.sourceBrief,intendedRole:requirement.prompt,reusedAt:new Date().toISOString()};
      const reusableArtifacts=[];
      for(const [index,native] of (parent.reusableArtifacts || []).entries()){
        if(index>=16 || !/^[a-f0-9]{64}$/.test(native.sha256 || ''))throw error('CONTENT_FACTORY_REUSABLE_REFERENCE_INVALID',409);
        const source=await artifactPath(native),bytes=await fs.readFile(source);
        if(bytes.length>512*1024*1024 || crypto.createHash('sha256').update(bytes).digest('hex')!==native.sha256)throw error('CONTENT_FACTORY_REFERENCE_HASH_MISMATCH',409);
        const extension=path.extname(source);if(!/^\.[A-Za-z0-9]{1,12}$/.test(extension))throw error('CONTENT_FACTORY_REUSABLE_REFERENCE_INVALID',409);
        const destination=path.join(out,`native-${index}${extension}`);await fs.copyFile(source,destination);
        reusableArtifacts.push({...native,path:path.relative(root,destination)});
      }
      await fs.writeFile(path.join(out,"reuse-receipt.json"),JSON.stringify(receipt,null,2),{mode:0o600});
      return {artifact:{...verified,path:path.relative(root,file)},audioRole:parent.audioRole,
        model:parent.provenance.model,modelRevision:parent.provenance.modelRevision,
        settings:parent.provenance.settings,seed:parent.provenance.seed,origin:receipt.origin,parentProvenance:receipt,
        reusableArtifacts,tool:"AutoPromote private owner-scoped raw asset reuse"};
    }
    if (requirement.provider==="original_audio") {
      await command(python,[path.join(scriptsDirectory,"content-factory/make-original-audio.py"),"--output",out,"--duration",String(requirement.duration),"--seed",String(requirement.seed+context.attempt-1)],signal);
      const receipt=JSON.parse(await fs.readFile(path.join(out,"score-receipt.json"),"utf8"));
      return {...receipt,audioRole:"music",artifact:{...receipt.artifact,path:path.relative(root,receipt.artifact.path)}};
    }
    if (requirement.provider === "ace_step") {
      if (requirement.type !== "audio" || requirement.duration < 10 || requirement.duration > 60)
        throw error("CONTENT_FACTORY_MUSIC_REQUIREMENT_INVALID");
      if (Date.now()/1000 + 600 >= deadlineEpoch) throw error("CONTENT_FACTORY_GPU_WINDOW_EXPIRED",409);
      await gpuIdle(signal);
      const remoteOut=`${remoteRoot}/assets/${attemptId}`;
      await remote(`mkdir -p ${remoteOut} ${remoteRoot}/scripts/content-factory`,signal);
      const requestFile=path.join(out,"music-request.json");
      await fs.writeFile(requestFile,JSON.stringify({deadlineEpoch,sourceBrief:context.sourceBrief,
        prompt:requirement.prompt,duration:requirement.duration,seed:requirement.seed+context.attempt-1}),{mode:0o600});
      await transfer(requestFile,`${host}:${remoteOut}/request.json`,signal);
      await transfer(path.join(scriptsDirectory,"content-factory/generate-music.py"),`${host}:${remoteRoot}/scripts/content-factory/generate-music.py`,signal);
      const name=`factory-music-${attemptId}`;
      await container(name,`docker run --rm --name ${name} --gpus all --network none -v ${remoteRoot}:/work --entrypoint timeout autopromote-factory-music:20261007 480 python3 /work/scripts/content-factory/generate-music.py --models /work/models/ace-step --request /work/assets/${attemptId}/request.json --output /work/assets/${attemptId}`,signal);
      for(const name of ["audio.wav","native.wav","receipt.json"])await transfer(`${host}:${remoteOut}/${name}`,path.join(out,name),signal);
      const receipt=JSON.parse(await fs.readFile(path.join(out,"receipt.json"),"utf8"));
      return {...receipt,audioRole:"music",origin:"native_audio_generation",
        artifact:{...receipt.artifact,path:path.relative(root,path.join(out,"audio.wav"))},
        reusableArtifacts:[{role:"native_audio",path:path.relative(root,path.join(out,"native.wav")),sha256:receipt.nativeArtifact.sha256}]};
    }
    if(requirement.provider==='wan_video_refine') {
      if(requirement.type!=='video' || requirement.duration<3 || requirement.duration>121/24 ||
          !Number.isFinite(requirement.refinementStrength) || requirement.refinementStrength<.2 || requirement.refinementStrength>.85)
        throw error('CONTENT_FACTORY_VIDEO_REFINEMENT_INVALID');
      const parent=context.priorAssets?.find(a=>a.assetId===requirement.referenceVideoAssetId && a.status==='accepted' && a.review?.accepted);
      if(!parent || !['video','three_d','motion'].includes(parent.type))throw error('CONTENT_FACTORY_REFERENCE_UNREVIEWED',409);
      const verified=await verifyArtifact(parent.artifact,{signal});
      if(!verified.width || verified.duration<3 || verified.duration>10)throw error('CONTENT_FACTORY_VIDEO_REFINEMENT_INVALID');
      if(Date.now()/1000+1200>=deadlineEpoch)throw error('CONTENT_FACTORY_GPU_WINDOW_EXPIRED',409);
      const remoteOut=`${remoteRoot}/assets/${attemptId}`;
      await remote(`mkdir -p ${remoteOut} ${remoteRoot}/scripts/content-factory`,signal);
      const reference={assetId:parent.assetId,artifact:verified,provenance:parent.provenance || null};
      const requestFile=path.join(out,'refinement-request.json');
      await fs.writeFile(requestFile,JSON.stringify({sourceVideo:`/work/assets/${attemptId}/reference.mp4`,sourceVideoSha256:verified.sha256,
        reference,sourceBrief:context.sourceBrief,prompt:requirement.prompt,negativePrompt:requirement.negativePrompt,
        strength:requirement.refinementStrength,seed:requirement.seed+context.attempt-1,deadlineEpoch}),{mode:0o600});
      await transfer(await artifactPath(verified),`${host}:${remoteOut}/reference.mp4`,signal);
      await transfer(requestFile,`${host}:${remoteOut}/request.json`,signal);
      await transfer(path.join(scriptsDirectory,'content-factory/refine-video.py'),`${host}:${remoteRoot}/scripts/content-factory/refine-video.py`,signal);
      await gpuIdle(signal);
      const name=`factory-refine-${attemptId}`,seconds=Math.floor(Math.min(1100,deadlineEpoch-Date.now()/1000-30));
      await container(name,`docker run --rm --name ${name} --gpus all --network none -v ${remoteRoot}:/work -v /data/autopromote-l40s-20261006/models:/models:ro --entrypoint timeout autopromote-wan-cuda:20261006 ${seconds} python3 /work/scripts/content-factory/refine-video.py --root /work --models /models --request /work/assets/${attemptId}/request.json --output /work/assets/${attemptId}`,signal);
      for(const file of ['video.mp4','native.mp4','receipt.json'])await transfer(`${host}:${remoteOut}/${file}`,path.join(out,file),signal);
      const receipt=JSON.parse(await fs.readFile(path.join(out,'receipt.json'),'utf8'));
      if(receipt.settings.reference.artifactSha256!==verified.sha256)throw error('CONTENT_FACTORY_REFERENCE_HASH_MISMATCH',409);
      return {...receipt,artifact:{...receipt.artifact,path:path.relative(root,path.join(out,'video.mp4'))},
        reusableArtifacts:[{role:'native_video',path:path.relative(root,path.join(out,'native.mp4')),sha256:receipt.nativeArtifact.sha256}],parentProvenance:reference};
    }
    if (requirement.provider==="motion") {
      await command(python,[path.join(scriptsDirectory,"content-factory/make-motion-asset.py"),"--output",out,"--text",requirement.prompt,"--duration",String(requirement.duration)],signal);
      return JSON.parse(await fs.readFile(path.join(out,"receipt.json"),"utf8"));
    }
    if(requirement.provider==="ui_capture") {
      if(!uiCapture?.url || !uiCapture?.projectName)throw error("CONTENT_FACTORY_UI_CAPTURE_CONFIGURATION_REQUIRED",503);
      await command(process.execPath,[path.join(scriptsDirectory,"content-factory/capture-studio.js"),uiCapture.url,uiCapture.projectName,out],signal,180_000);
      const receipt=JSON.parse(await fs.readFile(path.join(out,"receipt.json"),"utf8"));
      return {...receipt,settings:{...receipt.settings,sourceBrief:context.sourceBrief}};
    }
    if (["sdxl","kokoro","blender","brand_ident"].includes(requirement.provider)) {
      const remoteOut=`${remoteRoot}/assets/${attemptId}`;
      await remote(`mkdir -p ${remoteOut} ${remoteRoot}/scripts/content-factory`,signal);
      let receiptFile;
      if(requirement.provider==="kokoro") {
        const file=path.join(out,"narration-request.json");
        await fs.writeFile(file,JSON.stringify({deadlineEpoch,sourceBrief:context.sourceBrief,
          lines:[{id:requirement.assetId,text:requirement.prompt,speed:1}]}));
        await transfer(file,`${host}:${remoteOut}/request.json`,signal);
        await transfer(path.join(scriptsDirectory,"content-factory/generate-narration.py"),`${host}:${remoteRoot}/scripts/content-factory/generate-narration.py`,signal);
        // Kokoro is small enough for CPU. Do not reserve a GPU for narration.
        const name=`factory-narration-${attemptId}`;
        await container(name,`docker run --rm --name ${name} --network none -e NVIDIA_VISIBLE_DEVICES=void -v ${remoteRoot}:/work --entrypoint timeout autopromote-factory-audio:20261007 300 python3 /work/scripts/content-factory/generate-narration.py --models /work/models/kokoro --request /work/assets/${attemptId}/request.json --output /work/assets/${attemptId}`,signal,false);
        await transfer(`${host}:${remoteOut}/${requirement.assetId}.wav`,path.join(out,"audio.wav"),signal);
        receiptFile=`${remoteOut}/${requirement.assetId}-receipt.json`;
      } else if(requirement.provider==="sdxl") {
        await gpuIdle(signal);
        const file=path.join(out,"image-request.json");
        await fs.writeFile(file,JSON.stringify({deadlineEpoch,sourceBrief:context.sourceBrief,
          images:[{id:requirement.assetId,prompt:requirement.prompt,seed:requirement.seed+context.attempt-1,duration:requirement.duration}]}));
        await transfer(file,`${host}:${remoteOut}/request.json`,signal);
        await transfer(path.join(scriptsDirectory,"content-factory/generate-image.py"),`${host}:${remoteRoot}/scripts/content-factory/generate-image.py`,signal);
        await container(`factory-image-${attemptId}`,`docker run --rm --name factory-image-${attemptId} --gpus all --network none -v ${remoteRoot}:/work --entrypoint timeout autopromote-wan-cuda:20261006 600 python3 /work/scripts/content-factory/generate-image.py --models /work/models/sdxl --request /work/assets/${attemptId}/request.json --output /work/assets/${attemptId}`,signal);
        for(const name of ["image.png","video.mp4"])await transfer(`${host}:${remoteOut}/${requirement.assetId}/${name}`,path.join(out,name),signal);
        receiptFile=`${remoteOut}/${requirement.assetId}/receipt.json`;
      } else {
        await gpuIdle(signal);
        const ident=requirement.provider==="brand_ident",transform=requirement.blenderScene==='paper_to_yacht',script=ident?"make-brand-ident.py":transform?"make-paper-yacht-transformation.py":"make-paper-ocean-3d.py";
        const file=path.join(out,"scene-config.json");
        await fs.writeFile(file,JSON.stringify({template:ident?"autopromote_ident":transform?'paper_to_yacht':"paper_ocean",...(ident?{style:requirement.identStyle,deadlineEpoch}:transform?{deadlineEpoch}:{}),duration:Math.min(requirement.duration,10),fps:24,width:1280,height:ident||transform?720:704,seed:requirement.seed+context.attempt-1,sourceBrief:context.sourceBrief}));
        await transfer(file,`${host}:${remoteOut}/request.json`,signal);
        await transfer(path.join(scriptsDirectory,`content-factory/${script}`),`${host}:${remoteRoot}/scripts/content-factory/${script}`,signal);
        const name=`factory-3d-${attemptId}`;
        await container(name,`docker run --rm --name ${name} --gpus all --network none -e STUDIO_3D_DEVICE=optix -e STUDIO_3D_SAMPLES=${transform?64:32} -v ${remoteRoot}:/work --entrypoint blender autopromote-studio-3d:20261006-final --background --python /work/scripts/content-factory/${script} -- /work/assets/${attemptId}/request.json /work/assets/${attemptId}`,signal);
        await remote(`docker run --rm --network none -e NVIDIA_VISIBLE_DEVICES=void -v ${remoteRoot}:/work --entrypoint ffmpeg autopromote-media-gpu:20261006-final -y -v error -framerate 24 -i /work/assets/${attemptId}/frame_%04d.png -c:v libx264 -crf 17 -pix_fmt yuv420p -movflags +faststart /work/assets/${attemptId}/video.mp4`,signal);
        for(const name of [ident?"autopromote-ident.blend":transform?'paper-yacht.blend':"paper-ocean.blend","video.mp4"])await transfer(`${host}:${remoteOut}/${name}`,path.join(out,name),signal);
        receiptFile=`${remoteOut}/scene-receipt.json`;
      }
      await transfer(`${host}:${receiptFile}`,path.join(out,"generation-receipt.json"),signal);
      const receipt=JSON.parse(await fs.readFile(path.join(out,"generation-receipt.json"),"utf8"));
      const audio=requirement.provider==="kokoro";
      const ident=requirement.provider==="brand_ident";
      if(ident){
        await command(python,[path.join(scriptsDirectory,"content-factory/make-ident-audio.py"),"--receipt",path.join(out,"generation-receipt.json"),"--output",path.join(out,"ident.wav")],signal);
        await command("ffmpeg",["-y","-v","error","-i",path.join(out,"video.mp4"),"-i",path.join(out,"ident.wav"),"-c:v","copy","-c:a","aac","-b:a","192k","-shortest","-movflags","+faststart",path.join(out,"ident.mp4")],signal);
      }
      const extra=requirement.provider==="blender"?[requirement.blenderScene==='paper_to_yacht'?'paper-yacht.blend':"paper-ocean.blend"]:ident?["autopromote-ident.blend","ident.wav","audio-receipt.json"]:requirement.provider==="sdxl"?["image.png"]:[];
      const reusableArtifacts=await Promise.all(extra.map(async name=>({role:name.endsWith(".blend")?"native_scene":name.endsWith('.wav')?'audio_source':name.endsWith('.json')?'audio_metadata':"native_image",
        path:path.relative(root,path.join(out,name)),sha256:crypto.createHash("sha256").update(await fs.readFile(path.join(out,name))).digest("hex")})));
      return {artifact:{path:path.relative(root,path.join(out,audio?"audio.wav":ident?"ident.mp4":"video.mp4")),...(receipt.artifact?.sha256?{sha256:receipt.artifact.sha256}:{})},
        model:receipt.model || (ident?"Blender AutoPromote studio ident":"Blender procedural paper ocean"),modelRevision:receipt.modelRevision || receipt.version,
        tool:receipt.tool,settings:receipt.settings || {...receipt.config,device:receipt.device},audioRole:audio?"voiceover":ident?"brand_ident":null,reusableArtifacts};
    }
    if (requirement.provider!=="wan") throw error("CONTENT_FACTORY_PROVIDER_UNAVAILABLE",503);
    const name=attemptId;
    let reference=null,referenceFile;
    if(requirement.referenceAssetId){
      const parent=context.priorAssets?.find(a=>a.assetId===requirement.referenceAssetId && a.status==='accepted' && a.review?.accepted);
      if(!parent)throw error('CONTENT_FACTORY_REFERENCE_UNREVIEWED',409);
      const verified=await verifyArtifact(parent.artifact,{signal});
      referenceFile=path.join(out,'reference.png');
      const native=parent.type==='image' && parent.reusableArtifacts?.find(a=>a.role==='native_image');
      if(native){
        const real=await artifactPath(native),bytes=await fs.readFile(real);
        if(bytes.length>40*1024*1024 || crypto.createHash('sha256').update(bytes).digest('hex')!==native.sha256)throw error('CONTENT_FACTORY_REFERENCE_HASH_MISMATCH',409);
        await fs.copyFile(real,referenceFile);
      }else{
        const at=requirement.referenceTime ?? 0;
        if(!Number.isFinite(at)||at<0||at>=verified.duration)throw error('CONTENT_FACTORY_REFERENCE_INVALID');
        await command('ffmpeg',['-y','-v','error','-ss',String(at),'-i',await artifactPath(verified),'-frames:v','1',referenceFile],signal,60000);
      }
      reference={assetId:parent.assetId,parentArtifactSha256:verified.sha256,sourceTime:native?null:requirement.referenceTime ?? 0,
        frameSha256:crypto.createHash('sha256').update(await fs.readFile(referenceFile)).digest('hex')};
      await fs.writeFile(path.join(out,'reference-receipt.json'),JSON.stringify(reference,null,2),{mode:0o600});
    }
    if(requirement.videoModel==='wan_i2v_a14b') {
      if(!reference)throw error('CONTENT_FACTORY_REFERENCE_REQUIRED',409);
      let lastReference=null,lastReferenceFile;
      if(requirement.lastReferenceAssetId){
        const parent=context.priorAssets?.find(a=>a.assetId===requirement.lastReferenceAssetId && a.status==='accepted' && a.review?.accepted);
        if(!parent)throw error('CONTENT_FACTORY_END_REFERENCE_UNREVIEWED',409);
        const verified=await verifyArtifact(parent.artifact,{signal});
        lastReferenceFile=path.join(out,'last-reference.png');
        const native=parent.type==='image' && parent.reusableArtifacts?.find(a=>a.role==='native_image');
        if(native){
          const file=await artifactPath(native),bytes=await fs.readFile(file);
          if(bytes.length>40*1024*1024 || crypto.createHash('sha256').update(bytes).digest('hex')!==native.sha256)throw error('CONTENT_FACTORY_REFERENCE_HASH_MISMATCH',409);
          await fs.copyFile(file,lastReferenceFile);
        }else{
          const at=requirement.lastReferenceTime ?? 0;
          if(!Number.isFinite(at)||at<0||at>=verified.duration)throw error('CONTENT_FACTORY_END_REFERENCE_INVALID');
          await command('ffmpeg',['-y','-v','error','-ss',String(at),'-i',await artifactPath(verified),'-frames:v','1',lastReferenceFile],signal,60000);
        }
        lastReference={assetId:parent.assetId,parentArtifactSha256:verified.sha256,sourceTime:native?null:requirement.lastReferenceTime ?? 0,
          frameSha256:crypto.createHash('sha256').update(await fs.readFile(lastReferenceFile)).digest('hex')};
        await fs.writeFile(path.join(out,'last-reference-receipt.json'),JSON.stringify(lastReference,null,2),{mode:0o600});
      }
      const model='Wan-AI/Wan2.2-I2V-A14B-Diffusers',revision='596658fd9ca6b7b71d5057529bbf319ecbc61d74';
      if(!Number.isFinite(requirement.duration)||requirement.duration<.5||requirement.duration>7.5625)
        throw error('CONTENT_FACTORY_SUPPORTED_ASSET_LIMIT');
      const frameCount=requirement.duration>5.0625?121:81;
      const readResult=receipt=>({artifact:{path:path.relative(root,path.join(out,'video.mp4')),sha256:receipt.artifact.sha256,duration:receipt.artifact.duration},
        model,modelRevision:revision,tool:receipt.tool,settings:{...receipt.settings,reference,lastReference}});
      try {
        const saved=JSON.parse(await fs.readFile(path.join(out,'generation-receipt.json'),'utf8'));
        if(saved.model===model && saved.modelRevision===revision && saved.prompt===requirement.prompt &&
            saved.seed===requirement.seed+context.attempt-1 && saved.sourceBrief===context.sourceBrief &&
            saved.settings.frames===frameCount && (saved.shot?.negative_prompt || '')===(requirement.negativePrompt || '') &&
            saved.referenceImageSha256===reference.frameSha256 && (saved.lastReferenceImageSha256 || null)===(lastReference?.frameSha256 || null)){
          await verifyArtifact({path:path.relative(root,path.join(out,'video.mp4')),sha256:saved.artifact.sha256},{signal});
          return readResult(saved);
        }
      } catch(e){if(e.code!=='ENOENT')throw e;}
      if(deadlineEpoch-Date.now()/1000<(frameCount===121?45:30)*60)throw error('CONTENT_FACTORY_GPU_WINDOW_TOO_SHORT',409);
      await gpuIdle(signal);
      const remoteOut=`${remoteRoot}/assets/${attemptId}`;
      const requestFile=path.join(out,'conditioned-request.json');
      await fs.writeFile(requestFile,JSON.stringify({deadlineEpoch,sourceBrief:context.sourceBrief,
        settings:{width:832,height:480,frames:frameCount,steps:40},shots:[{name,seed:requirement.seed+context.attempt-1,
          ...(requirement.negativePrompt?{negative_prompt:requirement.negativePrompt}:{}),
          prompt:requirement.prompt,reference_image:`/work/assets/${attemptId}/reference.png`,referenceProvenance:reference,
          ...(lastReference?{last_reference_image:`/work/assets/${attemptId}/last-reference.png`,lastReferenceProvenance:lastReference}:{})}]}),{mode:0o600});
      await remote(`mkdir -p ${remoteOut} ${remoteRoot}/scripts/content-factory`,signal);
      await transfer(requestFile,`${host}:${remoteOut}/request.json`,signal);
      await transfer(referenceFile,`${host}:${remoteOut}/reference.png`,signal);
      if(lastReference)await transfer(lastReferenceFile,`${host}:${remoteOut}/last-reference.png`,signal);
      await transfer(path.join(scriptsDirectory,'content-factory/generate-conditioned-video.py'),`${host}:${remoteRoot}/scripts/content-factory/generate-conditioned-video.py`,signal);
      const seconds=Math.floor(Math.min(frameCount===121?3000:2200,deadlineEpoch-Date.now()/1000-45));
      await container(`factory-wan14b-${attemptId}`,`docker run --rm --name factory-wan14b-${attemptId} --gpus all --network none --ipc=host -e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 -v ${remoteRoot}:/work --entrypoint timeout autopromote-wan-cuda:20261006 ${seconds} python3 /work/scripts/content-factory/generate-conditioned-video.py --request /work/assets/${attemptId}/request.json --models /work/models/wan-i2v-a14b --root /work --output /work/conditioned-video`,signal,true,(seconds+30)*1000);
      await transfer(`${host}:${remoteRoot}/conditioned-video/${name}/video.mp4`,path.join(out,'video.mp4'),signal);
      await transfer(`${host}:${remoteRoot}/conditioned-video/${name}/receipt.json`,path.join(out,'generation-receipt.json'),signal);
      const receipt=JSON.parse(await fs.readFile(path.join(out,'generation-receipt.json'),'utf8'));
      if(receipt.model!==model || receipt.modelRevision!==revision || receipt.referenceImageSha256!==reference.frameSha256 ||
          (receipt.lastReferenceImageSha256 || null)!==(lastReference?.frameSha256 || null))
        throw error('CONTENT_FACTORY_MODEL_RECEIPT_INVALID',409);
      return readResult(receipt);
    }
    try {
      const saved=JSON.parse(await fs.readFile(path.join(out,"generation-receipt.json"),"utf8"));
      if(saved.shot.prompt===requirement.prompt && saved.shot.seed===requirement.seed+context.attempt-1 && saved.shot.sourceBrief===context.sourceBrief && (!requirement.negativePrompt || saved.negative_prompt===requirement.negativePrompt) && (saved.referenceImageSha256 || null)===(reference?.frameSha256 || null)) {
        await fs.access(path.join(out,"video.mp4"));
        return {artifact:{path:path.relative(root,path.join(out,"video.mp4")),sha256:saved.sha256,duration:saved.frame_count/saved.fps},
          model:saved.model.model,modelRevision:saved.model.revision,tool:"AutoPromote Wan asset adapter",settings:{steps:saved.steps,width:saved.width,height:saved.height,fps:saved.fps,reference}};
      }
    } catch(e){if(e.code!=="ENOENT")throw e;}
    await gpuIdle(signal);
    const planFile=path.join(out,"shot-plan.json");
    await fs.writeFile(planFile,JSON.stringify({settings:{steps:50,frame_count:121,width:1280,height:704},shots:[{
      name,seed:requirement.seed+context.attempt-1,prompt:requirement.prompt,sourceBrief:context.sourceBrief,storyRole:requirement.beatId,
      ...(requirement.negativePrompt?{negative_prompt:requirement.negativePrompt}:{}),
      ...(reference?{reference_image:`/work/assets/${attemptId}/reference.png`,referenceProvenance:reference}:{})}]}),{mode:0o600});
    await remote(`mkdir -p ${remoteRoot}/assets/${attemptId}`,signal);
    await transfer(planFile,`${host}:${remoteRoot}/assets/${attemptId}/shot-plan.json`,signal);
    if(reference)await transfer(referenceFile,`${host}:${remoteRoot}/assets/${attemptId}/reference.png`,signal);
    await transfer(path.join(scriptsDirectory,"generate-autopromote-l40s-motion.py"),`${host}:${remoteRoot}/generate-autopromote-l40s-motion.py`,signal);
    const modelReceipt=path.join(out,"wan-model-receipt.json");
    await fs.writeFile(modelReceipt,JSON.stringify({model:"Wan-AI/Wan2.2-TI2V-5B-Diffusers",revision:"b8fff7315c768468a5333511427288870b2e9635",source:"Retained pinned offline model archive"}));
    await transfer(modelReceipt,`${host}:${remoteRoot}/wan-model-receipt.json`,signal);
    const seconds=Math.floor(Math.min(1100,deadlineEpoch-Date.now()/1000-30));
    await container(`factory-wan-${attemptId}`,`docker run --rm --name factory-wan-${attemptId} --gpus all --network none --shm-size 4g -e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video -v ${remoteRoot}:/work -v /data/autopromote-l40s-20261006/models:/work/models:ro --entrypoint timeout autopromote-wan-cuda:20261006 ${seconds} python3 /work/generate-autopromote-l40s-motion.py --work /work --shot-plan /work/assets/${attemptId}/shot-plan.json`,signal);
    // Immutable local attempt references preserve rejected prior versions.
    await transfer(`${host}:${remoteRoot}/generated/${name}.mp4`,path.join(out,"video.mp4"),signal);
    await transfer(`${host}:${remoteRoot}/generated/${name}-receipt.json`,path.join(out,"generation-receipt.json"),signal);
    const receipt=JSON.parse(await fs.readFile(path.join(out,"generation-receipt.json"),"utf8"));
    return {artifact:{path:path.relative(root,path.join(out,"video.mp4")),sha256:receipt.sha256,duration:receipt.frame_count/receipt.fps},
      model:receipt.model.model,modelRevision:receipt.model.revision,tool:"AutoPromote Wan asset adapter",
      settings:{steps:receipt.steps,width:receipt.width,height:receipt.height,fps:receipt.fps,guidance:5,negativePrompt:receipt.negative_prompt,reference}};
  }
  async function review(context) {
    const real=await artifactPath(context.artifact);
    if (context.requirement?.creativeScene) {
      if (typeof scenePerformanceReviewer !== 'function')
        throw error('CONTENT_FACTORY_MOTION_REVIEW_REQUIRED', 409,
          'Sampled still-frame review cannot accept a planned moving scene. The saved take requires full-video performance review.');
      const result = await scenePerformanceReviewer({ ...context, artifactPath: real });
      require('./contentFactoryScenePerformance').validateScenePerformanceReview({
        scene: context.requirement.creativeScene, artifact: context.artifact, review: result });
      return result;
    }
    if(path.extname(real)===".wav") {
      const result=JSON.parse((await command(python,[path.join(scriptsDirectory,"content-factory/review-audio.py"),"--input",real],context.signal)).stdout);
      // Technical audio checks alone do not assert story quality. Final film
      // review gets the sound design and measurements alongside actual frames.
      const criteria=context.criteria.map(criterion=>{
        const supported= /audib|stereo|clip|sample|48000|48.k|duration|headroom/i.test(criterion) && !/emotional|cinematic|orchestral|compelling|spoken|intelligib|clarity/i.test(criterion);
        const longEnough=!/duration/i.test(criterion) || result.duration+1/24>=(context.requirement?.duration || 0);
        return {criterion,passed:supported && result.accepted && longEnough,observation:supported?`${result.reason} Duration ${result.duration.toFixed(3)} seconds; sample rate ${result.sampleRate} Hz.`:"This criterion cannot be established by sample measurements; creative/listening evidence is required."};
      });
      const accepted=criteria.every(c=>c.passed);
      return {accepted,reason:accepted?result.reason:criteria.filter(c=>!c.passed).map(c=>c.observation).join(' '),revisionInstructions:accepted?"":"Correct failed measurable audio properties. Unsupported listening or creative criteria require independent listening evidence, not an automatic technical pass.",
        reviewer:"AutoPromote original audio technical review",modelRevision:"audio-measurements-v1",evidenceSha256:context.artifact.sha256,artifactSha256:context.artifact.sha256,
        criteria};
    }
    const evidence=path.join(path.dirname(real),`${path.basename(real)}-review.jpg`);
    const framesDir=path.join(path.dirname(real),`${path.basename(real)}-frames`);
    const frameCount=context.output?12:(context.requirement?.lastReferenceAssetId||context.requirement?.referenceVideoAssetId)?16:6;
    await command(python,[path.join(scriptsDirectory,"content-factory/contact-sheet.py"),"--input",real,"--output",evidence,"--frames-dir",framesDir,"--frame-count",String(frameCount)],context.signal);
    const frames=JSON.parse(await fs.readFile(path.join(framesDir,'frames.json'),'utf8')).frames;
    const result=await creative({id:`review-${context.artifact.sha256.slice(0,16)}`,signal:context.signal,frames,schema:reviewSchema,
      input:{...(context.output ? {story:context.story,output:context.output,scope:context.mode==='screenplay_scene'?'One screenplay scene; whole-film payoff and final film review occur after scene assembly.':'Complete marketing film',sourceLineage:context.sourceLineage || null} : {scope:"One raw asset only. Do not require the whole film or its payoff inside this shot.",requirement:context.requirement || null}),criteria:context.criteria,
        duration:context.artifact.duration,hasAudio:context.artifact.hasAudio,
        audioMeasurements:context.output ? await fs.readFile(path.join(path.dirname(real),"render-receipt.json"),"utf8").then(JSON.parse).then(r=>r.audioMeasurements) : null,
        limitation:"Contact sheet observes sampled visual frames. Audio is not heard by this model. Decoded audio measurements can verify audibility/headroom, and the written edit gives cue timing; emotional effectiveness and speech clarity require founder listening. Do not invent unseen transitions or heard audio judgments; state uncertainty explicitly."},
      system:context.output ? (context.mode==='screenplay_scene'?
        'Judge actual time-ordered frames of ONE GENERATED SCREENPLAY SCENE. Evaluate supplied exact criteria in order against its planned action, intended continuity and dramatic role. This scene may intentionally withhold the whole-film payoff; do not require a complete marketing plot or brand reveal here. Rendering success is insufficient. State visible defects and specific corrections; do not invent unseen transitions or claim to have heard audio.':
        "Judge this actual finished-film contact sheet as a viewer. Inspect supplied criteria in order, returning exact criteria and concrete observations. Reject weak story, incoherent action, unreadable text or missing payoff. Rendering success alone is insufficient. Give specific corrections. Audio is not heard.") : "Inspect this actual contact sheet of ONE RAW ASSET. Evaluate only its assigned shot role and the supplied exact criteria. A single asset is not a complete film: do not require other shots, escalation, brand UI or a final payoff inside it. Read time-ordered frames carefully; do not assert identical frames unless the visible frames are identical. Distinguish visible evidence from metadata that pixels cannot establish. Reject failed criteria and specify corrections to this asset only. Audio is not heard."});
    return {...result.value,reviewer:result.model,modelRevision:result.modelRevision,evidenceSha256:result.evidenceSha256,artifactSha256:context.artifact.sha256};
  }
  async function render({edit,output,signal,attempt=1,jobId}) {
    // Different owners/jobs can choose the same output name. Keep immutable
    // render versions under their job namespace, including transport caches.
    const namespace=jobId && ID.test(jobId) ? jobId : digest(edit.projectId).slice(0,24);
    const relativeOut=path.posix.join("outputs",namespace,output.outputId,`v${attempt}`);
    const out=path.join(root,relativeOut);await fs.mkdir(out,{recursive:true,mode:0o700});
    const request=path.join(out,"render-request.json");await fs.writeFile(request,JSON.stringify(edit.renderRequest,null,2));
    await fs.writeFile(path.join(out,"studio-project.json"),JSON.stringify(edit,null,2));
    const requestSha=crypto.createHash("sha256").update(await fs.readFile(request)).digest("hex");
    try {
      const receipt=JSON.parse(await fs.readFile(path.join(out,"render-receipt.json"),"utf8"));
      const sha=crypto.createHash("sha256").update(await fs.readFile(path.join(out,"final.mp4"))).digest("hex");
      const transportSha=crypto.createHash("sha256").update(await fs.readFile(path.join(scriptsDirectory,"content-factory/render-existing-studio.py"))).digest("hex");
      if(receipt.requestSha256===requestSha && receipt.transportSourceSha256===transportSha && receipt.sha256===sha)return {artifact:{path:path.relative(root,path.join(out,"final.mp4")),sha256:sha},
        editArtifact:{path:path.relative(root,path.join(out,"studio-project.json")),sha256:crypto.createHash("sha256").update(await fs.readFile(path.join(out,"studio-project.json"))).digest("hex")}};
    } catch(e){if(e.code!=="ENOENT")throw e;}
    if(!["auto","cpu","nvenc"].includes(renderDevice))throw error("CONTENT_FACTORY_RENDER_DEVICE_INVALID");
    let useGpu=renderDevice!=="cpu";
    if(useGpu)try{await gpuIdle(signal);}catch(failure){
      if(renderDevice==="auto"&&["CONTENT_FACTORY_GPU_BUSY","CONTENT_FACTORY_GPU_WINDOW_EXPIRED"].includes(failure.code))useGpu=false;
      else throw failure;
    }
    const remoteOut = `${remoteRoot}/${relativeOut}`;
    await remote(`mkdir -p ${remoteOut} ${remoteRoot}/scripts/content-factory ${remoteRoot}/python_media_worker`,signal);
    // Copy only explicit worker sources and public fonts/models. No .env,
    // service account, auth token or generic repository archive is transferred.
    const bundle=path.join(out,"worker-code.tar.gz");
    const files=(await fs.readdir(workerDirectory)).filter(name=>name.endsWith(".py")).map(name=>`python_media_worker/${name}`);
    const repo=path.dirname(workerDirectory);
    await command("tar",["-czf",bundle,"-C",repo,...files,"python_media_worker/assets/fonts","python_media_worker/models/yunet",
      "scripts/content-factory/render-existing-studio.py","scripts/local_media_http.py"],signal,60_000);
    await transfer(bundle,`${host}:${remoteOut}/worker-code.tar.gz`,signal);
    await remote(`tar -xzf ${remoteOut}/worker-code.tar.gz -C ${remoteRoot}`,signal);
    const urls=[...edit.renderRequest.timeline_segments.map(s=>s.url), ...(edit.renderRequest.background_audio ? [edit.renderRequest.background_audio.url] : []), ...(edit.renderRequest.music_url ? [edit.renderRequest.music_url] : []), ...(edit.renderRequest.sound_effects || []).filter(s=>!s.builtIn).map(s=>s.url)];
    const sources=[];
    for(const url of [...new Set(urls)]) {
      const parsed=new URL(url);
      if(parsed.origin!=="http://127.0.0.1:8765")throw error("CONTENT_FACTORY_RENDER_SOURCE_INVALID",409);
      const rel=decodeURIComponent(parsed.pathname.slice(1));
      if(!/^[A-Za-z0-9/_.-]+$/.test(rel)||rel.includes(".."))throw error("CONTENT_FACTORY_RENDER_SOURCE_INVALID",409);
      const local=await artifactPath({path:rel});
      sources.push({rel,local,sha:crypto.createHash('sha256').update(await fs.readFile(local)).digest('hex')});
    }
    // Reuse verified remote raw bytes across edit revisions rather than
    // transferring every source again. Missing/mismatched files still upload.
    const remoteHashes=(await remote(`sha256sum ${sources.map(s=>`${remoteRoot}/${s.rel}`).join(' ')} 2>/dev/null || true`,signal)).stdout;
    const hashes=new Map(remoteHashes.trim().split(/\r?\n/).filter(Boolean).map(line=>{const [sha,file]=line.split(/\s+/);return [file,sha];}));
    for(const {rel,local,sha} of sources) {
      if(hashes.get(`${remoteRoot}/${rel}`)===sha)continue;
      await remote(`mkdir -p ${remoteRoot}/${path.posix.dirname(rel)}`,signal);
      await transfer(local,`${host}:${remoteRoot}/${rel}`,signal);
    }
    await transfer(request,`${host}:${remoteOut}/render-request.json`,signal);
    const name=`factory-render-${namespace.slice(0,16)}-${output.outputId}-v${attempt}`;
    const seconds=useGpu ? Math.floor(Math.min(1100,deadlineEpoch-Date.now()/1000-30)) : 1100;
    const cmd=`docker run --rm --name ${name} ${useGpu?"--gpus all":"-e NVIDIA_VISIBLE_DEVICES=void"} --network none -e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video -e VIRAL_EXPORT_ENCODER=${useGpu?"nvenc":"cpu"} -e FIREBASE_STATUS_UPDATES_ENABLED=false -v ${remoteRoot}:/work -v ${remoteRoot}/python_media_worker:/app:ro --entrypoint timeout autopromote-media-gpu:20261006-final ${Math.max(30,seconds)} python3 /work/scripts/content-factory/render-existing-studio.py --root /work --worker /app --request /work/${relativeOut}/render-request.json --output /work/${relativeOut}`;
    await container(name,cmd,signal,useGpu);
    for(const name of ["final.mp4","render-receipt.json","poster.jpg"])
      await transfer(`${host}:${remoteOut}/${name}`,path.join(out,name),signal);
    const receipt=JSON.parse(await fs.readFile(path.join(out,"render-receipt.json"),"utf8"));
    if(receipt.requestSha256!==requestSha)throw error("CONTENT_FACTORY_RENDER_RECEIPT_MISMATCH",409);
    return {artifact:{path:path.relative(root,path.join(out,"final.mp4")),sha256:receipt.sha256},editArtifact:{path:path.relative(root,path.join(out,"studio-project.json")),
      sha256:crypto.createHash("sha256").update(await fs.readFile(path.join(out,"studio-project.json"))).digest("hex")}};
  }
  async function reviseEdit(context) {
    const result=await creative({id:`revise-${context.jobId.slice(0,12)}-${context.attempt}`,signal:context.signal,schema:revisionSchema,
      input:{story:context.story,output:context.output,rejection:context.review,availableAssets:context.assets.map(a=>({assetId:a.assetId,duration:a.artifact?.duration,status:a.status}))},
      system:"Fix the rejected edit by changing shot choices and timing to repair the specific creative failure. Use accepted visual assets only. Return a revised sequence and a concrete reason. Do not repeat the failed sequence unchanged."});
    return {...context.output,sequence:result.value.sequence,revisionReason:result.value.reason};
  }
  async function planScreenplayScene({ productionId, screenplay, scene, signal, previousFailure }) {
    const { scenePlanSchema } = require('./screenplayProductionSchemas');
    const schema=structuredClone(scenePlanSchema);
    schema.properties.sceneId={enum:[scene.sceneId]};schema.properties.sourceSha256={enum:[screenplay.source.sha256]};
    const spoken=scene.dialogueUnits.map(d=>d.dialogueUnitId);
    if(spoken.length)schema.properties.shots.items.properties.dialogueUnitIds.items={enum:spoken};
    else schema.properties.shots.items.properties.dialogueUnitIds.maxItems=0;
    const sourceText=screenplay.source.text.slice(scene.sourceRef.start,scene.sourceRef.end);
    const quotes=[...new Set([scene.heading,...scene.blocks.map(b=>screenplay.source.text.slice(b.sourceRef.start,b.sourceRef.end)),
      ...[...sourceText.matchAll(/[^.!?\r\n]+[.!?]?/g)].map(m=>m[0].trim())].filter(q=>q&&q.length<=1000&&sourceText.includes(q)))];
    for(const field of ['props','characterDesigns','shots','continuity'])schema.properties[field].items.properties.sourceQuote={enum:quotes};
    const actionQuotes=quotes.filter(q=>scene.blocks.some(b=>b.kind==='action' && screenplay.source.text.slice(b.sourceRef.start,b.sourceRef.end).includes(q)));
    const groundedItems=require('./screenplayGroundingSchema').groundedPropItems(actionQuotes,screenplay.entities.filter(e=>e.kind!=='prop').map(e=>e.name));
    if(groundedItems)schema.properties.props.items=groundedItems;
    else schema.properties.props.maxItems=0;
    const common={ title: screenplay.title, sourceSha256: screenplay.source.sha256, sceneId: scene.sceneId,
        sourceText: screenplay.source.text.slice(scene.sourceRef.start,scene.sourceRef.end), scene,
        entityBible: screenplay.entities, plannedContinuity: screenplay.continuity,
        previousScene: screenplay.scenes.find(s=>s.ordinal===scene.ordinal-1)?.plan || null, correction: previousFailure };
    const object=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
    const {props,characterDesigns,...shotProperties}=schema.properties;
    const results=await creative({id:`scene-${productionId.slice(0,12)}-${scene.ordinal}-${digest({previousFailure,bible:screenplay.entities,version:3}).slice(0,8)}`,signal,
      requests:[{id:'scene-entities',input:common,schema:object({props,characterDesigns}),maxTokens:1600,
        system:'Extract physical props and action-only characters from the exact scene, grounded in the supplied source quotes. Prop names must occur literally in their sourceQuote. Include every physical object later needed as a shot entity. Creases and lighting are features, not independent entities. Keep existing character designs exactly stable; new design choices must say creative_choice. Use concise descriptions. This is script breakdown, not generated visual evidence.'},
      {id:'scene-shots',contextFrom:['scene-entities'],entitySchemaFrom:'scene-entities',existingEntityNames:screenplay.entities.map(e=>e.name),input:common,schema:object(shotProperties),maxTokens:3200,
        system:'Plan generated movie shots from the exact scene and priorStages.scene-entities. No recorded or multicamera footage is required. Story and the dramatic question lead the plan. Each of the eleven story decisions is one concise sentence; never decorate weak storytelling. Use 1 to 3 motivated shots, 0.5 to 5 seconds each. entityNames and continuity entityName must use established entity names from the bible or prior breakdown, never a part of an object such as a crease. Assign EVERY input dialogueUnitId exactly once with its speaker; never invent or omit words. Continuity is a planned requirement, not observed pixels. Carry established values forward; a script-grounded material or state change requires intentionalChange true and the supporting quote. Preserve reveal timing. Avoid feature lists, generic symbolism and invented backstory. Repair the previousFailure if present.'}]});
    return {plan:{...results[0].value,...results[1].value},provenance:{model:results[0].model,modelRevision:results[0].modelRevision,
      settings:results.map(r=>r.settings),stages:results.map(r=>({id:r.id,seconds:r.seconds})),sourceSha256:screenplay.source.sha256,origin:'nvidia_screenplay_scene_planning'}};
  }
  async function planBRoll({jobId, captions, duration, maxShots = 3, excludedCaptionIds = [], signal}) {
    // Cue identity already owns the exact wording and clock. Asking the model
    // to retype both caused punctuation drift and rejected otherwise grounded
    // plans. Bind those fields from the selected cue, never from invented text.
    const eligible= captions.filter(c=>!excludedCaptionIds.includes(c.id) && ! /^(hello\b|welcome\b|thank you\b|i (?:am your host|welcome|was born|moved|grew up well)\b|everything was going well\b|then i moved\b|today is\b|let us\b|on that note\b|to take us back\b)/i.test(c.text.trim())).filter(c=>visualSubjectsForCaption(c).length);
    if(!eligible.length)return {plan:{reason:'Keep the original picture for these spoken beats.',shots:[]},provenance:{origin:'protected_speaker_beats'}};
    const schema = {type:'object',additionalProperties:false,required:['reason','shots'],properties:{
      reason:{type:'string',maxLength:500},shots:{type:'array',maxItems:maxShots,items:{type:'object',additionalProperties:false,
        required:['captionId','subjectQuote','title','prompt','duration'],properties:{
          captionId:{enum:eligible.map(c=>c.id)},
          subjectQuote:{enum:[...new Set(eligible.flatMap(visualSubjectsForCaption))]},
          title:{type:'string',maxLength:100},prompt:{type:'string',maxLength:1500},
          duration:{type:'number',minimum:1,maximum:4}}}}}};
    const result=await creative({id:`broll-plan-${jobId.slice(0,24)}`,signal,schema,
      input:{context:captions,eligibleCaptions:eligible.map(c=>({...c,allowedVisualSubjects:visualSubjectsForCaption(c)})),duration,maxShots},
      system:'Plan useful moving B-roll for this content in any genre. Select captionId ONLY from eligibleCaptions. It binds the exact supporting quote and start time automatically. subjectQuote must select ONE token from that caption’s allowedVisualSubjects, such as church or singer. Never retype a whole sentence or combine adjacent cues. Choose a SPECIFIC visual subject or action, such as bread, mountain or running. Abstract phrases such as grew up well, life, story or everything going well justify NO invented room, possessions or photographs. Return zero shots if none adds meaning. Protect introductions, personal revelations, jokes and emotional payoffs: keep the real speaker visible. Choose up to maxShots distinct beats, at least eight seconds apart; duration 1-4 seconds within the programme. Describe ONE simple cinematic 16:9 detail shot with clearly visible continuous PHYSICAL ACTION throughout the take, plus an appreciable gentle camera move. A prior empty church room was rejected for frozen camera and barely changing light: do not repeat quiet stillness. Use active candle flames with a lateral camera glide for a church detail, or a microphone gently swinging on its cable against slowly moving stage lights for a singer detail. Use natural light, coherent objects, no people, text, logos or sound. Never generate a replacement host, presenter, guest, child, relative, historical event or specific named location. For personal memories use a nonidentifying environmental or object detail grounded in the line, or keep the speaker. A church mention motivates two lit candles with clearly dancing flames in the foreground and an appreciable lateral camera glide, with the church window softly behind them. A singer motivates a microphone visibly swinging gently on its cable against moving stage lights. Avoid generic filler. Five seconds of moving source will be generated for each shorter editable insert.'});
    const plan={...result.value,shots:result.value.shots.map(shot=>{
      const cue=eligible.find(c=>c.id===shot.captionId);
      if(!cue)throw error('BROLL_PLAN_NOT_GROUNDED',422);
      return {...shot,evidenceQuote:cue.text,start:cue.start};
    })};
    return {plan,provenance:{model:result.model,modelRevision:result.modelRevision,settings:result.settings}};
  }
  return {plan,planScreenplayScene,planBRoll,generate,review,verifyArtifact,render,reviseEdit,urlFor};
}
module.exports={createNvidiaFactoryProviders};
