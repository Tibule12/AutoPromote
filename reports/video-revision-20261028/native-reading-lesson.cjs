// Ordinary signed-in controls and native exports only. Never inject state or mock results.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),folder=path.join(__dirname,'proof/reading-lesson');
Object.assign(process.env,{STUDIO_TEMPLATE_PROOF_DIR:folder,STUDIO_KINETIC_PROOF_DIR:folder,STUDIO_QA_EXPECTED_WIDTH:'720',STUDIO_QA_EXPECTED_HEIGHT:'1280',STUDIO_QA_EXPORT_FPS:'24',STUDIO_QA_EXPORT_RESOLUTION:'source',STUDIO_QA_NATIVE_DOWNLOAD_METHOD:'playwright',STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS:'1200000',STUDIO_QA_UPLOAD_BUDGET_MS:'300000',STUDIO_QA_TIMELINE_HEIGHT:'430',STUDIO_QA_HIDE_MEDIA:'1'});
const h=require('../../scripts/creative-templates/studio-proof'),q=require('../../test/e2e/playwright/studio-stability/run');const {pause,seek,range}=require('../../scripts/studio-professional/kinetic-type-proof');const {hash}=require('../../src/creativeTemplates/contract');
Object.assign(process.env,{STUDIO_QA_EXPECTED_WIDTH:'720',STUDIO_QA_EXPECTED_HEIGHT:'1280'});
const title='Reading beat / coffee motion lesson / 20261028 / r4';const stateFile=path.join(folder,'working-session.private.json');
const write=(name,data)=>fs.writeFileSync(path.join(folder,name),JSON.stringify(data,null,2)+'\n',{mode:0o600});
async function entry(page){await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click({timeout:90000});assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));}
async function open(page){const backupFile=path.join(folder,'READING-BEAT.autopromote.json');if(fs.existsSync(backupFile)&&process.argv[2]!=='checkpoint'){await page.getByLabel('Restore project backup',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="Restore project backup"]')?.disabled===false);await page.getByLabel('Restore project backup',{exact:true}).setInputFiles(backupFile);await page.waitForTimeout(1000);}await page.getByRole('region',{name:'Saved Studio projects',exact:true}).getByRole('button',{name:title,exact:true}).click();await h.rail(page);await pause(page);}
async function backup(page){const include=page.getByLabel('Include saved versions in backup',{exact:true});if(await include.count()&&await include.isChecked())await include.uncheck();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();await(await pending).saveAs(path.join(folder,'READING-BEAT.autopromote.json'));}
async function titleLayer(page,text,y,size,wait){await q.tool(page,'Graphics');await seek(page,.2);await page.locator('[aria-label="Add title layer"]').getByRole('button',{name:/Headline/}).click();await page.getByLabel('Title text',{exact:true}).fill(text);for(const [label,v]of [['Title start time',.2],['Title duration',10.8]]){await page.getByLabel(label,{exact:true}).fill(String(v));await page.getByLabel(label,{exact:true}).blur();}await page.getByRole('button',{name:'Center',exact:true}).last().click();await range(page.getByLabel('Title text box width',{exact:true}),68);await range(page.getByLabel('Title size',{exact:true}),size);await page.getByLabel('Title text color',{exact:true}).fill('#F7E8CC');await range(page.getByLabel('Title outline width',{exact:true}),0);await page.getByTestId('title-editor').locator('select').filter({has:page.locator('option[value=strong]')}).selectOption('none');
const current=await h.save(page,'new-title-'+text.toLowerCase());const layer=current.snapshot.overlays.find(l=>l.type==='text'&&l.text===text);assert(layer);await q.tool(page,'Motion');await page.getByRole('button',{name:'Transform keyframes',exact:true}).click();await page.getByLabel('Target layer',{exact:true}).selectOption(layer.id);for(const[label,v]of [['X',48],['Y',y]]){const input=page.getByRole('spinbutton',{name:label,exact:true});await input.fill(String(v));await input.blur();}
await q.tool(page,'Graphics');await page.getByLabel('Kinetic movement',{exact:true}).selectOption('rise');await page.getByLabel('Kinetic unit',{exact:true}).selectOption('letter');await page.getByLabel('Kinetic order',{exact:true}).selectOption('forward');for(const[label,v]of [['Kinetic stagger (s)',.065],['Kinetic entrance (s)',.5],['Kinetic travel (%)',7]])await page.getByLabel(label,{exact:true}).fill(String(v));await seek(page,wait);await page.getByRole('button',{name:'Build editable text motion',exact:true}).click();await page.waitForTimeout(300);return layer.id;}
async function polish(page){await entry(page);await open(page);const before=await h.save(page,'before-polish');const texts=before.snapshot.overlays.filter(l=>l.type==='text');
for(let i=0;i<texts.length;i++){await q.tool(page,'Graphics');await page.locator('.title-layer-list button').nth(i).click();await range(page.getByLabel('Title outline width',{exact:true}),0);await page.getByTestId('title-editor').locator('select').filter({has:page.locator('option[value=strong]')}).selectOption('none');if(i>=4){await range(page.getByLabel('Title size',{exact:true}),1.1);await q.tool(page,'Motion');await page.getByRole('button',{name:'Transform keyframes',exact:true}).click();await page.getByLabel('Target layer',{exact:true}).selectOption(texts[i].id);const x=page.getByRole('spinbutton',{name:'X',exact:true});await x.fill(String(48+(texts[i].x-48)*.78));await x.blur();}}
await q.tool(page,'Export');await seek(page,2.5);await page.getByTestId('hook-preview-frame').click({position:{x:4,y:4}});await page.keyboard.press('Escape');const after=await h.save(page,'polished');await backup(page);await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'polished-native-result.png')});write('polished.json',{projectId:after.id,canonicalHash:hash(after.snapshot.studioDocument),nativeStyleEdits:texts.length,criticalTextNarrowed:true});}
async function teach(page, alreadyOpen=false) {
  if(!alreadyOpen){await entry(page);await open(page);}
  await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
  await page.getByLabel('Project name',{exact:true}).fill(title+' / narrated how-to r2');
  await q.tool(page,'Graphics');
  while(await page.locator('.title-layer-list button').count()) {
    await page.locator('.title-layer-list button').first().click();
    await page.getByTestId('title-editor').getByRole('button',{name:'Remove',exact:true}).click();
  }
  await titleLayer(page,'MORNINGS.',59,1.1,.3);
  await seek(page,2.5); await q.tool(page,'Graphics');
  const before=await h.save(page,'teaching-clean');
  const stopCapture=await require('../../scripts/studio-professional/kinetic-type-proof').recording(page);
  const captureStart=Date.now(), clips=[];
  async function stamp(id,seconds,fn) {
    const from=Date.now(); await fn();
    await page.waitForTimeout(Math.max(800,seconds*1000-(Date.now()-from)));
    const image=path.join(folder,'how-'+id+'-r2.png');await page.screenshot({path:image});
    clips.push({id,startSeconds:(from-captureStart)/1000,endSeconds:(Date.now()-captureStart)/1000,image});
  }
  await stamp('title',8,async()=>{
    await page.locator('[aria-label="Add title layer"]').getByRole('button',{name:/Headline/}).click();
    const input=page.getByLabel('Title text',{exact:true});await input.fill('');await input.pressSequentially('SLOW',{delay:240});await input.blur();
    await page.waitForTimeout(700);
    await page.getByLabel('Title text color',{exact:true}).fill('#F7E8CC');
    await range(page.getByLabel('Title outline width',{exact:true}),0);
    await page.getByTestId('title-editor').locator('select').filter({has:page.locator('option[value=strong]')}).selectOption('none');
    await page.getByRole('button',{name:'Center',exact:true}).last().click();
    await range(page.getByLabel('Title size',{exact:true}),2);
    await range(page.getByLabel('Title text box width',{exact:true}),68);
    for(const[label,v]of[['Title start time',.2],['Title duration',10.8]]){await page.getByLabel(label,{exact:true}).fill(String(v));await page.getByLabel(label,{exact:true}).blur();}
    await page.getByLabel('Title text',{exact:true}).scrollIntoViewIfNeeded();
  });
  const record=await h.save(page,'teaching-title-r2'),layer=record.snapshot.overlays.find(l=>l.text==='SLOW');assert(layer);
  await stamp('position',9,async()=>{
    await q.tool(page,'Motion');await page.getByRole('button',{name:'Transform keyframes',exact:true}).click();
    await page.getByLabel('Target layer',{exact:true}).selectOption(layer.id);
    for(const[label,v]of[['X',48],['Y',23]]){const input=page.getByRole('spinbutton',{name:label,exact:true});await input.fill(String(v));await input.blur();await page.waitForTimeout(1000);}
    await seek(page,2.5);await page.getByRole('spinbutton',{name:'Y',exact:true}).scrollIntoViewIfNeeded();
  });
  await stamp('kinetic',9,async()=>{
    await q.tool(page,'Graphics');await page.getByLabel('Kinetic movement',{exact:true}).selectOption('rise');await page.waitForTimeout(800);
    await page.getByLabel('Kinetic unit',{exact:true}).selectOption('letter');await page.waitForTimeout(800);
    for(const[label,v]of[['Kinetic entrance (s)',.5],['Kinetic stagger (s)',.065],['Kinetic travel (%)',7]]){await page.getByLabel(label,{exact:true}).fill(String(v));await page.getByLabel(label,{exact:true}).blur();await page.waitForTimeout(800);}
    await page.getByLabel('Kinetic entrance (s)',{exact:true}).scrollIntoViewIfNeeded();
  });
  await stamp('build',8,async()=>{
    await page.getByRole('button',{name:'Build editable text motion',exact:true}).click();await page.waitForTimeout(1500);
    const timeline=page.getByTestId('studio-pro-timeline');await timeline.getByRole('button',{name:'Fit entire timeline',exact:true}).click();
    await seek(page,0);await page.getByRole('button',{name:'Play comparison',exact:true}).click();await page.waitForTimeout(3500);await pause(page);
  });
  await stamp('hold',8,async()=>{
    await q.tool(page,'Graphics');await page.locator('.title-layer-list button').first().click();
    await page.getByLabel('Title duration',{exact:true}).scrollIntoViewIfNeeded();await page.waitForTimeout(2000);
    await seek(page,8);await page.waitForTimeout(2500);await seek(page,2.5);
  });
  await h.save(page,'teaching-recorded-r2');const include=page.getByLabel('Include saved versions in backup',{exact:true});if(await include.isChecked())await include.uncheck();const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Download project backup',exact:true}).click();await(await dl).saveAs(path.join(folder,'TEACHING-r4.autopromote.json'));
  write('teaching-recording-r2.json',{wallClockStart:captureStart,clips,nativeActions:true,graphInjection:false,projectId:before.id});
  await stopCapture();
}
async function prepare(page){await entry(page);const saved=page.getByRole('region',{name:'Saved Studio projects',exact:true});if(await saved.getByRole('button',{name:title,exact:true}).count()){await open(page);return;}
const input=page.locator('.viral-studio-entry-panel input[type=file][accept="video/*"]');await input.setInputFiles(path.join(folder,'blank-stage-r4.mp4'));await page.getByRole('button',{name:'Open Creator Studio',exact:true}).click({timeout:120000});await h.rail(page);await pause(page);await page.getByLabel('Project name',{exact:true}).fill(title);await q.tool(page,'Reframe');await page.getByTestId('reframe-aspect-9-16').click();await page.getByTestId('reframe-preserve-frame').click();await q.tool(page,'Sound');const repair=page.getByLabel('Use voice repair on export',{exact:true});if(await repair.isChecked())await repair.uncheck();await q.tool(page,'Graphics');const panel=page.getByTestId('studio-graphics-import');if(!await panel.evaluate(e=>e.open))await panel.locator('summary').click();await page.getByLabel('Graphics composition file',{exact:true}).setInputFiles(path.join(folder,'poster-v3.graphics.json'));await panel.getByRole('status').waitFor();assert((await panel.getByRole('status').innerText()).includes('imported.'),await panel.innerText());
await titleLayer(page,'SLOW',23,2,.2);await titleLayer(page,'MORNINGS.',59,1.1,.3);await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid=hook-preview-frame] img')].every(i=>i.complete&&i.naturalWidth>0));await q.tool(page,'Export');await page.getByLabel('Export frame rate',{exact:true}).selectOption('24');await seek(page,2.5);const record=await h.save(page,'prepared');await backup(page);await page.getByTestId('hook-preview-frame').screenshot({path:path.join(folder,'native-result.png')});write('prepared.json',{projectId:record.id,canonicalHash:hash(record.snapshot.studioDocument),nativeActions:true,graphInjection:false,keys:record.snapshot.motionKeyframes.length,layers:record.snapshot.overlays.length});}
(async()=>{const b=await chromium.launch({headless:true,args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.35','--no-proxy-server','--disable-quic','--disable-http2']});const c=await b.newContext({storageState:(()=>{const saved=JSON.parse(fs.readFileSync(fs.existsSync(stateFile)?stateFile:'/home/tibule12/.local/share/autopromote-qa/session/studio-session.private.json'));return{...saved,origins:saved.origins.map(o=>({...o,indexedDB:(o.indexedDB||[]).filter(d=>process.argv[2]==='checkpoint'||d.name!=='autopromote-viral-studio')}))};})(),viewport:{width:1600,height:1100},acceptDownloads:true,recordVideo:{dir:path.join(folder,'raw-native-editing'),size:{width:1600,height:1100}}});const p=await c.newPage();p.setDefaultTimeout(45000);p.on('dialog',d=>d.accept());try{if(process.argv[2]==='rebuild'){await prepare(p);await teach(p,true);const saved=p.locator('details.studio-saved-projects');if(!await saved.evaluate(e=>e.open))await saved.locator('summary').click();await saved.getByRole('button',{name:new RegExp('^'+title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).first().click();await h.rail(p);await h.render(p,'result-r4');await backup(p);}else if(process.argv[2]==='checkpoint'){await entry(p);await open(p);await backup(p);await h.save(p,'result-r3');}else if(process.argv[2]==='prepare'){await prepare(p);await h.render(p,'result-r3');await backup(p);}else if(process.argv[2]==='polish')await polish(p);else if(process.argv[2]==='teach')await teach(p);else{await entry(p);await open(p);if(process.argv[2]==='render'){assert(!fs.existsSync(path.join(folder,'result/native-render-completed.json')),'Recover accepted export; no second submission');await h.render(p,'result');}else if(process.argv[2]==='view'){await require('../../scripts/creative-templates/materials-editing-proof').view(p,'result-r3');}else throw Error('Unknown phase');}write('working-session.private.json',await c.storageState({indexedDB:true}));console.log('Native phase complete:',process.argv[2]);}catch(e){write('failure-'+Date.now()+'.json',{phase:process.argv[2],error:e.message});await p.screenshot({path:path.join(folder,'failure-'+Date.now()+'.png')}).catch(()=>{});write('working-session.private.json',await c.storageState({indexedDB:true}));throw e;}finally{await c.close();await b.close()}})().catch(e=>{console.error(e.stack);process.exitCode=1});
