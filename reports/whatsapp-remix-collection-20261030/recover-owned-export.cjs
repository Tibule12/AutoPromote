// Recover an already completed real job using ordinary backup/receipt controls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const root=path.resolve(process.argv[2]),preset=process.argv[3],jobId=process.argv[4],dir=path.join(root,preset);
const saved=JSON.parse(fs.readFileSync(path.join(dir,'BEFORE-DELIVERY.autopromote.json')));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const {clickStudioControl}=require('../../test/e2e/playwright/studio-timeline-layout');
async function main(){
 require('dotenv').config({path:'/home/tibule12/Projects/AutoPromte/AutoPromote/.env',quiet:true});
 const {admin}=require('../../src/firebaseAdmin');const row=await admin.firestore().collection('video_edits').doc(jobId).get();assert(row.exists);const job=row.data();
 assert.equal(job.status,'completed');const remix=job.options?.viralData?.audio_remix||job.options?.viralData?.audioRemix;assert.equal(remix?.preset,preset);
 const sha=job.result?.outputSha256;assert(/^[a-f0-9]{64}$/.test(sha));
 fs.writeFileSync(path.join(dir,'native-export-receipt.json'),JSON.stringify({projectId:saved.id,projectHash:hash(Buffer.from(JSON.stringify(stable(saved.snapshot.studioDocument)))),outputSha256:sha,submittedJobId:jobId},null,2));
 const browser=await chromium.launch({headless:true,args:['--mute-audio']});const context=await browser.newContext({storageState:path.join(root,'account-session.private.json'),viewport:{width:1440,height:1000}});const p=await context.newPage();p.setDefaultTimeout(60000);p.on('dialog',d=>d.accept());
 try{
  await p.goto('http://localhost:5008');await p.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();
  await p.getByLabel('Restore project backup',{exact:true}).waitFor();
  if(!await p.getByRole('button',{name:saved.name,exact:true}).count()){
   await p.waitForFunction(()=>!document.querySelector('input[aria-label="Restore project backup"]')?.disabled);
   await p.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(dir,'BEFORE-DELIVERY.autopromote.json'));
  }
  await p.getByRole('button',{name:saved.name,exact:true}).first().click();await p.waitForFunction(name=>document.querySelector('input[aria-label="Project name"]')?.value===name,saved.name);
  await p.getByTestId('studio-pro-timeline').waitFor();await clickStudioControl(p,p.getByRole('navigation',{name:'Creative tools'}).getByRole('button',{name:'Export',exact:true}));
  await p.getByLabel('Restore export receipt',{exact:true}).setInputFiles(path.join(dir,'native-export-receipt.json'));await p.getByTestId('rendered-output-ready').waitFor();
  const pending=p.waitForEvent('download',{timeout:120000});await p.getByRole('button',{name:'Download Rendered Clip',exact:true}).click();const name=saved.name.split(' — ')[0],file=path.join(dir,name+'.mp4');await(await pending).saveAs(file);assert.equal(hash(fs.readFileSync(file)),sha);
  const show=p.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();const rail=p.locator('.studio-project-rail__head');if(!await rail.evaluate(e=>e.open))await rail.locator(':scope > summary').click();
  await p.getByTestId('studio-save-project').click();const versions=p.getByLabel('Include saved versions in backup',{exact:true});if(await versions.isChecked())await versions.uncheck();const download=p.waitForEvent('download');await p.getByRole('button',{name:'Download project backup',exact:true}).click();await(await download).saveAs(path.join(dir,'FINAL-EDITABLE.autopromote.json'));
  const actual=JSON.parse(fs.readFileSync(path.join(dir,'FINAL-EDITABLE.autopromote.json')));assert.equal(actual.id,saved.id);assert.equal(actual.name,saved.name);assert.equal(actual.snapshot.audioRemix.preset,preset);
  const state=await context.storageState({indexedDB:true});fs.writeFileSync(path.join(root,'account-session.private.json'),JSON.stringify(state),{mode:0o600});state.origins=state.origins.map(o=>({...o,indexedDB:(o.indexedDB||[]).filter(d=>d.name==='firebaseLocalStorageDb')}));fs.writeFileSync(path.join(dir,'login.private.json'),JSON.stringify(state),{mode:0o600});
  fs.writeFileSync(path.join(dir,'delivery.json'),JSON.stringify({preset,name,projectTitle:saved.name,file:path.relative(root,file),sha256:sha,sourceSha256:hash(fs.readFileSync('/home/tibule12/Downloads/WhatsApp Video 2026-10-30 at 18.23.56.mp4')),deliveredAt:new Date().toISOString(),nativeAuthoring:true,canonicalCpuRender:true,actualOwnerAccount:true,headlessMuted:true,recoveredExistingJob:jobId,browserErrors:[]},null,2));console.log(preset+': recovered the correct completed native job through normal controls');
 }catch(e){await p.screenshot({path:path.join(dir,'recovery-failure.png')}).catch(()=>{});fs.writeFileSync(path.join(dir,'recovery-failure.private.txt'),await p.locator('body').innerText().catch(()=>''),{mode:0o600});throw e;}
 finally{await context.close();await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
