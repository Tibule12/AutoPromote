// Restore a retained native project through its ordinary owned backup control.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const {clickStudioControl}=require('../../test/e2e/playwright/studio-timeline-layout');
async function main(){
 const demo=path.resolve(process.argv[2]),backup=path.resolve(process.argv[3]),out=path.resolve(process.argv[4]);fs.mkdirSync(out,{recursive:true,mode:0o700});
 const config=JSON.parse(fs.readFileSync(path.join(demo,'browser-private.json'))),expected=JSON.parse(fs.readFileSync(backup));assert.match(config.origin,/^http:\/\/127\.0\.0\.1:/);assert(expected.snapshot.subjectVfxScenes[0].modelArtifactRef);
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost']});const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true});const page=await context.newPage();page.setDefaultTimeout(30000);page.on('dialog',d=>d.accept());
 try{
  await page.goto(config.origin);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.locator('#login-email').fill(config.email);await page.locator('#login-password').fill(config.password);await page.locator('form input[type=checkbox]').check();await page.locator('form button[type=submit]').click();await page.getByTestId('shared-credit-balance').waitFor();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();
  await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(backup);await page.getByRole('button',{name:'Podcast moving-edge repair - 4 November',exact:true}).click();await page.locator('.viral-studio-container').waitFor();
  const show=page.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();await clickStudioControl(page,page.getByTestId('studio-save-project'));const event=page.waitForEvent('download');await clickStudioControl(page,page.getByRole('button',{name:'Download project backup',exact:true,includeHidden:true}));const file=path.join(out,'restored-parent.autopromote.json');await(await event).saveAs(file);const actual=JSON.parse(fs.readFileSync(file));
  // The owned preview read capability is renewed during normal recovery.
  // Compare its exact gateway path and every authored/model field, without
  // treating an expiry/signature refresh as a changed editing decision.
  const stableScenes=value=>value.map(scene=>{const copy=structuredClone(scene);if(copy.preview?.url){const u=new URL(copy.preview.url);assert.equal(u.origin,config.origin);copy.preview.url=u.origin+u.pathname;}return copy;});
  assert.equal(JSON.stringify(stableScenes(actual.snapshot.subjectVfxScenes)),JSON.stringify(stableScenes(expected.snapshot.subjectVfxScenes)),'Restored authored scenes/model references differ');assert.equal(JSON.stringify(actual.snapshot.studioDocument),JSON.stringify(expected.snapshot.studioDocument),'Restored canonical document differs');fs.writeFileSync(path.join(out,'parent-restore.json'),JSON.stringify({normalStudioBackupRestore:true,sourceBackup:path.basename(backup),canonicalDocumentExact:true,subjectScenesExactExceptRenewedPreviewCapability:true,modelArtifactHash:expected.snapshot.subjectVfxScenes[0].modelArtifactRef.artifactHash,paidCloud:false},null,2));console.log('NATIVE_EXACT_AUTHORED_PARENT_RESTORED');
  if(process.argv.includes('--advance-revision')){
   // Restoring an old local backup retains its original revision. Generate a
   // fresh authoring revision through real controls, preserving the final
   // effect values; never rewrite or lower the server's revision record.
   await page.getByRole('button',{name:/Composite/}).first().click();const panel=page.locator('.studio-subject-vfx');const field=panel.getByRole('group',{name:'Foreground light and colour',exact:true}).getByRole('spinbutton',{name:'exposure',exact:true});const original=await field.inputValue();
   for(let i=0;i<12;i++){await field.fill(String(Number(original)-.001));await field.press('Tab');await field.fill(original);await field.press('Tab');}
   await clickStudioControl(page,page.getByTestId('studio-save-project'));const download=page.waitForEvent('download');await clickStudioControl(page,page.getByRole('button',{name:'Download project backup',exact:true,includeHidden:true}));const f=path.join(out,'fresh-authored-parent.autopromote.json');await(await download).saveAs(f);const fresh=JSON.parse(fs.readFileSync(f));
   assert(fresh.snapshot.studioDocument.revision>actual.snapshot.studioDocument.revision);assert.equal(JSON.stringify(fresh.snapshot.subjectVfxScenes[0].scene),JSON.stringify(expected.snapshot.subjectVfxScenes[0].scene));assert.equal(JSON.stringify(fresh.snapshot.subjectVfxScenes[0].modelArtifactRef),JSON.stringify(expected.snapshot.subjectVfxScenes[0].modelArtifactRef));console.log('NATIVE_PARENT_NEW_REVISION_WITH_EXACT_EFFECTS_AND_MODEL',fresh.snapshot.studioDocument.revision);
  }
 }finally{await context.storageState({path:path.join(out,'native-state.json'),indexedDB:true});await context.close();await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
