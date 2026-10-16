#!/usr/bin/env node
// Package an actual screen recording through ordinary Studio source/trim/export.
// The source already contains its truthful original result and timeline.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const folder=path.resolve('reports/studio-platform-packaging-20261016/proof/recording-excerpt');fs.mkdirSync(folder,{recursive:true});
Object.assign(process.env,{STUDIO_KINETIC_PROOF_DIR:folder,STUDIO_QA_EXPORT_RESOLUTION:'source',STUDIO_QA_EXPECTED_WIDTH:'1600',STUDIO_QA_EXPECTED_HEIGHT:'1000'});
const {pause,seek}=require('../studio-professional/kinetic-type-proof'),h=require('./studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run'),{chromium}=require('playwright');
Object.assign(process.env,{STUDIO_QA_EXPORT_RESOLUTION:'source',STUDIO_QA_EXPECTED_WIDTH:'1600',STUDIO_QA_EXPECTED_HEIGHT:'1000'});
const name='Editable type bands — result excerpt';
async function main(){
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.1']});
 const context=await browser.newContext({storageState:path.resolve('reports/studio-platform-packaging-20261016/proof/publisher-session.private.json'),viewport:{width:1920,height:1200},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(60000);
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  if(process.argv[2]==='resume'){
   await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(folder,'prepared-project.private.json'));await page.getByRole('button',{name,exact:true}).click();await h.rail(page);await pause(page);
  }else{
  await page.locator('.creator-studio-dropzone input').setInputFiles(path.resolve('reports/studio-noise-pressure-20261016/proof/noise-pressure/edited-in-studio.mp4'));
  await page.getByRole('button',{name:'Open Creator Studio',exact:true}).click();await h.rail(page);await pause(page);await page.getByLabel('Project name',{exact:true}).fill(name);
  await page.getByRole('tab',{name:'Media',exact:true}).click();
  const card=page.locator('.studio-media-card').filter({has:page.getByRole('button',{name:'Preview edited-in-studio.mp4',exact:true})});
  await card.getByText('Saved · ready to edit',{exact:true}).waitFor({timeout:120000});await card.getByRole('button',{name:'Replace entire sequence',exact:true}).click();
  await q.tool(page,'Color');const rounded=page.getByLabel('Rounded main footage',{exact:true});if(await rounded.isChecked())await rounded.uncheck();
  await seek(page,5.6);await page.getByTestId('pro-quick-trim-start').click();
  }
  const record=await h.save(page,'prepared');assert.equal(record.snapshot.timeline.length,1);assert.equal(record.snapshot.overlays.length,0);assert.equal(record.snapshot.timeline[0].startRequest,5.6);
  await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'prepared-picture.png')});
  fs.writeFileSync(path.join(folder,'native-controls.private.json'),JSON.stringify({projectId:record.id,aspect:record.snapshot.reframeAspect,smartCrop:record.snapshot.smartCrop,frame:record.snapshot.mainFrame,timeline:record.snapshot.timeline,muteOriginalAudio:record.snapshot.muteOriginalAudio},null,2),{mode:0o600});
  assert.equal(record.snapshot.mainFrame.enabled,false);assert(!record.snapshot.smartCrop,'Never crop the recorded movie/timeline');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();const download=await pending;await download.saveAs(path.join(folder,'TYPE-BANDS-EXCERPT.autopromote.json'));
  await h.render(page,'type-bands-excerpt');
 }catch(e){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(folder,'failure.private.txt'),(await page.locator('body').innerText()).slice(-18000),{mode:0o600});throw e;}
 finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
