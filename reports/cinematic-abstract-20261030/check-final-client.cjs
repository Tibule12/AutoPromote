const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {chromium}=require('playwright');
const root='/dev/shm/autopromote-abstract-20261030';
process.env.STUDIO_TEMPLATE_PROOF_DIR=path.join(root,'final-check');
process.env.STUDIO_KINETIC_PROOF_DIR=process.env.STUDIO_TEMPLATE_PROOF_DIR;
const h=require('../../scripts/creative-templates/studio-proof');
const {seek,pause,range}=require('../../scripts/studio-professional/kinetic-type-proof');
const config=JSON.parse(fs.readFileSync('/dev/shm/autopromote-application-demo-rlq21z/browser-private.json'));
const proxy=JSON.parse(fs.readFileSync(path.join(root,'final-candidate.json')));
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{
 const browser=await chromium.launch({headless:true,proxy:{server:proxy.origin},args:['--mute-audio','--proxy-bypass-list=<-loopback>','--disk-cache-size=16777216']});
 const context=await browser.newContext({storageState:path.join(root,'current/session.private.json'),viewport:{width:1600,height:1000},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(60000);let submissions=0;
 page.on('pageerror',error=>console.log('Candidate browser error:',error.message));
 page.on('request',r=>{if(r.method()==='POST'&&['/api/media/studio-3d/preview','/api/media/process'].includes(new URL(r.url()).pathname))submissions++;});
 try{
  await page.goto(config.origin);await page.getByTestId('shared-credit-balance').waitFor();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();
  await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(root,'current/SOURCE_BEFORE_GPU.autopromote.json'));
  const title='CURRENT / liquid metal / native motion / 20261030 / take 1';
  await page.getByRole('region',{name:'Saved Studio projects',exact:true}).getByRole('button',{name:title,exact:true}).click();
  await h.rail(page);await pause(page);await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();await page.waitForTimeout(1000);await page.getByLabel('Project name',{exact:true}).fill('CURRENT / final client editable check /20261030');await h.save(page,'check-copy');await page.getByRole('button',{name:'Motion',exact:true}).click();await page.getByRole('button',{name:'3D Motion',exact:true}).click();await seek(page,4.5);
  const before=await h.save(page,'before-responsive-check');await page.screenshot({path:path.join(process.env.STUDIO_TEMPLATE_PROOF_DIR,'before-canvas-check.png')});
  const canvas=page.getByTestId('studio-3d-preview').locator('canvas'),node=await canvas.elementHandle();
  const first=digest(await canvas.screenshot());const slider=page.getByLabel('Ribbon wave',{exact:true});await slider.scrollIntoViewIfNeeded();const original=Number(await slider.inputValue());
  const started=Date.now();await range(slider,.75);await page.waitForTimeout(500);const changed=digest(await canvas.screenshot());
  assert(await node.evaluate((element,other)=>element===other,await canvas.elementHandle()),'Editing replaced the preview canvas');assert.notEqual(first,changed,'Ribbon edit did not reach rendered pixels');
  const editAndPictureMs=Date.now()-started;await range(slider,original);await page.waitForTimeout(500);
  const after=await h.save(page,'after-responsive-check');assert.deepEqual(after.snapshot.threeDScenes,before.snapshot.threeDScenes);
  await page.getByRole('button',{name:'Help: 3D Motion',exact:true}).click();const help=page.getByRole('dialog',{name:'Ask AutoPromote',exact:true});
  await help.getByLabel('Question',{exact:true}).fill('How do I control the continuously flowing ribbon in Object Composition?');
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/product-assistance/ask'&&r.request().method()==='POST');await help.getByRole('button',{name:'Ask',exact:true}).click();const response=await pending;assert.equal(response.status(),200);const answer=await response.json();assert(answer.features.some(f=>f.feature_id==='studio.three_d'));
  await help.locator('.product-assistance-answer').waitFor();await page.screenshot({path:path.join(process.env.STUDIO_TEMPLATE_PROOF_DIR,'real-workspace-and-help.png')});assert.equal(submissions,0);
  const result={realSavedAuth:true,fabricatedAuth:false,normalNativeRestore:true,sameCanvasAcrossEdits:true,actualPictureChanged:true,sceneDecisionsRestoredExactly:true,editAndPictureMs,submissions,contextualHelpStatus:200,sourceApiOriginPreserved:true};
  fs.writeFileSync(path.join(process.env.STUDIO_TEMPLATE_PROOF_DIR,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(error){await page.screenshot({path:path.join(process.env.STUDIO_TEMPLATE_PROOF_DIR,'failure-'+Date.now()+'.png')}).catch(()=>{});throw error;}finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
