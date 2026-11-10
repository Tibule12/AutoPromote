// Actual existing Composite controls, source-bound 3s window, loopback only.
// No auth/session simulation and no cloud job submission.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=__dirname,repo=path.resolve(root,'../../..'),base='http://127.0.0.1:6345';
const kernel=require(path.join(repo,'src/generated/studioDirectorReplayKernel.cjs'));
const project=JSON.parse(fs.readFileSync(path.join(root,'../review/Editable Studio Project.json')));
project.id='unmuted-native-composite-shot-20261031';project.name='UNMUTED · native Composite source selection';
const s=project.snapshot;s.timeline=[{...s.timeline[1],id:'native-composite-source',startRequest:539/24,endRequest:611/24}];
s.threeDScenes=[];s.soundEffects=[];s.subjectVfxScenes=[];s.compositionOrder=[];s.activeTimelineIndex=0;
s.studioDocument=kernel.adaptStudioSnapshotToDocument({projectId:project.id,snapshot:s});
async function main(){
 const context=await chromium.launchPersistentContext(path.join(root,'private/native-control-browser'),{headless:true,args:['--mute-audio'],viewport:{width:1680,height:1050}});
 const page=context.pages()[0],external=[],errors=[];page.setDefaultTimeout(20000);
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(['http:','https:'].includes(u.protocol)&&u.origin!==base){external.push(u.origin);return r.abort();}if(u.pathname==='/review-project.json')return r.fulfill({json:project});return r.continue();});
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'/?project='+project.id);
  await page.getByRole('button',{name:'Composite',exact:true}).click();
  const source=page.getByLabel('Subject effect source clip',{exact:true});
  const value=await source.locator('option').nth(1).getAttribute('value');await source.selectOption(value);
  await page.getByRole('group',{name:'Background replacement',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Background choice',{exact:true}).count(),1);
  await page.getByLabel('Subject point X',{exact:true}).fill('.34');await page.getByLabel('Subject point Y',{exact:true}).fill('.45');
  await page.getByRole('button',{name:'Add first-frame point',exact:true}).click();
  await page.getByRole('button',{name:'Render subject preview',exact:true}).click();
  await page.getByText('Save or upload this source to your Studio project before rendering subject effects.',{exact:true}).waitFor();
  await page.screenshot({path:path.join(root,'frames/native-composite-controls.png')});
  const result={controlsPresent:true,sourceInterval:[539/24,611/24],sourceSelected:true,backgroundChoiceVisible:true,personPointAuthored:true,
   renderStarted:false,blocker:'Isolated engineering build has no owned Studio uploader/storage binding and disables Firebase authentication. Native render guard stops before dispatch.',
   noAuthBypass:true,cloudJobs:0,external,errors};assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(root,'native-composite-controls.json'),JSON.stringify(result,null,2));
 }finally{await context.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
