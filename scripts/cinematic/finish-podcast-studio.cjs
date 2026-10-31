#!/usr/bin/env node
// Native project authoring, export, exact recovery, movie download and playback.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const {chromium}=require("playwright");
const ROOT=path.resolve(__dirname,"../.."),report=path.join(ROOT,"reports/unmuted-comeback-20261031"),base="http://127.0.0.1:6341";
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
async function command(page,name){await page.keyboard.press("Control+k");await page.getByPlaceholder("Find a tool, effect or workflow…").fill(name);await page.getByRole("button",{name:new RegExp(name)}).click();}
async function project(page,id){return page.evaluate(async id=>{
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open("autopromote-viral-studio",1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 return new Promise((resolve,reject)=>{const r=db.transaction("projects").objectStore("projects").get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});},id);}
async function save(page,id){await command(page,"Save project checkpoint");await page.waitForTimeout(1400);return project(page,id);}
async function main(){
 const context=await chromium.launchPersistentContext(path.join(report,"private-local/native-browser"),{headless:true,args:["--mute-audio"],viewport:{width:1680,height:1050},acceptDownloads:true,recordVideo:{dir:path.join(report,"review/native-recordings"),size:{width:1680,height:1050}}});
 const page=context.pages()[0];page.setDefaultTimeout(20000);const external=[],errors=[],results=[];
 await context.route("**/*",route=>{const u=new URL(route.request().url());if(["http:","https:"].includes(u.protocol)&&u.origin!==base){external.push(u.origin);return route.abort();}return route.continue();});
 page.on("pageerror",error=>errors.push(error.message));
 let video;
 try{
  await page.goto(base);video=page.video();
  const inputs=["portrait","landscape"].map(format=>JSON.parse(fs.readFileSync(path.join(report,`private-local/${format}-project.json`))));
  await page.evaluate(async projects=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open("autopromote-viral-studio",1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   await new Promise((resolve,reject)=>{const tx=db.transaction("projects","readwrite");for(const p of projects)tx.objectStore("projects").put(p);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});},inputs);
  for(const format of ["portrait","landscape"]){
   const id=`unmuted-comeback-${format}-20261031`,url=base+`/?project=${id}&offlineWorker=true`;
   await page.goto(url);await page.getByRole("button",{name:"After",exact:true}).click();
   let pause=page.getByRole("button",{name:"Pause edited preview",exact:true});if(await pause.count())await pause.click();
   await page.getByRole("button",{name:"Motion",exact:true}).click();await page.getByRole("button",{name:"Transform keyframes",exact:true}).click();
   await page.getByLabel("Target layer",{exact:true}).selectOption("guest-welcome");
   await page.getByLabel("Y",{exact:true}).fill("72");await page.getByLabel("Y",{exact:true}).press("Tab");
   await page.getByLabel("Target layer",{exact:true}).selectOption("show-identity");
   await page.getByLabel("X",{exact:true}).fill(format==="portrait"?"20":"12");await page.getByLabel("X",{exact:true}).press("Tab");
   const saved=await save(page,id);assert.equal(saved.snapshot.overlays.find(l=>l.id==="guest-welcome").y,72);
   fs.writeFileSync(path.join(report,`review/${format}-editable-project.json`),JSON.stringify(saved,null,2));
   await page.reload();await page.getByRole("button",{name:"Motion",exact:true}).waitFor();
   const reopened=await project(page,id);assert.deepEqual(reopened.snapshot.studioDocument,saved.snapshot.studioDocument);
   await page.getByRole("button",{name:"Export",exact:true}).click();
   const event=page.waitForResponse(r=>r.url()===base+"/api/cinematic/offline-programmes"&&r.request().method()==="POST",{timeout:30000});
   await page.getByRole("button",{name:"Render Final Clip",exact:true}).click();
   const response=await event;let job=await response.json();assert(response.ok(),JSON.stringify(job));
   console.log(format,"native full Studio worker job",job.id);
   const deadline=Date.now()+600000;
   while(!["completed","failed","cancelled"].includes(job.status)){
    if(Date.now()>deadline)throw Error("Bounded local render deadline exceeded");await page.waitForTimeout(1000);
    job=await page.evaluate(async id=>(await fetch(`/api/cinematic/jobs/${id}`)).json(),job.id);
   }
   assert.equal(job.status,"completed",job.error);assert(Math.abs(job.receipt.duration-824/30)<.05);
   console.log(format,"completed verified worker output",job.outputSha256);
   await page.getByRole("button",{name:"Export",exact:true}).click();
   await page.waitForTimeout(1200);
   fs.writeFileSync(path.join(report,`private-local/${format}-post-render-screen.txt`),await page.locator("body").innerText());
   await page.getByRole("button",{name:"Download Rendered Clip",exact:true}).waitFor();
   const downloadEvent=page.waitForEvent("download");await page.getByRole("button",{name:"Download Rendered Clip",exact:true}).click();
   const download=await downloadEvent,target=path.join(report,`review/Unmuted - We Are Back - ${format}.mp4`);await download.saveAs(target);assert.equal(hash(fs.readFileSync(target)),job.outputSha256);
   const movie=page.getByTestId("studio-after-video");await movie.waitFor();await page.waitForFunction(url=>document.querySelector('[data-testid="studio-after-video"]')?.src.endsWith(url),job.movieUrl);
   pause=page.getByRole("button",{name:"Pause edited preview",exact:true});if(await pause.count())await pause.click();
   await page.getByLabel("Edited output position",{exact:true}).fill("0");await page.getByRole("button",{name:"Play edited preview",exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('[data-testid="studio-after-video"]')?.currentTime>27.4,null,{timeout:40000});
   pause=page.getByRole("button",{name:"Pause edited preview",exact:true});if(await pause.count())await pause.click();
   for(const [label,t]of [["opening",.4],["conversation",5.3],["guest",27.1]]){
    await page.getByLabel("Edited output position",{exact:true}).fill(String(t));await page.waitForTimeout(800);
    await page.screenshot({path:path.join(report,`review/${format}-native-${label}.png`)});
    await movie.screenshot({path:path.join(report,`review/${format}-picture-${label}.png`)});
   }
   fs.writeFileSync(path.join(report,`review/${format}-native-render.json`),JSON.stringify(job,null,2));results.push({format,jobId:job.id,sha256:job.outputSha256,coldReopen:true,nativeTitleReposition:true,completePlayback:true,nativeDownload:true});
  }
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(report,"review/native-verification.json"),JSON.stringify({headless:true,muted:true,actualEditor:"frontend/src/components/ViralClipStudio.js",renderer:"ordinary production Studio worker with denied external I/O",external,browserErrors:errors,results},null,2));
  console.log("Both real native Studio exports, downloads, title revisions, exact recovery and complete playback passed");
 }catch(error){fs.writeFileSync(path.join(report,"private-local/native-failure-screen.txt"),await page.locator("body").innerText());await page.screenshot({path:path.join(report,`review/native-failure-${Date.now()}.png`)}).catch(()=>{});throw error;}
 finally{const file=video&&await video.path();await context.close();if(file)fs.copyFileSync(file,path.join(report,"review/Authoring and Full Studio Playback.webm"));}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
