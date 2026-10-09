const {importScreenplay,validateScenePlan,compileSceneDirection,sourceHash,entityId}=require('../src/services/screenplayProductionContract');
const {createScreenplayProductionService}=require('../src/services/screenplayProductionService');
const {createContentFactoryService}=require('../src/services/contentFactoryService');
const {localFactoryStore}=require('../src/services/contentFactoryStore');
const {validateDirection,digest}=require('../src/services/contentFactoryContract');
const fs=require('fs/promises'),os=require('os'),path=require('path');
const story={about:'A small light reveals a way out.',whyCare:'Hope comes from a small ordinary object.',hook:'A light appears in darkness.',beginning:'A dark room.',development:'The light grows.',tension:'Will it survive?',payoff:'The door is revealed.',ending:'A way forward.',withheld:'The exit.',amplify:['The light.'],remove:['Unmotivated spectacle.']};
const input=text=>({requestId:'film-one',title:'The way out',format:'fountain',text});
const raw='INT. WORKSHOP - NIGHT\n\nA paper boat rests on the desk.\n\nEXT. OCEAN - DAWN\n\nA paper boat rides the water.\n';
function planFor(screenplay,scene){return {sceneId:scene.sceneId,sourceSha256:screenplay.source.sha256,summary:'The paper boat is revealed.',story,
 props:[{name:'paper boat',sourceQuote:scene.blocks[0].text}],characterDesigns:[],continuity:[],
 shots:[{shotId:'shot-one',action:'Reveal the boat without a cut.',reason:'Show the ordinary material.',camera:'Slow push in.',framing:'Close shot.',duration:4,
  entityNames:[screenplay.entities.find(e=>e.entityId===scene.locationId).name,'paper boat'],dialogueUnitIds:scene.dialogueUnits.map(d=>d.dialogueUnitId),sourceQuote:scene.blocks[0].text}]};}
function memoryStore(){const rows=new Map();let lock=Promise.resolve();return {rows,get:async id=>structuredClone(rows.get(id)||null),transaction(id,mutate){const p=lock.then(()=>{const next=mutate(structuredClone(rows.get(id)||null));if(next)rows.set(id,structuredClone(next));return structuredClone(next)});lock=p.catch(()=>{});return p;},listQueued:async()=>[]};}
function providers(){return {plan:jest.fn(),planScreenplayScene:jest.fn(async({screenplay,scene})=>({plan:planFor(screenplay,scene),provenance:{model:'test-only',modelRevision:'fixture'}})),
 generate:jest.fn(async({requirement})=>({artifact:{path:requirement.assetId},audioRole:requirement.type==='audio'?'music':null,model:'fixture',modelRevision:'fixture',settings:{},tool:'test-only'})),
 verifyArtifact:jest.fn(async a=>({...a,sha256:a.sha256||sourceHash(a.path),duration:a.duration||5.041667,container:a.path.includes('score')?'wav':'mp4',codec:a.path.includes('score')?'pcm_s16le':'h264',fps:24,hasAudio:a.path.includes('score')||a.path.startsWith('final-')})),
 review:jest.fn(async({artifact,criteria})=>({accepted:true,artifactSha256:artifact.sha256,reason:'Fixture review only.',reviewer:'test',modelRevision:'fixture',evidenceSha256:'e'.repeat(64),revisionInstructions:'',criteria:criteria.map(criterion=>({criterion,passed:true,observation:'Fixture verification.'}))})),
 render:jest.fn(async({output})=>({artifact:{path:'final-'+output.outputId,duration:4}})),urlFor:a=>'http://fixture.local/'+a.path};}
async function fixture(){const store=memoryStore(),p=providers(),factory=createContentFactoryService({store,providers:p}),service=createScreenplayProductionService({store,factory,providers:p});const {job}=await service.create({uid:'founder',input:input(raw)});return {store,p,factory,service,job};}

