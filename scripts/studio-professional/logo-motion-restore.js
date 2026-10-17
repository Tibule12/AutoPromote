#!/usr/bin/env node
// Restore the exact native logo backup into an independent authenticated App.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const base=path.resolve(root,process.env.STUDIO_LOGO_BASE||'reports/studio-logo-motion-20261017'),folder=path.resolve(process.env.STUDIO_LOGO_PROOF_DIR||path.join(base,'proof'));
process.env.STUDIO_KINETIC_PROOF_DIR=path.join(folder,'fresh-restore');
const {pause,seek}=require('./kinetic-type-proof'),h=require('../creative-templates/studio-proof');
const {hash}=require('../../src/creativeTemplates/contract');
async function main(){
 const config=JSON.parse(fs.readFileSync(path.join(base,'config.json')));
 const backupFile=path.join(folder,config.backupName),backup=JSON.parse(fs.readFileSync(backupFile));
 const receipt=JSON.parse(fs.readFileSync(path.join(folder,config.output,'render-receipt.json')));
 const request=JSON.parse(fs.readFileSync(path.join(folder,config.output+'-render-request.private.json')));
 assert.equal(hash(backup.snapshot.studioDocument),receipt.projectHash);
 assert.deepEqual(backup.snapshot.motionKeyframes,request.options.viralData.editor_timeline.motion_keyframes);
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.1']});
 const context=await browser.newContext({storageState:path.join(root,require('../../config/daily-studio.json').authState),viewport:{width:1920,height:1200}});
 const page=await context.newPage();page.setDefaultTimeout(60000);const writes=[];
 page.on('request',r=>{const p=new URL(r.url()).pathname;
  if((p==='/api/media/process'||p.startsWith('/api/content/'))&&['POST','PUT','PATCH','DELETE'].includes(r.method()))writes.push(p);});
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
  await page.waitForFunction(()=>document.querySelector('[aria-label="Restore project backup"]')?.disabled===false);
  await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(backupFile);
  await page.getByRole('button',{name:config.projectName,exact:true}).click();await h.rail(page);await pause(page);
  const restored=await h.save(page,'restored-logo');assert.equal(restored.id,backup.id);
  assert.equal(hash(restored.snapshot.studioDocument),receipt.projectHash);
  assert.deepEqual(restored.snapshot.motionKeyframes,backup.snapshot.motionKeyframes);
  const images=restored.snapshot.overlays.filter(o=>o.type==='image');
  assert(images.length>0);assert(images.every(o=>o.sourceStoragePath||o.storagePath));
  let nativeAppLogoDecoded=false;
  if(config.pieceConstruction){
   const logo=page.locator('.studio-brand-lockup .ap-brand-logo img');await logo.evaluate(i=>i.decode());
   nativeAppLogoDecoded=await logo.evaluate(i=>i.naturalWidth===1200&&i.naturalHeight===269&&i.getBoundingClientRect().width>80);
   assert(nativeAppLogoDecoded);
   assert.equal(restored.snapshot.overlays.filter(o=>o.name.startsWith('Wordmark pieces /')).length,2*(config.pieceColumns||11));
   assert.equal(restored.snapshot.overlays.filter(o=>o.name.startsWith('Words /')&&o.mask?.enabled).length,config.pieceStyle==='diamond'?20:15);
  }
  const lockup=restored.snapshot.overlays.find(o=>o.name==='Mark / continuous original lockup');
  assert(lockup&&!lockup.mask?.enabled,'Settled identity must be continuous');
  await seek(page,8);await page.waitForFunction(()=>Array.from(document.querySelector('[data-testid="hook-preview-frame"]')?.querySelectorAll('img')||[])
    .some(i=>i.complete&&i.naturalWidth===1200&&i.naturalHeight===269&&i.getBoundingClientRect().width>0));
  assert.equal(writes.length,0);const out=path.join(folder,'fresh-restore');fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,'native-restored-logo.png')});
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({projectId:restored.id,canonicalHash:receipt.projectHash,
   backupSha256:hash(fs.readFileSync(backupFile)),exactFreshNativeRestore:true,keys:restored.snapshot.motionKeyframes.length,
   compiledKeyTuplesExact:true,ownedImageLayers:images.length,continuousOriginalLockup:true,visibleOwnedLogoDecoded:true,
   renderingOrPublishingWrites:writes,nativeAppLogoDecoded,wholeLiveParityQualified:false},null,2));
  console.log('Exact current logo backup, compiled keys and owned logo decoder verified in a fresh signed-in App.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
