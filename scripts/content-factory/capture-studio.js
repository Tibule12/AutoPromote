#!/usr/bin/env node
// Capture the actual existing Studio. No generated UI, login or publication.
const fs=require('fs/promises'),path=require('path'),crypto=require('crypto'),{promisify}=require('util');
const execFile=promisify(require('child_process').execFile);
const {chromium}=require('playwright');
const {BrowserOperator}=require('../browser-agent/operator');
async function run(){
 const [url,projectName,out]=process.argv.slice(2),origin=new URL(url).origin;
 if(!['http://127.0.0.1:5008','http://localhost:5008','http://127.0.0.1:5009','http://localhost:5009'].includes(origin)||!projectName||!out)throw Error('Configured private Studio preview and project name required');
 await fs.mkdir(out,{recursive:true,mode:0o700});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const descriptor=await context.request.get(origin+'/content-factory-project.json').then(async response=>{
  if(!response.ok())throw Error('Private project descriptor is unavailable');return response.json();
 });
 if(descriptor.project.name!==projectName)throw Error('Configured project descriptor does not match the capture task');
  const expectedSource=descriptor.project.snapshot.timeline.at(-1).name;
  if(!expectedSource)throw Error('Capture project needs named source clips');
  async function waitForProgrammeFrame(clock){
   let elapsed=0,expected;
   for(const clip of descriptor.project.snapshot.timeline){
    if(clock<elapsed+clip.duration){expected={src:new URL(clip.url,origin).href,time:(clip.startRequest||0)+clock-elapsed};break;}
    elapsed+=clip.duration;
   }
   if(!expected)throw Error('Capture clock exceeds the actual assembly');
   await page.waitForFunction(({clock,expected})=>{
    const slider=document.querySelector('[aria-label="Edited output position"]');
    const video=document.querySelector('[data-testid="studio-after-video"]');
    return video?.paused&&!video.seeking&&video.readyState>=2&&video.currentSrc===expected.src&&
     Math.abs(video.currentTime-expected.time)<.041&&Math.abs(Number(slider?.value)-clock)<.026;
   },{clock,expected});
  }
 const operator=new BrowserOperator({context,planner:{},task:{goal:`Inspect and open the existing ${projectName} project for a raw UI capture`,startUrl:url,allowedOrigins:[origin],success:[{type:'text_visible',value:expectedSource}],allowedOperations:[]},folder:path.join(out,'browser-evidence')});
 try{
  await operator.initialize();
  async function action(name,tag,expect){
   const observation=await operator.observe();
   const candidates=observation.snapshot.frames.flatMap(f=>f.controls).filter(c=>(c.name===name||(name==='Open saved project'&&c.name.startsWith(name+' (')))&&(!tag||c.tag===tag)&&!c.disabled);
   if(candidates.length!==1)throw Error(`Expected one contextual ${name} control; found ${candidates.length}`);
   const result=await operator.execute({type:'click',target:candidates[0].ref,reason:`Open the observed ${name} control`,expect},observation);
   await operator.evidence('verified-ui-navigation',await operator.observe());return result;
  }
  // Inspect the current assembly first. The private fixture can already be
  // open; reopening it starts another load and can reset playback intent.
  const assemblyAlreadyOpen=await operator.verify([{type:'text_visible',value:expectedSource}],3000);
  if(!assemblyAlreadyOpen){
  await page.getByRole('button',{name:'Show media',exact:true}).waitFor();
  await action('Show media','button',[{type:'visible',role:'button',name:'Hide media'}]);
  await action(projectName,'summary',[{type:'state_changed'}]);
  await action('Open saved project','summary',[{type:'state_changed'}]);
  const library=await operator.observe();
  const cards=library.snapshot.frames.flatMap(f=>f.controls).filter(c=>c.tag==='button'&&c.name.startsWith(projectName+' ')&&!c.name.startsWith('Delete '));
  if(!cards.length)throw Error('Saved project card is missing');
  // The card includes a dynamic saved time. Choose the latest observed entry,
  // then verify the expected second source is present in the opened assembly.
  await operator.execute({type:'click',target:cards.at(-1).ref,reason:'Open the original source assembly from the observed project library',expect:[{type:'text_visible',value:expectedSource}]},library);
  await action('Hide media','button',[{type:'visible',role:'button',name:'Show media'}]);
  }
  await page.getByText('Loading edited preview…',{exact:true}).waitFor({state:'hidden',timeout:60000});
  // This is the application's existing semantic monitor identifier. CSS can
  // hide the native video while a compositor presents its decoded frame.
  await page.getByTestId('studio-after-video').evaluate(v=>new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Edited monitor has no decoded frame')),30000);
   const ready=()=>{if(v.readyState>=2&&v.videoWidth>0){clearTimeout(timer);resolve();return true;}return false;};
   if(!ready())v.addEventListener('loadeddata',ready,{once:true});
  }));
  const media=await page.evaluate(()=>[...document.querySelectorAll('video')].map(v=>({src:v.currentSrc,readyState:v.readyState,width:v.videoWidth,duration:v.duration})));
  if(errors.length)throw Error('Studio page error: '+errors.join('; '));
  if(await page.getByRole('button',{name:'Pause edited preview',exact:true}).isVisible())await action('Pause edited preview','button',[{type:'visible',role:'button',name:'Play edited preview'}]);
  await page.waitForFunction(()=>document.querySelector('[data-testid="studio-after-video"]')?.paused===true);
  await page.getByRole('slider',{name:'Edited output position',exact:true}).press('Home');
  await waitForProgrammeFrame(0);
  await page.getByText('Loading edited preview…',{exact:true}).waitFor({state:'hidden',timeout:30000});
  await page.screenshot({path:path.join(out,'poster.png')});
  // Scrub the native edited-output slider with keyboard controls. This shows
  // actual editable frames and avoids guessing that a play request succeeded.
  const slider=page.getByRole('slider',{name:'Edited output position',exact:true});
  for(let i=0;i<50;i++){
   const previous=Number(await slider.inputValue());await slider.press('ArrowRight');
   await waitForProgrammeFrame(previous+.05);
  }
  const startClock=Number(await slider.inputValue());
  if(startClock<2 || startClock>3)throw Error('Edited monitor did not follow the source scrub');
  // Actual screenshot frames preserve the product's visible state and motion.
  for(let i=0;i<72;i++){
   const previous=Number(await slider.inputValue());
   await slider.press('ArrowRight');
   await waitForProgrammeFrame(previous+.05);
   if(await page.getByText('Loading edited preview…',{exact:true}).isVisible()){
    await page.getByText('Loading edited preview…',{exact:true}).waitFor({state:'hidden',timeout:30000});
   }
   await page.screenshot({path:path.join(out,`frame_${String(i).padStart(4,'0')}.png`)});await page.waitForTimeout(42);
  }
  await execFile('ffmpeg',['-y','-v','error','-framerate','24','-i',path.join(out,'frame_%04d.png'),'-c:v','libx264','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,'video.mp4')]);
  const hash=crypto.createHash('sha256').update(await fs.readFile(path.join(out,'video.mp4'))).digest('hex');
  const record={status:'GENERATED_PENDING_REVIEW',model:'AutoPromote actual Studio browser capture',modelRevision:'studio-ui-capture-v2',tool:'Playwright and BrowserOperator observe-act-verify',origin:'actual_product_ui',settings:{url,projectName,viewport:{width:1440,height:900},fps:24,frames:72,interaction:'Native edited-output slider keyboard scrubbing',sourceClock:{start:startClock,end:Number(await slider.inputValue())}},sourceMedia:media,pageErrors:errors,artifact:{path:path.resolve(out,'video.mp4'),sha256:hash,duration:3},limitation:'Raw capture of the existing local Studio project; timed screenshot sampling compresses actual keyboard scrubbing. No public feature or customer outcome is implied.'};
  await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(record,null,2));console.log(JSON.stringify({event:'studio_ui_asset_ready',sha256:hash}));
 }catch(e){
  const state=await page.evaluate(()=>({media:[...document.querySelectorAll('video')].map(v=>({src:v.currentSrc,readyState:v.readyState,networkState:v.networkState,error:v.error?.message||null,paused:v.paused,time:v.currentTime,seeking:v.seeking})),slider:document.querySelector('[aria-label="Edited output position"]')?.value,loading:[...document.querySelectorAll('[role="status"]')].map(x=>x.textContent)})).catch(()=>null);
  await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await operator.evidence('capture-failed',await operator.observe()).catch(()=>{});
  await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({message:e.message,errors,url:page.url(),state},null,2));throw e;
 }
 finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1});
