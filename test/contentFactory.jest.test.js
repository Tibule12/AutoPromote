const { createContentFactoryService } = require("../src/services/contentFactoryService");
const { validateDirection, validateReview, digest } = require("../src/services/contentFactoryContract");
const { compileFactoryEdit } = require("../src/services/contentFactoryStudioAdapter");
const { buildFactoryIntelligence } = require("../src/services/contentFactoryIntelligenceAdapter");
const { validateProjectIntelligenceRevision } = require("../src/services/studioProjectIntelligenceContract");
const { localFactoryStore } = require("../src/services/contentFactoryStore");
const fs = require("fs/promises"), os = require("os"), path = require("path");
const direction = () => ({ schemaVersion: 1, title: "A brief becomes a world", story: {
  about: "An imagined voyage becomes visible", whyCare: "Ideas deserve to be seen", hook: "A boat escapes a desk",
  beginning: "A sheet of paper", development: "The boat crosses an ocean", tension: "A wave threatens it",
  payoff: "It reaches calm and the Studio reveal", ending: "AutoPromote made this from a brief",
  withheld: "The origin of the footage", amplify: ["The first impossible movement"], remove: ["Unrelated effects"] },
  script: ["hook", "tension", "payoff"].map(beatId => ({ beatId, action: `Show ${beatId}`, sound: "Story-specific sound" })),
  assets: ["hook", "tension", "payoff"].map((beatId,i) => ({ assetId: `shot-${i+1}`, type: "video", beatId,
    prompt: `Concrete ${beatId} shot`, reason: `Advance ${beatId}`, duration: 5, provider: "wan", acceptanceCriteria: ["Recognisable paper boat"], seed: i + 1 })),
  outputs: [{ outputId: "hero", aspect: "16:9", purpose: "Reveal imagination becoming a film",
    sequence: [1,2,3].map(i => ({ assetId: `shot-${i}`, start: 0, duration: 3, reason: "Advance the voyage" })) }] });
const review = criteria => ({ accepted: true, reason: "Actual frames support the assigned story moment", reviewer: "test visual critic",
  modelRevision: "pinned-test-revision", evidenceSha256: "e".repeat(64), revisionInstructions: "",
  criteria: criteria.map(criterion => ({ criterion, passed: true, observation: "The boat and action are visible in the sampled frames" })) });
const memoryStore = () => {
  const rows = new Map(); let lock=Promise.resolve();
  return { rows, get: async id => structuredClone(rows.get(id) || null),
    transaction(id,mutate) { const r=lock.then(()=>{const next=mutate(structuredClone(rows.get(id)||null));if(next)rows.set(id,structuredClone(next));return structuredClone(next);});lock=r.catch(()=>{});return r; },
    listQueued: async()=>[...rows.values()].filter(r=>r.status==="queued").map(r=>r.jobId) };
};
const providers = () => ({ plan: jest.fn(async()=>direction()),
  generate: jest.fn(async({requirement,attemptId})=>({artifact:{path:`assets/${attemptId}.mp4`,sha256:digest(attemptId),duration:5,fps:24},
    model:"Wan",modelRevision:"pinned-Wan",settings:{steps:50},tool:"NVIDIA Wan adapter"})),
  verifyArtifact: jest.fn(async a=>a),review:jest.fn(async({criteria})=>review(criteria)),
  urlFor:a=>`http://127.0.0.1:8765/${a.path}`,
  render:jest.fn(async()=>({artifact:{path:"outputs/hero/v1/final.mp4",sha256:"f".repeat(64),duration:9,fps:24},editArtifact:{path:"outputs/hero/v1/studio-project.json"}})) });
async function fixture() {const store=memoryStore(),p=providers(),service=createContentFactoryService({store,providers:p});
  const {job}=await service.create({uid:"founder",input:{requestId:"brief-one",brief:"Make my paper idea into a cinematic voyage"}});return{store,p,service,job};}

