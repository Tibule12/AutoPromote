#!/usr/bin/env node
// Author/rebind the shared template through the ordinary authenticated Studio.
// No project injection, alternate renderer, mocked job or model allocation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const h=require('./studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');
const {hash}=require('../../src/creativeTemplates/contract');
const {saveAuthenticatedState}=require('./studio-session');
const source=path.resolve('reports/model-capability-runtime-v1-20261009/proof/launch-template');
const folder=path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR),state=process.env.STUDIO_QA_STORAGE_STATE;
const version='1.1.2';
const briefs={
 ember:{headline:'CRAFT.\nNOT ROUTINE.',featureOne:'PRECISION.\nIN EVERY POUR.',featureTwo:'A LITTLE PAUSE.\nA LOT OF FEELING.',callToAction:'Make mornings matter.',brandColour:'#ffc58c',
 hookFootage:'coffee-beans-falling-into-a-coffee-pot-4985.mp4',productFootage:'cup-being-filled-with-coffee-in-a-coffee-machine-41865.mp4',detailFootage:'tamping-coffee-for-a-coffee-maker-3572.mp4',music:'materials-editing-20261010/materials/mixkit-music-1147.mp3'},
 onda:{headline:'FEEL.\nEVERY FREQUENCY.',featureOne:'YOUR WORLD.\nON YOUR TERMS.',featureTwo:'LESS DISTRACTION.\nMORE FEELING.',callToAction:'Find your frequency.',brandColour:'#d5b4ff',
 hookFootage:'woman-listening-to-music-in-a-dark-room-4284.mp4',productFootage:'woman-takes-her-headphones-to-listen-to-music-51134.mp4',detailFootage:'close-up-view-of-man-dancing-with-headphones-51764.mp4',music:'materials-editing-20261010/materials/mixkit-music-872.mp3'},
};
async function pause(page){const b=page.getByRole('button',{name:'Pause comparison',exact:true});if(await b.isVisible())await b.click();}
async function bind(panel,page,slot,file){
 const select=panel.getByLabel(`Select ${slot}`,{exact:true}),name=path.basename(file);
 const options=await select.locator('option').evaluateAll(es=>es.map(e=>({name:e.textContent,value:e.value})));
 const saved=options.find(o=>o.name===name);
 if(saved){await select.selectOption(saved.value);return;}
 await panel.getByLabel(`Upload ${slot}`,{exact:true}).setInputFiles(path.join(source,file));
 await page.waitForFunction(()=>document.querySelector('[data-testid="launch-template-panel"] [role="status"]')?.textContent.endsWith(' saved.'),undefined,{timeout:90000});
}
async function sample(page,name){
 await q.tool(page,'Export');const live=page.getByRole('button',{name:'Show Live Edit',exact:true});if(await live.isVisible())await live.click();
 await page.getByRole('separator',{name:'Resize timeline',exact:true}).focus();await page.keyboard.press('Escape');
 const out=path.join(folder,name,'native');fs.mkdirSync(out,{recursive:true});
 for(const time of [.75,1.25,3,5.75,8.75,10.75,13.75,16.75,18.75]){
  const slider=page.getByLabel('Edited output position',{exact:true});
  await slider.evaluate((el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(v));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},time);
  await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v&&!v.seeking&&v.readyState>=3;});await page.waitForTimeout(250);
  await page.getByTestId('hook-preview-frame').screenshot({path:path.join(out,`${time}.png`)});
 }
}
async function film(page,name){
 await h.render(page,name);await require('./materials-editing-proof').view(page,name);
 const frames=path.join(folder,name,'studio-recording-frames'),files=fs.readdirSync(frames).filter(f=>f.endsWith('.jpg')).sort();
 for(const[i,label]of[[0,'start'],[Math.floor(files.length/2),'middle'],[files.length-1,'end']])fs.copyFileSync(path.join(frames,files[i]),path.join(folder,name,`studio-${label}.jpg`));
 fs.rmSync(frames,{recursive:true});
}
async function main(){
 fs.mkdirSync(folder,{recursive:true});
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--disk-cache-size=1048576','--media-cache-size=1048576','--disable-background-networking']});
 const context=await browser.newContext({storageState:state,viewport:{width:1600,height:1400},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(45000);
 try{
  await page.goto('http://localhost:5000/?studioTemplateSession=editorial-launch');
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  const originals=(await h.records(page)).filter(p=>!p.name.includes('editorial launch')).map(p=>({id:p.id,hash:hash(p.snapshot.studioDocument)}));
  for(const name of (process.env.STUDIO_QA_BRANDS||'ember,onda').split(',')){
   const brief=briefs[name];assert(brief,'Unknown creative brief');
   const title=`${name.toUpperCase()} — editorial launch · v${version}`;
   const records=await h.records(page),retained=records.find(p=>p.name===title);
   const base=retained||records.find(p=>p.name===`${name.toUpperCase()} — editorial launch · v1.1.0`)
     ||records.find(p=>p.name.startsWith(name.toUpperCase())&&p.snapshot.creativeTemplateInstance?.templateRef.templateId==='product_launch_cinematic_v1');assert(base,'Missing owned launch project');
   if(!await page.getByRole('button',{name:base.name,exact:true}).isVisible()){
    await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
   }
   await page.getByRole('button',{name:base.name,exact:true}).click();await h.rail(page);await pause(page);
   if(!retained){await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));}
   await page.getByLabel('Project name',{exact:true}).fill(title);
   const panel=page.getByTestId('launch-template-panel');if(!await panel.evaluate(e=>e.open))await panel.locator(':scope > summary').click();
   if(process.env.STUDIO_QA_RECOVER!=='1'){
    if(process.env.STUDIO_QA_RENDER_SAVED==='1'){
      await sample(page,name);await film(page,name);
    }else{
    await panel.getByLabel('Creative template',{exact:true}).selectOption(`product_launch_cinematic_v1@${version}`);
    await panel.getByLabel('Template aspect ratio',{exact:true}).selectOption('16:9');
    for(const[key,label]of Object.entries({headline:'Launch headline',featureOne:'Feature one',featureTwo:'Feature two',callToAction:'Launch CTA',brandColour:'Launch colour'}))await panel.getByLabel(label,{exact:true}).fill(brief[key]);
    for(const slot of ['hookFootage','productFootage','detailFootage','music'])await bind(panel,page,slot,brief[slot]);
    for(const slot of ['hookFootage','productFootage','detailFootage'])await panel.getByLabel(`${slot} in-point`,{exact:true}).fill('0');
    await bind(panel,page,'transitionSfx','materials-editing-20261010/materials/mixkit-sfx-1492.wav');
    await bind(panel,page,'revealSfx','materials-editing-20261010/materials/mixkit-sfx-1143.mp3');
    // Director and manual application both enter this same ordinary editable graph.
    await panel.getByRole('button',{name:'Director: select launch edit',exact:true}).click();
    await panel.getByRole('button',{name:'Apply Director launch',exact:true}).click();
    await pause(page);const edited=await h.save(page,`${name}-edited`);
    assert.equal(edited.snapshot.creativeTemplateInstance.templateRef.version,version);assert.equal(edited.snapshot.creativeTemplateInstance.instantiatedBy,'director');
    assert.equal(edited.snapshot.smartCrop,true);assert.equal(edited.snapshot.smartCropMode,'speaker_track');
    assert.equal(edited.snapshot.reframeKeyframes[0].x,50);
    assert.equal(edited.snapshot.timeline.length,10);assert.equal(edited.snapshot.soundEffects.filter(c=>!c.builtIn).length,4);
    await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();await page.getByRole('button',{name:title,exact:true}).click();await h.rail(page);await pause(page);
    const reopened=await h.save(page,`${name}-reopened`);assert.equal(hash(edited.snapshot.studioDocument),hash(reopened.snapshot.studioDocument));
    await sample(page,name);console.log(`Creative ${name}: shared template, editable cuts/type/sound and exact cold reopen complete.`);
    await film(page,name);
    }
   }else{
    await h.recover(page,name);await require('./materials-editing-proof').view(page,name);
   }
   const after=await h.save(page,`${name}-final`),receipt=JSON.parse(fs.readFileSync(path.join(folder,name,'render-receipt.json')));
   assert.equal(hash(after.snapshot.studioDocument),receipt.projectHash);
   fs.writeFileSync(path.join(folder,name,'creative-project-receipt.json'),JSON.stringify({projectId:after.id,projectHash:receipt.projectHash,outputHash:receipt.outputSha256,templateRef:after.snapshot.creativeTemplateInstance.templateRef,nativeEditableTimelineAndFinishedPlayback:true,directorUsesSameAdapter:true,creativeReview:'Actual movie supplied for review; no founder/public approval implied',newGpuJobs:0},null,2));
   saveAuthenticatedState(await context.storageState({indexedDB:true}),state);
   console.log(`Creative ${name}: actual final movie and full Studio timeline recording delivered.`);
   if(name!=='onda'){await page.reload();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();}
  }
  const after=await h.records(page);for(const before of originals)assert.equal(hash(after.find(p=>p.id===before.id).snapshot.studioDocument),before.hash,'Original project changed');
 }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(folder,'failure.json'),JSON.stringify({error:error.message,creativeApproved:false}));throw error;}
 finally{saveAuthenticatedState(await context.storageState({indexedDB:true}),state);await context.close();await browser.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
