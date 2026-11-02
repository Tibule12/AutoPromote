const fs=require('fs'),path=require('path'),{chromium}=require('playwright');
const {clickStudioControl}=require('../../test/e2e/playwright/studio-timeline-layout');
async function main(){
 const directory=process.argv[2],selection=JSON.parse(fs.readFileSync(process.argv[3])).parameters,config=JSON.parse(fs.readFileSync(path.join(directory,'browser-private.json')));
 const browser=await chromium.launch({headless:true,args:['--mute-audio']});const context=await browser.newContext({viewport:{width:1600,height:1100},storageState:path.join(directory,'browser-state.json'),recordVideo:{dir:path.join(directory,'background-recordings')}});
 await context.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>console.log('BROWSER_ERROR',e.message));page.on('response',async r=>{if(r.url().includes('studio-subject')&&r.status()>=400)console.log('MODEL_HTTP',r.status(),await r.text());});
 try{
 await page.goto(config.origin);
 await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().waitFor({timeout:90000});
 await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();await page.getByRole('button',{name:'Credit lifecycle local project',exact:true}).click();await page.locator('.viral-studio-container').waitFor();
 const save=async()=>{const show=page.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();await clickStudioControl(page,page.getByTestId('studio-save-project'));};
 const composite=page.getByRole('button',{name:/Composite/});console.log('COMPOSITE_BUTTONS',await composite.count());await composite.first().click();
 const panel=page.locator('.studio-subject-vfx');await panel.waitFor();console.log('PANEL_START',await panel.innerText());
 if(!await panel.getByRole('combobox',{name:'Subject effect scene',exact:true}).count())await panel.getByRole('combobox',{name:'Subject effect source clip',exact:true}).selectOption({index:1});
 const mask=panel.getByRole('group',{name:'Subject mask',exact:true});
 for(const [i,key] of ['left','top','right','bottom'].entries())await mask.getByRole('spinbutton',{name:`Subject box ${key}`,exact:true}).fill(String(selection.initialBox[i]));
 const details=mask.locator('details');if(await details.count()&&!await details.evaluate(n=>n.open))await details.locator('summary').click();
 if(await mask.getByRole('button',{name:'Remove component 7',exact:true}).count())await mask.getByRole('button',{name:'Remove component 7',exact:true}).click();
 const alreadySelected=(await panel.getByRole('combobox',{name:'Correction target',exact:true}).locator('option').count())>=7;
 if(!alreadySelected){
 await panel.getByRole('button',{name:'Clear points',exact:true}).click();
 for(const p of selection.points){await panel.getByRole('button',{name:p.label?'Subject point':'Background point',exact:true}).click();await panel.getByRole('spinbutton',{name:'Subject point X',exact:true}).fill(String(p.position[0]));await panel.getByRole('spinbutton',{name:'Subject point Y',exact:true}).fill(String(p.position[1]));await panel.getByRole('button',{name:'Add point on selected frame',exact:true}).click();}
 if(!await details.evaluate(n=>n.open))await details.locator('summary').click();
 for(const [number,c] of selection.components.entries()){
  for(const [i,key] of ['left','top','right','bottom'].entries())await mask.getByRole('spinbutton',{name:`Component box ${key}`,exact:true}).fill(String(c.box[i]));
  await mask.getByRole('checkbox',{name:'Object stays fixed in this shot',exact:true}).setChecked(c.propagate===false);
  for(const p of c.points){await mask.getByRole('spinbutton',{name:'Component point X',exact:true}).fill(String(p.position[0]));await mask.getByRole('spinbutton',{name:'Component point Y',exact:true}).fill(String(p.position[1]));await mask.getByRole('checkbox',{name:'Keep component point',exact:true}).setChecked(!!p.label);await mask.getByRole('button',{name:'Add component point',exact:true}).click();}
  await mask.getByRole('button',{name:'Add foreground component',exact:true}).click();console.log('ADDED_COMPONENT',number+1,c.id);
 }
 }
 await panel.getByRole('combobox',{name:'Correction target',exact:true}).selectOption({index:1});
 const frame=panel.getByRole('slider',{name:'Subject prompt frame',exact:true});await frame.press('Home');for(let i=0;i<36;i++)await frame.press('ArrowRight');
 await panel.getByRole('button',{name:'Subject point',exact:true}).click();await panel.getByRole('spinbutton',{name:'Subject point X',exact:true}).fill(String(1013/1430));await panel.getByRole('spinbutton',{name:'Subject point Y',exact:true}).fill('.75');await panel.getByRole('button',{name:'Add point on selected frame',exact:true}).click();
 await save();await page.waitForTimeout(800);
 await page.screenshot({path:path.join(directory,'background-selections.png')});
 await mask.getByRole('button',{name:'Create subject mask',exact:true}).click();console.log('MASK_REQUESTED');
 for(let check=0;check<270;check++){if(await mask.getByRole('button',{name:'Subject mask attached',exact:true}).count())break;const message=await mask.getByRole('status').allTextContents();console.log('MASK_STATUS',message.join(' '));if(message.some(x=>/unavailable|must|before|failed|invalid|required|cannot|does not|not match|MODEL_|OUTSIDE_|source|Save this/i.test(x)&&!x.startsWith('Creating')))throw Error(message.join(' '));await page.waitForTimeout(10000);}
 await mask.getByRole('button',{name:'Subject mask attached',exact:true}).waitFor();console.log('MASK_ATTACHED');
 await mask.getByRole('spinbutton',{name:'Edge refinement radius',exact:true}).fill('12');await mask.getByRole('button',{name:'Refine saved mask edges',exact:true}).click();console.log('ALPHA_REQUESTED');
 await mask.getByText('Subject mask saved. Adjust the background and render a preview; changing effects reuses this mask.').waitFor({timeout:45*60000});
 console.log('ALPHA_ATTACHED');await save();await page.screenshot({path:path.join(directory,'background-alpha-attached.png')});
 }catch(e){await page.screenshot({path:path.join(directory,'background-failure.png')});console.log('BODY', (await page.locator('body').innerText()).slice(-9000));throw e;}
 finally{await context.storageState({path:path.join(directory,'browser-state.json'),indexedDB:true});await context.close();await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
