#!/usr/bin/env node
'use strict';
// A bounded raw-source grade adaptation through the ordinary Studio controls.
// Existing source switching remains source switching, not an AutoPromote claim.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {execFileSync}=require('node:child_process');
const h=require('./studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const {hash}=require('../../src/creativeTemplates/contract');
const {saveAuthenticatedState}=require('./studio-session');
const folder=path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR),state=process.env.STUDIO_QA_STORAGE_STATE;
const title='UNMUTED — raw-source colour study';
const sourceId='viral-project-5879c33e-ca46-4a20-ac5b-6e12c13739fd';
async function project(page,id){return page.evaluate(id=>new Promise((resolve,reject)=>{const r=indexedDB.open('autopromote-viral-studio',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects','readonly').objectStore('projects').get(id);q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=()=>reject(q.error);};}),id);}
async function range(input,value){await input.evaluate((el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(v));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);}
async function main(){
 fs.mkdirSync(folder,{recursive:true});require('./proof-storage').requireProofSpace(folder);
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--host-resolver-rules=MAP localhost [::1]','--disk-cache-size=1048576','--media-cache-size=1048576']});
 const adaptation=path.join(folder,'grade-adaptation.json'),gradeId=fs.existsSync(adaptation)?JSON.parse(fs.readFileSync(adaptation)).projectId:null;
 const savedState=JSON.parse(fs.readFileSync(state)),scopedState=structuredClone(savedState);
 // Restore only the two real projects needed for this bounded study; merge
 // their native updates into the full retained library before saving it.
 // This avoids repeatedly serializing unrelated large project histories.
 for(const o of scopedState.origins||[])for(const d of o.indexedDB||[])if(d.name==='autopromote-viral-studio')for(const s of d.stores||[])if(s.name==='projects')s.records=s.records.filter(r=>r.value.id===sourceId||r.value.id===gradeId||r.value.name===title);
 const context=await browser.newContext({storageState:scopedState,viewport:{width:1600,height:1080},acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(30000);
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();console.log('Authenticated Studio opened.');
  const source=await project(page,sourceId);assert(source,'Original source project unavailable');
  const originalHash=hash(source.snapshot.studioDocument),retained=gradeId?await project(page,gradeId):null;
  await page.getByRole('button',{name:retained?title:source.name,exact:true}).click();await h.rail(page);console.log('Raw-source project opened.');
  const pause=page.getByRole('button',{name:'Pause comparison',exact:true});if(await pause.isVisible())await pause.click();
  if(!retained){await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();await page.getByLabel('Project name',{exact:true}).fill(title);}
  if(process.argv[2]==='view'){
   await h.recover(page,'graded');await require('./materials-editing-proof').view(page,'graded');
  }else if(process.argv[2]==='before'){
   await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();await page.getByLabel('Project name',{exact:true}).fill('UNMUTED — colour study original');
   await q.tool(page,'Color');const rack=page.getByTestId('studio-finish-rack');await rack.getByRole('button',{name:'Reset',exact:true}).click();await rack.getByLabel('Rounded main footage',{exact:true}).uncheck();
   await h.render(page,'neutral');await require('./materials-editing-proof').view(page,'neutral');
  }else if(process.argv[2]==='render'){
   await h.render(page,'graded');await require('./materials-editing-proof').view(page,'graded');
  }else{
   // The native marked-removal fields are local to the selected occurrence.
   // Keep one source occurrence using normal clip selection/deletion instead.
   await q.tool(page,'Cut');
   let count=await page.locator('[data-testid^="pro-video-clip-"]').count();
   while(count>1){await page.getByTestId('pro-video-clip-'+count).click();await q.tool(page,'Cut');await page.getByRole('button',{name:/Delete this clip/}).click();count--;}
   await page.getByTestId('pro-video-clip-1').click();await q.tool(page,'Cut');
   const advanced=page.locator('details').filter({has:page.locator('summary',{hasText:'Advanced Pro Controls'})});if(!await advanced.evaluate(e=>e.open))await advanced.locator(':scope > summary').click();
   await range(page.getByLabel('Clip end',{exact:true}),6);
   await q.tool(page,'Graphics');
   const titles=page.locator('.title-layer-list button');
   while(await titles.count()){await titles.first().click();await page.getByTestId('title-editor').getByRole('button',{name:'Remove',exact:true}).click();}
   console.log('One six-second raw-source occurrence; generic editorial titles removed.');
   await q.tool(page,'Motion');await page.getByRole('button',{name:'Transform keyframes',exact:true}).click();
   await page.locator('.advanced-inspector-body select').filter({has:page.locator('option[value="main-video"]')}).first().selectOption('main-video');await page.getByRole('button',{name:'Reset transform',exact:true}).click();
   await q.tool(page,'Color');
   const rack=page.getByTestId('studio-finish-rack');
   if(await rack.getByRole('button',{name:'Reset',exact:true}).isEnabled())await rack.getByRole('button',{name:'Reset',exact:true}).click();
   await rack.getByLabel('Rounded main footage',{exact:true}).uncheck();
   await range(page.getByLabel('Edited output position',{exact:true}),1.8);
   await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=3;},undefined,{timeout:90000});
   await page.waitForTimeout(500);
   await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'neutral-native.png')});
   const neutral=await h.save(page,'neutral');
   const cdp=await context.newCDPSession(page),frames=[];let bytesUsed=0;
   cdp.on('Page.screencastFrame',event=>{const bytes=Buffer.from(event.data,'base64');bytesUsed+=bytes.length;assert(bytesUsed<32*1024**2,'Bounded colour operation capture exceeded 32 MiB');const filename=path.join(folder,'operation-'+String(frames.length).padStart(5,'0')+'.jpg');fs.writeFileSync(filename,bytes);frames.push({filename,at:Date.now()/1000});void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId});});
   await cdp.send('Page.startScreencast',{format:'jpeg',quality:75,maxWidth:1600,maxHeight:1080,everyNthFrame:1});
   const precision=rack.getByLabel('Precision RGB grade',{exact:true});
   const nativePrecision=await precision.count()>0;
   if(nativePrecision)await precision.check();
   const values={Contrast:1.075,Saturation:1,Warmth:-.08,Clarity:.10,Vignette:.035};
   if(nativePrecision)Object.assign(values,{'Exposure stops':.10,Lift:.005,Gamma:1.035,Gain:.99,Tint:.015});
   for(const [label,value] of Object.entries(values)){const control=rack.getByLabel(label,{exact:true});await control.scrollIntoViewIfNeeded();await control.hover();await range(control,value);await page.waitForTimeout(350);}
   await page.waitForTimeout(750);
   await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'graded-native.png')});
   const after=await h.save(page,'graded');
   assert(after.snapshot.timeline.every(c=>c.name==='unmuted-raw-speech-window.mp4'),'Study must use raw footage, not baked result/workflow inserts');
   assert(!after.snapshot.motionKeyframes.some(k=>k.targetId==='main-video'),'Study must not retain source fades or old motion');
   fs.writeFileSync(path.join(folder,'grade-adaptation.json'),JSON.stringify({createdAt:new Date().toISOString(),sourceProjectId:source.id,sourceProjectHash:originalHash,projectId:after.id,neutralHash:hash(neutral.snapshot.studioDocument),gradedHash:hash(after.snapshot.studioDocument),templateRef:after.snapshot.creativeTemplateInstance.templateRef,finishFx:after.snapshot.finishFx,values,nativePrecision,sourceSwitchingAuthoredHere:false,creativeApproval:false,publicScheduling:false},null,2)+'\n');
   await page.screenshot({path:path.join(folder,'colour-controls-and-timeline.png')});
   const stopped=Date.now()/1000;await cdp.send('Page.stopScreencast');assert(frames.length>2);
   const concat=path.join(folder,'operations.ffconcat');fs.writeFileSync(concat,'ffconcat version 1.0\n'+frames.map((f,i)=>`file '${path.basename(f.filename)}'\nduration ${Math.max(.04,(frames[i+1]?.at||stopped)-f.at).toFixed(6)}\n`).join('')+`file '${path.basename(frames.at(-1).filename)}'\n`);
   execFileSync('ffmpeg',['-v','error','-safe','0','-i',concat,'-vf','fps=24','-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart','-y',path.join(folder,'colour-operations-in-studio.mp4')]);for(const f of frames)fs.unlinkSync(f.filename);fs.unlinkSync(concat);
   console.log(JSON.stringify({nativeGradeApplied:true,nativePrecision,project:after.name,rawOccurrences:after.snapshot.timeline.length,neutral:'neutral-native.png',graded:'graded-native.png'}));
   if(process.argv[2]==='correct'){await h.render(page,'graded');await require('./materials-editing-proof').view(page,'graded');}
  }
  assert.equal(hash((await project(page,source.id)).snapshot.studioDocument),originalHash,'Original project must remain unchanged');
 }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});throw error;}
 finally{
  const current=await context.storageState({indexedDB:true}),latest=JSON.parse(fs.readFileSync(state));
  for(const o of current.origins||[])for(const d of o.indexedDB||[])if(d.name==='autopromote-viral-studio')for(const s of d.stores||[])if(s.name==='projects'){
   const retained=latest.origins.find(x=>x.origin===o.origin)?.indexedDB?.find(x=>x.name===d.name)?.stores?.find(x=>x.name===s.name);
   const rows=new Map((retained?.records||[]).map(r=>[r.value.id,r]));for(const r of s.records)rows.set(r.value.id,r);s.records=[...rows.values()];
  }
  saveAuthenticatedState(current,state);await browser.close();
 }
}
main().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1;});
