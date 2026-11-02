#!/usr/bin/env node
// Actual App controls, normal emulator sign-in, canonical Studio CPU export.
process.env.STUDIO_MOTION_VARIANT='episode';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const n=require('./motion-flow-proof.cjs');
const {recording}=require('./kinetic-type-proof');
const q=require('../../test/e2e/playwright/studio-stability/run');
const h=require('../creative-templates/studio-proof');
const {hash}=require('../../src/creativeTemplates/contract');
const runtime=process.argv[2],phase=process.argv[3]||'author',folder=n.folder;
const config=JSON.parse(fs.readFileSync(path.join(runtime,'browser-private.json')));
const source=name=>path.resolve(__dirname,'../../reports/studio-motion-flow-takeover-20261031/video-texture/open-world-sources',name+'.mp4');
const file=name=>path.join(folder,name);
const load=name=>JSON.parse(fs.readFileSync(file(name)));
const write=(name,value)=>fs.writeFileSync(file(name),JSON.stringify(value,null,2),{mode:0o600});

async function live(p){
  await q.tool(p,'Export');
  const button=p.getByRole('button',{name:'Show Live Edit',exact:true});
  if(await p.getByTestId('hook-preview-frame').evaluate(el=>el.classList.contains('has-rendered-output'))){
    await button.waitFor({state:'visible'});await button.click();
  }
  await p.getByTestId('studio-program-canvas').waitFor({state:'visible'});
}
async function apply(p,plan){
  write('reviewed-scene-plan.json',plan);
  await p.getByTestId('studio-mode-fxflow').click();
  const panel=p.getByTestId('studio-scene-actions');
  if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();
  await panel.getByLabel('Scene action plan',{exact:true}).setInputFiles(file('reviewed-scene-plan.json'));
  await panel.getByRole('button',{name:'Apply reviewed scene actions',exact:true}).click();
  await p.waitForFunction(()=>{
    const s=document.querySelector('[data-testid="studio-scene-actions"] [role="status"]');
    return s&&s.textContent!=='Review this plan before applying.';
  },undefined,{timeout:60000});
  assert.match(await panel.getByRole('status').innerText(),/Scene actions applied/);
}
async function trim(p,start,end){
  await q.tool(p,'Cut');
  if(start){await n.range(p.getByText('Clip start',{exact:true}).locator('..').locator('input'),start);await p.waitForTimeout(250);}
  await p.waitForFunction(target=>{const label=[...document.querySelectorAll('label')].find(el=>el.querySelector('span')?.textContent==='Clip end');return Number(label?.querySelector('input')?.max)>=target;},end);
  await n.range(p.getByText('Clip end',{exact:true}).locator('..').locator('input'),end);
  await p.waitForTimeout(200);await n.pause(p);
}
async function author(p){
  assert(!fs.existsSync(file('Editable Project.autopromote.json')),'Preserve the completed episode; use inspect/refine');
  const resume=fs.existsSync(file('Interrupted Project.autopromote.json'));
  if(resume){
    if(fs.existsSync(file('Raw Project.autopromote.json'))&&!await p.getByRole('button',{name:n.title,exact:true}).count())
      await p.getByLabel('Restore project backup',{exact:true}).setInputFiles(file('Raw Project.autopromote.json'));
    await n.open(p);
  }
  else{
  await p.locator('.creator-studio-dropzone input[type=file]').setInputFiles(source('City'));
  await p.getByRole('button',{name:'Open Creator Studio',exact:true}).click({timeout:180000});
  await h.rail(p);await n.pause(p);await p.getByLabel('Project name',{exact:true}).fill(n.title);
  }
  const stop=await recording(p,folder);
  try{
    if(!resume){
    await q.tool(p,'Reframe');await p.getByTestId('reframe-aspect-16-9').click();await p.getByTestId('reframe-preserve-frame').click();
    const rounded=p.getByLabel('Rounded main footage',{exact:true});if(await rounded.count()&&await rounded.isChecked())await rounded.uncheck();
    await trim(p,0,4);
    const edl=load('edit-decision-list.json');
    for(const [name,start,end]of edl.slice(1)){
      const media=p.locator('.studio-media-card').filter({has:p.locator('strong',{hasText:name+'.mp4'})});
      if(!await media.count())await p.getByTestId('project-media-import-input').setInputFiles(source(name));
      await media.getByRole('button',{name:'Preview '+name+'.mp4',exact:true}).click();
      await media.getByRole('button',{name:'Add to sequence',exact:true}).click({timeout:90000});
      await trim(p,start,end);
    }
    }else{await n.seek(p,6.5);await trim(p,4,8);}
    await q.tool(p,'Sound');await p.getByLabel('Use voice repair on export',{exact:true}).uncheck();
    let saved=await n.save(p,'episode-raw-assembly');
    assert.equal(saved.snapshot.timeline.reduce((sum,c)=>sum+c.endRequest-c.startRequest,0),36);
    await n.backup(p,'Raw Project');
    const template=load('episode-plan-template.json');
    template.actions=template.actions.map(action=>action.sourceMediaId?{...action,sourceMediaId:saved.snapshot.projectMedia.find(m=>m.name===action.sourceMediaId+'.mp4').id}:action);
    await apply(p,{format:'autopromote-scene-actions',version:1,projectId:saved.id,
      baseRevision:saved.snapshot.studioDocument.revision,...template});
    saved=await n.save(p,'episode-scene-applied');
    assert(saved.snapshot.compoundClips.length>=12);
    const applied=n.decisions(saved.snapshot.studioDocument);
    await p.getByTestId('studio-undo-button').click();
    const undone=await n.save(p,'episode-scene-undo');assert.equal(undone.snapshot.overlays.length,0);
    await p.getByTestId('studio-redo-button').click();
    saved=await n.save(p,'episode-scene-redo');assert.equal(n.decisions(saved.snapshot.studioDocument),applied);
    await q.tool(p,'Motion');
    const transform=p.getByRole('button',{name:'Transform keyframes',exact:true});if(await transform.count())await transform.click();
    await p.getByLabel('Target layer',{exact:true}).selectOption(saved.snapshot.overlays.find(o=>o.name==='02 / shutter 4').id);
    await p.getByLabel('Enable layer motion blur',{exact:true}).check();
    await q.tool(p,'Sound');
    await p.getByTestId('background-sound-input').setInputFiles(file('Episode original score.wav'));
    const duck=p.getByLabel('Duck under speech',{exact:true});if(await duck.count()&&await duck.isChecked())await duck.uncheck();
    await n.range(p.getByText('Background volume',{exact:true}).locator('..').locator('..').locator('input'),88);
    await n.range(p.getByLabel('Music fade in',{exact:true}),.4);await n.range(p.getByLabel('Music fade out',{exact:true}),2);
    for(const [time,id,volume]of [[0,'cinematic_hit',24],[3.9,'airy_whoosh',18],[6,'reverse',14],
      [6.85,'click',12],[10,'bass_punch',24],[15.7,'airy_whoosh',18],[20,'cinematic_hit',23],
      [24,'chime',12],[28.2,'reverse',16],[29.25,'sparkle',14]]){
      await n.seek(p,time);await p.getByTestId('sound-effect-preset-'+id).click();
      await n.range(p.getByTestId('sound-effect-volume'),volume);
    }
    saved=await n.save(p,'episode-authored');await n.backup(p,'Editable Project');
    write('authoring.json',{projectId:saved.id,canonicalHash:hash(saved.snapshot.studioDocument),
      normalUi:true,reviewedSceneApplied:true,singleUndoRedo:true,seconds:36,videoOccurrences:saved.snapshot.timeline.length,
      layers:saved.snapshot.overlays.length,groups:saved.snapshot.compoundClips.length,keys:saved.snapshot.motionKeyframes.length,
      sources:saved.snapshot.projectMedia.map(m=>({name:m.name,sha256:m.contentHash})),
      inferenceCalls:0,scope:'Reviewed local directions executed through native Director scene controls; no model inference claim.'});
  }finally{await stop();}
}
async function inspect(p){
  await live(p);await p.getByTestId('studio-mode-fxflow').click();
  await p.getByTestId('studio-comp-workbench').getByText('Main Programme',{exact:true}).click();
  const samples=[];
  for(const time of [0.75,2.6,4.8,6.9,8,9.7,11.5,14,16.5,17.7,19.5,21.5,23,25,27,29.3,31.5,34.5,35.9]){
    await n.seek(p,time);
    await p.waitForFunction(t=>{const c=document.querySelector('[data-testid="studio-program-canvas"]'),v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&c?.getAttribute('aria-busy')!=='true'&&Math.abs(Number(c?.dataset.programmeTime)-t)<1/24;},time,{timeout:30000});
    await p.waitForTimeout(350);
    await p.getByTestId('hook-preview-frame').screenshot({path:file(`preview-${time.toFixed(2)}.png`)});
    samples.push({requested:time,...await p.getByTestId('studio-program-canvas').evaluate(el=>({...el.dataset}))});
  }
  write('preview-samples.json',samples);
}
async function reopenEdit(p){
  const before=await n.save(p,'reopened-before-edit'),expected=load('Editable Project.autopromote.json');
  assert.equal(n.decisions(before.snapshot.studioDocument),n.decisions(expected.snapshot.studioDocument));
  await n.seek(p,30);await trim(p,0,7.9);
  const shortened=await n.save(p,'reopen-trim-history');
  assert.equal(shortened.snapshot.timeline.at(-1).endRequest,7.9);
  await p.getByTestId('studio-undo-button').click();
  const trimUndone=await n.save(p,'reopen-trim-undone');
  assert.equal(n.decisions(trimUndone.snapshot.studioDocument),n.decisions(before.snapshot.studioDocument));
  await n.seek(p,17.7);await q.tool(p,'Composite');
  const layer=before.snapshot.overlays.find(o=>o.name==='05 / Feathered moving sea');assert(layer?.mask?.enabled);
  await p.getByText('Composite target',{exact:true}).locator('..').locator('select').selectOption(layer.id);
  const feather=p.getByText('Feather',{exact:true}).locator('..').locator('input');
  await n.range(feather,6);
  const edited=await n.save(p,'reopened-effect-edited');
  assert.equal(edited.snapshot.overlays.find(o=>o.id===layer.id).mask.feather,6);
  assert.notEqual(n.decisions(edited.snapshot.studioDocument),n.decisions(before.snapshot.studioDocument));
  await n.backup(p,'Editable Project');
  write('reopen-edit.json',{normalReopen:true,exactDecisionsBeforeEdit:true,effectId:layer.id,
    featherBefore:layer.mask.feather,featherAfter:6,canonicalHash:hash(edited.snapshot.studioDocument)});
  await p.getByTestId('hook-preview-frame').screenshot({path:file('reopened-effect-edit.png')});
}
async function soundtrack(p){
  await q.tool(p,'Sound');
  await p.getByTestId('background-sound-input').setInputFiles(file('Episode original score-master.wav'));
  const duck=p.getByLabel('Duck under speech',{exact:true});if(await duck.count()&&await duck.isChecked())await duck.uncheck();
  await n.range(p.getByText('Background volume',{exact:true}).locator('..').locator('..').locator('input'),88);
  await n.range(p.getByLabel('Music fade in',{exact:true}),.2);await n.range(p.getByLabel('Music fade out',{exact:true}),1.6);
  const saved=await n.save(p,'episode-original-score');await n.backup(p,'Editable Project');
  write('soundtrack.json',{canonicalHash:hash(saved.snapshot.studioDocument),score:'Episode original score-master.wav',
    sha256:hash(fs.readFileSync(file('Episode original score-master.wav'))),seconds:36,importedThroughStudio:true});
}
async function playback(p,finished=false){
  if(!finished)await live(p);
  await p.getByTestId('dock-tab-timeline').click();await n.seek(p,0);
  await p.evaluate(()=>{
    const frames=[],start=performance.now(),v=document.querySelector('[data-testid="studio-after-video"]');
    const quality=()=>{const q=v?.getVideoPlaybackQuality?.();return q?{total:q.totalVideoFrames,dropped:q.droppedVideoFrames,corrupted:q.corruptedVideoFrames}:null;};
    const timer=setInterval(()=>{const c=document.querySelector('[data-testid="studio-program-canvas"]');frames.push({ms:performance.now()-start,time:Number(c?.dataset.programmeTime),videoTime:v?.currentTime});},40);
    window.__finishEpisodePlayback=()=>{clearInterval(timer);return{elapsedMs:performance.now()-start,frames,decoder:quality()};};
  });
  const out=file(finished?'finished-playback':'live-playback');fs.mkdirSync(out,{recursive:true});
  const stop=await recording(p,out);
  try{
    await p.getByRole('button',{name:'Play edited preview',exact:true}).click();
    await p.waitForFunction(done=>{const c=document.querySelector('[data-testid="studio-program-canvas"]'),v=document.querySelector('[data-testid="studio-after-video"]');return done?(v?.currentTime>=35.9||v?.ended):Number(c?.dataset.programmeTime)>=35.9;},finished,{timeout:180000});
    await n.pause(p);write((finished?'finished':'live')+'-playback.json',await p.evaluate(()=>window.__finishEpisodePlayback()));
  }finally{await stop();}
}
async function main(){
  const browser=await chromium.launch({headless:true,args:['--mute-audio','--disable-gpu']});
  const session=file('session.private.json');
  const context=await browser.newContext({viewport:{width:1440,height:1100},...(fs.existsSync(session)?{storageState:session}:{})});
  await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['blob:','data:'].includes(u.protocol)?route.continue():route.abort();});
  const p=await context.newPage();p.setDefaultTimeout(30000);const errors=[];p.on('pageerror',error=>errors.push(error.message));p.on('dialog',dialog=>void dialog.accept());
  try{
    await n.entry(p);
    if(phase==='author')await author(p);
    else{await n.open(p);
      if(phase==='inspect')await inspect(p);
      else if(phase==='soundtrack')await soundtrack(p);
      else if(phase==='reopen-edit'){await reopenEdit(p);await inspect(p);}
      else if(phase==='playback')await playback(p);
      else if(phase==='render')await n.render(p);
      else if(phase==='finished')await playback(p,true);
      else throw Error('Unknown episode phase');
    }
    assert.deepEqual(errors,[]);write(phase+'-ui.json',{phase,normalAuth:true,headless:true,muted:true,browserErrors:errors,completedAt:new Date().toISOString()});
  }catch(error){
    await p.screenshot({path:file('failure-'+Date.now()+'.png')}).catch(()=>{});
    fs.writeFileSync(file('failure-'+Date.now()+'.txt'),error.stack+'\n'+await p.locator('body').innerText());
    try{await n.save(p,'interrupted');await n.backup(p,'Interrupted Project');}catch{}
    throw error;
  }finally{await context.storageState({path:session});await context.close();await browser.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
