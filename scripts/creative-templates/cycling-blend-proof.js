#!/usr/bin/env node
// Native signed-in Composite edit/history/cold-reopen and deterministic export.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {hash}=require('../../src/creativeTemplates/contract');
const {saveAuthenticatedState}=require('./studio-session');
const h=require('./studio-proof');
const q=require('../../test/e2e/playwright/studio-stability/run');
const folder=path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const originalState=process.env.STUDIO_QA_ORIGINAL_STATE || '/home/tibule12/.local/share/autopromote-qa/session/studio-cycling-audio-curve.private.json';
const state=process.env.STUDIO_QA_STORAGE_STATE || '/home/tibule12/.local/share/autopromote-qa/session/studio-cycling-blend.private.json';
const originalName='VELO — SFX value curve · 20261011';
const name=process.env.STUDIO_QA_PROJECT_NAME || 'VELO — native blend · 20261011';
const mode=process.env.STUDIO_QA_BLEND_MODE || 'difference';
const decisions=document=>{const {revision,journal,...content}=document;return hash(content);};

async function main(){
  const action=process.argv[2]||'edit';assert(['edit','render','view','preflight','recover','inspect'].includes(action));
  fs.mkdirSync(folder,{recursive:true});
  const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio']});
  const context=await browser.newContext({storageState:action==='edit'?originalState:state,
    acceptDownloads:true,viewport:{width:1600,height:1000}});
  const page=await context.newPage();page.setDefaultTimeout(45000);
  let renders=0,authorization;
  page.on('request',r=>{
    const url=new URL(r.url());
    if(url.hostname==='localhost'&&url.port==='5119'&&url.pathname.startsWith('/api/')) {
      authorization=r.headers().authorization||authorization;
    }
    if(url.pathname==='/api/media/process')renders++;
  });
  try{
    await page.goto('http://localhost:5000/?studioTemplateSession=native-blend');
    await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
    await page.getByRole('button',{name:action==='edit'?originalName:name,exact:true}).click();
    await h.rail(page);assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
    if(action==='inspect') {
      const jobId=process.env.STUDIO_QA_OWNED_JOB;
      assert(/^viral_[a-f0-9]{64}$/.test(jobId));assert(authorization);
      const response=await context.request.get(`http://localhost:5119/api/media/status/${jobId}`,{headers:{authorization}});
      assert.equal(response.status(),200);const status=await response.json();
      fs.writeFileSync(path.join(folder,'owned-job-status.private.json'),JSON.stringify(status,null,2),{mode:0o600});
      const result={at:new Date().toISOString(),jobId,status:status.status,
        outputSha256:status.result?.outputSha256,outputBytes:status.result?.outputBytes,
        ownedExport:!!status.result?.outputStoragePath?.startsWith('studio/exports/'),
        outputGeneration:status.result?.outputGeneration,realAuthentication:true,serverOwnerCheck:true,
        newRenderJobs:0,newGpuJobs:0,nativeDelivery:false,
        scope:'Read-only owned status after an earlier native client timeout; this does not repair or qualify that lost delivery.'};
      fs.writeFileSync(path.join(folder,'owned-job-status.json'),JSON.stringify(result,null,2));
      console.log(`Earlier owned render status: ${result.status}; native delivery remains separate.`);return;
    }
    if(action==='preflight'){
      assert(authorization,'No real authenticated API request observed');
      const responses=[];
      for(const viralData of [{overlays:[{id:'unsupported',type:'text',blendMode:'hue'}]},
        {composition_plan:{layers:[{id:'main-video',blend_mode:'difference'}]}}]) {
        const response=await context.request.post('http://localhost:5119/api/media/process',{
          headers:{authorization},data:{fileUrl:'https://test.invalid/not-ingested.mp4',renderRequestId:'native-blend-rejection-'+responses.length,
            options:{renderViral:true,viralData}}});
        const body=await response.json();assert.equal(response.status(),400);
        assert.equal(body.code,'UNSUPPORTED_STUDIO_BLEND',JSON.stringify({status:response.status(),code:body.code,message:body.message}));assert(!body.jobId);
        responses.push({status:response.status(),code:body.code,jobCreated:false});
      }
      fs.writeFileSync(path.join(folder,'native-blend-preflight.json'),JSON.stringify({at:new Date().toISOString(),
        realAuthentication:true,noMocks:true,responses,gpuJobs:0,renderJobs:0,
        billingScope:'Existing local development charging bypass retained; production billing is not qualified.'},null,2));
      saveAuthenticatedState(await context.storageState({indexedDB:true}),state);return;
    }
    if(action==='recover'){
      await h.recover(page,'blend');assert.equal(renders,0);
      if(process.env.STUDIO_QA_REQUIRE_OWNED_EXPORT==='1') {
        const receipt=JSON.parse(fs.readFileSync(path.join(folder,'blend','render-receipt.json')));
        const response=await context.request.get(`http://localhost:5119/api/media/status/${receipt.submittedJobId}`,{headers:{authorization}});
        assert.equal(response.status(),200);const status=await response.json();
        const output=status.result;
        assert(output.outputStoragePath.startsWith('studio/exports/'));
        assert(output.outputStoragePath.endsWith(`/${receipt.submittedJobId}/render.mp4`));
        assert(output.outputGeneration);assert.equal(output.outputSha256,receipt.outputSha256);
        const result={at:new Date().toISOString(),projectId:receipt.projectId,canonicalHash:receipt.projectHash,
          jobId:receipt.submittedJobId,outputSha256:receipt.outputSha256,outputGeneration:output.outputGeneration,
          ownedExportPathVerified:true,serverOwnerCheck:true,exactDownloadedBytes:true,
          nativeColdRecovery:true,nativeDownload:true,fullDecode:receipt.technical.independentFullDecode,
          workerOffline:true,renderJobs:0,gpuJobs:0,noMocks:true};
        fs.writeFileSync(path.join(folder,'owned-output-recovery.json'),JSON.stringify(result,null,2));
      }
      saveAuthenticatedState(await context.storageState({indexedDB:true}),state);return;
    }
    if(action==='render'){
      await h.render(page,'blend');assert.equal(renders,1);
      saveAuthenticatedState(await context.storageState({indexedDB:true}),state);return;
    }
    if(action==='view'){
      await require('./materials-editing-proof').view(page,'blend');assert.equal(renders,0);
      await h.rail(page);
      const downloadEvent=page.waitForEvent('download');
      await page.getByRole('button',{name:'Download project backup',exact:true}).click();
      const download=await downloadEvent,file=path.join(folder,'blend','VELO-native-blend.autopromote.json');
      await download.saveAs(file);fs.chmodSync(file,0o600);assert.equal(await download.failure(),null);
      const receipt=JSON.parse(fs.readFileSync(path.join(folder,'blend','render-receipt.json')));
      assert.equal(hash(JSON.parse(fs.readFileSync(file)).snapshot.studioDocument),receipt.projectHash);
      saveAuthenticatedState(await context.storageState({indexedDB:true}),state);return;
    }
    const original=await h.save(page,'original');
    await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
    await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
    await page.getByLabel('Project name',{exact:true}).fill(name);
    const pause=page.getByRole('button',{name:'Pause comparison',exact:true});if(await pause.isVisible())await pause.click();
    const before=await h.save(page,'before');
    const layer=before.snapshot.overlays.find(item=>item.type==='text'&&item.name==='hook-kicker');assert(layer);
    await q.tool(page,'Composite');
    await page.getByText('Composite target',{exact:true}).locator('..').locator('select').selectOption(layer.id);
    const exercisedModes=[];
    for (const selected of JSON.parse(process.env.STUDIO_QA_BLEND_MODES || JSON.stringify([mode]))) {
      await page.getByText('Blend mode',{exact:true}).locator('..').locator('select').selectOption(selected);
      await page.waitForTimeout(300);
      const intermediate=await h.save(page,`mode-${selected}`);
      assert.equal(intermediate.snapshot.overlays.find(item=>item.id===layer.id).blendMode,selected);
      exercisedModes.push(selected);
    }
    await page.getByText('Blend mode',{exact:true}).locator('..').locator('select').selectOption(mode);
    await page.waitForTimeout(600);
    const edited=await h.save(page,'edited');
    assert.equal(edited.snapshot.overlays.find(item=>item.id===layer.id).blendMode,mode);
    assert.deepEqual(edited.snapshot.audioKeyframes,before.snapshot.audioKeyframes);
    const canonicalId=item=>item.layerId || item.id;
    assert(before.snapshot.studioDocument.layers.some(item=>canonicalId(item)===layer.id));
    for(const other of before.snapshot.studioDocument.layers.filter(item=>canonicalId(item)!==layer.id))
      assert.deepEqual(edited.snapshot.studioDocument.layers.find(item=>canonicalId(item)===canonicalId(other)),other);
    console.log('Native modes saved; canonical other layers and audio preserved.');
    await page.getByTestId('studio-undo-button').click();await page.waitForTimeout(600);
    const undone=await h.save(page,'undone');
    if (exercisedModes.length===1) assert.equal(decisions(undone.snapshot.studioDocument),decisions(before.snapshot.studioDocument));
    else assert.notEqual(decisions(undone.snapshot.studioDocument),decisions(edited.snapshot.studioDocument));
    await page.getByTestId('studio-redo-button').click();await page.waitForTimeout(600);
    const redone=await h.save(page,'redone');assert.equal(decisions(redone.snapshot.studioDocument),decisions(edited.snapshot.studioDocument));
    await page.reload();
    await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
    await page.getByRole('button',{name,exact:true}).click();
    const reopened=await h.save(page,'reopened');assert.equal(hash(reopened.snapshot.studioDocument),hash(redone.snapshot.studioDocument));
    assert.equal(hash((await h.records(page)).find(item=>item.id===original.id).snapshot.studioDocument),hash(original.snapshot.studioDocument));
    await q.tool(page,'Composite');await page.getByText('Composite target',{exact:true}).locator('..').locator('select').selectOption(layer.id);
    await page.getByLabel('Edited output position',{exact:true}).evaluate(input=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'0.75');
      input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v?.readyState>=3&&!v.seeking;});
    await page.getByText('Loading edited preview…',{exact:true}).waitFor({state:'hidden'});
    await page.screenshot({path:path.join(folder,'native-blend-and-timeline.png')});
    assert.equal(renders,0);
    saveAuthenticatedState(await context.storageState({indexedDB:true}),state);
    fs.writeFileSync(path.join(folder,'native-blend-lifecycle.json'),JSON.stringify({at:new Date().toISOString(),
      projectId:reopened.id,canonicalHash:hash(reopened.snapshot.studioDocument),originalId:original.id,
      originalPreserved:true,layerId:layer.id,mode,exercisedModes,nativeControls:true,undo:true,redo:true,
      coldReopened:true,otherLayersAndAudioUnchanged:true,renderJobs:0,gpuJobs:0,noMocks:true},null,2));
    console.log(`Native ${mode} layer edit/history/cold-reopen passed; original preserved.`);
  }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});throw error;}
  finally{
    // A failed/slow render still owns an attempt ID in normal Studio storage.
    // Keep it with the retained real login so cold recovery can resume it.
    if(action!=='edit') {
      try {saveAuthenticatedState(await context.storageState({indexedDB:true}),state);}
      catch(error){console.warn(`Could not retain native attempt state: ${error.message}`);}
    }
    await browser.close();
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
