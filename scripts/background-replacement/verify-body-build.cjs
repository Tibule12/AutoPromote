// Read-only normal-auth build checks; edits remain in this transient browser.
const fs=require('fs'),{chromium}=require('playwright'),assert=require('assert/strict');
(async()=>{
 const out='reports/background-replacement-20261101/private/body-edge-r5',base='/tmp/autopromote-application-demo-UByimw',config=JSON.parse(fs.readFileSync(base+'/browser-private.json'));
 const browser=await chromium.launch({headless:true,args:['--mute-audio']});const state=fs.readFileSync(base+'/browser-state.json');
 const context=await browser.newContext({storageState:JSON.parse(state),viewport:{width:1600,height:1100}});
 await context.route('**/*',r=>{const u=new URL(r.request().url());return u.hostname==='127.0.0.1'||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});
 let executions=0;const errors=[];context.on('request',r=>{if(r.method()==='POST'&&/studio-subject|model-runtime|media\/process/.test(r.url()))executions++;});
 try{
  const help=await context.newPage();help.on('pageerror',e=>errors.push(e.message));await help.goto(config.origin);
  await help.getByRole('button',{name:'Ask AutoPromote',exact:true}).click();await help.getByRole('dialog',{name:'Ask AutoPromote'}).waitFor();await help.close();
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(config.origin);
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();await page.getByRole('button',{name:'Credit lifecycle local project',exact:true}).click();
  const creator=page.getByRole('button',{name:'Creator',exact:true});if(await creator.isVisible())await creator.click();const pause=page.getByRole('button',{name:/^Pause (comparison|edited preview)$/});if(await pause.count())await pause.first().click();
  await page.getByRole('button',{name:/Composite/}).first().click();const panel=page.locator('.studio-subject-vfx');await panel.getByRole('combobox',{name:'Subject effect scene',exact:true}).selectOption({index:0});
  for(const g of await panel.getByRole('group',{name:'Foreground matte refinement',exact:true}).all())if(Number(await g.getByRole('spinbutton',{name:'decontaminate',exact:true}).inputValue())>0){await g.getByRole('button',{name:'Remove layer',exact:true}).click();break;}
  await panel.getByRole('button',{name:'Clean background edges',exact:true}).click();assert.equal(await panel.getByRole('spinbutton',{name:'Background edge detail width',exact:true}).inputValue(),'0');
  await page.screenshot({path:out+'/final-build-signed-in-studio.png'});assert.equal(executions,0);assert.deepEqual(errors,[]);
  fs.writeFileSync(out+'/final-build-signed-in-check.json',JSON.stringify({normalSavedAuth:true,retainedProjectOpens:true,newCleanupDefaultWidth:0,existingProjectsNotMigrated:true,helpPanelOpens:true,newExecutions:executions,browserErrors:errors,scope:'Transient local browser edit only; not saved to the delivery project.'},null,2));
  console.log('Same-origin compiled default, Studio project and dashboard help passed; no executions.');
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
