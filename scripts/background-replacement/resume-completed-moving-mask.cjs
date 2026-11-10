// Normal fresh-browser backup restore and Resume for a sealed owned request.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const {clickStudioControl}=require('../../test/e2e/playwright/studio-timeline-layout');
async function main(){
 const demo=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),config=JSON.parse(fs.readFileSync(path.join(demo,'browser-private.json')));assert.match(config.origin,/^http:\/\/127\.0\.0\.1:/);
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost']});const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true,recordVideo:{dir:path.join(out,'native-request-recovery')}});const page=await context.newPage();page.setDefaultTimeout(30000);page.on('dialog',d=>d.accept());
 try{
  await page.goto(config.origin);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.locator('#login-email').fill(config.email);await page.locator('#login-password').fill(config.password);await page.locator('form input[type=checkbox]').check();await page.locator('form button[type=submit]').click();await page.getByTestId('shared-credit-balance').waitFor();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();
  await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(out,'recover-completed-mask.autopromote.json'));await page.getByRole('button',{name:'Podcast moving-edge repair - 4 November',exact:true}).click();await page.locator('.viral-studio-container').waitFor();await page.getByRole('button',{name:/Composite/}).first().click();const mask=page.locator('.studio-subject-vfx').getByRole('group',{name:'Subject mask',exact:true});await mask.getByRole('button',{name:'Resume subject mask',exact:true}).click();
  for(let i=0;i<60;i++){
   const status=(await mask.getByRole('status').allTextContents()).join(' ');
   if(status.includes('saved mask is from an earlier edit'))await mask.getByRole('button',{name:'Use saved mask for this edit',exact:true}).click();
   if(status.startsWith('Subject mask saved.'))break;
   if(/failed|unavailable|MODEL_|changed|does not match/i.test(status))throw Error(status);
   await page.waitForTimeout(1000);
  }
  await mask.getByRole('button',{name:'Subject mask attached',exact:true}).waitFor();const show=page.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();await clickStudioControl(page,page.getByTestId('studio-save-project'));const e=page.waitForEvent('download');await clickStudioControl(page,page.getByRole('button',{name:'Download project backup',exact:true,includeHidden:true}));const file=path.join(out,'native-segmentation-project.autopromote.json');await(await e).saveAs(file);assert(JSON.parse(fs.readFileSync(file)).snapshot.subjectVfxScenes[0].modelArtifactRef);console.log('COMPLETED_OWNED_MASK_RESUMED_THROUGH_NATIVE_STUDIO');
 }catch(e){await page.screenshot({path:path.join(out,'mask-recovery-failure.png')});fs.writeFileSync(path.join(out,'mask-recovery-failure.txt'),await page.locator('body').innerText());throw e;}
 finally{await context.storageState({path:path.join(out,'native-state.json'),indexedDB:true});await context.close();await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
