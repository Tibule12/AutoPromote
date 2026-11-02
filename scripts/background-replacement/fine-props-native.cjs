// Actual mask-backed two-second Studio authoring. No flattened repair import.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {clickStudioControl}=require('../../test/e2e/playwright/studio-timeline-layout');
async function main(){
 const demo=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
 const config=JSON.parse(fs.readFileSync(path.join(demo,'browser-private.json')));assert.match(config.origin,/^http:\/\/127\.0\.0\.1:/);
 const root=path.resolve('reports/background-replacement-20261101/private/fine-props-r8');
 const source='/home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Four-minute movement test/Latest short source - 115-117s.mp4';
 const scenes=JSON.parse(fs.readFileSync('reports/background-replacement-20261101/private/long-podcast-r7/final-short-correction/scenes.json'));
 const settings=JSON.parse(fs.readFileSync(path.join(root,'native-colour-clicks.json')));
 const components=scenes[0].maskComponents.map(c=>({...c,shotPrompts:[]}));
 components.push({id:'corrected-fine-props',box:[1040/1430,.45,1,.745],propagate:false,
  points:[...settings.fg.map(([x,y])=>({position:[x/1430,y/1000],label:1})),...settings.bg.map(([x,y])=>({position:[x/1430,y/1000],label:0}))]});
 assert.equal(components.length,7);assert(components.every(c=>c.points.length<=16));
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost']});
 const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true});const page=await context.newPage();page.setDefaultTimeout(30000);page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const save=async()=>{const show=page.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();await clickStudioControl(page,page.getByTestId('studio-save-project'));};
 const backup=async name=>{await save();const event=page.waitForEvent('download');await clickStudioControl(page,page.getByRole('button',{name:'Download project backup',exact:true,includeHidden:true}));await(await event).saveAs(path.join(out,name+'.autopromote.json'));};
 try{
  await page.goto(config.origin);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.locator('#login-email').fill(config.email);await page.locator('#login-password').fill(config.password);await page.locator('form input[type=checkbox]').check();await page.locator('form button[type=submit]').click();await page.getByTestId('shared-credit-balance').waitFor();
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();await page.locator('.creator-studio-dropzone input[type=file]').setInputFiles(source);await page.getByRole('button',{name:'Open Creator Studio',exact:true}).click();await page.locator('.viral-studio-container').waitFor();
  const show=page.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();const title=page.getByRole('textbox',{name:'Project name',exact:true,includeHidden:true});await clickStudioControl(page,title);await title.fill('Fine prop movement repair v2');await save();
  await page.getByRole('button',{name:/Composite/}).first().click();const panel=page.locator('.studio-subject-vfx');await panel.getByRole('combobox',{name:'Subject effect source clip',exact:true}).selectOption({index:1});
  await panel.getByLabel('Upload background image',{exact:true}).setInputFiles(path.resolve('reports/background-replacement-20261101/private/replacement.png'));
  await panel.getByRole('combobox',{name:'Background choice',exact:true}).locator('option').filter({hasText:'replacement'}).waitFor({state:'attached',timeout:60000});
  await panel.getByRole('combobox',{name:'Background choice',exact:true}).selectOption({label:'replacement.png'});
  const bg=panel.getByRole('group',{name:'Replace background',exact:true});await bg.getByRole('spinbutton',{name:'exposure',exact:true}).fill('-.35');await bg.getByRole('spinbutton',{name:'saturation',exact:true}).fill('.8');
  const mask=panel.getByRole('group',{name:'Subject mask',exact:true});for(const [i,key] of ['left','top','right','bottom'].entries())await mask.getByRole('spinbutton',{name:`Subject box ${key}`,exact:true}).fill(String([.04,.02,.68,1][i]));
  await panel.getByRole('button',{name:'Clear points',exact:true}).click();
  for(const [x,y,label] of [[.27,.27,1],[.20,.60,1],[.38,.80,1],[.25,.93,1],[.90,.30,0],[485/1430,.225,0]]){
   await panel.getByRole('button',{name:label?'Subject point':'Background point',exact:true}).click();await panel.getByRole('spinbutton',{name:'Subject point X',exact:true}).fill(String(x));await panel.getByRole('spinbutton',{name:'Subject point Y',exact:true}).fill(String(y));await panel.getByRole('button',{name:'Add point on selected frame',exact:true}).click();
  }
  const details=mask.locator('details');await details.locator('summary').click();
  for(const [index,c] of components.entries()){
   for(const [i,key] of ['left','top','right','bottom'].entries())await mask.getByRole('spinbutton',{name:`Component box ${key}`,exact:true}).fill(String(c.box[i]));await mask.getByRole('checkbox',{name:'Object stays fixed in this shot',exact:true}).setChecked(c.propagate===false);
   for(const point of c.points){await mask.getByRole('spinbutton',{name:'Component point X',exact:true}).fill(String(point.position[0]));await mask.getByRole('spinbutton',{name:'Component point Y',exact:true}).fill(String(point.position[1]));await mask.getByRole('checkbox',{name:'Keep component point',exact:true}).setChecked(!!point.label);await mask.getByRole('button',{name:'Add component point',exact:true}).click();}
   await mask.getByRole('button',{name:'Add foreground component',exact:true}).click();console.log('NATIVE_PROP_COMPONENT',index+1);
  }
  await backup('native-corrective-prompts');await page.screenshot({path:path.join(out,'native-corrective-prompts.png')});await mask.getByRole('button',{name:'Create subject mask',exact:true}).click();console.log('ACTUAL_NATIVE_SAM_REQUESTED');
  const wait=async attached=>{for(let i=0;i<2400;i++){const text=(await mask.getByRole('status').allTextContents()).join(' ');if(i%30===0)console.log('NATIVE_MODEL_STATUS',text);if(attached?await mask.getByRole('button',{name:'Subject mask attached',exact:true}).count():text.startsWith('Subject mask saved.'))return;if(/failed|unavailable|MODEL_|OUTSIDE_/i.test(text))throw Error(text);await page.waitForTimeout(1000);}throw Error('Bounded native model observation elapsed');};
  await wait(true);await backup('native-sam-attached');await mask.getByRole('spinbutton',{name:'Edge refinement radius',exact:true}).fill('6');await mask.getByRole('button',{name:'Refine saved mask edges',exact:true}).click();console.log('ACTUAL_NATIVE_VITMATTE_REQUESTED');await wait(false);await backup('native-alpha-attached');
  await panel.getByRole('button',{name:'Clean background edges',exact:true}).click();await panel.getByRole('spinbutton',{name:'Background edge detail width',exact:true}).fill('0');await panel.getByRole('spinbutton',{name:'Remove old background colour',exact:true}).fill('1');await save();
  await panel.getByRole('button',{name:'Render subject preview',exact:true}).click();await panel.getByRole('status').filter({hasText:/ready/i}).waitFor({timeout:600000});await backup('native-preview-ready');
  fs.writeFileSync(path.join(out,'native-status.json'),JSON.stringify({modelBackedSource:true,flattenedInput:false,browserExceptions:errors},null,2));console.log('ACTUAL_NATIVE_PROP_PREVIEW_READY');
 }catch(e){await page.screenshot({path:path.join(out,'failure.png')});fs.writeFileSync(path.join(out,'failure.txt'),await page.locator('body').innerText());throw e;}
 finally{await context.storageState({path:path.join(out,'native-state.json'),indexedDB:true});await context.close();await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
