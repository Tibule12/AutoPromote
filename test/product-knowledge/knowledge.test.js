'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const k=require('../../src/productKnowledge');
const {generatedFiles,writeGenerated}=require('../../src/productKnowledge/generate');
const book=JSON.parse(fs.readFileSync(path.join(k.ROOT,k.CATALOG),'utf8'));
const clone=()=>structuredClone(book);
const validate=b=>k.validateKnowledge(b,{checkReview:false});
const feature=(b,id)=>b.features.find(f=>f.feature_id===id);
function rejected(mutator,pattern){const b=clone();mutator(b);const r=validate(b);assert.equal(r.valid,false);assert.match(r.errors.join('\n'),pattern);}

test('real catalogue, implementation references and explicit deferred inventory validate',()=>{
  const r=k.validateKnowledge(book,{strictReview:true});assert.equal(r.valid,true,r.errors.join('\n'));
  assert.equal(r.warnings.length,10);assert.ok(book.features.length>=100);assert.ok(book.controls.length>=100);assert.equal(book.tasks.length,18);
  assert.equal(book.qualifications.length,3);assert.equal(book.features.filter(f=>['PRO_READY','PRODUCTION_READY'].includes(f.status)).length,0);
});
test('all three documentation qualifications include real feature/control/task references and retained limits',()=>{
  for(const q of book.qualifications){assert.ok(q.feature_coverage.length>=3);assert.ok(q.control_coverage.length>=5);assert.ok(q.task_coverage.length>=2);assert.ok(q.source_evidence.length>=2);assert.ok(q.limitations.some(s=>s.includes('not a new product execution')));}
  assert.equal(feature(book,'studio.keyframes').status,'FUNCTIONAL');assert.equal(feature(book,'cam_combiner.switching').status,'PARTIAL');
  assert.equal(feature(book,'studio.compositing.text_behind_subject').status,'PARTIAL');assert.equal(feature(book,'studio.creator.text_behind_subject').status,'PROXY_ONLY');
  assert.equal(feature(book,'studio.compositing.depth_estimation').status,'UNIMPLEMENTED');
});
test('meaningful control constraints preserve actual scope, including disabled and unknown fields',()=>{
  const c=id=>book.controls.find(c=>c.control_id===id);
  assert.deepEqual([c('studio.transform.scale').constraints.minimum,c('studio.transform.scale').constraints.maximum],[.1,5]);
  assert.equal(c('studio.transform.anchorx').keyframeable,'UNSUPPORTED');assert.equal(c('studio.subject.mask_feather').constraints.default_known,false);
  assert.equal(c('studio.three_d.audioReactiveIntensity'.toLowerCase()).render_support,'UNSUPPORTED');
  assert.deepEqual(c('cam_combiner.clean_audio_mode').constraints.values,['external_only','low_camera','mute_camera']);
});
test('unknown IDs, controls and templates fail instead of creating guessed documentation',()=>{
  rejected(b=>b.features[0].requires.push('unknown.feature'),/Unresolved feature dependency/);
  rejected(b=>b.tasks[0].control_ids.push('unknown.control'),/Unresolved task control/);
  rejected(b=>b.tasks[0].steps[0].feature_id='unknown.feature',/Unresolved step feature/);
  rejected(b=>b.features[0].templates_using_feature.push({template_id:'fictional',version:'1.0.0'}),/Unresolved template/);
  rejected(b=>b.template_bindings.pop(),/Template missing knowledge capability binding/);
  rejected(b=>b.template_bindings[0].feature_ids.push('unknown.capability'),/Unresolved template capability/);
});
test('duplicates, missing readiness, missing implementation and broken ranges fail',()=>{
  rejected(b=>b.features.push(structuredClone(b.features[0])),/Duplicate ID/);
  rejected(b=>delete b.features[0].status,/required property/);
  rejected(b=>b.features[0].source_evidence[0].path='missing-source.js',/Unknown\/unsafe reference/);
  rejected(b=>b.features[0].source_evidence[0].path='../secret',/Unknown\/unsafe reference/);
  rejected(b=>b.controls[0].constraints.minimum=999,/Invalid range|Default outside/);
  rejected(b=>b.controls[0].constraints.default='oops',/Default type mismatch/);
  rejected(b=>b.product_version='999.0.0',/differs from the actual product/);
});
test('runtime capabilities, readiness authorities and browser proxies cannot overclaim',()=>{
  rejected(b=>b.features[0].model_capabilities.push('fictional_model_capability'),/Unresolved model capability/);
  rejected(b=>feature(b,'studio.creator.screen_replacement').status='PRODUCTION_READY',/Availability contradicts implementation/);
  rejected(b=>feature(b,'studio.preview').status='FUNCTIONAL',/Readiness overclaim/);
  rejected(b=>feature(b,'cam_combiner.switching').status='PRO_READY',/Professional readiness lacks/);
  rejected(b=>b.tasks[0].feature_ids.push('studio.creator.object_cleanup'),/Executable guide requires unavailable/);
});
test('canonical graph and help-control binding errors are rejected',()=>{
  rejected(b=>b.relationships.push({from:'unknown.node',to:'studio.keyframes',type:'requires'}),/Unresolved graph edge/);
  rejected(b=>b.relationships=b.relationships.filter(e=>!(e.from==='studio.keyframes'&&e.type==='requires')),/Missing canonical graph relationship/);
  rejected(b=>feature(b,'studio.layers').requires.push('studio.keyframes'),/dependency cycle/);
  rejected(b=>b.contextual_help[0].control_ids.push('studio.audio.hum'),/Help control binding mismatch/);
});
test('missing major surface is an error while adjacent deferred surfaces are warnings',()=>{
  const inventory=JSON.parse(fs.readFileSync(path.join(k.ROOT,'config/product-knowledge/inventory.v1.json')));
  inventory.surfaces.push({feature_id:'workspace.new_major',path:'frontend/src/components/ViralClipStudio.js',anchor:'ViralClipStudio',required:true});
  const r=k.validateKnowledge(book,{inventory,checkReview:false});assert.equal(r.valid,false);assert.ok(r.errors.includes('Undocumented product surface: workspace.new_major'));
});
test('safe public projection excludes internal-only records and strips all source/provenance/model fields',()=>{
  const b=clone();b.features[0].source_evidence[0].path='/home/private/sentinel';b.features[0].examples.push({label:'private',kind:'RETAINED_PRIVATE_EVIDENCE',evidence_path:'gs://private/prompt',qualification:'private'});
  b.features[0].privateSentinel='SECRET';const p=k.projectPublic(b),serialized=JSON.stringify(p);
  assert.deepEqual(p.features.map(f=>f.feature_id).sort(),b.features.filter(f=>f.visibility==='PUBLIC').map(f=>f.feature_id).sort());
  assert.ok(p.features.some(f=>f.feature_id==='studio.logo_motion'));
  assert.ok(p.features.some(f=>f.feature_id==='studio.vector_artwork'));
  assert.ok(p.controls.some(c=>c.control_id==='studio.vector.stroke_start'&&c.keyframeable==='SUPPORTED'));
  assert.ok(p.controls.some(c=>c.control_id==='studio.vector.stroke_end'&&c.constraints.default===100));
  assert.ok(p.controls.some(c=>c.control_id==='studio.vector.stroke_offset'&&c.constraints.minimum===-1000&&c.constraints.maximum===1000));
  assert.ok(p.features.some(f=>f.feature_id==='studio.text_choreography'&&f.status==='PARTIAL'));
  assert.ok(p.features.some(f=>f.feature_id==='studio.logo_design'&&f.status==='PARTIAL'));
  assert.ok(p.controls.some(c=>c.control_id==='studio.logo_design.svg'&&c.keyframeable==='UNSUPPORTED'));
  assert.ok(p.controls.some(c=>c.control_id==='studio.logo_design.name'&&c.constraints.default==='AutoPromote'));
  assert.ok(p.controls.some(c=>c.control_id==='studio.text_animator.progress'&&c.keyframeable==='SUPPORTED'&&c.constraints.maximum===100));
  assert.ok(p.controls.some(c=>c.control_id==='studio.text_animator.from_rotation'&&c.constraints.minimum===-360));
  assert.ok(!serialized.includes('SECRET'));assert.ok(!serialized.includes('source_evidence'));
  assert.ok(!serialized.includes('model_capabilities'));assert.ok(!serialized.includes('evidence_path'));assert.ok(!serialized.includes('readiness_authority'));
  assert.ok(!serialized.includes('/home/'));assert.ok(!serialized.includes('generation.narration'));assert.ok(!serialized.includes('config/model-runtime'));
  for(const control of p.controls)assert.equal(Object.hasOwn(control,'field'),false);
});
test('sensitive text accidentally placed in public prose fails closed',()=>{
  for(const sentinel of ['gs://private/project','Bearer secret','/home/private/project','Qwen3 private implementation','signed.mp4?token=secret','reports/private-project.md']){
    const b=clone();b.features[0].summary=sentinel;assert.throws(()=>k.projectPublic(b),/PUBLIC_KNOWLEDGE_SENSITIVE_CONTENT/);
  }
});
test('six requested assistant questions retrieve grounded records, including related comparison concepts',()=>{
  const p=k.projectPublic(book);
  for(const [query,id] of [
    ['How do I make text go behind this person?','studio.compositing.text_behind_subject'],
    ['Why cannot I use object tracking?','studio.tracking'],
    ['What is the difference between Cam Combiner and Director?','director.proposals'],
    ['How do I make this product shot more cinematic?','task.product_launch'],
    ['Can AutoPromote animate this image?','generation.image_to_video'],
    ['What controls can I change after Director makes the edit?','task.director_manual']]){
    const rows=k.searchKnowledge(query,{book:p,limit:8});assert.ok(rows.some(r=>r.id===id),`${query}: ${rows.map(r=>r.id)}`);
    for(const row of rows){assert.equal(row.status,row.entry.status);assert.equal(row.product_version,book.product_version);assert.equal(row.knowledge_version,book.knowledge_version);}
  }
  assert.throws(()=>k.searchKnowledge('x'.repeat(2001),{book:p}));assert.throws(()=>k.searchKnowledge('query',{book:p,limit:21}));
});
test('EXPLAIN/GUIDE/DIAGNOSE/CREATE contextual proof is read-only and bound to known controls',()=>{
  const p=k.projectPublic(book),before=JSON.stringify(p);
  for(const id of ['studio.keyframes','cam_combiner.channel_mapping','studio.compositing.text_behind_subject'])for(const mode of ['EXPLAIN','GUIDE','DIAGNOSE','CREATE']){
    const help=k.contextualHelp({help_feature_id:id,mode},{book:p});assert.equal(help.read_only,true);assert.equal(help.execution_authority,'NONE');assert.deepEqual(help.actions,[]);assert.ok(help.tasks.length);assert.ok(help.controls.length);
  }
  assert.equal(JSON.stringify(p),before);assert.throws(()=>k.contextualHelp({help_feature_id:'made.up'},{book:p}));
  assert.throws(()=>k.contextualHelp({help_feature_id:'studio.keyframes',control_id:'studio.audio.hum'},{book:p}));
});

