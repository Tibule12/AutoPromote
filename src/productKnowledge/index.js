'use strict';
// Read-only product truth. No model, browser, cloud, secrets or project mutation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Ajv = require('ajv');
const ROOT = path.resolve(__dirname, '../..');
const CATALOG = 'config/product-knowledge/knowledge.v1.json';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const readJson = (root, file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const normalStatus = value => String(value).replaceAll('-', '_');
const rank = {UNIMPLEMENTED:0, BROKEN:0, PROXY_ONLY:0, PARTIAL:1, FUNCTIONAL:2, PRO_READY:3, PRODUCTION_READY:4};

function validateKnowledge(book, { root = ROOT, inventory, checkReview = true, strictReview = false } = {}) {
  const errors = [], warnings = [];
  const ajv = new Ajv({ allErrors:true, jsonPointers:true });
  const validate = ajv.compile(readJson(ROOT, 'contracts/product-knowledge-v1.schema.json'));
  if (!validate(book)) return {valid:false, errors:validate.errors.map(e => `${e.dataPath}: ${e.message}`), warnings};
  if(book.product_version!==readJson(root,'package.json').version)errors.push('Knowledge product version differs from the actual product package');
  const features = new Map(), controls = new Map(), tasks = new Map(), ids = new Set();
  for (const [entries, key, map] of [[book.features,'feature_id',features],[book.controls,'control_id',controls],[book.tasks,'task_id',tasks]]) {
    for (const entry of entries) {
      if (ids.has(entry[key])) errors.push(`Duplicate ID: ${entry[key]}`);
      ids.add(entry[key]); map.set(entry[key],entry);
      for (const ref of entry.source_evidence) {
        if (!safeSource(root,ref.path)) { errors.push(`Unknown/unsafe reference: ${entry[key]} ${ref.path}`);continue; }
        if (!fs.readFileSync(path.join(root,ref.path),'utf8').includes(ref.anchor)) errors.push(`Missing source anchor: ${entry[key]} ${ref.path} ${ref.anchor}`);
      }
      if (entry.product_version !== book.product_version) errors.push(`Product version mismatch: ${entry[key]}`);
    }
  }
  const requireId = (id,map,context) => { if (!map.has(id)) errors.push(`Unresolved ${context}: ${id}`); };
  const readiness = readJson(root,'test/e2e/studio-capability-matrix.json');
  const byMatrix = new Map(readiness.capabilities.map(c=>[c.id,normalStatus(c.readiness)]));
  const modelRegistry = readJson(root,'config/model-runtime/registry.v1.json');
  const capabilities = new Set(modelRegistry.models.map(m=>m.capabilityId));
  const modelContract = readJson(root,'contracts/model-capabilities-v1.json');
  const templateRegistry = readJson(root,'config/creative-templates/registry.v1.json');
  const templateKeys = new Set(templateRegistry.templates.map(t=>`${t.templateId}@${t.version}`));
  const templateNodes = new Set([...templateKeys].map(t=>`template:${t}`));
  for (const f of book.features) {
    for (const id of [...f.requires,...f.optional_capabilities,...f.related_features]) requireId(id,features,`feature dependency from ${f.feature_id}`);
    for (const id of f.controls) requireId(id,controls,`control from ${f.feature_id}`);
    for (const id of f.controls) if(controls.has(id)&&!controls.get(id).feature_ids.includes(f.feature_id))errors.push(`Control binding mismatch: ${f.feature_id} ${id}`);
    for (const cap of f.model_capabilities) if (!capabilities.has(cap) || !modelContract.inputs[cap] || !modelContract.outputs[cap]) errors.push(`Unresolved model capability: ${f.feature_id} ${cap}`);
    for (const t of f.templates_using_feature) if (!templateKeys.has(`${t.template_id}@${t.version}`)) errors.push(`Unresolved template: ${f.feature_id} ${t.template_id}@${t.version}`);
    if (['BROWSER_PROXY','STUB','UNIMPLEMENTED'].includes(f.implementation_kind) && rank[f.status] > 0) errors.push(`Availability contradicts implementation: ${f.feature_id}`);
    if (f.readiness_authority) {
      const current = byMatrix.get(f.readiness_authority.matrix_id);
      if (!current) errors.push(`Unknown readiness authority: ${f.feature_id}`);
      else if (rank[f.status] > rank[current] || (current==='BROKEN' && f.status!=='BROKEN' && rank[f.status]>0)) errors.push(`Readiness overclaim: ${f.feature_id} docs=${f.status} source=${current}`);
    }
    if (rank[f.status]>=3 && !f.readiness_authority) errors.push(`Professional readiness lacks authoritative qualification: ${f.feature_id}`);
    if(rank[f.status]>=3 && f.readiness_authority){
      const row=readiness.capabilities.find(c=>c.id===f.readiness_authority.matrix_id);
      if(!row?.qualificationEvidence?.realUserFlow||!row?.qualificationEvidence?.preFinalPairedParity||!row?.qualificationEvidence?.referencePaths?.length||Object.values(row?.lifecycle||{}).length!==12||Object.values(row?.lifecycle||{}).some(g=>g.status!=='VERIFIED'))errors.push(`Professional readiness evidence incomplete: ${f.feature_id}`);
      if(f.status==='PRODUCTION_READY'&&['security','ordinaryAccounts','broadMedia','concurrency','recovery','operations'].some(key=>row?.productionQualification?.[key]!=='VERIFIED'))errors.push(`Production readiness evidence incomplete: ${f.feature_id}`);
    }
  }
  for (const c of book.controls) {
    for (const id of [...c.feature_ids,...c.dependencies]) requireId(id,features,`control feature from ${c.control_id}`);
    for(const id of c.feature_ids)if(features.has(id)&&!features.get(id).controls.includes(c.control_id))errors.push(`Feature/control inverse binding mismatch: ${id} ${c.control_id}`);
    const range=c.constraints;
    if (range.minimum!==null && range.maximum!==null && range.minimum>range.maximum) errors.push(`Invalid range: ${c.control_id}`);
    if (range.default_known && typeof range.default==='number' && ((range.minimum!==null&&range.default<range.minimum)||(range.maximum!==null&&range.default>range.maximum))) errors.push(`Default outside range: ${c.control_id}`);
    if (range.type==='enum' && range.default_known && !range.values.includes(range.default)) errors.push(`Default outside enum: ${c.control_id}`);
    if(range.default_known && range.type!=='enum' && range.type!=='array' && typeof range.default !== (range.type==='integer'?'number':range.type)) errors.push(`Default type mismatch: ${c.control_id}`);
    if(range.type==='integer' && range.default_known&&!Number.isInteger(range.default))errors.push(`Integer default required: ${c.control_id}`);
    if (c.status==='UNIMPLEMENTED' && (c.render_support==='SUPPORTED'||c.director_edit==='SUPPORTED')) errors.push(`Unimplemented control overclaim: ${c.control_id}`);
  }
  for (const task of book.tasks) {
    for (const id of [...task.feature_ids,...task.prerequisites,...task.troubleshooting_features]) requireId(id,features,`task feature from ${task.task_id}`);
    for (const id of task.control_ids) requireId(id,controls,`task control from ${task.task_id}`);
    for (const step of task.steps) {
      requireId(step.feature_id,features,`step feature from ${task.task_id}`);
      if(!task.feature_ids.includes(step.feature_id))errors.push(`Task/step feature binding mismatch: ${task.task_id}`);
      for (const id of step.control_ids) requireId(id,controls,`step control from ${task.task_id}`);
      for(const id of step.control_ids)if(!task.control_ids.includes(id)||!controls.get(id)?.feature_ids.includes(step.feature_id))errors.push(`Task/step control binding mismatch: ${task.task_id} ${id}`);
    }
    if (task.mode!=='UNAVAILABLE' && task.feature_ids.some(id=>['UNIMPLEMENTED','PROXY_ONLY'].includes(features.get(id)?.status))) errors.push(`Executable guide requires unavailable feature: ${task.task_id}`);
  }
  const bindings = new Set();
  for (const t of book.template_bindings) {
    const key=`${t.template_id}@${t.version}`; bindings.add(key);
    if (!templateKeys.has(key)) errors.push(`Unknown template binding: ${key}`);
    for(const id of t.feature_ids)requireId(id,features,`template capability ${key}`);
  }
  for (const key of templateKeys) if (!bindings.has(key)) errors.push(`Template missing knowledge capability binding: ${key}`);
  const nodes = new Set([...ids,...templateNodes,...[...capabilities].map(id=>`capability:${id}`)]);
  for (const edge of book.relationships) if (!nodes.has(edge.from)||!nodes.has(edge.to)) errors.push(`Unresolved graph edge: ${edge.from} ${edge.type} ${edge.to}`);
  for(const f of book.features) {
    for(const [field,type] of [['requires','requires'],['optional_capabilities','optionally_uses'],['controls','editable_with']])for(const id of f[field])
      if(!book.relationships.some(e=>e.from===f.feature_id&&e.type===type&&e.to===id))errors.push(`Missing canonical graph relationship: ${f.feature_id} ${type} ${id}`);
  }
  const visited=new Set(),active=new Set();
  function visit(id){if(active.has(id)){errors.push(`Required feature dependency cycle: ${id}`);return;}if(visited.has(id))return;active.add(id);for(const next of features.get(id)?.requires||[])visit(next);active.delete(id);visited.add(id);}
  for(const id of features.keys())visit(id);
  for(const h of book.contextual_help) {
    requireId(h.help_feature_id,features,`contextual help ${h.surface}`);
    for(const id of h.control_ids)requireId(id,controls,`help control ${h.surface}`);
    for(const id of h.control_ids)if(features.has(h.help_feature_id)&&!features.get(h.help_feature_id).controls.includes(id))errors.push(`Help control binding mismatch: ${h.surface} ${id}`);
  }
  for(const q of book.qualifications) {
    requireId(q.feature_id,features,'qualification');
    for(const id of q.feature_coverage)requireId(id,features,'qualified feature');
    for(const id of q.control_coverage)requireId(id,controls,'qualified control');
    for(const id of q.task_coverage)requireId(id,tasks,'qualified task');
    for(const ref of q.source_evidence) if (!safeSource(root,ref.path)||!fs.readFileSync(path.join(root,ref.path),'utf8').includes(ref.anchor))errors.push(`Invalid qualification evidence: ${q.feature_id}`);
  }
  for(const f of book.features)for(const example of f.examples)if(!safeSource(root,example.evidence_path))errors.push(`Unknown example evidence: ${f.feature_id}`);
  inventory ||= readJson(root,'config/product-knowledge/inventory.v1.json');
  for (const item of inventory.surfaces) {
    if(!safeSource(root,item.path)||!fs.readFileSync(path.join(root,item.path),'utf8').includes(item.anchor)) errors.push(`Unknown product surface: ${item.feature_id}`);
    if (!features.has(item.feature_id)) (item.required ? errors : warnings).push(`Undocumented product surface: ${item.feature_id}`);
  }
  const impactFile=path.join(root,'config/product-knowledge/change-impact.v1.json');
  if(!fs.existsSync(impactFile))errors.push('Documentation impact declarations are missing');
  else {
    const impact=JSON.parse(fs.readFileSync(impactFile,'utf8'));
    const validateImpact=ajv.compile(readJson(ROOT,'contracts/product-knowledge-impact-v1.schema.json'));
    if(!validateImpact(impact))errors.push(...validateImpact.errors.map(e=>`Impact ${e.dataPath}: ${e.message}`));
    else for(const change of impact.changes){
      requireId(change.feature_id,features,'documentation impact feature');
      if(features.has(change.feature_id)&&change.status_after!==features.get(change.feature_id).status)errors.push(`Impact readiness mismatch: ${change.feature_id}`);
      if(change.status_before!==change.status_after&&!change.documentation_impact.includes('READINESS'))errors.push(`Status change needs readiness review: ${change.feature_id}`);
      for(const file of change.source_paths)if(!safeSource(root,file))errors.push(`Unknown impact source: ${file}`);
    }
  }
  if(checkReview) {
    const lockPath=path.join(root,'config/product-knowledge/source-lock.v1.json');
    if(!fs.existsSync(lockPath)) (strictReview?errors:warnings).push('Documentation review lock is missing');
    else {
      const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
      if(lock.catalog_sha256!==sha(Buffer.from(JSON.stringify(book)))) (strictReview?errors:warnings).push('Knowledge content changed: documentation review required');
      for(const ref of lock.sources) if(!safeSource(root,ref.path)||sha(fs.readFileSync(path.join(root,ref.path)))!==ref.sha256) (strictReview?errors:warnings).push(`Source changed; documentation impact review required: ${ref.path}`);
    }
  }
  return {valid:errors.length===0,errors,warnings};
}

function safeSource(root, file) {
  if(typeof file!=='string'||path.isAbsolute(file)||file.split(/[\\/]/).includes('..'))return false;
  const target=path.resolve(root,file);
  try{return fs.statSync(target).isFile()&&fs.realpathSync(target).startsWith(fs.realpathSync(root)+path.sep);}catch{return false;}
}

const PUBLIC_FEATURE_FIELDS=['feature_id','name','area','status','summary','purpose','implementation_kind','available_to','supported_media','requires','optional_capabilities','controls','workflow','preview_behavior','render_behavior','limitations','common_errors','related_features','templates_using_feature','aliases','updated_at','product_version'];
const PUBLIC_CONTROL_FIELDS=['control_id','feature_ids','label','status','meaning','constraints','unit','keyframeable','preview_support','render_support','director_edit','applicable_media','dependencies','limitations','updated_at','product_version'];
const PUBLIC_TASK_FIELDS=['task_id','title','status','summary','feature_ids','control_ids','prerequisites','mode','steps','troubleshooting_features','expected_result','limitations','aliases','updated_at','product_version'];
const pick=(entry,fields)=>Object.fromEntries(fields.map(key=>[key,structuredClone(entry[key])]));
const LEAK=/(?:\/home\/|C:\\Users\\|gs:\/\/|storage\.googleapis\.com|Bearer\s|GoogleAccessId=|[?&](?:token|signature)=|(?:frontend\/src|python_media_worker\/|src\/services|reports\/|config\/model-runtime)|(?:Qwen3|SAM2\.1|Wan2\.2|checkpoint|safetensors))/i;
function projectPublic(book) {
  const features=book.features.filter(f=>f.visibility==='PUBLIC').map(f=>pick(f,PUBLIC_FEATURE_FIELDS));
  const controls=book.controls.filter(c=>c.visibility==='PUBLIC').map(c=>pick(c,PUBLIC_CONTROL_FIELDS));
  const tasks=book.tasks.filter(t=>t.visibility==='PUBLIC').map(t=>pick(t,PUBLIC_TASK_FIELDS));
  const ids=new Set([...features.map(f=>f.feature_id),...controls.map(c=>c.control_id),...tasks.map(t=>t.task_id)]);
  for(const f of features)for(const k of ['requires','optional_capabilities','controls','related_features'])f[k]=f[k].filter(id=>ids.has(id));
  for(const c of controls)for(const k of ['feature_ids','dependencies'])c[k]=c[k].filter(id=>ids.has(id));
  for(const t of tasks){for(const k of ['feature_ids','control_ids','prerequisites','troubleshooting_features'])t[k]=t[k].filter(id=>ids.has(id));t.steps=t.steps.filter(s=>ids.has(s.feature_id));for(const s of t.steps)s.control_ids=s.control_ids.filter(id=>ids.has(id));}
  const result={schema_version:1,knowledge_version:book.knowledge_version,product_version:book.product_version,release_channel:book.release_channel,updated_at:book.updated_at,features,controls,tasks,relationships:book.relationships.filter(e=>ids.has(e.from)&&ids.has(e.to)).map(e=>pick(e,['from','type','to']))};
  const scan=value=>{
    if(typeof value==='string'&&LEAK.test(value))throw new Error('PUBLIC_KNOWLEDGE_SENSITIVE_CONTENT');
    if(Array.isArray(value))value.forEach(scan);else if(value&&typeof value==='object')Object.values(value).forEach(scan);
  };scan(result);return result;
}

function loadKnowledge({ root=ROOT, strictReview=true }={}) {
  const book=readJson(root,CATALOG);
  const result=validateKnowledge(book,{root,strictReview});
  if(!result.valid)throw Object.assign(new Error(result.errors.join('\n')),{code:'KNOWLEDGE_INVALID',validation:result});
  return {book,validation:result};
}
function textRecords(book) {
  return [...book.features.map(f=>({id:f.feature_id,kind:'feature',entry:f})),...book.controls.map(c=>({id:c.control_id,kind:'control',entry:c})),...book.tasks.map(t=>({id:t.task_id,kind:'task',entry:t}))].map(r=>({...r,status:r.entry.status,product_version:book.product_version,knowledge_version:book.knowledge_version,text:[r.id,r.entry.name||r.entry.label||r.entry.title,r.entry.summary||r.entry.meaning,r.entry.purpose||'',...(r.entry.aliases||[]),...(r.entry.workflow||[]),...(r.entry.steps||[]).map(s=>s.instruction),...(r.entry.requires||[]),...(r.entry.feature_ids||[]),...(r.entry.controls||[]),...(r.entry.control_ids||[]),...(r.entry.limitations||[])].join('\n')}));
}
function searchKnowledge(query,{book,limit=8}={}) {
  book ||= projectPublic(loadKnowledge().book);
  if(typeof query!=='string'||query.length>2000||!Number.isInteger(limit)||limit<1||limit>20)throw new TypeError('Bounded query and limit required');
  const tokens=[...new Set(query.toLowerCase().match(/[a-z0-9_]+/g)||[])].filter(t=>t.length>2&&!['how','the','this','can','does','what','why','with','into','make','that','from'].includes(t));
  const scored=textRecords(book).map(r=>{const title=(r.entry.name||r.entry.label||r.entry.title||'').toLowerCase(),text=r.text.toLowerCase();return {...r,score:tokens.reduce((sum,t)=>sum+(r.id.toLowerCase().includes(t)?6:0)+(title.includes(t)?5:0)+(text.includes(t)?1:0),0)};}).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  // Include explicit related concepts in comparison queries; these are documented
  // graph neighbors, not inferred capability or availability claims.
  if(/difference|compare|versus/i.test(query)&&limit>=4){
    const selected=scored.slice(0,limit-2),seen=new Set(selected.map(r=>r.id));
    const related=(book.relationships||[]).filter(e=>e.type==='related_to'&&seen.has(e.from)&&!seen.has(e.to));
    for(const edge of related){const record=scored.find(r=>r.id===edge.to);if(record&&!seen.has(record.id)){selected.push({...record,retrieval_relation:'related_to',related_from:edge.from});seen.add(record.id);}if(selected.length===limit)break;}
    for(const record of scored){if(selected.length===limit)break;if(!seen.has(record.id)){selected.push(record);seen.add(record.id);}}
    return selected;
  }
  return scored.slice(0,limit);
}
function contextualHelp({help_feature_id,control_id=null,mode='EXPLAIN'},{book}={}) {
  if(!['EXPLAIN','GUIDE','DIAGNOSE','CREATE'].includes(mode))throw new TypeError('Unknown help mode');
  book ||= projectPublic(loadKnowledge().book);
  const feature=book.features.find(f=>f.feature_id===help_feature_id);
  if(!feature)throw Object.assign(new Error('Unknown help feature'),{code:'HELP_FEATURE_UNKNOWN'});
  const controls=book.controls.filter(c=>feature.controls.includes(c.control_id)&&(!control_id||c.control_id===control_id));
  if(control_id&&!controls.length)throw new Error('Control does not belong to this feature');
  return {mode,feature,controls,tasks:book.tasks.filter(t=>t.feature_ids.includes(help_feature_id)),dependencies:book.features.filter(f=>feature.requires.includes(f.feature_id)),availability_notes:[...feature.limitations,...feature.requires.map(id=>{const f=book.features.find(e=>e.feature_id===id);return `${f?.name||id}: ${f?.status||'unavailable'}`;})],knowledge_version:book.knowledge_version,product_version:book.product_version,read_only:true,actions:[],execution_authority:'NONE',scope:'Documentation is a dated product snapshot. Account entitlements, current artifacts, costs and execution availability must be checked by the product before an action.'};
}
function recordReview({root=ROOT,reviewer,reason}={}) {
  if(!reviewer||!reason)throw new TypeError('Reviewer and concrete documentation review reason are required');
  const book=readJson(root,CATALOG),result=validateKnowledge(book,{root,checkReview:false});
  if(!result.valid)throw new Error(result.errors.join('\n'));
  const paths=new Set(['package.json','test/e2e/studio-capability-matrix.json','test/e2e/studio-preview-render-parity.json','config/model-runtime/registry.v1.json','config/creative-templates/registry.v1.json','contracts/model-capabilities-v1.json','config/product-knowledge/inventory.v1.json','config/product-knowledge/change-impact.v1.json','contracts/product-knowledge-v1.schema.json','contracts/product-knowledge-impact-v1.schema.json']);
  for(const e of [...book.features,...book.controls,...book.tasks])for(const ref of e.source_evidence)paths.add(ref.path);
  // Assistance contracts/code are reviewed along with the truth they project.
  for (const file of ['src/productKnowledge/generate.js', 'src/productAssistance/index.js', 'src/productAssistance/journal.js', 'src/routes/productAssistanceRoutes.js', 'src/middlewares/distributedRateLimiter.js',
    'frontend/src/components/ProductAssistance.js', 'frontend/src/components/ProductAssistance.css', 'frontend/src/components/ProductHelpButton.js']) if (fs.existsSync(path.join(root, file))) paths.add(file);
  for(const q of book.qualifications)for(const ref of q.source_evidence)paths.add(ref.path);
  const lock={schema_version:1,reviewer,reason,reviewed_at:new Date().toISOString(),catalog_sha256:sha(Buffer.from(JSON.stringify(book))),sources:[...paths].sort().map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(root,file)))})),scope:'Documentation review of repository sources and retained evidence. Not product runtime, professional creative or production release approval.'};
  fs.writeFileSync(path.join(root,'config/product-knowledge/source-lock.v1.json'),JSON.stringify(lock,null,2)+'\n');return lock;
}
module.exports={ROOT,CATALOG,validateKnowledge,loadKnowledge,projectPublic,textRecords,searchKnowledge,contextualHelp,recordReview,sha};
