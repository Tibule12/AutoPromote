// Normal isolated App controls only. No graph/session/response injection.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const directory=process.argv[2],root=path.resolve(__dirname,'../..');
const config=JSON.parse(fs.readFileSync(path.join(directory,'browser-private.json')));
const runtime=JSON.parse(fs.readFileSync(path.join(directory,'config.json')));
assert.equal(runtime.env.GCLOUD_PROJECT,'demo-autopromote-credits');
assert.equal(new URL(config.origin).hostname,'127.0.0.1');
const proof=path.join(directory,'all-cut-tools-proof');fs.mkdirSync(proof,{recursive:true,mode:0o700});
const {seek}=require(path.join(root,'test/e2e/playwright/studio-stability/flows'));
const {clickStudioControl}=require(path.join(root,'test/e2e/playwright/studio-timeline-layout'));
const title='All cut tools — native source editing';
const result={steps:[],browserErrors:[]};
const log=(name,details)=>{result.steps.push({name,...details});fs.writeFileSync(path.join(proof,'progress.json'),JSON.stringify(result,null,2));console.log(name)};
const range=s=>s.timeline.map(c=>[c.startRequest,c.endRequest]);
const near=(a,b)=>assert(Math.abs(a-b)<=1/24+.0001,`${a} differs from ${b}`);
async function rail(p){
  await p.getByTestId('studio-pro-timeline').waitFor({timeout:90000});
  const show=p.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();
  const head=p.locator('.studio-project-rail__head');if(!await head.evaluate(e=>e.open))await head.locator(':scope > summary').click();
}
async function save(p,name){
  await rail(p);await p.getByTestId('studio-save-project').click();
  const versions=p.getByLabel('Include saved versions in backup',{exact:true});if(await versions.isChecked())await versions.uncheck();
  const download=p.waitForEvent('download');await p.getByRole('button',{name:'Download project backup',exact:true}).click();
  const file=path.join(proof,name+'.autopromote.json');await(await download).saveAs(file);
  return JSON.parse(fs.readFileSync(file)).snapshot;
}
async function tool(p,name){await p.getByRole('button',{name:name+' tool',exact:true}).click();}
async function creative(p,name){await clickStudioControl(p,p.getByRole('navigation',{name:'Creative tools'}).getByRole('button',{name,exact:true}));}
async function drag(p,s,index,edge,delta){
  const clip=s.timeline[index],total=s.timeline.reduce((sum,c)=>sum+c.endRequest-c.startRequest,0);
  const lane=await p.locator('[data-testid="pro-track-row-video"] .pro-track-lane').boundingBox();
  const target=edge?p.getByTestId(`source-trim-${edge}-${clip.id}`):p.getByTestId(`pro-video-clip-${index+1}`).locator('.pro-sequence-body');
  await target.scrollIntoViewIfNeeded();const box=await target.boundingBox();
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+lane.width*delta/total,y,{steps:8});await p.mouse.up();
}
async function undo(p){await p.getByTestId('studio-undo-button').click();}
async function pause(p){const button=p.getByRole('button',{name:'Pause comparison',exact:true});if(await button.isVisible())await button.click();}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--mute-audio']});
 const context=await browser.newContext({viewport:{width:1600,height:1000},recordVideo:{dir:path.join(proof,'recordings')}});
 await context.route('**/*',route=>{const url=new URL(route.request().url());return url.hostname==='127.0.0.1'||['data:','blob:'].includes(url.protocol)?route.continue():route.abort()});
 const p=await context.newPage();p.setDefaultTimeout(30000);p.on('dialog',d=>d.accept());p.on('pageerror',e=>result.browserErrors.push(e.message));
 try{
  await p.goto(config.origin);await p.getByRole('button',{name:'Sign In',exact:true}).click();
  await p.locator('#login-email').fill(config.email);await p.locator('#login-password').fill(config.password);
  await p.locator('form input[type=checkbox]').check();await p.locator('form button[type=submit]').click();
  await p.getByTestId('shared-credit-balance').waitFor();
  await p.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();
  await p.locator('.creator-studio-dropzone input[type=file]').setInputFiles(path.join(directory,'source.mp4'));
  await p.getByRole('button',{name:'Open Creator Studio',exact:true}).click();
  await rail(p);await p.getByLabel('Project name',{exact:true}).fill(title);await pause(p);
  await creative(p,'Reframe');await p.getByTestId('reframe-aspect-16-9').click();await p.getByTestId('reframe-preserve-frame').click();
  const frame=p.getByLabel('Rounded main footage',{exact:true});if(await frame.count()&&await frame.isChecked())await frame.uncheck();
  await creative(p,'Sound');await p.getByLabel('Use voice repair on export',{exact:true}).uncheck();
  await creative(p,'Export');await p.getByLabel('Export frame rate',{exact:true}).selectOption('24');
  await creative(p,'Cut');
  for(const at of [4,8,12]){await seek(p,at);await p.getByTestId('pro-quick-split').click();}
  let s=await save(p,'four-source-occurrences');assert.equal(s.timeline.length,4);log('Split four source occurrences',{ranges:range(s)});
  const snap=p.getByRole('button',{name:/^⌁ Snap$/});if((await snap.getAttribute('class')).includes('is-on'))await snap.click();
  const ripple=p.getByRole('button',{name:/Ripple layers/});if(!(await ripple.getAttribute('class')).includes('is-on'))await ripple.click();
  await tool(p,'Slip');await drag(p,s,1,null,.5);let changed=await save(p,'slip-drag');near(changed.timeline[1].startRequest,s.timeline[1].startRequest+.5);
  near(changed.timeline[1].endRequest,s.timeline[1].endRequest+.5);log('Slip drag',{ranges:range(changed)});
  await undo(p);s=await save(p,'slip-undo');near(s.timeline[1].startRequest,4);
  await tool(p,'Roll');await drag(p,s,1,'end',.5);changed=await save(p,'roll-drag');near(changed.timeline[1].endRequest,8.5);near(changed.timeline[2].startRequest,8.5);
  log('Roll drag',{ranges:range(changed)});await undo(p);s=await save(p,'roll-undo');
  await tool(p,'Slide');await drag(p,s,1,null,.5);changed=await save(p,'slide-drag');near(changed.timeline[0].endRequest,4.5);near(changed.timeline[1].startRequest,4);near(changed.timeline[2].startRequest,8.5);
  assert.deepEqual(changed.timeline.map(c=>c.id),s.timeline.map(c=>c.id));log('Slide preserves middle clip and adjusts neighbors',{ranges:range(changed)});
  await undo(p);s=await save(p,'slide-undo');
  await tool(p,'Ripple');await drag(p,s,1,'end',-.5);changed=await save(p,'ripple-drag');near(changed.timeline[1].endRequest,7.5);log('Ripple source edge',{ranges:range(changed)});
  await undo(p);s=await save(p,'ripple-undo');
  await p.getByLabel('Timeline zoom',{exact:true}).fill('4');await tool(p,'Hand');
  const scroll=p.locator('.pro-timeline-scroll'),before=await scroll.evaluate(e=>e.scrollLeft);
  const area=await scroll.boundingBox();await p.mouse.move(area.x+500,area.y+100);await p.mouse.down();await p.mouse.move(area.x+300,area.y+100,{steps:8});await p.mouse.up();
  assert(await scroll.evaluate(e=>e.scrollLeft)>before);log('Hand pans real zoomed timeline');
  await p.getByRole('button',{name:'Fit entire timeline',exact:true}).click();await tool(p,'Select');
  await seek(p,5);await creative(p,'Cut');await p.locator('.precision-edit-details > summary').click();
  await p.getByLabel('Precision edit nudge',{exact:true}).selectOption('0.25');
  await p.getByRole('button',{name:'slip later',exact:true}).click();changed=await save(p,'slip-button');near(changed.timeline[1].startRequest,4.25);
  await undo(p);await p.getByRole('button',{name:'roll later',exact:true}).click();changed=await save(p,'roll-button');near(changed.timeline[1].endRequest,8.25);
  await undo(p);await p.getByRole('button',{name:'slide later',exact:true}).click();changed=await save(p,'slide-button');near(changed.timeline[0].endRequest,4.25);
  await undo(p);await p.getByRole('button',{name:'ripple earlier',exact:true}).click();changed=await save(p,'ripple-button');near(changed.timeline[1].endRequest,7.75);
  await undo(p);log('Advanced Ripple Roll Slip Slide buttons');
  await p.getByRole('button',{name:'jcut earlier',exact:true}).click();changed=await save(p,'jcut-button');near(changed.timeline[1].audioTrimOffsetStart,-.25);
  await p.getByRole('button',{name:'lcut later',exact:true}).click();changed=await save(p,'lcut-button');near(changed.timeline[1].audioTrimOffsetEnd,.25);
  log('J/L buttons use rendered audio fields');await undo(p);await undo(p);
  const link=p.getByRole('checkbox',{name:/Link source video and audio/});await link.uncheck();
  await tool(p,'Slip');s=await save(p,'before-unlinked');await drag(p,s,1,null,.5);changed=await save(p,'unlinked-slip');
  assert(changed.timeline[1].audioDetached);near(changed.timeline[1].audioSourceStart,4);near(changed.timeline[1].audioProgrammeStart,4);near(changed.timeline[1].startRequest,4.5);
  log('Unlinked picture slip preserves independent audio',{ranges:range(changed)});await undo(p);await link.check();
  await tool(p,'Roll');s=await save(p,'final-roll-before');await drag(p,s,1,'end',.5);s=await save(p,'final-roll');
  await tool(p,'Slide');await drag(p,s,1,null,.5);s=await save(p,'final-slide');
  await tool(p,'Slip');await drag(p,s,1,null,.5);s=await save(p,'final-slip');
  await tool(p,'Ripple');await drag(p,s,1,'end',-1);s=await save(p,'final-ripple');
  await seek(p,5);await p.getByRole('button',{name:'jcut earlier',exact:true}).click();await p.getByRole('button',{name:'lcut later',exact:true}).click();
  s=await save(p,'final-source-edit');log('Final combined editable project',{ranges:range(s),audio:s.timeline.map(c=>[c.audioTrimOffsetStart||0,c.audioTrimOffsetEnd||0])});
  await p.reload();await p.getByTestId('shared-credit-balance').waitFor();await p.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();
  await p.getByRole('button',{name:title,exact:true}).click();const reopened=await save(p,'cold-reopened');assert.deepEqual(range(reopened),range(s));
  assert.deepEqual(reopened.timeline.map(c=>[c.audioTrimOffsetStart,c.audioTrimOffsetEnd]),s.timeline.map(c=>[c.audioTrimOffsetStart,c.audioTrimOffsetEnd]));
  log('Cold reopen preserves all edit ranges and audio decisions');
  await creative(p,'Export');const dismiss=p.getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.count())await dismiss.click();
  await p.getByRole('button',{name:/^(Render Final Clip|Render Again)$/}).click();
  const consent=p.getByRole('dialog',{name:'Studio export',exact:true});await consent.waitFor();await consent.getByRole('button',{name:/^Approve /}).click();
  const downloadButton=p.getByRole('button',{name:'Download Rendered Clip',exact:true});await downloadButton.waitFor({timeout:180000});
  const download=p.waitForEvent('download');await downloadButton.click();await(await download).saveAs(path.join(proof,'all-tools-final.mp4'));
  log('Actual canonical CPU export and owned download');
  await seek(p,0);const play=p.getByRole('button',{name:'Play edited preview',exact:true});if(await play.count())await play.click();
  const seconds=reopened.timeline.reduce((sum,c)=>sum+c.endRequest-c.startRequest,0);await p.waitForTimeout((seconds+1)*1000);await pause(p);
  await p.screenshot({path:path.join(proof,'finished-timeline.png')});log('Complete matching Studio playback recorded',{seconds});
  assert.deepEqual(result.browserErrors,[]);result.status='PASS';
 }catch(error){result.failure=error.message;await p.screenshot({path:path.join(proof,'failure.png')}).catch(()=>{});throw error;}
 finally{fs.writeFileSync(path.join(proof,'results.json'),JSON.stringify(result,null,2));await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
