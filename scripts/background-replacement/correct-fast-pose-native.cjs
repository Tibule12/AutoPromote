// Author the inspected remaining finger gap through normal native point controls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const {clickStudioControl}=require('../../test/e2e/playwright/studio-timeline-layout');
async function main(){
 const demo=path.resolve(process.argv[2]),previous=path.resolve(process.argv[3]),out=path.resolve(process.argv[4]);fs.mkdirSync(out,{recursive:true,mode:0o700});const config=JSON.parse(fs.readFileSync(path.join(demo,'browser-private.json')));assert.match(config.origin,/^http:\/\/127\.0\.0\.1:/);const browser=await chromium.launch({headless:true,args:['--mute-audio','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost']});const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true,storageState:path.join(previous,'native-state.json'),recordVideo:{dir:path.join(out,'corrective-authoring')}});const page=await context.newPage();page.setDefaultTimeout(30000);page.on('dialog',d=>d.accept());
 try{
  await page.goto(config.origin);await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();await page.getByRole('button',{name:'Podcast moving-edge repair - 4 November',exact:true}).click();await page.locator('.viral-studio-container').waitFor();await page.getByRole('button',{name:/Composite/}).first().click();const panel=page.locator('.studio-subject-vfx'),frame=panel.getByRole('slider',{name:'Subject prompt frame',exact:true});
  const add=async(x,y,label)=>{await panel.getByRole('button',{name:label?'Subject point':'Background point',exact:true}).click();await panel.getByRole('spinbutton',{name:'Subject point X',exact:true}).fill(String(x/1430));await panel.getByRole('spinbutton',{name:'Subject point Y',exact:true}).fill(String(y/1000));await panel.getByRole('button',{name:'Add point on selected frame',exact:true}).click();};
  for(const target of ['person','left-hand']){
   const select=panel.getByRole('combobox',{name:'Correction target',exact:true});await select.selectOption(target==='person'?'person':{index:1});await frame.press('Home');for(let i=0;i<23;i++)await frame.press('ArrowRight');
   // These pixels are visibly the photographed TV between the moving fingers.
   // Adjacent fingers/palm remain positive; no hand outline is manually rotoed.
   for(const [x,y] of [[356,370],[361,380],[364,390]])await add(x,y,0);
   for(const [x,y] of [[343,380],[385,395],[380,470],[400,500]])await add(x,y,1);
   if(target==='person')for(const [x,y] of [[820,180],[850,320],[800,650],[800,900],[540,650],[1320,650]])await add(x,y,1);
  }
  await frame.press('Home');await panel.getByRole('combobox',{name:'Correction target',exact:true}).selectOption('person');const show=page.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();await clickStudioControl(page,page.getByTestId('studio-save-project'));const event=page.waitForEvent('download');await clickStudioControl(page,page.getByRole('button',{name:'Download project backup',exact:true,includeHidden:true}));const f=path.join(out,'corrected-selection.autopromote.json');await(await event).saveAs(f);const s=JSON.parse(fs.readFileSync(f)).snapshot.subjectVfxScenes[0];assert(!s.modelArtifactRef);assert.equal(s.maskComponents.length,5);assert(s.scene.prompt.shotPrompts.some(p=>Math.round(p.time*24)===23));assert(s.maskComponents[0].shotPrompts.some(p=>p.frameIndex===23));console.log('ACTUAL_NATIVE_FRAME23_GAP_CORRECTIONS_AUTHORED');
 }finally{await context.storageState({path:path.join(out,'native-state.json'),indexedDB:true});await context.close();await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
