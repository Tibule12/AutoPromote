#!/usr/bin/env node
// Public graphics interchange and normal signed-in Studio controls only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),report=path.join(root,'reports/content-performance-test-20261021'),folder=path.join(report,'proof');
fs.mkdirSync(folder,{recursive:true});
Object.assign(process.env,{STUDIO_TEMPLATE_PROOF_DIR:folder,STUDIO_KINETIC_PROOF_DIR:folder,
 STUDIO_QA_EXPECTED_WIDTH:'720',STUDIO_QA_EXPECTED_HEIGHT:'1280',STUDIO_QA_EXPORT_FPS:'24',
 STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS:'1800000',STUDIO_QA_UPLOAD_BUDGET_MS:'300000',
 STUDIO_QA_NATIVE_DOWNLOAD_METHOD:'playwright',STUDIO_QA_TIMELINE_HEIGHT:'430',STUDIO_QA_HIDE_MEDIA:'1'});
const h=require('../creative-templates/studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const {pause,seek,range}=require('./kinetic-type-proof'),{hash}=require('../../src/creativeTemplates/contract');
Object.assign(process.env,{STUDIO_QA_EXPECTED_WIDTH:'720',STUDIO_QA_EXPECTED_HEIGHT:'1280'});
const title='Three clips to a restaurant film · portrait audience test · 20261021';
const source=path.join(report,'assets/portrait-paper.mp4');
const result=path.join(root,'reports/studio-restaurant-film-20261020/proof/film/final.mp4');
const timeline=path.join(root,'reports/studio-restaurant-film-20261020/proof/film/edited-in-studio.mp4');
const stateFile=path.join(folder,'progress.json'),state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)):{};
const done=(key,value=true)=>{state[key]=value;fs.writeFileSync(stateFile,JSON.stringify(state,null,2));};
async function entry(page){await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click({timeout:120000});assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));}
async function open(page){await page.getByRole('region',{name:'Saved Studio projects',exact:true}).getByRole('button',{name:title,exact:true}).click();await h.rail(page);await pause(page);}
async function motion(page,id){await q.tool(page,'Motion');await page.getByRole('button',{name:'Transform keyframes',exact:true}).click();await page.getByLabel('Target layer',{exact:true}).selectOption(id);}
async function fields(page,values){for(const [name,value]of Object.entries(values)){const input=page.getByLabel(name,{exact:true});await input.fill(String(value));await input.blur();}}
async function addVideo(page,{name,file,start,duration,sourceStart,width,height,x,y,mask,checkpoint=true}){
 await seek(page,start);await q.tool(page,'B-roll');await page.getByTestId('broll-video-input').setInputFiles(file);
 const r=await h.save(page,`${name}-imported`),layer=r.snapshot.overlays.at(-1);assert.equal(layer.type,'video');
 await page.getByRole('button',{name:'Picture-in-picture',exact:true}).click();
 await range(page.getByRole('slider',{name:'Frame corner curve',exact:true}),0);
 await range(page.getByLabel('B-roll source start',{exact:true}),sourceStart);
 await motion(page,layer.id);await fields(page,{'Motion layer in point':start,'Motion layer duration':duration,'Motion layer width':width,'Motion layer height':height});
 for(const [label,value]of [['X',x],['Y',y],['Scale',1]]){const n=page.getByRole('spinbutton',{name:label,exact:true});await n.fill(String(value));await n.blur();}
 if(mask){
  await q.tool(page,'Composite');const groups=page.getByRole('region',{name:'Graphic groups',exact:true});
  await groups.getByRole('checkbox',{name:`Group selection ${layer.name}`,exact:true}).check();
  await groups.getByRole('button',{name:'Group selected layers',exact:true}).click();
  const grouped=await h.save(page,'timeline-grouped'),group=grouped.snapshot.compoundClips.find(g=>g.layerIds.includes(layer.id));assert(group);
  await page.getByLabel(`${group.name} enable mask`,{exact:true}).check();
  await page.getByLabel(`${group.name} mask shape`,{exact:true}).selectOption('polygon');
  const p=page.getByLabel(`${group.name} mask polygon path`,{exact:true});await p.fill('polygon(0% 66.62%, 100% 66.62%, 100% 81.1%, 0% 81.1%)');await p.press('Enter');
 }
 await h.save(page,name);done(name,layer.id);if(checkpoint)await backup(page);return layer.id;
}
async function backup(page){await h.rail(page);const versions=page.getByLabel('Include saved versions in backup',{exact:true});if(await versions.count()&&await versions.isChecked())await versions.uncheck();const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();await(await waiting).saveAs(path.join(folder,'THREE-CLIPS-PORTRAIT.autopromote.json'));fs.chmodSync(path.join(folder,'THREE-CLIPS-PORTRAIT.autopromote.json'),0o600);}
async function prepare(page){
 const projects=page.getByRole('region',{name:'Saved Studio projects',exact:true});
 const priorBackup=path.join(folder,'THREE-CLIPS-PORTRAIT.autopromote.json');
 if(fs.existsSync(priorBackup)){await page.waitForFunction(()=>document.querySelector('[aria-label="Restore project backup"]')?.disabled===false);await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(priorBackup);if(!JSON.parse(fs.readFileSync(priorBackup)).snapshot.voiceovers?.length)done('voice',false);}
 if(await projects.getByRole('button',{name:title,exact:true}).count())await open(page);
 else{await page.locator('.creator-studio-dropzone input[type=file]').setInputFiles(source);await page.getByRole('button',{name:'Open Creator Studio',exact:true}).click();await h.rail(page);await pause(page);await page.getByLabel('Project name',{exact:true}).fill(title);await h.save(page,'created');}
 if(!state.base){
  await seek(page,0);await q.tool(page,'Reframe');const auto=page.getByTestId('auto-reframe-toggle');if(await auto.isChecked()){await auto.click();await page.waitForFunction(()=>!document.querySelector('[data-testid=auto-reframe-toggle]')?.checked);}
  await q.tool(page,'Color');const rounded=page.getByLabel('Rounded main footage',{exact:true});if(await rounded.isChecked())await rounded.uncheck();
  await q.tool(page,'Sound');const repair=page.getByLabel('Use voice repair on export',{exact:true});if(await repair.isChecked())await repair.uncheck();
  await motion(page,'main-video');for(const [n,v]of [['X',50],['Y',50],['Scale',1]]){const input=page.getByRole('spinbutton',{name:n,exact:true});await input.fill(String(v));await input.blur();}
  await h.save(page,'base');done('base');await backup(page);
 }
 if(!state.graphics){await q.tool(page,'Graphics');const imp=page.getByTestId('studio-graphics-import');if(!await imp.evaluate(e=>e.open))await imp.locator('summary').click();await page.getByLabel('Graphics composition file',{exact:true}).setInputFiles(path.join(report,'assets/portrait.graphics.json'));await imp.getByRole('status').waitFor();assert((await imp.getByRole('status').innerText()).includes('imported.'));await h.save(page,'graphics');done('graphics');}
 if(!state.result)await addVideo(page,{name:'result',file:result,start:0,duration:60,sourceStart:0,width:100,height:31.640625,x:50,y:30,checkpoint:false});
 if(!state.raw){const original=JSON.parse(fs.readFileSync(path.join(root,'reports/studio-real-footage-20261018/sources.json'))).items.find(i=>i.assetId==='13261');await addVideo(page,{name:'raw',file:path.resolve(root,original.path),start:2.2,duration:3,sourceStart:11,width:100,height:31.640625,x:50,y:30,checkpoint:false});}
 if(!state.timeline)await addVideo(page,{name:'timeline',file:timeline,start:0,duration:60,sourceStart:0,width:100,height:42.1875,x:50,y:60,mask:true,checkpoint:false});
 if(!state.voice){
  console.log('Native picture layout saved; adding narration and sound.');const voice=path.join(report,'narration/narration.mp3');assert(fs.existsSync(path.join(report,'narration/narration-receipt.json')));
  await q.tool(page,'Sound');await page.getByTestId('voiceover-recording-input').setInputFiles(voice);await page.getByLabel(`Start for ${path.basename(voice)}`,{exact:true}).fill('0');await page.getByLabel(`Start for ${path.basename(voice)}`,{exact:true}).blur();
  await range(page.getByLabel(`Volume for ${path.basename(voice)}`,{exact:true}),1);
  await page.getByTestId('background-sound-input').setInputFiles(path.join(report,'assets/restaurant-designed-mix.mp3'));
  for(const label of ['Keep original audio','Duck under speech','Loop for the full clip']){const e=page.getByLabel(label,{exact:false});if(await e.isChecked())await e.uncheck();}
  await range(page.locator('.inspector-range').filter({hasText:'Background volume'}).locator('input[type=range]'),60);
  await page.getByLabel('Automation source',{exact:true}).selectOption('music');const snap=page.getByRole('button',{name:'⌁ Snap',exact:true});if((await snap.getAttribute('class')).includes('is-on'))await snap.click();
  for(const [time,value]of [[0,48],[2.2,0],[5.2,28],[43,52],[51,35],[59.9,0]]){
   await seek(page,time);const add=page.getByRole('button',{name:/^◆ Add volume keyframe at/});await add.click();const key=page.locator('.audio-keyframe-editor input[aria-label^="music volume at"]').last();await key.waitFor();const placed=Number((await key.getAttribute('aria-label')).match(/at ([\d.]+) seconds/)[1]);assert(Math.abs(placed-time)<.05);await range(key,value);console.log(`Native music key ${placed}s = ${value}%`);
  }
  await h.save(page,'voice');done('voice');console.log('Native sound complete; validating cold reopen and poses.');
 }
 await seek(page,0);const saved=await h.save(page,'prepared');await entry(page);await open(page);const cold=await h.save(page,'cold-reopened');assert.equal(hash(saved.snapshot.studioDocument),hash(cold.snapshot.studioDocument));
 assert.equal(cold.snapshot.overlays.filter(x=>x.type==='video').length,3);assert.equal(cold.snapshot.voiceovers.length,1);
 for(const t of [.5,3,6.5,11,18.7,24.7,28,36.8,43.8,52,57.3]){await seek(page,t);await page.waitForTimeout(800);await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`live-${t}.png`)});}
 fs.writeFileSync(path.join(folder,'native-edit.json'),JSON.stringify({projectId:cold.id,projectName:title,canonicalHash:hash(cold.snapshot.studioDocument),nativeControlsOnly:true,authBypass:false,graphInjection:false,exactColdReopen:true,seconds:60,width:720,height:1280,layers:cold.snapshot.overlays.length,sourceHash:hash(fs.readFileSync(result)),timelineHash:hash(fs.readFileSync(timeline)),sourceGainKeys:cold.snapshot.audioKeyframes.music.length},null,2));
 console.log('Portrait result, raw comparison, same-clock timeline and voice authored; poses ready for review.');
}
async function main(){
 const action=process.argv[2]||'prepare';let submissions=0,publishingWrites=0;const errors=[];
 const launch={channel:'chromium',headless:true,args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.4','--no-proxy-server','--disable-quic','--disable-http2','--remote-debugging-address=127.0.0.1','--remote-debugging-port=9844']};
 const browser=await chromium.launch(launch);const context=await browser.newContext({storageState:require('../creative-templates/studio-session').sessionPath,viewport:{width:1920,height:1440},acceptDownloads:true});const page=await context.newPage();page.setDefaultTimeout(60000);
 page.on('request',r=>{const p=new URL(r.url()).pathname;if(r.method()==='POST'&&p==='/api/media/process')submissions++;if(['POST','PUT','PATCH','DELETE'].includes(r.method())&&/^\/api\/(content|publisher|platform)\//.test(p))publishingWrites++;});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',async r=>{if(r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/media/process'&&r.ok())fs.writeFileSync(path.join(folder,'submission.json'),JSON.stringify({at:new Date().toISOString(),response:await r.json()},null,2),{mode:0o600});});
 try{await entry(page);
  if(action==='prepare'||action==='all'){
   await prepare(page);
   if(action==='all'){
    const deadline=Date.now()+15*60*1000;const review=path.join(folder,'visual-review.json');
    while(!fs.existsSync(review)&&Date.now()<deadline)await page.waitForTimeout(1000);
    const v=JSON.parse(fs.readFileSync(review)),edit=JSON.parse(fs.readFileSync(path.join(folder,'native-edit.json')));assert(v.accepted&&v.canonicalHash===edit.canonicalHash);assert(!fs.existsSync(path.join(folder,'submission.json')));
    await h.render(page,'portrait');await require('../creative-templates/materials-editing-proof').view(page,'portrait');await backup(page);
   }
  }
  else if(action==='restore'){
   await page.waitForFunction(()=>document.querySelector('[aria-label="Restore project backup"]')?.disabled===false);await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(folder,'THREE-CLIPS-PORTRAIT.autopromote.json'));await open(page);const r=await h.save(page,'fresh-restored'),b=JSON.parse(fs.readFileSync(path.join(folder,'THREE-CLIPS-PORTRAIT.autopromote.json')));assert.equal(hash(r.snapshot.studioDocument),hash(b.snapshot.studioDocument));fs.writeFileSync(path.join(folder,'fresh-restore.json'),JSON.stringify({canonicalHash:hash(r.snapshot.studioDocument),backupSha256:hash(fs.readFileSync(path.join(folder,'THREE-CLIPS-PORTRAIT.autopromote.json'))),independentExactRestore:true,renderJobs:submissions},null,2));
  }else{
   const b=path.join(folder,'THREE-CLIPS-PORTRAIT.autopromote.json');await page.waitForFunction(()=>document.querySelector('[aria-label="Restore project backup"]')?.disabled===false);await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(b);await open(page);
   if(action==='render'){assert(!fs.existsSync(path.join(folder,'submission.json')),'Recover existing accepted job; do not resubmit.');const visual=JSON.parse(fs.readFileSync(path.join(folder,'visual-review.json')));assert(visual.accepted);await h.render(page,'portrait');}
   else if(action==='recover')await h.recover(page,'portrait');
   else if(action==='view'){await require('../creative-templates/materials-editing-proof').view(page,'portrait');await backup(page);}
   else throw Error('Unknown action');
  }
  assert.equal(submissions,['render','all'].includes(action)?1:0);assert.equal(publishingWrites,0);assert.deepEqual(errors,[]);
 }catch(e){await page.screenshot({path:path.join(folder,`${action}-failure-${Date.now()}.png`)}).catch(()=>{});fs.writeFileSync(path.join(folder,'last-failure.private.txt'),(await page.locator('body').innerText()).slice(-14000),{mode:0o600});if(action==='prepare')await backup(page).catch(()=>{});throw e;}finally{await context.close();if(browser)await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
