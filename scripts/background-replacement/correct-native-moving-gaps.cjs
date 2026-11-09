// Correct the reviewed source photograph through ordinary Studio controls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {clickStudioControl}=require('../../test/e2e/playwright/studio-timeline-layout');
async function main(){
 const demo=path.resolve(process.argv[2]),previous=path.resolve(process.argv[3]),out=path.resolve(process.argv[4]);fs.mkdirSync(out,{recursive:true,mode:0o700});
 const config=JSON.parse(fs.readFileSync(path.join(demo,'browser-private.json')));assert.match(config.origin,/^http:\/\/127\.0\.0\.1:/);
 const state=path.join(out,'native-state.json');if(!fs.existsSync(state))fs.copyFileSync(path.join(previous,'native-state.json'),state);
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost']});
 const context=await browser.newContext({viewport:{width:1600,height:1100},storageState:state,acceptDownloads:true,recordVideo:{dir:path.join(out,'corrective-authoring')}});const page=await context.newPage();page.setDefaultTimeout(30000);page.on('dialog',d=>d.accept());
 try{
  await page.goto(config.origin);await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();await page.getByRole('button',{name:'Podcast moving-edge repair - 4 November',exact:true}).click();await page.locator('.viral-studio-container').waitFor();await page.getByRole('button',{name:/Composite/}).first().click();
  const panel=page.locator('.studio-subject-vfx'),mask=panel.getByRole('group',{name:'Subject mask',exact:true}),frame=panel.getByRole('slider',{name:'Subject prompt frame',exact:true});
  const point=async(x,y,label)=>{await panel.getByRole('button',{name:label?'Subject point':'Background point',exact:true}).click();await panel.getByRole('spinbutton',{name:'Subject point X',exact:true}).fill(String(x/1430));await panel.getByRole('spinbutton',{name:'Subject point Y',exact:true}).fill(String(y/1000));await panel.getByRole('button',{name:'Add point on selected frame',exact:true}).click();};
  await panel.getByRole('combobox',{name:'Correction target',exact:true}).selectOption('person');await frame.press('Home');await point(1330,940,0);
  const details=mask.locator('details');if(!await details.evaluate(n=>n.open))await details.locator('summary').click();await mask.getByRole('button',{name:'Remove component 6',exact:true}).click();
  for(const target of ['person',1]){
   const select=panel.getByRole('combobox',{name:'Correction target',exact:true});await select.selectOption(target==='person'?'person':{index:target});await frame.press('Home');for(let i=0;i<8;i++)await frame.press('ArrowRight');
   // TV triangle is visible through this genuine finger gap. Adjacent palm
   // and fingers remain positive selections; the frame's blur is preserved.
   for(const [x,y] of [[340,381],[335,400],[331,418]])await point(x,y,0);
   for(const [x,y] of [[305,410],[350,480],[380,520]])await point(x,y,1);
   if(target==='person')for(const [x,y] of [[820,180],[850,320],[800,650],[800,900],[540,650],[1320,650]])await point(x,y,1);
  }
  await frame.press('Home');await panel.getByRole('combobox',{name:'Correction target',exact:true}).selectOption('person');
  const show=page.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();await clickStudioControl(page,page.getByTestId('studio-save-project'));
  const event=page.waitForEvent('download');await clickStudioControl(page,page.getByRole('button',{name:'Download project backup',exact:true,includeHidden:true}));const file=path.join(out,'corrected-selection.autopromote.json');await(await event).saveAs(file);const item=JSON.parse(fs.readFileSync(file)).snapshot.subjectVfxScenes[0];assert.equal(item.maskComponents.length,5);assert(!item.modelArtifactRef);assert(item.scene.prompt.shotPrompts.length);
  console.log('REVIEWED_NATIVE_GAP_AND_BACKGROUND_SELECTION_CORRECTED');
 }finally{await context.storageState({path:state,indexedDB:true});await context.close();await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
