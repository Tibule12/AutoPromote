'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {ROOT,projectPublic,textRecords}=require('./index');
const slug=id=>id.replaceAll('.','-');
const cell=value=>String(value??'unknown').replaceAll('|','\\|').replaceAll('\n',' ');
const bullets=values=>values.length?values.map(v=>`- ${v}`).join('\n'):'No additional requirement recorded.';
const banner=book=>`Development documentation • product ${book.product_version} • knowledge ${book.knowledge_version} • ${book.updated_at}\n\nReadiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.\n`;
const table=c=>`| ${cell(c.control_id)} | ${cell(c.label)} | ${cell(c.constraints.type)} | ${cell(c.constraints.values.length?c.constraints.values.join(', '):`${c.constraints.minimum??'source-dependent'} … ${c.constraints.maximum??'source-dependent'}`)} | ${cell(c.unit)} | ${cell(c.constraints.default_known?JSON.stringify(c.constraints.default):'not a fixed default')} | ${c.keyframeable} | ${c.preview_support} | ${c.render_support} | ${c.director_edit} |`;

function featureText(f,book){
  const controls=book.controls.filter(c=>f.controls.includes(c.control_id));
  const tasks=book.tasks.filter(t=>t.feature_ids.includes(f.feature_id));
  return `## ${f.name}\n\nID: \`${f.feature_id}\` • **${f.status}** • ${f.implementation_kind}\n\n${f.summary}\n\n${f.purpose!==f.summary?`**Purpose:** ${f.purpose}\n\n`:''}**Available to:** ${f.available_to.join('; ')}\n\n**Media:** ${f.supported_media.join(', ')||'not qualified'}\n\n**Requires:** ${f.requires.map(id=>`${id} (${book.features.find(x=>x.feature_id===id)?.status||'unavailable'})`).join(', ')||'No additional feature requirement recorded.'}\n\n**Optional:** ${f.optional_capabilities.map(id=>`${id} (${book.features.find(x=>x.feature_id===id)?.status||'unavailable'})`).join(', ')||'None recorded.'}\n\n**Workflow**\n\n${f.workflow.map((s,i)=>`${i+1}. ${s}`).join('\n')}\n\n**Preview:** ${f.preview_behavior}\n\n**Final render:** ${f.render_behavior}\n\n**Limits**\n\n${bullets(f.limitations)}\n\n**Common errors**\n\n${f.common_errors.map(e=>`- ${e.condition}: ${e.resolution}`).join('\n')}\n\n**Controls:** ${controls.map(c=>`[${c.label}](../control-reference/index.md#${slug(c.control_id)})`).join(', ')||'No source-qualified editable control is recorded.'}\n\n**Guides:** ${tasks.map(t=>`[${t.title}](../task-guides/${slug(t.task_id)}.md)`).join(', ')||'No task guide in V1.'}\n\n**Templates:** ${f.templates_using_feature.map(t=>`${t.template_id}@${t.version}`).join(', ')||'No pinned shared-template binding recorded.'}\n`;
}
function taskText(t,book){
  return `# ${t.title}\n\n${banner(book)}\nID: \`${t.task_id}\` • **${t.status}** • ${t.mode}\n\n${t.summary}\n\n## Before you start\n\n${bullets(t.prerequisites.map(id=>`${id} — ${book.features.find(f=>f.feature_id===id)?.status||'unavailable'}`))}\n\n## Steps\n\n${t.steps.map((s,i)=>`${i+1}. ${s.instruction}\n   Feature: \`${s.feature_id}\`.${s.control_ids.length?` Controls: ${s.control_ids.map(id=>`[${id}](../control-reference/index.md#${slug(id)})`).join(', ')}.`:''}`).join('\n\n')}\n\n## Feature readiness\n\n${bullets(t.feature_ids.map(id=>{const f=book.features.find(f=>f.feature_id===id);return `${id} — **${f?.status||'unavailable'}**: ${f?.summary||''}`;}))}\n\n## Result and limitations\n\n${t.expected_result}\n\n${bullets(t.limitations)}\n\nTroubleshooting references: ${t.troubleshooting_features.join(', ')}.\n`;
}
function generatedFiles(internalBook){
  const b=projectPublic(internalBook),files=new Map();
  const add=(file,text)=>files.set('docs/product/'+file,text.trimEnd()+'\n');
  const areas=new Map([
    ['Studio','studio'],['Cam Combiner','cam-combiner'],['Director','director'],
    ['Generated media','generated-media'],['Templates','templates'],
    ['Publishing','publishing'],['Troubleshooting','troubleshooting']]);
  const counts=Object.fromEntries(['UNIMPLEMENTED','BROKEN','PROXY_ONLY','PARTIAL','FUNCTIONAL','PRO_READY','PRODUCTION_READY'].map(s=>[s,internalBook.features.filter(f=>f.status===s).length]));
  add('README.md',`# AutoPromote product knowledge\n\n${banner(b)}\nThis generated user documentation describes the actual development snapshot. It does not announce a release or certify public showcase films.\n\nThe canonical internal catalogue has ${internalBook.features.length} features, ${internalBook.controls.length} control records and ${internalBook.tasks.length} task guides. This safe projection contains ${b.features.length} features; internal-only provider records and implementation/evidence paths are excluded.\n\n## Readiness\n\n| Status | Internal feature count |\n|---|---:|\n${Object.entries(counts).map(([s,n])=>`| ${s} | ${n} |`).join('\n')}\n\nUNIMPLEMENTED means no qualified implementation. BROKEN identifies a known blocking defect. PROXY_ONLY is a study or stub, not the advertised model result. PARTIAL has significant workflow/combination limits. FUNCTIONAL has an implemented scoped path. PRO_READY and PRODUCTION_READY require their authoritative higher qualification; neither is claimed here.\n\n## Start here\n\n- [Getting started](getting-started/index.md)\n${[...areas].map(([label,dir])=>`- [${label}](${dir}/index.md)`).join('\n')}\n- [Motion / Transform Keyframes](studio/motion-keyframes.md)\n- [Real masks and placement proxies](studio/subject-effects.md)\n- [3D support limits](3d/index.md)\n- [Audio controls](audio/index.md)\n- [Caption defect and reviewed correction](captions/index.md)\n- [Control reference](control-reference/index.md)\n- [Task guides](task-guides/index.md)\n- [AI-readable documentation package](ai/index.md)\n\n## Retrieval data\n\n[Structured user knowledge](_data/knowledge.public.v1.json), [searchable records](_data/search.public.v1.jsonl) and [public relationship graph](_data/graph.public.v1.json) retain stable IDs, readiness and product/knowledge versions. Consuming this data grants no authority to run jobs or mutate a project.\n\nTen adjacent workspace/assistant surfaces remain outside the audited V1 catalogue. The internal inventory names them; this is not complete documentation of the entire product.\n`);
  for(const [area,dir] of areas)add(`${dir}/index.md`,`# ${area}\n\n${banner(b)}\n${b.features.filter(f=>f.area===area).map(f=>featureText(f,b)).join('\n')}`);
  add('getting-started/index.md',`# Start with an owned editable project\n\n${banner(b)}\n1. Sign in through the existing account flow and import owned supported sources.\n2. Open Studio and inspect the native timeline. A cut already inside imported footage is different from a new clip occurrence.\n3. Apply an exact draft template or edit ordinary clips/layers/audio. Director proposals require evidence and review; manual editing uses the same project.\n4. Save, reopen and inspect current source bindings, timing and keys.\n5. Render the current revision and watch the full exported movie with sound. Check the relevant limitations before publishing.\n\nModel-backed features require current execution availability, costs/authorization and owned reviewed artifacts. Browser placement studies do not qualify as segmentation, tracking, cleanup or replacement output.\n\nSee [Cam Combiner](../cam-combiner/index.md), [template workflow](../task-guides/task-use_template.md), [final export](../task-guides/task-final_export.md) and [troubleshooting](../troubleshooting/index.md).\n`);
  for(const [file,title,filter] of [
    ['studio/motion-keyframes.md','Motion / Transform Keyframes',f=>['studio.transforms','studio.keyframes','studio.easing'].includes(f.feature_id)],
    ['studio/subject-effects.md','Mask-backed subject effects and browser proxies',f=>f.feature_id.startsWith('studio.compositing.')||f.feature_id.startsWith('studio.creator.')||['studio.subject_cutout','studio.tracking','studio.masks'].includes(f.feature_id)],
    ['3d/index.md','3D authored scenes',f=>['studio.three_d','studio.blender','studio.three_d_audio','creative.three_d'].includes(f.feature_id)],
    ['audio/index.md','Audio editing and sound design',f=>['studio.audio','studio.voiceover','studio.music','studio.sfx','studio.audio_restoration','studio.audio_automation','studio.ducking','creative.audio'].includes(f.feature_id)],
    ['captions/index.md','Captions and reviewed transcription',f=>f.feature_id==='studio.captions']
  ])add(file,`# ${title}\n\n${banner(b)}\n${b.features.filter(filter).map(f=>featureText(f,b)).join('\n')}`);
  add('task-guides/index.md',`# Task guides\n\n${banner(b)}\n${b.tasks.map(t=>`- [${t.title}](${slug(t.task_id)}.md) — ${t.status}; ${t.mode}`).join('\n')}\n`);
  for(const t of b.tasks)add(`task-guides/${slug(t.task_id)}.md`,taskText(t,b));
  add('control-reference/index.md',`# Source-qualified controls\n\n${banner(b)}\nA value is scoped to its listed inspector/media type. Unknown defaults/ranges are explicitly retained as unknown. Keyframe support, preview, final render and Director editability are separate facts.\n\n| ID | Label | Type | Range/values | Unit | Default | Keys | Preview | Render | Director |\n|---|---|---|---|---|---|---|---|---|---|\n${b.controls.map(table).join('\n')}\n\n${b.controls.map(c=>`<a id="${slug(c.control_id)}"></a>\n\n## ${c.label}\n\nID: \`${c.control_id}\` • **${c.status}**\n\n${c.meaning}\n\nApplies to: ${c.applicable_media.join(', ')}. Requires: ${c.dependencies.join(', ')}.\n\n${bullets(c.limitations)}\n`).join('\n')}`);
  add('_data/knowledge.public.v1.json',JSON.stringify(b,null,2));
  // External AI package derives only from the same reviewed public projection.
  // These local discovery links do not guarantee third-party indexing/ingestion.
  add('_data/ai-package.v1.json', JSON.stringify({
    schema_version: 1, product_version: b.product_version, knowledge_version: b.knowledge_version,
    updated_at: b.updated_at, release_channel: b.release_channel,
    catalogue: 'knowledge.public.v1.json', controls: 'controls.public.v1.json',
    task_guides: 'tasks.public.v1.json', relationships: 'graph.public.v1.json',
    canonical_documentation: '../README.md',
    features: b.features.map(f => ({ feature_id: f.feature_id, status: f.status,
      documentation: f.feature_id.startsWith('studio.three_d') || f.feature_id === 'studio.blender' ? '../3d/index.md' :
        `../${areas.get(f.area) || 'studio'}/index.md` })),
    guides: b.tasks.map(t => ({ task_id: t.task_id, documentation: `../task-guides/${slug(t.task_id)}.md` })),
    policy: 'Dated, read-only product documentation. Preserve readiness and limitations. Not project execution authority or a guarantee of external AI ingestion.',
  }, null, 2));
  add('_data/controls.public.v1.json', JSON.stringify({ knowledge_version: b.knowledge_version, controls: b.controls }, null, 2));
  add('_data/tasks.public.v1.json', JSON.stringify({ knowledge_version: b.knowledge_version, tasks: b.tasks }, null, 2));
  add('ai/index.md', `# AutoPromote public documentation for AI readers\n\n${banner(b)}\nUse the [package index](../_data/ai-package.v1.json), [feature catalogue](../_data/knowledge.public.v1.json), [controls](../_data/controls.public.v1.json), [task guides](../_data/tasks.public.v1.json) and [relationship graph](../_data/graph.public.v1.json). Human-readable canonical documents are linked from the package index. All derive from the same public projection.\n\nRetain readiness, limitations and the documentation date in answers. A placement study is not model output. Do not infer current account entitlements, model availability or permission to execute. Unknown or ambiguous questions need clarification or documentation review. This is an AI-readable package, not an ingestion guarantee for ChatGPT, Claude, Gemini or search engines.\n`);
  add('_data/search.public.v1.jsonl',textRecords(b).map(r=>JSON.stringify(r)).join('\n'));
  add('_data/graph.public.v1.json',JSON.stringify({schema_version:1,knowledge_version:b.knowledge_version,product_version:b.product_version,nodes:[...b.features.map(f=>({id:f.feature_id,kind:'feature',status:f.status})),...b.controls.map(c=>({id:c.control_id,kind:'control',status:c.status})),...b.tasks.map(t=>({id:t.task_id,kind:'task',status:t.status}))],edges:b.relationships},null,2));
  return files;
}
function writeGenerated(book,{root=ROOT,check=false}={}){
  const files=generatedFiles(book),errors=[];
  for(const [file,content]of files){const target=path.join(root,file);if(check){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==content)errors.push(`Stale generated documentation: ${file}`);}else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);}}
  // An obsolete generated page must not preserve a removed capability claim.
  const manifest=path.join(root,'docs/product/_data/generated-files.v1.json');
  const expected=JSON.stringify({schema_version:1,files:[...files.keys()].sort()},null,2)+'\n';
  if(fs.existsSync(manifest)){for(const file of JSON.parse(fs.readFileSync(manifest,'utf8')).files){if(!files.has(file)){if(check)errors.push(`Obsolete generated documentation: ${file}`);else if(file.startsWith('docs/product/')&&!file.split('/').includes('..'))fs.rmSync(path.join(root,file),{force:true});}}}
  if(check){if(!fs.existsSync(manifest)||fs.readFileSync(manifest,'utf8')!==expected)errors.push('Generated-file manifest is stale');}else fs.writeFileSync(manifest,expected);
  return {valid:!errors.length,errors,file_count:files.size+1};
}
module.exports={generatedFiles,writeGenerated};
