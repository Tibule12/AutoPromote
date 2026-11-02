// A normally signed-in export of the retained local review source. This checks
// native picture/audio transport, not editable long-form model qualification.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {clickStudioControl}=require('../../test/e2e/playwright/studio-timeline-layout');
const hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
async function main(){
 const directory=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);const config=JSON.parse(fs.readFileSync(path.join(directory,'browser-private.json')));assert.match(config.origin,/^http:\/\/127\.0\.0\.1:/);
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost']});
 const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true,storageState:path.join(out,'native-state.json')});const page=await context.newPage();page.setDefaultTimeout(30000);page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const save=async()=>{const show=page.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();await clickStudioControl(page,page.getByTestId('studio-save-project'));};
 const backup=async name=>{await save();const event=page.waitForEvent('download');await clickStudioControl(page,page.getByRole('button',{name:'Download project backup',exact:true,includeHidden:true}));const file=path.join(out,name+'.autopromote.json');await(await event).saveAs(file);return JSON.parse(fs.readFileSync(file));};
 const open=async()=>{await page.goto(config.origin);await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();await page.getByRole('button',{name:'Four-minute background replacement review',exact:true}).click();await page.locator('.viral-studio-container').waitFor();};
 try{
  await open();await page.getByRole('button',{name:/Reframe/}).first().click();await page.getByTestId('reframe-aspect-16-9').click();await clickStudioControl(page,page.getByTestId('preview-fit-full'));
  await page.getByRole('button',{name:/Sound/}).first().click();await page.getByRole('checkbox',{name:'Use voice repair on export',exact:true}).uncheck();
  await clickStudioControl(page,page.getByRole('button',{name:'Export',exact:true}));await page.getByRole('combobox',{name:'Export resolution',exact:true}).selectOption('1080p');await page.getByRole('combobox',{name:'Export frame rate',exact:true}).selectOption('24');await page.getByRole('combobox',{name:'Export quality',exact:true}).selectOption('master');
  const before=await backup('before-cold-reopen');await page.reload();await open();const reopened=await backup('after-cold-reopen');assert.deepEqual(before.snapshot.studioDocument,reopened.snapshot.studioDocument);assert.deepEqual(before.snapshot.timeline,reopened.snapshot.timeline);assert.equal(reopened.snapshot.audioRestoration.enabled,false);
  if(process.argv.includes('--configure-only')){await context.storageState({path:path.join(out,'native-state.json'),indexedDB:true});console.log('FOUR_MINUTE_CONTROLS_AND_COLD_REOPEN_EXACT');return;}
  await clickStudioControl(page,page.getByRole('button',{name:'Export',exact:true}));const recovery=page.getByTestId('viral-render-recovery');if(await recovery.isVisible())await recovery.getByRole('button',{name:'Dismiss',exact:true}).click();
  const request=page.waitForRequest(r=>r.url().includes('/api/media/process')&&r.method()==='POST',{timeout:120000});void request.catch(()=>{});await page.getByRole('button',{name:/^(Render Final Clip|Render Again)$/}).click();const modal=page.getByRole('dialog',{name:'Studio export',exact:true});await modal.waitFor();await modal.getByRole('button',{name:/^Approve /}).click();const actual=await request;fs.writeFileSync(path.join(out,'native-export-request.private.json'),actual.postData());
  await page.getByRole('button',{name:'Download Rendered Clip',exact:true}).waitFor({timeout:960000});const event=page.waitForEvent('download');await page.getByRole('button',{name:'Download Rendered Clip',exact:true}).click();const movie=path.join(out,'Four-minute native export.mp4');await(await event).saveAs(movie);const final=await backup('final-project');assert.deepEqual(reopened.snapshot.studioDocument,final.snapshot.studioDocument);
  fs.writeFileSync(path.join(out,'native-persistence.json'),JSON.stringify({nativeUploadSourceIsFlattenedReview:true,longFormModelEditingQualified:false,canonicalDocumentColdReopenExact:true,canonicalDocumentAfterExportExact:true,originalAudioRestorationBypassed:true,canonicalDocumentSha256:hash(Buffer.from(JSON.stringify(final.snapshot.studioDocument))),exportSha256:hash(fs.readFileSync(movie)),browserExceptions:errors,paidCloudInference:false},null,2));await context.storageState({path:path.join(out,'native-state.json'),indexedDB:true});console.log('FOUR_MINUTE_NATIVE_EXPORT_COMPLETE',hash(fs.readFileSync(movie)));
 }catch(e){await page.screenshot({path:path.join(out,'finish-failure.png')});fs.writeFileSync(path.join(out,'finish-failure.txt'),await page.locator('body').innerText());throw e;}
 finally{await context.close();await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
