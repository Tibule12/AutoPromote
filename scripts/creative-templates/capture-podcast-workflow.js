#!/usr/bin/env node
'use strict';
// Real native controls, actual screen capture. The crop is source preparation,
// not a marketing renderer; final packaging remains an editable Studio project.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const {saveAuthenticatedState}=require('./studio-session');
const h=require('./studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const {hash}=require('../../src/creativeTemplates/contract');
const folder=path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR),state=process.env.STUDIO_QA_STORAGE_STATE;
async function range(input,value){await input.evaluate((el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(v));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);}
async function main(){
 fs.mkdirSync(folder,{recursive:true});require('./proof-storage').requireProofSpace(folder);
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--disk-cache-size=1048576']});
 const context=await browser.newContext({storageState:state,viewport:{width:1600,height:1400}}),page=await context.newPage();
 const frames=[];let cdp;
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name:'UNMUTED — podcast story · v1.0.1',exact:true}).click();await h.rail(page);
  const pause=page.getByRole('button',{name:'Pause comparison',exact:true});if(await pause.isVisible())await pause.click();
  // Work on an ordinary duplicate and preserve the accepted source project.
  await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
  await page.getByLabel('Project name',{exact:true}).fill('Podcast — editable sound workflow capture');
  await q.tool(page,'Sound');await page.getByLabel('Automation source',{exact:true}).selectOption('music');
  const input=page.getByLabel('music volume at 0.00 seconds',{exact:true});await input.scrollIntoViewIfNeeded();
  await range(page.getByLabel('Edited output position',{exact:true}),3);
  await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=2;},undefined,{timeout:90000});
  const before=await h.save(page,'workflow-before');await input.scrollIntoViewIfNeeded();
  const box=await input.locator('xpath=ancestor::div[contains(@class,"audio-automation-card")]').boundingBox(),fader=await input.boundingBox();assert(box&&fader);
  const crop={x:Math.floor(box.x/2)*2,y:Math.max(0,Math.floor((fader.y-36)/2)*2),width:Math.floor((1600-box.x)/2)*2,height:290};
  await page.screenshot({path:path.join(folder,'workflow-controls.png')});
  cdp=await context.newCDPSession(page);
  cdp.on('Page.screencastFrame',event=>{const bytes=Buffer.from(event.data,'base64');assert(frames.reduce((n,f)=>n+f.bytes,0)+bytes.length<24*1024**2,'Bounded workflow capture exceeded 24 MiB');const filename=path.join(folder,`workflow-${String(frames.length).padStart(5,'0')}.jpg`);fs.writeFileSync(filename,bytes);frames.push({filename,at:Date.now()/1000,bytes:bytes.length});void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId});});
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:75,maxWidth:1600,maxHeight:1400,everyNthFrame:1});
  const operations=[];
  await page.waitForTimeout(750);
  for(const value of [65,28,40]){await input.hover();await range(input,value);operations.push({control:'Music volume at 0.00 seconds',value,at:new Date().toISOString()});await page.waitForTimeout(1250);}
  // The edit has changed through the native keyframe inspector; final value
  // is the demonstrated source project's authored setting, not an invented mix.
  await page.waitForTimeout(1000);const stoppedAt=Date.now()/1000;await cdp.send('Page.stopScreencast');assert(frames.length>3);
  const after=await h.save(page,'workflow-after');assert.equal(after.snapshot.audioKeyframes.music[0].value,40);
  const concat=path.join(folder,'workflow.ffconcat');
  fs.writeFileSync(concat,'ffconcat version 1.0\n'+frames.map((f,i)=>`file '${path.basename(f.filename)}'\nduration ${Math.max(.04,(frames[i+1]?.at||stoppedAt)-f.at).toFixed(6)}\n`).join('')+`file '${path.basename(frames.at(-1).filename)}'\n`);
  const command=['-v','error','-safe','0','-i',concat,'-vf',`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=540:960:force_original_aspect_ratio=decrease,pad=540:960:(ow-iw)/2:(oh-ih)/2:black,fps=24`,'-t','6','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart','-y',path.join(folder,'native-sound-workflow.mp4')];
  execFileSync('ffmpeg',command);fs.writeFileSync(path.join(folder,'workflow-capture-receipt.json'),JSON.stringify({at:new Date().toISOString(),projectId:after.id,projectHashBefore:hash(before.snapshot.studioDocument),projectHashAfter:hash(after.snapshot.studioDocument),sourceTemplateRef:after.snapshot.creativeTemplateInstance.templateRef,operations,crop,frames:frames.length,outputSha256:hash(fs.readFileSync(path.join(folder,'native-sound-workflow.mp4'))),note:'Actual native music automation controls. Muted QA capture; no simulated UI or claim of human listening. Working duplicate; original project preserved.'},null,2)+'\n');
  for(const frame of frames)fs.unlinkSync(frame.filename);fs.unlinkSync(concat);
  console.log(JSON.stringify({frames:frames.length,crop,output:'native-sound-workflow.mp4',sourceProjectPreserved:true}));
 }finally{if(cdp)await cdp.send('Page.stopScreencast').catch(()=>{});saveAuthenticatedState(await context.storageState({indexedDB:true}),state);await browser.close();}
}
main().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1;});
