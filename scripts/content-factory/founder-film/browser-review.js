const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const {chromium}=require('playwright');const {BrowserOperator}=require('../../browser-agent/operator');
const root=path.resolve(process.argv[2]),base='http://127.0.0.1:3098',folder=path.join(root,'browser-review');
fs.mkdirSync(folder,{recursive:true});const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1024}});
 const names=[['hero','One Edit hero film','Download the hero film',53.75],['cutdown','One Edit cutdown','Download the cutdown',27],['teaser','One Edit teaser','Download the teaser',10]];
 const operator=new BrowserOperator({context,task:{goal:'Verify all three actual films and retain their exact bytes',startUrl:base+'/review.html',allowedOrigins:[base],success:[{type:'download',value:'autopromote-one-edit-teaser.mp4'}],allowedOperations:names.map(([id,,name])=>({id:'download-'+id,action:'click',role:'link',name}))},folder,planner:{},timeoutMs:15000,maxSteps:8});
 await operator.initialize();const page=operator.page;const errors=[];page.on('pageerror',e=>errors.push(e.message));const results=[];
 for(const [id,label,name,duration] of names){
  const locator=page.getByLabel(label,{exact:true});await locator.scrollIntoViewIfNeeded();await locator.evaluate(v=>{v.muted=true;v.load();});await locator.evaluate(v=>new Promise((resolve,reject)=>{if(v.readyState>=2)return resolve();v.addEventListener('loadeddata',resolve,{once:true});v.addEventListener('error',()=>reject(Error('Actual film could not load')),{once:true});}));
  await locator.evaluate(async v=>{await v.play()});await page.waitForFunction(label=>{const v=[...document.querySelectorAll('video')].find(x=>x.getAttribute('aria-label')===label);return v.currentTime>.25},label);
  const at=id==='hero'?37:id==='cutdown'?16:7;await locator.evaluate((v,at)=>{v.pause();v.currentTime=at},at);await page.waitForFunction(({label,at})=>{const v=[...document.querySelectorAll('video')].find(x=>x.getAttribute('aria-label')===label);return !v.seeking&&v.readyState>=2&&Math.abs(v.currentTime-at)<.15},{label,at});
  const playback=await locator.evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,at:v.currentTime,decodedFrames:v.getVideoPlaybackQuality().totalVideoFrames}));assert(Math.abs(playback.duration-duration)<.15);assert.equal(playback.width,1920);assert(playback.decodedFrames>0);
  await page.screenshot({path:path.join(folder,id+'-playback.png')});const observed=await operator.observe();const link=observed.snapshot.frames.flatMap(f=>f.controls).find(c=>c.role==='link'&&c.name===name);assert(link);
  assert.equal(await operator.execute({type:'click',target:link.ref,operationId:'download-'+id,reason:'Observed the matching film after actual playback and seeking; verify retained bytes.',expect:[{type:'download',value:'autopromote-one-edit-'+id+'.mp4'}]},observed),'verified');
  const download=operator.events.filter(e=>e.type==='download').at(-1);const artifact='outputs/final-v2/one-edit-'+id+'/final.mp4';const expected=sha(fs.readFileSync(path.join(root,artifact)));assert.equal(sha(fs.readFileSync(download.artifact)),expected);
  const range=await context.request.get(base+'/'+artifact,{headers:{Range:'bytes=0-1023'}});assert.equal(range.status(),206);assert.equal((await range.body()).length,1024);results.push({id,artifact,sha256:expected,playback,downloadBytes:download.bytes,rangeStatus:206});
 }
 for(const p of ['production-state.json','source-brief.txt','textures/quota-zero.png','assets/ident/scene.blend'])assert.equal((await context.request.get(base+'/'+p)).status(),404);
 assert.deepEqual(errors,[]);operator.memory.status='completed';operator.flush();fs.writeFileSync(path.join(folder,'receipt.json'),JSON.stringify({status:'PASS',results,errors,scope:'Real Chromium picture playback, seek, exact downloads, Range responses and private-file exclusions; no human sound or creative acceptance claimed.'},null,2));console.log(JSON.stringify({status:'PASS',films:results.length}));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
