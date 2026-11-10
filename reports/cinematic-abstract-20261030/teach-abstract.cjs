// Recorded ordinary controls on an actual native duplicate. No graphs injected.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const id=process.argv[2],root=path.join('/dev/shm/autopromote-abstract-20261030',id),out=path.join(root,'teaching');fs.mkdirSync(out,{recursive:true,mode:0o700});
Object.assign(process.env,{STUDIO_TEMPLATE_PROOF_DIR:out,STUDIO_KINETIC_PROOF_DIR:out,STUDIO_QA_CAPTURE_FPS:'6'});
const h=require('../../scripts/creative-templates/studio-proof'),{recording,pause,seek,range}=require('../../scripts/studio-professional/kinetic-type-proof');
const config=JSON.parse(fs.readFileSync('/dev/shm/autopromote-application-demo-rlq21z/browser-private.json'));
const source=JSON.parse(fs.readFileSync(path.join(root,'authored-project.private.json'))),title=source.name;
const wait=async seconds=>new Promise(r=>setTimeout(r,seconds*1000));
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--mute-audio','--disk-cache-size=16777216'],...(process.env.FILM_HTTP_PROXY?{proxy:{server:process.env.FILM_HTTP_PROXY},args:['--mute-audio','--proxy-bypass-list=<-loopback>','--disk-cache-size=16777216']}:{})});
 const context=await browser.newContext({storageState:path.join(root,'session.private.json'),viewport:{width:1600,height:1000},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(60000);page.on('dialog',d=>void d.accept());let submissions=0,stop;
 page.on('request',r=>{if(r.method()==='POST'&&['/api/media/process','/api/media/studio-3d/preview'].includes(new URL(r.url()).pathname))submissions++;});
 try{
  await page.goto(config.origin);await page.getByTestId('shared-credit-balance').waitFor();await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();
  await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(path.join(root,'SOURCE_BEFORE_GPU.autopromote.json'));
  await page.getByRole('region',{name:'Saved Studio projects',exact:true}).getByRole('button',{name:title,exact:true}).click();await h.rail(page);await pause(page);
  await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();await page.waitForTimeout(1000);await page.getByLabel('Project name',{exact:true}).fill(id.toUpperCase()+' / teaching copy /20261030');
  await h.save(page,'teaching-copy');await page.getByRole('button',{name:'Motion',exact:true}).click();await page.getByRole('button',{name:'3D Motion',exact:true}).click();
  const panel=page.getByTestId('studio-3d-panel');await panel.getByRole('button',{name:'Basic',exact:true}).click();
  const names=await panel.getByLabel('Selected scene object',{exact:true}).locator('option').allTextContents();
  const select=async name=>{const e=panel.getByLabel('Selected scene object',{exact:true});await e.scrollIntoViewIfNeeded();await e.selectOption({label:name});};
  await select(names[0]);await seek(page,source.snapshot.threeDScenes[0].duration/2);
  const before=await h.save(page,'teaching-before');stop=await recording(page);const origin=Date.now(),steps=[];
  const step=async(name,seconds,action)=>{const start=(Date.now()-origin)/1000;await action();const spent=(Date.now()-origin)/1000-start;if(spent<seconds)await wait(seconds-spent);steps.push({id:name,start,end:(Date.now()-origin)/1000});};
  await step('form',18,async()=>{
   await select(names[0]);const slider=panel.getByLabel('Ribbon wave',{exact:true});await slider.scrollIntoViewIfNeeded();const old=Number(await slider.inputValue());await range(slider,.2);await wait(3);await range(slider,old);await wait(3);
   const width=panel.getByLabel('Ribbon width',{exact:true});const w=Number(await width.inputValue());await range(width,Math.max(.15,w*.6));await wait(3);await range(width,w);
  });
  await step('flow',18,async()=>{
   const speed=panel.getByLabel('Ribbon speed',{exact:true});await speed.scrollIntoViewIfNeeded();const old=Number(await speed.inputValue());await range(speed,0);await seek(page,1);await wait(2);await seek(page,4);await wait(2);await range(speed,old);
   await seek(page,1);await page.getByRole('button',{name:'Play comparison',exact:true}).click();await wait(7);await pause(page);
  });
  await step('surface',18,async()=>{
   await seek(page,source.snapshot.threeDScenes[0].duration*.55);await select(names[0]);const material=panel.getByLabel('Object surface',{exact:true});await material.scrollIntoViewIfNeeded();const old=await material.inputValue();await material.selectOption('matte');await wait(3.5);await material.selectOption(old);
   const rough=panel.getByLabel('Object surface roughness',{exact:true});await rough.scrollIntoViewIfNeeded();
   if(before.snapshot.threeDScenes[0].objects[0].roughness!==undefined){const oldRough=Number(await rough.inputValue());await range(rough,.6);await wait(3.5);await range(rough,oldRough);}else await wait(7);
  });
  await step('light',16,async()=>{
   await panel.getByRole('button',{name:'Advanced',exact:true}).click();const rig=panel.getByLabel('Lighting rig',{exact:true});await rig.scrollIntoViewIfNeeded();await rig.selectOption('softbox');await wait(4);await rig.selectOption('sculpture');await wait(3);
   const intensity=panel.getByLabel('Light intensity',{exact:true});await intensity.scrollIntoViewIfNeeded();
  });
  await step('timeline',16,async()=>{
   await page.getByTestId('studio-pro-timeline').getByRole('button',{name:'Fit entire timeline',exact:true}).click();await seek(page,0);await page.getByRole('button',{name:'Play comparison',exact:true}).click();await wait(source.snapshot.threeDScenes[0].duration+.5);await pause(page);
  });
  await stop();stop=null;
  const saved=await h.save(page,'teaching-after');assert.deepEqual(saved.snapshot.threeDScenes,before.snapshot.threeDScenes,'Teaching must leave its authored scene decisions intact');assert.equal(submissions,0);
  const include=page.getByLabel('Include saved versions in backup',{exact:true});if(await include.isChecked())await include.uncheck();const d=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();await(await d).saveAs(path.join(out,'TEACHING.autopromote.json'));
  fs.writeFileSync(path.join(out,'clocks.json'),JSON.stringify({origin,steps,actualNativeDuplicate:true,sourceProjectPreserved:true,wholeWorkspace:true,submissions,graphInjection:false},null,2));console.log(id+' real full-workspace teaching complete.');
 }catch(error){await page.screenshot({path:path.join(out,'failure-'+Date.now()+'.png')}).catch(()=>{});throw error;}
 finally{if(stop)await stop().catch(()=>{});await context.close();await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