test('screenplay import preserves exact Unicode/CRLF source offsets and stable characters across scenes',()=>{
 const text='Title: Tomorrow 🌊\r\n\r\nINT. WORKSHOP - NIGHT\r\n\r\nALEX\r\n(quietly)\r\nWe go now.\r\n\r\nEXT. OCEAN - DAWN\r\n\r\nALEX\r\nWe made it.\r\n';
 const film=importScreenplay(input(text));expect(film.source.sha256).toBe(sourceHash(text));expect(film.source.text).toBe(text);
 expect(film.scenes.map(s=>s.timeOfDay)).toEqual(['NIGHT','DAWN']);expect(film.entities.filter(e=>e.kind==='character')).toHaveLength(1);
 const dialogue=film.scenes.flatMap(s=>s.dialogueUnits);expect(dialogue.map(d=>d.text)).toEqual(['We go now.','We made it.']);
 expect(dialogue[0].characterId).toBe(dialogue[1].characterId);for(const d of dialogue)for(const ref of d.lineRefs)expect(text.slice(ref.start,ref.end)).toBe(ref.quote);
 expect(film.source.offsetUnit).toBe('utf16_code_units');expect(film.warnings).toHaveLength(1);
});
test('Fountain multiline notes never become generated dialogue or shots',()=>{
 const film=importScreenplay(input('INT. WORKSHOP - NIGHT\n\n/*\nFAKE\nDo not speak this.\n*/\n\n[[\nOTHER\nDo not speak this either.\n]]\n\nA light appears.\n'));
 expect(film.entities.some(e=>e.kind==='character')).toBe(false);expect(film.scenes[0].blocks.map(b=>b.text)).toEqual(['A light appears.']);
});
test('import rejects missing headings, unknown request fields and oversized UTF8',()=>{
 expect(()=>importScreenplay(input('Just some text'))).toThrow('SCENE_HEADINGS_REQUIRED');expect(()=>importScreenplay({...input(raw),public:true})).toThrow('INPUT_INVALID');
 expect(()=>importScreenplay(input('INT. ROOM - DAY\n'+ '🌊'.repeat(65000)))).toThrow('INPUT_INVALID');
});
test('model evidence must be exact source text and props must occur in it',()=>{
 const film=importScreenplay(input(raw)),scene=film.scenes[0],plan=planFor(film,scene);
 plan.props[0].name='golden yacht';expect(()=>validateScenePlan(film,scene,plan)).toThrow('UNGROUNDED_PROP');
 plan.props=[];plan.shots[0].entityNames=['WORKSHOP'];plan.shots[0].sourceQuote='A boat rests.';expect(()=>validateScenePlan(film,scene,plan)).toThrow('UNGROUNDED_SOURCE');
});
test('dialogue is assigned exactly once with its speaker and is never silently dropped at execution',()=>{
 const film=importScreenplay(input('INT. ROOM - NIGHT\n\nALEX\nWe go now.\n')),scene=film.scenes[0],plan=planFor(film,scene);
 plan.props=[];plan.shots[0].entityNames=['ROOM','ALEX'];plan.shots[0].sourceQuote='We go now.';
 const qualified=validateScenePlan(film,scene,plan);expect(qualified.shots[0].requiredAssets[1].text).toBe('We go now.');
 expect(()=>compileSceneDirection({screenplay:film,scene,plan:qualified})).toThrow('DIALOGUE_ALIGNMENT_REQUIRED');
 plan.shots[0].dialogueUnitIds=[];expect(()=>validateScenePlan(film,scene,plan)).toThrow('DIALOGUE_OMITTED');
 plan.shots[0].dialogueUnitIds=[scene.dialogueUnits[0].dialogueUnitId,scene.dialogueUnits[0].dialogueUnitId];expect(()=>validateScenePlan(film,scene,plan)).toThrow('DIALOGUE_ASSIGNMENT_INVALID');
});
test('action-only characters stay explicit and cannot bypass reference qualification',()=>{
 const film=importScreenplay(input('INT. ROOM - DAY\n\nAlex opens a door.\n')),scene=film.scenes[0],plan=planFor(film,scene);
 plan.props=[];plan.characterDesigns=[{name:'Alex',description:'A woman in a blue coat.',origin:'creative_choice',sourceQuote:'Alex opens a door.'}];plan.shots[0].entityNames=['ROOM','Alex'];
 const validated=validateScenePlan(film,scene,plan);expect(validated.entities.some(e=>e.entityId===entityId('character','Alex'))).toBe(true);
 expect(()=>compileSceneDirection({screenplay:film,scene,plan:validated})).toThrow('CHARACTER_REFERENCES_REQUIRED');
});
test('unexplained cross-scene prop changes are rejected and planned continuity is never observed truth',()=>{
 const film=importScreenplay(input(raw)),first=film.scenes[0],one=planFor(film,first);
 one.continuity=[{entityName:'paper boat',key:'prop_material',value:'Ivory paper',intentionalChange:false,sourceQuote:first.blocks[0].text}];
 const p=validateScenePlan(film,first,one);film.entities=p.entities;film.continuity=p.continuity;
 const two=planFor(film,film.scenes[1]);two.continuity=[{...one.continuity[0],value:'Red plastic',sourceQuote:film.scenes[1].blocks[0].text}];
 expect(()=>validateScenePlan(film,film.scenes[1],two)).toThrow('CONTINUITY_CONFLICT');expect(p.continuity[0].status).toBe('requires_visual_verification');
});
test('private import identity is owner scoped, idempotent and rejects changed screenplay bytes',async()=>{
 const {service,job}=await fixture();expect((await service.create({uid:'founder',input:input(raw)})).duplicate).toBe(true);
 await expect(service.create({uid:'founder',input:input(raw+'\nSomething else.')})).rejects.toMatchObject({code:'SCREENPLAY_IDEMPOTENCY_CONFLICT'});
 await expect(service.get('other',job.productionId)).rejects.toMatchObject({statusCode:404});
});
test('creative plan rejection is bound to the plan hash and blocks generation or inherited planning',async()=>{
 const {service,p,job}=await fixture(),productionId=job.productionId,sceneId=job.screenplay.scenes[0].sceneId;
 const row=await service.planScene({uid:'founder',productionId,sceneId}),planHash=row.screenplay.scenes[0].plan.planHash;
 const review={accepted:false,reason:'The shot plan reveals the payoff before the transformation.',reviewer:'Test plan critic'};
 await expect(service.reviewScenePlan({uid:'other',productionId,sceneId,planHash,review})).rejects.toMatchObject({statusCode:404});
 await expect(service.reviewScenePlan({uid:'founder',productionId,sceneId,planHash:'a'.repeat(64),review})).rejects.toMatchObject({code:'SCREENPLAY_PLAN_REVIEW_STALE'});
 const rejected=await service.reviewScenePlan({uid:'founder',productionId,sceneId,planHash,review});
 expect(rejected.status).toBe('needs_scene_revision');expect(rejected.screenplay.scenes[0].plan.planHash).toBe(planHash);
 await expect(service.queueScene({uid:'founder',productionId,sceneId})).rejects.toMatchObject({code:'SCREENPLAY_SCENE_PLAN_REJECTED'});
 await expect(service.planScene({uid:'founder',productionId,sceneId:job.screenplay.scenes[1].sceneId})).rejects.toMatchObject({code:'SCREENPLAY_PRIOR_PLAN_REJECTED'});
 expect(p.generate).not.toHaveBeenCalled();
});
test('a queued scene cannot start inference after its written plan is rejected',async()=>{
 const {service,factory,p,job}=await fixture(),productionId=job.productionId,sceneId=job.screenplay.scenes[0].sceneId;
 const row=await service.planScene({uid:'founder',productionId,sceneId});
 const child=await service.queueScene({uid:'founder',productionId,sceneId});
 await service.reviewScenePlan({uid:'founder',productionId,sceneId,planHash:row.screenplay.scenes[0].plan.planHash,
  review:{accepted:false,reason:'The planned action is weak.',reviewer:'Test plan critic'}});
 const result=await factory.process(child.job.jobId);
 expect(result.failure.code).toBe('CONTENT_FACTORY_SCREENPLAY_PLAN_REJECTED');expect(p.generate).not.toHaveBeenCalled();expect(p.render).not.toHaveBeenCalled();
});
test('scene plans progress in screenplay order and retry fixes a grounded model failure',async()=>{
 const {service,p,job}=await fixture();await expect(service.planScene({uid:'founder',productionId:job.productionId,sceneId:job.screenplay.scenes[1].sceneId})).rejects.toMatchObject({code:'SCREENPLAY_PLAN_ORDER_REQUIRED'});
 const good=p.planScreenplayScene.getMockImplementation();p.planScreenplayScene.mockImplementationOnce(async c=>{const result=await good(c);result.plan.shots[0].sourceQuote='Invented action';return result});
 const request={uid:'founder',productionId:job.productionId,sceneId:job.screenplay.scenes[0].sceneId};await expect(service.planScene(request)).rejects.toMatchObject({code:'SCREENPLAY_UNGROUNDED_SOURCE'});
 expect((await service.get('founder',job.productionId)).status).toBe('needs_scene_revision');await service.planScene(request);
 expect(p.planScreenplayScene.mock.calls[1][0].previousFailure.code).toBe('SCREENPLAY_UNGROUNDED_SOURCE');await service.planScene(request);expect(p.planScreenplayScene).toHaveBeenCalledTimes(2);
});
test('one-shot generated scene uses the existing canonical Director/render path with screenplay provenance',async()=>{
 const {service,factory,p,job}=await fixture(),scene=job.screenplay.scenes[0];await service.planScene({uid:'founder',productionId:job.productionId,sceneId:scene.sceneId});
 const child=await service.queueScene({uid:'founder',productionId:job.productionId,sceneId:scene.sceneId});expect((await service.queueScene({uid:'founder',productionId:job.productionId,sceneId:scene.sceneId})).duplicate).toBe(true);
 const result=await factory.process(child.job.jobId);expect(result.failure).toBeNull();expect(result.status).toBe('awaiting_founder_review');expect(p.plan).not.toHaveBeenCalled();
 const edit=p.render.mock.calls[0][0].edit;expect(edit.document.clipOccurrences).toHaveLength(1);expect(edit.renderRequest.end_time).toBe(4);
 expect(p.review.mock.calls.find(([c])=>c.output)[0].criteria[0]).toContain('screenplay action');
 expect(result.assets[0].provenance.sourceLineage.sourceSha256).toBe(job.screenplay.source.sha256);
 expect(edit.intelligence.revision.evidenceRefs[0].dependencyHashes).toContain(job.screenplay.source.sha256);
 const marketing={...result.direction};delete marketing.mode;expect(()=>validateDirection(marketing)).toThrow('DIRECTION_INVALID');
});
test('internal scene direction and parent hashes cannot be replaced with arbitrary generation requests',async()=>{
 const {service,factory,job}=await fixture(),scene=job.screenplay.scenes[0];await service.planScene({uid:'founder',productionId:job.productionId,sceneId:scene.sceneId});
 const parent=await service.get('founder',job.productionId),direction=compileSceneDirection({screenplay:parent.screenplay,scene:parent.screenplay.scenes[0],plan:parent.screenplay.scenes[0].plan});
 const args={uid:'founder',input:{requestId:'tamper',brief:'An internal scene job'},creativeDirection:direction,sourceLineage:{productionId:job.productionId,sceneId:scene.sceneId,sourceSha256:parent.screenplay.source.sha256,scenePlanHash:parent.screenplay.scenes[0].plan.planHash}};
 args.creativeDirection.title='Changed';await expect(factory.create(args)).rejects.toMatchObject({code:'CONTENT_FACTORY_SCREENPLAY_DIRECTION_CHANGED'});
 args.uid='other';await expect(factory.create(args)).rejects.toMatchObject({code:'CONTENT_FACTORY_SCREENPLAY_LINEAGE_INVALID'});
});
test('reviewed scenes assemble in screenplay order, retaining native scene audio; stale reviews block assembly',async()=>{
 const {service,factory,store,job}=await fixture();for(const scene of job.screenplay.scenes){await service.planScene({uid:'founder',productionId:job.productionId,sceneId:scene.sceneId});const child=await service.queueScene({uid:'founder',productionId:job.productionId,sceneId:scene.sceneId});await factory.process(child.job.jobId);}
 const assembly=await service.prepareAssembly({uid:'founder',productionId:job.productionId});expect(assembly.edit.renderRequest.mute_audio).toBe(false);
 expect(assembly.output.sequence.map(s=>s.assetId)).toEqual(job.screenplay.scenes.map(s=>s.sceneId));expect(assembly.stage).toBe('prepared_for_existing_renderer');
 const parent=await service.get('founder',job.productionId),childId=parent.sceneJobs[0].jobId;await store.transaction(childId,r=>({...r,outputs:r.outputs.map(o=>({...o,review:{...o.review,artifactSha256:'a'.repeat(64)}}))}));
 await expect(service.prepareAssembly({uid:'founder',productionId:job.productionId})).rejects.toMatchObject({code:'SCREENPLAY_SCENE_REVIEW_STALE'});
});
test('the durable store rejects a record too large for Firestore before changing saved state',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'factory-bound-'));try{const store=localFactoryStore(root),id='a'.repeat(64);await store.transaction(id,()=>({status:'saved'}));
  await expect(store.transaction(id,()=>({text:'x'.repeat(900000)}))).rejects.toMatchObject({code:'CONTENT_FACTORY_JOB_RECORD_LIMIT'});expect((await store.get(id)).status).toBe('saved');
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
