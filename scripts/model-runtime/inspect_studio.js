#!/usr/bin/env node
// Actual editor and IndexedDB lifecycle around real artifacts. No API mocks,
// credentials, visible browser or new inference calls are used by this check.
const fs=require('fs/promises'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const {root}=require('./proof');
async function saved(page) {
  return page.evaluate(()=>new Promise((resolve,reject)=>{
    const opening=indexedDB.open('autopromote-viral-studio',1);
    opening.onerror=()=>reject(opening.error);
    opening.onsuccess=()=>{const db=opening.result,q=db.transaction('projects','readonly').objectStore('projects').getAll();
      q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=()=>reject(q.error);};
  }));
}
async function main() {
  const phase=process.argv[2] || 'complete',required=phase==='masks'?4:5;
  const fixture=JSON.parse(await fs.readFile(path.join(root,'studio-fixture-project.json')));
  const browser=await chromium.launch({headless:true,args:['--mute-audio']});
  const receipt={phase,startedAt:new Date().toISOString(),headless:true,muted:true,
    scope:'Local production component and real artifact state; signed-out fixture does not qualify ordinary-account release gates.',pageErrors:[]};
  try {
    const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage();
    page.on('pageerror',e=>receipt.pageErrors.push(e.message));
    await page.goto('http://127.0.0.1:6021/?fixture=factory&preserve=1');
    await page.getByTestId('viral-studio-workspace').waitFor({timeout:45000});
    await page.getByRole('button',{name:/Composite/}).first().click();
    const panel=page.locator('.studio-subject-vfx');await panel.waitFor();
    const title=panel.getByRole('group',{name:'Text behind subject'}).getByLabel('text',{exact:true});
    assert.equal(await title.inputValue(),'ON AIR');
    await title.fill('ON AIR EDIT');
    await page.getByRole('button',{name:'Show media',exact:true}).click();
    await page.locator('.studio-project-rail__head > summary').click();
    await page.getByTestId('studio-save-project').click();
    await page.waitForFunction(()=>document.querySelector('.studio-project-save-state')?.textContent.includes('Saved locally'));
    const record=(await saved(page)).find(p=>p.id===fixture.project.id);assert(record);
    const snapshot=record.snapshot;assert.equal(snapshot.analysisRefs.length,required);
    const subject=snapshot.subjectVfxScenes[0];assert(subject.modelArtifactRef && subject.trackingArtifactRef);
    assert.equal(subject.scene.effects[0].text,'ON AIR EDIT');assert.equal(subject.preview,undefined);
    if(required===5) {
      assert.equal(snapshot.projectMedia.length,2);assert.equal(snapshot.timeline.length,2);
      assert(snapshot.projectMedia.some(m=>m.generationProvenance?.origin==='generated_illustration'));
    }
    receipt.saved={projectId:record.id,artifactCount:snapshot.analysisRefs.length,mediaCount:snapshot.projectMedia.length,
      timelineCount:snapshot.timeline.length,maskArtifactHash:subject.modelArtifactRef.artifactHash,
      trackingArtifactHash:subject.trackingArtifactRef.artifactHash,editableTitle:subject.scene.effects[0].text,
      changedEditInvalidatesPreview:true};
    await page.reload();await page.getByTestId('viral-studio-workspace').waitFor({timeout:45000});
    await page.getByRole('button',{name:/Composite/}).first().click();
    assert.equal(await title.inputValue(),'ON AIR EDIT');
    const reopened=(await saved(page)).find(p=>p.id===fixture.project.id);
    assert.deepEqual(reopened.snapshot.analysisRefs,snapshot.analysisRefs);
    assert.deepEqual(reopened.snapshot.subjectVfxScenes[0].modelArtifactRef,subject.modelArtifactRef);
    assert.deepEqual(reopened.snapshot.subjectVfxScenes[0].trackingArtifactRef,subject.trackingArtifactRef);
    await page.screenshot({path:path.join(root,'qa',`studio-${phase}-editable-reopened.png`)});
    receipt.coldReopen=true;receipt.modelReferencesRecovered=true;receipt.status='PASS';
    await context.close();
  } finally {
    await browser.close();receipt.finishedAt=new Date().toISOString();
    await fs.writeFile(path.join(root,`studio-${phase}-lifecycle.json`),JSON.stringify(receipt,null,2));
  }
  console.log(JSON.stringify({phase,status:receipt.status,...receipt.saved,coldReopen:receipt.coldReopen,pageErrors:receipt.pageErrors}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
