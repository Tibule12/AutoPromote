// Normal authoring in a fresh isolated demo browser; no existing projects edited.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {clickStudioControl}=require('../../test/e2e/playwright/studio-timeline-layout');
async function main(){
 const directory=path.resolve(process.argv[2]),source=path.resolve(process.argv[3]),out=path.resolve(process.argv[4]);fs.mkdirSync(out,{recursive:true});
 const config=JSON.parse(fs.readFileSync(path.join(directory,'browser-private.json')));assert.match(config.origin,/^http:\/\/127\.0\.0\.1:/);
 const browser=await chromium.launch({headless:true,args:['--mute-audio',
  '--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost']});
 const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true});
 // Deny external traffic through the dead loopback proxy. Any Fetch routing
 // serializes this large PUT through DevTools, even an unmatched route regex.
 const page=await context.newPage();const network=await context.newCDPSession(page);
 await network.send('Network.enable',{maxPostDataSize:65536});
 page.setDefaultTimeout(90000);page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(config.origin);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.locator('#login-email').fill(config.email);await page.locator('#login-password').fill(config.password);await page.locator('form input[type=checkbox]').check();await page.locator('form button[type=submit]').click();
  await page.getByTestId('shared-credit-balance').waitFor();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();
  await page.locator('.creator-studio-dropzone input[type=file]').setInputFiles(source);await page.getByRole('button',{name:'Open Creator Studio',exact:true}).click();await page.locator('.viral-studio-container').waitFor({timeout:90000});
  const show=page.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();
  const title=page.getByRole('textbox',{name:'Project name',exact:true,includeHidden:true});await clickStudioControl(page,title);await title.fill(process.argv[5]||'Four-minute background replacement review');
  await clickStudioControl(page,page.getByTestId('studio-save-project'));await page.waitForTimeout(2000);
  const download=page.waitForEvent('download');await clickStudioControl(page,page.getByRole('button',{name:'Download project backup',exact:true,includeHidden:true}));const file=path.join(out,'original-four-minute-project.autopromote.json');await(await download).saveAs(file);
  const backup=JSON.parse(fs.readFileSync(file));const duration=backup.snapshot.timeline.reduce((n,s)=>n+(s.endRequest-s.startRequest),0);assert(duration>=240&&duration<241);
  await page.screenshot({path:path.join(out,'original-four-minute-timeline.png')});fs.writeFileSync(path.join(out,'native-source-check.json'),JSON.stringify({normalLogin:true,nativeUploadAndSave:true,projectName:backup.name,seconds:duration,browserExceptions:errors},null,2));await context.storageState({path:path.join(out,'native-state.json'),indexedDB:true});console.log('FOUR_MINUTE_SOURCE_SAVED',duration);
 }catch(e){await page.screenshot({path:path.join(out,'prepare-failure.png')});fs.writeFileSync(path.join(out,'prepare-failure.txt'),await page.locator('body').innerText());throw e;}
 finally{await context.close();await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
