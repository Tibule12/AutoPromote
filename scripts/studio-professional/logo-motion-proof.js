#!/usr/bin/env node
// Exercise the actual reusable Logo motion control, not a private graph import.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'reports/studio-logo-motion-20261017/proof');
process.env.STUDIO_KINETIC_PROOF_DIR=folder;
Object.assign(process.env,{STUDIO_QA_TIMELINE_HEIGHT:'560',STUDIO_QA_HIDE_MEDIA:'1'});
const {pause,seek,range,recording}=require('./kinetic-type-proof'),h=require('../creative-templates/studio-proof');
const q=require('../../test/e2e/playwright/studio-stability/run'),{hash}=require('../../src/creativeTemplates/contract');
const {chromium}=require('playwright');
const config=JSON.parse(fs.readFileSync(path.join(root,'reports/studio-logo-motion-20261017/config.json'))),name=config.projectName;
const decisions=doc=>{const {revision:_revision,journal:_journal,idempotency:_idempotency,...rest}=doc;return hash(rest);};
async function save(page,label){const r=await h.save(page,label);for(const suffix of ['project.private.json','document.json']){
 const f=path.join(folder,`${label}-${suffix}`);fs.writeFileSync(f+'.gz',zlib.gzipSync(fs.readFileSync(f)),{mode:0o600});fs.unlinkSync(f);}return r;}
async function main(){
 assert(!fs.existsSync(path.join(folder,'native-design.json')),'Preserve the completed logo project');
 const context=await chromium.launchPersistentContext(path.resolve('reports/studio-keyframe-selection-20261015/proof/browser-profile.private'),{
  channel:'chromium',headless:true,args:['--mute-audio','--disk-cache-size=16777216','--host-resolver-rules=MAP localhost 127.0.0.1'],viewport:{width:1920,height:1200}});
 const page=context.pages()[0];page.setDefaultTimeout(60000);let renders=0;
 page.on('request',r=>{if(new URL(r.url()).pathname==='/api/media/process')renders++;});
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name,exact:true}).click();await h.rail(page);await pause(page);await seek(page,0);
  assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
  const before=await save(page,'before-logo');assert.equal(before.snapshot.overlays.length,0);
  await q.tool(page,'Graphics');const panel=page.getByTestId('studio-logo-motion');await panel.locator('summary').click();
  await page.getByLabel('Logo motion image',{exact:true}).setInputFiles(path.join(root,'reports/studio-logo-motion-20261017/assets/AutoPromote-Gradient-Tech-Logo.png'));
  await panel.getByRole('status').filter({hasText:'selected.'}).waitFor();
  if(config.separateBitmap)await panel.getByRole('checkbox',{name:'Separate left symbol from wordmark',exact:true}).check();
  const stop=await recording(page);
  try{
   await page.getByRole('button',{name:'Build editable logo motion',exact:true}).click();
   await page.waitForFunction(()=>{const t=document.querySelector('[data-testid="studio-logo-motion"] [role="status"]')?.textContent;return t&&!t.includes('selected.');});
   assert((await panel.getByRole('status').innerText()).includes('Logo motion created.'),await panel.getByRole('status').innerText());
   const built=await save(page,'logo-created');
   if(config.separateBitmap){
    assert(built.snapshot.overlays.some(o=>o.name==='Mark / gradient symbol'));
    assert(built.snapshot.overlays.some(o=>o.name==='Mark / original gradient wordmark'));
   }else assert.equal(built.snapshot.overlays.filter(o=>o.name.startsWith('Mark / image band')).length,3);
   assert.equal(built.snapshot.overlays.filter(o=>o.name.startsWith('Wordmark /')).length,0,'Retain the PNG lettering');
   await page.getByTestId('studio-undo-button').click();assert.equal((await save(page,'logo-undone')).snapshot.overlays.length,0);
   await page.getByTestId('studio-redo-button').click();assert.equal(decisions((await save(page,'logo-redone')).snapshot.studioDocument),decisions(built.snapshot.studioDocument));
   await q.tool(page,'Sound');await page.getByTestId('background-sound-input').setInputFiles(path.join(root,'reports/studio-logo-motion-20261017',config.score));
   const duck=page.getByLabel(/Duck under speech/);if(await duck.isChecked())await duck.uncheck();
   const loop=page.getByLabel(/Loop for the full clip/);if(await loop.isChecked())await loop.uncheck();
   await range(page.getByLabel('Music fade in',{exact:true}),0);await range(page.getByLabel('Music fade out',{exact:true}),.2);
   // The ordinary music slider is bounded to 60%; use its actual range.
   await range(page.locator('.inspector-range').filter({hasText:'Background volume'}).locator('input[type=range]'),60);
   await q.tool(page,'Graphics');await seek(page,8);
   await page.locator('.title-layer-list button').first().click();const prior=await save(page,'before-tagline-edit');
   await page.getByLabel('Title text color',{exact:true}).fill('#f00000');
   assert.notEqual(decisions((await save(page,'tagline-edited')).snapshot.studioDocument),decisions(prior.snapshot.studioDocument));
   await page.getByTestId('studio-undo-button').click();assert.equal(decisions((await save(page,'tagline-undone')).snapshot.studioDocument),decisions(prior.snapshot.studioDocument));
   for(const time of [.2,.8,1.5,2.2,3.2,4.6,5.7,7.2,9.5]){
    await seek(page,time);await page.waitForTimeout(250);await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,`live-${time}.png`)});
   }
  }finally{await stop();}
  const final=await save(page,'final-logo');await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByRole('button',{name,exact:true}).click();await h.rail(page);await pause(page);
  const cold=await save(page,'cold-logo');assert.equal(hash(cold.snapshot.studioDocument),hash(final.snapshot.studioDocument));
  assert.equal(cold.snapshot.musicTrack?.volume??cold.snapshot.musicVolume,.6);
  const geometry={projectId:cold.id,canonicalHash:hash(cold.snapshot.studioDocument),layers:cold.snapshot.overlays.length,
   keys:cold.snapshot.motionKeyframes.length,groups:cold.snapshot.compoundClips.length,seconds:10,
   actualReusableLogoControl:true,nativeBuildUndoRedo:true,nativeIndependentTaglineEditUndo:true,exactColdReopen:true,
   nativeControlsOnly:true,graphInjection:false,sourceImageSha256:hash(fs.readFileSync(path.join(root,'reports/studio-logo-motion-20261017/assets/AutoPromote-Gradient-Tech-Logo.png'))),
   originalGradientAndLetteringRetained:true,separateSymbolAndWordmark:!!config.separateBitmap,nativeMusicVolume:.6,rendersSubmitted:renders};
  assert.equal(renders,0);fs.writeFileSync(path.join(folder,'native-design.json'),JSON.stringify(geometry,null,2));
  const designFile=path.join(root,'reports/studio-logo-motion-20261017/design.json');
  const design=JSON.parse(fs.readFileSync(designFile));Object.assign(design,{layers:geometry.layers,groups:geometry.groups,keys:geometry.keys});fs.writeFileSync(designFile,JSON.stringify(design,null,2));
  console.log(JSON.stringify(geometry));
 }catch(e){await page.screenshot({path:path.join(folder,`logo-failure-${Date.now()}.png`)}).catch(()=>{});fs.writeFileSync(path.join(folder,'last-logo-failure.private.txt'),(await page.locator('body').innerText()).slice(-18000),{mode:0o600});throw e;}
 finally{await context.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
