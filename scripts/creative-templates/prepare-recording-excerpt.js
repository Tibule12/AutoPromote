#!/usr/bin/env node
// Package an actual screen recording through ordinary Studio source/trim/export.
// The source already contains its truthful original result and timeline.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const custom=process.env.STUDIO_EXCERPT_CONFIG?JSON.parse(fs.readFileSync(process.env.STUDIO_EXCERPT_CONFIG)):{};
const folder=path.resolve(custom.folder||'reports/studio-platform-packaging-20261016/proof/recording-excerpt');fs.mkdirSync(folder,{recursive:true});
Object.assign(process.env,{STUDIO_KINETIC_PROOF_DIR:folder,STUDIO_QA_EXPORT_RESOLUTION:'source',STUDIO_QA_EXPECTED_WIDTH:'1600',STUDIO_QA_EXPECTED_HEIGHT:'1000'});
const {pause,seek}=require('../studio-professional/kinetic-type-proof'),h=require('./studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run'),{chromium}=require('playwright');
Object.assign(process.env,{STUDIO_QA_EXPORT_RESOLUTION:'source',STUDIO_QA_EXPECTED_WIDTH:'1600',STUDIO_QA_EXPECTED_HEIGHT:'1000'});
const name=custom.projectName||'Editable type bands — result excerpt',output=custom.output||'type-bands-excerpt',start=custom.start??5.6;
async function main(){
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.1']});
 const context=await browser.newContext({storageState:path.resolve('reports/studio-platform-packaging-20261016/proof/publisher-session.private.json'),viewport:{width:1920,height:1200},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(60000);
 try{
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  if(['resume','recover'].includes(process.argv[2])){
   const backup=process.argv[2]==='recover'?`${output}-project.private.json`:'prepared-project.private.json';
   // setInputFiles does not wait for a disabled input. Wait for subscription
   // loading to finish so the ordinary restore handler actually consumes it.
   await page.waitForFunction(()=>document.querySelector('[aria-label="Restore project backup"]')?.disabled===false);
   await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(folder,backup));await page.getByRole('button',{name,exact:true}).click();await h.rail(page);await pause(page);
  }else{
  const source=path.resolve(custom.source||'reports/studio-noise-pressure-20261016/proof/noise-pressure/edited-in-studio.mp4');
  await page.locator('.creator-studio-dropzone input').setInputFiles(source);
  await page.getByRole('button',{name:'Open Creator Studio',exact:true}).click();await h.rail(page);await pause(page);await page.getByLabel('Project name',{exact:true}).fill(name);
  await page.getByRole('tab',{name:'Media',exact:true}).click();
  const card=page.locator('.studio-media-card').filter({has:page.getByRole('button',{name:`Preview ${path.basename(source)}`,exact:true})});
  await card.getByText('Saved · ready to edit',{exact:true}).waitFor({timeout:120000});await card.getByRole('button',{name:'Replace entire sequence',exact:true}).click();
  await q.tool(page,'Color');const rounded=page.getByLabel('Rounded main footage',{exact:true});if(await rounded.isChecked())await rounded.uncheck();
  if(custom.end){await seek(page,custom.end);await page.getByTestId('pro-quick-trim-end').click();}
  if(start>0){await seek(page,start);await page.getByTestId('pro-quick-trim-start').click();}
  }
  if(custom.voiceSource&&!['resume','recover'].includes(process.argv[2])){
   await q.tool(page,'Sound');await page.getByTestId('voiceover-recording-input').setInputFiles(path.resolve(custom.voiceSource));
   const voiceName=path.basename(custom.voiceSource);await page.getByLabel(`Name for ${voiceName}`,{exact:true}).fill('Schedule walkthrough');
   await page.getByLabel('Start for Schedule walkthrough',{exact:true}).fill('0');
  }
  const record=await h.save(page,'prepared');assert.equal(record.snapshot.timeline.length,1);assert.equal(record.snapshot.overlays.length,0);assert.equal(record.snapshot.timeline[0].startRequest,start);
  if(custom.voiceSource){assert.equal(record.snapshot.voiceovers.length,1);assert.equal(record.snapshot.voiceovers[0].startTime,0);}
  await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'prepared-picture.png')});
  fs.writeFileSync(path.join(folder,'native-controls.private.json'),JSON.stringify({projectId:record.id,aspect:record.snapshot.reframeAspect,smartCrop:record.snapshot.smartCrop,frame:record.snapshot.mainFrame,timeline:record.snapshot.timeline,muteOriginalAudio:record.snapshot.muteOriginalAudio},null,2),{mode:0o600});
  assert.equal(record.snapshot.mainFrame.enabled,false);assert(!record.snapshot.smartCrop,'Never crop the recorded movie/timeline');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();const download=await pending;await download.saveAs(path.join(folder,custom.backupName||'TYPE-BANDS-EXCERPT.autopromote.json'));
  if(process.argv[2]==='prepare')return;
  if(process.argv[2]==='recover'){
   // A project backup intentionally excludes browser render attempts. Restore
   // identity through the normal export-receipt control; the server checks the
   // signed-in owner, completed job and output hash again. These fields came
   // from the observed native completion, not an invented completion receipt.
   const completed=JSON.parse(fs.readFileSync(path.join(folder,output,'native-render-completed.json')));
   const identity={projectId:completed.projectId,projectHash:completed.projectHash,
    submittedJobId:completed.submittedJobId,outputSha256:completed.serverOutputSha256};
   const identityFile=path.join(folder,'observed-completion-identity.json');
   fs.writeFileSync(identityFile,JSON.stringify(identity,null,2),{mode:0o600});
   await q.tool(page,'Export');await page.getByLabel('Restore export receipt',{exact:true}).setInputFiles(identityFile);
   await page.getByTestId('rendered-output-ready').waitFor({timeout:120000});
   await h.recover(page,output);
  }else await h.render(page,output);
  if(custom.recordPlayback){
   await require('./materials-editing-proof').view(page,output);
   const finalBackup=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();
   await (await finalBackup).saveAs(path.join(folder,custom.backupName||'TYPE-BANDS-EXCERPT.autopromote.json'));
  }
 }catch(e){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(folder,'failure.private.txt'),(await page.locator('body').innerText()).slice(-18000),{mode:0o600});throw e;}
 finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