// Lightweight text/JSON-only fixtures test review enforcement. No source media,
// browser profiles, project databases, GPU calls or render worker is copied/run.
function fixture(run){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'autopromote-knowledge-test-'));
  const put=(file,content)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);};
  const jsonPaths=['package.json','test/e2e/studio-capability-matrix.json','test/e2e/studio-preview-render-parity.json','config/model-runtime/registry.v1.json','contracts/model-capabilities-v1.json','config/creative-templates/registry.v1.json','config/product-knowledge/inventory.v1.json','config/product-knowledge/change-impact.v1.json',k.CATALOG,'contracts/product-knowledge-v1.schema.json','contracts/product-knowledge-impact-v1.schema.json'];
  for(const file of jsonPaths)put(file,fs.readFileSync(path.join(k.ROOT,file)));
  for(const change of JSON.parse(fs.readFileSync(path.join(k.ROOT,'config/product-knowledge/change-impact.v1.json'))).changes)
    for(const file of change.source_paths)put(file,fs.readFileSync(path.join(k.ROOT,file)));
  const refs=new Map();for(const e of [...book.features,...book.controls,...book.tasks,...book.qualifications])for(const ref of e.source_evidence){if(!refs.has(ref.path))refs.set(ref.path,new Set());refs.get(ref.path).add(ref.anchor);}
  for(const f of book.features)for(const example of f.examples)if(!refs.has(example.evidence_path))refs.set(example.evidence_path,new Set(['example evidence']));
  for(const item of JSON.parse(fs.readFileSync(path.join(k.ROOT,'config/product-knowledge/inventory.v1.json'))).surfaces){if(!refs.has(item.path))refs.set(item.path,new Set());refs.get(item.path).add(item.anchor);}
  for(const [file,anchors]of refs)if(!jsonPaths.includes(file))put(file,[...anchors].join('\n'));
  try{run(root,put);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('review lock invalidates changed sources and edited docs; explicit review is required',()=>fixture((root,put)=>{
  k.recordReview({root,reviewer:'test fixture',reason:'Testing documentation fingerprint enforcement only.'});assert.equal(k.validateKnowledge(book,{root,strictReview:true}).valid,true);
  const file='frontend/src/components/StudioAdvancedInspectors.js';put(file,fs.readFileSync(path.join(root,file),'utf8')+'\nchanged professional control');
  const r=k.validateKnowledge(book,{root,strictReview:true});assert.equal(r.valid,false);assert.match(r.errors.join('\n'),/Source changed; documentation impact review required/);
  const edited=clone();edited.features[0].summary+=' Changed.';assert.ok(k.validateKnowledge(edited,{root,strictReview:true}).errors.some(e=>e.includes('Knowledge content changed')));
}));
test('authoritative readiness downgrade prevents stale FUNCTIONAL public availability',()=>fixture((root,put)=>{
  const matrix=JSON.parse(fs.readFileSync(path.join(root,'test/e2e/studio-capability-matrix.json')));matrix.capabilities.find(c=>c.id==='motion_graphics').readiness='BROKEN';put('test/e2e/studio-capability-matrix.json',JSON.stringify(matrix));
  const r=k.validateKnowledge(book,{root,checkReview:false});assert.equal(r.valid,false);assert.match(r.errors.join('\n'),/studio.keyframes docs=FUNCTIONAL source=BROKEN/);
  assert.throws(()=>k.loadKnowledge({root}),/Readiness overclaim/);
}));
test('readiness transitions require explicit impact declaration and matching post-change status',()=>fixture((root,put)=>{
  const file='config/product-knowledge/change-impact.v1.json',impact=JSON.parse(fs.readFileSync(path.join(root,file)));impact.changes[0].status_before='PROXY_ONLY';impact.changes[0].documentation_impact=['CONTROLS'];put(file,JSON.stringify(impact));
  assert.match(k.validateKnowledge(book,{root,checkReview:false}).errors.join('\n'),/Status change needs readiness review/);
  impact.changes[0].status_after='PRODUCTION_READY';put(file,JSON.stringify(impact));assert.match(k.validateKnowledge(book,{root,checkReview:false}).errors.join('\n'),/Impact readiness mismatch/);
}));
test('generated Markdown and retrieval bundles exactly match the catalogue and have no stale pages',()=>{
  const r=writeGenerated(book,{check:true});assert.equal(r.valid,true,r.errors.join('\n'));
  const files=generatedFiles(book);assert.ok(files.size>=30);
  const combined=[...files.values()].join('\n');assert.ok(!combined.includes('source_evidence'));assert.ok(!combined.includes('/home/'));assert.ok(!combined.includes('checkpoint'));
});
test('removed generated claims are detected and pruned on rebuild',()=>fixture((root,put)=>{
  writeGenerated(book,{root});const manifest='docs/product/_data/generated-files.v1.json';const m=JSON.parse(fs.readFileSync(path.join(root,manifest)));m.files.push('docs/product/studio/obsolete.md');put(manifest,JSON.stringify(m));put('docs/product/studio/obsolete.md','stale claim');
  assert.equal(writeGenerated(book,{root,check:true}).valid,false);assert.equal(writeGenerated(book,{root}).valid,true);assert.equal(fs.existsSync(path.join(root,'docs/product/studio/obsolete.md')),false);
}));
