// Existing Studio controls only: source selections, corrections and background.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {clickStudioControl}=require('../../test/e2e/playwright/studio-timeline-layout');
async function main(){
 const demo=path.resolve(process.argv[2]),moving=JSON.parse(fs.readFileSync(process.argv[3])),fixed=JSON.parse(fs.readFileSync(process.argv[4])),out=path.resolve(process.argv[5]);
 const config=JSON.parse(fs.readFileSync(path.join(demo,'browser-private.json')));assert.match(config.origin,/^http:\/\/127\.0\.0\.1:/);
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost']});
 const context=await browser.newContext({viewport:{width:1600,height:1100},storageState:path.join(out,'native-state.json'),acceptDownloads:true,recordVideo:{dir:path.join(out,'authoring-recording')}});
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('dialog',d=>d.accept());
 try{
  await page.goto(config.origin);await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();await page.getByRole('button',{name:'Podcast moving-edge repair - 4 November',exact:true}).click();await page.locator('.viral-studio-container').waitFor();
  await page.getByRole('button',{name:/Composite/}).first().click();const panel=page.locator('.studio-subject-vfx');
  if(!await panel.getByRole('combobox',{name:'Subject effect scene',exact:true}).count())await panel.getByRole('combobox',{name:'Subject effect source clip',exact:true}).selectOption({index:1});
  const mask=panel.getByRole('group',{name:'Subject mask',exact:true});
  const save=async()=>{const show=page.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();await clickStudioControl(page,page.getByTestId('studio-save-project'));};
  if(!process.argv.includes('--resume-authored')){
  for(const [i,key] of ['left','top','right','bottom'].entries())await mask.getByRole('spinbutton',{name:`Subject box ${key}`,exact:true}).fill(String(moving.initialBox[i]));
  const addPoint=async p=>{await panel.getByRole('button',{name:p.label?'Subject point':'Background point',exact:true}).click();await panel.getByRole('spinbutton',{name:'Subject point X',exact:true}).fill(String(Math.min(p.position[0],.99999)));await panel.getByRole('spinbutton',{name:'Subject point Y',exact:true}).fill(String(Math.min(p.position[1],.99999)));await panel.getByRole('button',{name:'Add point on selected frame',exact:true}).click();};
  await panel.getByRole('button',{name:'Clear points',exact:true}).click();for(const p of moving.points)await addPoint(p);
  const details=mask.locator('details');if(!await details.evaluate(n=>n.open))await details.locator('summary').click();
  const components=[...moving.components,...fixed.components];
  for(const [n,c] of components.entries()){
   if(!await details.evaluate(n=>n.open))await details.locator('summary').click();
   for(const [i,key] of ['left','top','right','bottom'].entries())await mask.getByRole('spinbutton',{name:`Component box ${key}`,exact:true}).fill(String(c.box[i]));
   await mask.getByRole('checkbox',{name:'Object stays fixed in this shot',exact:true}).setChecked(c.propagate===false);
   for(const p of c.points){await mask.getByRole('spinbutton',{name:'Component point X',exact:true}).fill(String(p.position[0]));await mask.getByRole('spinbutton',{name:'Component point Y',exact:true}).fill(String(p.position[1]));await mask.getByRole('checkbox',{name:'Keep component point',exact:true}).setChecked(!!p.label);await mask.getByRole('button',{name:'Add component point',exact:true}).click();}
   await mask.getByRole('button',{name:'Add foreground component',exact:true}).click();
   if(c.shotPrompts?.length){
    await panel.getByRole('combobox',{name:'Correction target',exact:true}).selectOption({index:n+1});
    const frame=panel.getByRole('slider',{name:'Subject prompt frame',exact:true});
    for(const correction of c.shotPrompts){await frame.press('Home');for(let i=0;i<correction.frameIndex;i++)await frame.press('ArrowRight');for(const p of correction.points)await addPoint(p);}
    await frame.press('Home');
   }
   console.log('NATIVE_FOREGROUND_OBJECT_AUTHORED',n+1,c.id);
  }
  const target=panel.getByRole('combobox',{name:'Correction target',exact:true});
  await target.selectOption('person');
  const frame=panel.getByRole('slider',{name:'Subject prompt frame',exact:true});
  for(const correction of moving.shotPrompts||[]){await frame.press('Home');for(let i=0;i<correction.frameIndex;i++)await frame.press('ArrowRight');for(const point of correction.points)await addPoint(point);}
  await frame.press('Home');
  }else assert.equal(await panel.getByRole('combobox',{name:'Correction target',exact:true}).locator('option').count(),moving.components.length+fixed.components.length+1,'Resume only the already authored selections');
  await panel.getByRole('combobox',{name:'Correction target',exact:true}).selectOption('person');
  await panel.getByLabel('Upload background image',{exact:true}).setInputFiles(path.resolve('reports/background-replacement-20261101/private/replacement.png'));
  await panel.getByRole('combobox',{name:'Background choice',exact:true}).locator('option').last().waitFor({state:'attached'});
  await panel.getByRole('combobox',{name:'Background choice',exact:true}).selectOption({index:1});
  const clean=panel.getByRole('button',{name:'Clean background edges',exact:true});if(await clean.isVisible())await clean.click();
  await save();const event=page.waitForEvent('download');await clickStudioControl(page,page.getByRole('button',{name:'Download project backup',exact:true,includeHidden:true}));const file=path.join(out,'authored-selection-project.autopromote.json');await(await event).saveAs(file);
  const backup=JSON.parse(fs.readFileSync(file)),item=backup.snapshot.subjectVfxScenes[0];assert.equal(item.maskComponents.length,moving.components.length+fixed.components.length);assert.equal(item.maskComponents.filter(c=>c.shotPrompts?.length).length,[...moving.components,...fixed.components].filter(c=>c.shotPrompts?.length).length);
  assert(item.scene.effects.some(e=>e.type==='background_replace'));assert(!item.modelArtifactRef,'Authoring alone is not model inference');
  await page.screenshot({path:path.join(out,'authored-native-selection.png')});console.log('NATIVE_SELECTIONS_AND_CORRECTIONS_SAVED');
 }catch(e){await page.screenshot({path:path.join(out,'authoring-failure.png')});fs.writeFileSync(path.join(out,'authoring-failure.txt'),await page.locator('body').innerText());throw e;}
 finally{await context.storageState({path:path.join(out,'native-state.json'),indexedDB:true});await context.close();await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