test("brief request identity is stable, owner-scoped and rejects changed briefs",async()=>{
  const {service,job}=await fixture();
  expect((await service.create({uid:"founder",input:{requestId:"brief-one",brief:"Make my paper idea into a cinematic voyage"}})).duplicate).toBe(true);
  await expect(service.create({uid:"founder",input:{requestId:"brief-one",brief:"Different request"}})).rejects.toMatchObject({statusCode:409});
  await expect(service.get("other",job.jobId)).rejects.toMatchObject({statusCode:404});
});
test("complete pipeline uses the real Studio document/compiler and leaves founder approval pending",async()=>{
  const {service,p,job}=await fixture(),result=await service.process(job.jobId);
  expect(result.status).toBe("awaiting_founder_review");expect(p.generate).toHaveBeenCalledTimes(3);
  const edit=p.render.mock.calls[0][0].edit;
  expect(edit.document.clipOccurrences).toHaveLength(3);expect(edit.renderRequest.timeline_segments).toHaveLength(3);
  expect(edit.directorBatch.actor.type).toBe("ai");expect(edit.directorBatch.operations.every(o=>o.type==="trim_clip")).toBe(true);
  expect(edit.directorPreview.newRevision).toBeGreaterThan(edit.directorPreview.baseRevision);
  expect(edit.renderRequest.end_time).toBe(9);expect(edit.intelligence.revision.createdBy.kind).toBe("content_factory");
  expect(edit.intelligence.revision.coverage.every(c=>c.state==="proposed"&&c.review===null)).toBe(true);
  expect(result.assets.every(a=>a.usedIn.includes("hero"))).toBe(true);expect(result.lease).toBeNull();
});
test("concurrent workers cannot generate the same job twice",async()=>{
  const {service,p,job}=await fixture();await Promise.all([service.process(job.jobId),service.process(job.jobId)]);
  expect(p.generate).toHaveBeenCalledTimes(3);expect(p.render).toHaveBeenCalledTimes(1);
});
test("weak asset is preserved, rejected and regenerated with the concrete correction",async()=>{
  const {service,p,job}=await fixture();let first=true;
  p.review.mockImplementation(async({criteria})=>{const r=review(criteria);if(first){first=false;r.accepted=false;r.criteria[0].passed=false;r.reason="The paper sail melts";r.revisionInstructions="Keep a rigid, sharply folded triangular sail";}return r;});
  const result=await service.process(job.jobId);expect(result.status).toBe("awaiting_founder_review");
  expect(result.assets[0].status).toBe("rejected");expect(result.assets[1].provenance.prompt).toContain("Keep a rigid");
  expect(result.assets[1].provenance.seed).toBe(2);expect(p.generate).toHaveBeenCalledTimes(4);
});
test("failed critic resumes the saved artifact without another GPU generation",async()=>{
  const {service,p,job}=await fixture();p.review.mockRejectedValueOnce(new Error("critic interrupted"));
  expect((await service.process(job.jobId)).status).toBe("failed");expect(p.generate).toHaveBeenCalledTimes(1);
  await service.retry({uid:"founder",jobId:job.jobId});
  expect((await service.process(job.jobId)).status).toBe("awaiting_founder_review");expect(p.generate).toHaveBeenCalledTimes(3);
});
test("rejected reused bytes stop for replacement instead of being copied as regeneration",async()=>{
  const {service,p,job}=await fixture();const plan=direction();plan.assets[0].provider="reuse";plan.assets[0].libraryRef="original-take";p.plan.mockResolvedValue(plan);
  p.review.mockImplementation(async({criteria})=>{const r=review(criteria);r.accepted=false;r.criteria[0].passed=false;r.reason="No physical wave action";r.revisionInstructions="Replace with a take showing a breaking wave";return r;});
  let result=await service.process(job.jobId);expect(result.status).toBe("needs_creative_revision");expect(result.assets[0].status).toBe("rejected");expect(p.generate).toHaveBeenCalledTimes(1);
  await service.retry({uid:"founder",jobId:job.jobId});result=await service.process(job.jobId);
  expect(result.status).toBe("needs_creative_revision");expect(p.generate).toHaveBeenCalledTimes(1);expect(p.render).not.toHaveBeenCalled();
});
test("GPU busy leaves the attempt reusable and does not pretend generation succeeded",async()=>{
  const {service,p,job}=await fixture();p.generate.mockRejectedValueOnce(Object.assign(new Error("GPU occupied"),{code:"CONTENT_FACTORY_GPU_BUSY"}));
  const failed=await service.process(job.jobId);expect(failed.assets).toEqual([]);expect(failed.failure.code).toBe("CONTENT_FACTORY_GPU_BUSY");
  await service.retry({uid:"founder",jobId:job.jobId});expect((await service.process(job.jobId)).status).toBe("awaiting_founder_review");
  expect(p.generate.mock.calls[0][0].attemptId).toBe(p.generate.mock.calls[1][0].attemptId);
});
test("cancellation during generation prevents review, assembly and completion",async()=>{
  const {service,p,job}=await fixture(),generate=p.generate.getMockImplementation();
  p.generate.mockImplementation(async c=>{await service.cancel({uid:"founder",jobId:job.jobId});return generate(c);});
  const result=await service.process(job.jobId);expect(result.status).toBe("cancelled");expect(p.render).not.toHaveBeenCalled();expect(p.review).not.toHaveBeenCalled();
});
test("rejected final edit must change before rerender; rejected version survives",async()=>{
  const {service,p,job}=await fixture();let finals=0;
  p.review.mockImplementation(async({criteria,output})=>{const r=review(criteria);if(output&&finals++===0){r.accepted=false;r.criteria[0].passed=false;r.reason="Opening lingers";r.revisionInstructions="Trim the static opening";}return r;});
  p.reviseEdit=jest.fn(async({output})=>({...output,sequence:output.sequence.map((s,i)=>i===0?{...s,start:1,duration:2}:s)}));
  const result=await service.process(job.jobId);expect(result.status).toBe("awaiting_founder_review");expect(p.render).toHaveBeenCalledTimes(2);
  expect(result.outputs.map(o=>o.status)).toEqual(["rejected","ready_for_founder_review"]);
});
test("machine provenance is valid privately and rejected by the customer contract",async()=>{
  const {service,job}=await fixture(),result=await service.process(job.jobId);
  const intelligence=buildFactoryIntelligence({projectId:"factory:test",ownerUid:"founder",assets:result.assets,direction:result.direction});
  expect(()=>validateProjectIntelligenceRevision(intelligence.revision)).toThrow("PROJECT_INTELLIGENCE_AUTHOR");
  expect(()=>validateProjectIntelligenceRevision(intelligence.revision,{allowServerGenerated:true})).not.toThrow();
});
test("render compilation refuses rejected sources or ranges beyond generated media",async()=>{
  const {service,job}=await fixture(),result=await service.process(job.jobId);
  const opts={jobId:job.jobId,ownerUid:"founder",assets:result.assets,output:result.direction.outputs[0],urlFor:a=>a.path};
  expect(()=>compileFactoryEdit({...opts,assets:result.assets.map(a=>({...a,status:"rejected"}))})).toThrow("UNREVIEWED_SOURCE");
  expect(()=>compileFactoryEdit({...opts,output:{...opts.output,sequence:[{...opts.output.sequence[0],duration:7}]}})).toThrow("UNREVIEWED_SOURCE");
});
test("reviews cannot accept failed criteria or reject without revision instructions",()=>{
  const r=review(["boat"]);r.criteria[0].passed=false;expect(()=>validateReview(r,["boat"])).toThrow();
  r.accepted=false;expect(()=>validateReview(r,["boat"])).toThrow("REJECTION_NEEDS_FIX");
  const p=direction();p.story.payoff="";expect(()=>validateDirection(p)).toThrow();
});
test("local store keeps concurrent writes private and durable",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"factory-store-"));try {
    const store=localFactoryStore(root),id="a".repeat(64);
    await Promise.all(Array.from({length:10},()=>store.transaction(id,p=>({jobId:id,status:"queued",count:(p?.count||0)+1}))));
    expect((await store.get(id)).count).toBe(10);expect((await fs.stat(path.join(root,"jobs",`${id}.json`))).mode&0o777).toBe(0o600);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('founder review is owner-scoped and bound to the exact output bytes',async()=>{
  const {service,job}=await fixture();const result=await service.process(job.jobId),output=result.outputs[0];
  const input={jobId:job.jobId,outputId:output.outputId,artifactSha256:output.artifact.sha256,accepted:true,note:'Watched the current film and approved it'};
  await expect(service.reviewOutput({...input,uid:'other'})).rejects.toMatchObject({statusCode:404});
  await expect(service.reviewOutput({...input,uid:'founder',artifactSha256:'0'.repeat(64)})).rejects.toMatchObject({code:'CONTENT_FACTORY_REVIEW_STALE'});
  expect((await service.reviewOutput({...input,uid:'founder'})).status).toBe('founder_approved');
});
test('narration uses the accepted voiceover bus alongside music and records both sources',async()=>{
  const {service,job}=await fixture();const result=await service.process(job.jobId);
  const audio=(id,role)=>({...result.assets[0],assetId:id,type:'audio',audioRole:role,artifact:{path:`audio/${id}.wav`,sha256:digest(id),duration:9}});
  const output={...result.direction.outputs[0],musicAssetId:'music',musicVolume:.2,audioCues:[{assetId:'speech',kind:'voiceover',startTime:2,duration:2,trimStart:0,volume:.8}]};
  const edit=compileFactoryEdit({jobId:job.jobId,ownerUid:'founder',assets:[...result.assets,audio('speech','voiceover'),audio('music','music')],output,urlFor:a=>a.path});
  expect(edit.renderRequest.music_url).toBe('audio/music.wav');expect(edit.renderRequest.add_music).toBe(true);
  expect(edit.snapshot.addMusic).toBe(true);expect(edit.snapshot.musicVolume).toBe(.2);expect(edit.renderRequest.music_volume).toBe(.2);
  expect(edit.renderRequest.music_fade_out).toBe(.6);expect(edit.renderRequest.mute_audio).toBe(true);
  expect(edit.renderRequest.sound_effects[0]).toMatchObject({kind:'voiceover',url:'audio/speech.wav',startTime:2});
  expect(edit.sourceEvidence.map(s=>s.assetId)).toEqual(expect.arrayContaining(['speech','music']));
  expect(()=>compileFactoryEdit({jobId:job.jobId,ownerUid:'founder',assets:result.assets,output,urlFor:a=>a.path})).toThrow('UNREVIEWED_AUDIO');
});
test('planning rejects output timestamps masquerading as source trims and undersized scores',()=>{
  const p=direction();p.outputs[0].sequence[1].start=3;
  expect(()=>validateDirection(p)).toThrow('SOURCE_RANGE_EXCEEDS_ASSET');
  p.outputs[0].sequence[1].start=0;p.assets.push({...p.assets[0],assetId:'score',type:'audio',provider:'original_audio'});p.outputs[0].musicAssetId='score';
  expect(()=>validateDirection(p)).toThrow('SCORE_TOO_SHORT');
});

test('founder rejection revises the latest bytes using the founder note and preserves the prior film',async()=>{
 const {service,p,job}=await fixture();let result=await service.process(job.jobId);
 await service.reviewOutput({uid:'founder',jobId:job.jobId,outputId:'hero',artifactSha256:result.outputs.at(-1).artifact.sha256,accepted:false,note:'Remove the static opening and start with movement'});
 p.reviseEdit=jest.fn(async({output})=>({...output,sequence:output.sequence.map((s,i)=>i===0?{...s,start:1,duration:2}:s)}));
 await service.retry({uid:'founder',jobId:job.jobId});result=await service.process(job.jobId);
 expect(result.status).toBe('awaiting_founder_review');expect(p.reviseEdit.mock.calls[0][0].review.revisionInstructions).toContain('start with movement');
 expect(result.outputs.map(o=>o.status)).toEqual(['founder_rejected','ready_for_founder_review']);expect(p.generate).toHaveBeenCalledTimes(3);
});

test('worker queue is limited to the configured founder owner',async()=>{
 const {service,job}=await fixture();await service.create({uid:'another-founder',input:{requestId:'another',brief:'Private unrelated campaign'}});
 expect(await service.listQueued('founder')).toEqual([job.jobId]);await expect(service.listQueued()).rejects.toThrow('SCOPE_INVALID');
});

test('reused raw material preserves original model provenance and rechecks its assigned story role',async()=>{
 const {service,p,job}=await fixture();const generate=p.generate.getMockImplementation();
 p.generate.mockImplementation(async c=>({...await generate(c),origin:'reused_server_generated',seed:42,parentProvenance:{sourceBrief:'Original world brief',parentArtifact:{sha256:'a'.repeat(64)}}}));
 const result=await service.process(job.jobId);expect(result.assets[0].provenance).toMatchObject({origin:'reused_server_generated',seed:42,parentProvenance:{sourceBrief:'Original world brief'}});
 expect(p.review).toHaveBeenCalledTimes(4);
});

test('brand ident preserves its embedded impact sound through the existing render contract',async()=>{
 const {service,job}=await fixture();const r=await service.process(job.jobId);const assets=r.assets.map((a,i)=>i===2?{...a,type:'three_d',audioRole:'brand_ident',artifact:{...a.artifact,hasAudio:true}}:a);
 const edit=compileFactoryEdit({jobId:job.jobId,ownerUid:'founder',assets,output:r.direction.outputs[0],urlFor:a=>a.path});
 expect(edit.renderRequest.mute_audio).toBe(false);expect(edit.renderRequest.smart_crop).toBe(true);expect(edit.renderRequest.smart_crop_mode).toBe('safe_fit');
 const p=direction();p.assets[0]={...p.assets[0],provider:'brand_ident',type:'three_d',identStyle:'compute',duration:3.5};expect(()=>validateDirection(p)).not.toThrow();
 p.assets[0].identStyle='untrusted-template';expect(()=>validateDirection(p)).toThrow('ASSET_REQUIREMENT_INVALID');
});
test('image-conditioned video can reference only an earlier reviewed visual asset',async()=>{
 const plan=direction();plan.assets[1].referenceAssetId='shot-1';plan.assets[1].referenceTime=2;
 expect(()=>validateDirection(plan)).not.toThrow();
 const {service,p,job}=await fixture();p.plan.mockResolvedValue(plan);await service.process(job.jobId);
 expect(p.generate.mock.calls[1][0].priorAssets).toHaveLength(1);expect(p.generate.mock.calls[1][0].priorAssets[0].review.accepted).toBe(true);
 plan.assets[0].referenceAssetId='shot-2';expect(()=>validateDirection(plan)).toThrow('REFERENCE_INVALID');
 delete plan.assets[0].referenceAssetId;plan.assets[1].referenceTime=5;expect(()=>validateDirection(plan)).toThrow('REFERENCE_INVALID');
});
test('narration cannot overlap, overrun the film or exceed its accepted source',()=>{
 const p=direction();p.assets.push({...p.assets[0],assetId:'voice',type:'audio',provider:'kokoro',duration:5});
 const cue={assetId:'voice',kind:'voiceover',startTime:0,duration:3,trimStart:0,volume:.8};p.outputs[0].audioCues=[cue,{...cue,startTime:2}];
 expect(()=>validateDirection(p)).toThrow('NARRATION_OVERLAP');
 p.outputs[0].audioCues=[{...cue,startTime:8}];expect(()=>validateDirection(p)).toThrow('AUDIO_RANGE_INVALID');
 p.outputs[0].audioCues=[{...cue,trimStart:4}];expect(()=>validateDirection(p)).toThrow('AUDIO_RANGE_INVALID');
 p.outputs[0].audioCues=[cue,{...cue,startTime:3.1}];expect(()=>validateDirection(p)).not.toThrow();
});
test('the larger video model requires a reviewed prior visual reference and cannot select arbitrary models',()=>{
 const p=direction();p.assets[1].videoModel='wan_i2v_a14b';
 expect(()=>validateDirection(p)).toThrow('VIDEO_MODEL_INVALID');
 p.assets[1].referenceAssetId='shot-1';p.assets[1].referenceTime=2;
 expect(()=>validateDirection(p)).not.toThrow();
 p.assets[1].videoModel='arbitrary-endpoint';expect(()=>validateDirection(p)).toThrow('VIDEO_MODEL_INVALID');
 p.assets[1].videoModel='wan_i2v_a14b';p.assets[1].provider='sdxl';expect(()=>validateDirection(p)).toThrow('VIDEO_MODEL_INVALID');
});
test('a transformation end frame must come from a prior visual asset and the larger conditioned model',()=>{
 const p=direction();p.assets[2].videoModel='wan_i2v_a14b';p.assets[2].referenceAssetId='shot-1';p.assets[2].lastReferenceAssetId='shot-2';p.assets[2].lastReferenceTime=1;
 expect(()=>validateDirection(p)).not.toThrow();
 p.assets[2].lastReferenceTime=5;expect(()=>validateDirection(p)).toThrow('END_REFERENCE_INVALID');
 p.assets[2].lastReferenceTime=0;p.assets[2].lastReferenceAssetId='shot-3';expect(()=>validateDirection(p)).toThrow('END_REFERENCE_INVALID');
 p.assets[2].lastReferenceAssetId='shot-2';p.assets[2].videoModel='wan_ti2v_5b';expect(()=>validateDirection(p)).toThrow('END_REFERENCE_INVALID');
});
test('native instrumental music is bounded and cannot be used as a picture generator',()=>{
 const p=direction();p.assets.push({...p.assets[0],assetId:'score',type:'audio',provider:'ace_step',duration:24});
 expect(()=>validateDirection(p)).not.toThrow();
 p.assets.at(-1).type='video';expect(()=>validateDirection(p)).toThrow('ASSET_REQUIREMENT_INVALID');
 p.assets.at(-1).type='audio';p.assets.at(-1).duration=61;expect(()=>validateDirection(p)).toThrow('ASSET_REQUIREMENT_INVALID');
});
test('negative video direction is bounded data and is rejected for other providers',()=>{
 const p=direction();p.assets[0].negativePrompt='hard cut, duplicate hull, sudden replacement';
 expect(()=>validateDirection(p)).not.toThrow();
 p.assets[0].negativePrompt='';expect(()=>validateDirection(p)).toThrow('NEGATIVE_PROMPT_INVALID');
 p.assets[0].negativePrompt='hard cut';p.assets[0].provider='sdxl';expect(()=>validateDirection(p)).toThrow('NEGATIVE_PROMPT_INVALID');
});
test('editable transformation scenes are bounded templates, not arbitrary Blender scripts',()=>{
 const p=direction();p.assets[0]={...p.assets[0],provider:'blender',type:'three_d',blenderScene:'paper_to_yacht',duration:6};
 expect(()=>validateDirection(p)).not.toThrow();
 p.assets[0].blenderScene='python-script';expect(()=>validateDirection(p)).toThrow('BLENDER_SCENE_INVALID');
 p.assets[0].blenderScene='paper_to_yacht';p.assets[0].duration=9;expect(()=>validateDirection(p)).toThrow('BLENDER_SCENE_INVALID');
});
test('video refinement requires an earlier visual motion guide and rejects impossible strengths or reference kinds',()=>{
 const p=direction();p.assets[0]={...p.assets[0],type:'three_d',provider:'blender',duration:6};
 p.assets[1]={...p.assets[1],provider:'wan_video_refine',referenceVideoAssetId:'shot-1',refinementStrength:.8,duration:5};
 expect(()=>validateDirection(p)).not.toThrow();
 p.assets[1].refinementStrength=.99;expect(()=>validateDirection(p)).toThrow('VIDEO_REFINEMENT_INVALID');
 p.assets[1].refinementStrength=.8;p.assets[1].referenceVideoAssetId='shot-3';expect(()=>validateDirection(p)).toThrow('VIDEO_REFINEMENT_INVALID');
 p.assets[1].referenceVideoAssetId='shot-1';p.assets[0].type='image';expect(()=>validateDirection(p)).toThrow('VIDEO_REFINEMENT_INVALID');
});
