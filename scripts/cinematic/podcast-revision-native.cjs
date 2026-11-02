#!/usr/bin/env node
// Actual editor authoring/export. Only the dedicated loopback host is allowed.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,"../.."),report=path.join(root,"reports/unmuted-cinematic-revision-20261031"),base="http://127.0.0.1:6345";
const projectFile=process.argv[2];
const mode=process.argv[3]||"scenes";
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function stored(page,id){return page.evaluate(async id=>{
 const db=await new Promise((r,j)=>{const q=indexedDB.open("autopromote-viral-studio",1);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});
 return new Promise((r,j)=>{const q=db.transaction("projects").objectStore("projects").get(id);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});},id);}
async function checkpoint(page,id){await page.keyboard.press("Control+k");await page.getByPlaceholder("Find a tool, effect or workflow…").fill("Save project checkpoint");await page.getByRole("button",{name:/Save project checkpoint/}).click();await delay(1400);return stored(page,id);}
async function main(){
 const input=JSON.parse(fs.readFileSync(projectFile));
 const context=await chromium.launchPersistentContext(path.join(report,"private-local/native-browser"),{headless:true,args:["--mute-audio"],viewport:{width:1680,height:1050},acceptDownloads:true,
  recordVideo:{dir:path.join(report,"private-local/authoring-recordings"),size:{width:1680,height:1050}}});
 const page=context.pages()[0];page.setDefaultTimeout(25000);const external=[],errors=[];
 await context.route("**/*",route=>{const u=new URL(route.request().url());if(["http:","https:"].includes(u.protocol)&&u.origin!==base){external.push(u.origin);return route.abort();}return route.continue();});
 page.on("pageerror",e=>errors.push(e.message));let recording;
 try{
  await page.goto(base);await page.getByRole("button",{name:"Motion",exact:true}).waitFor();
  await page.evaluate(async p=>{const db=await new Promise((r,j)=>{const q=indexedDB.open("autopromote-viral-studio",1);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});await new Promise((r,j)=>{const tx=db.transaction("projects","readwrite");tx.objectStore("projects").put(p);tx.oncomplete=r;tx.onerror=()=>j(tx.error);});},input);
  await page.goto(base+`/?project=${input.id}`);await page.getByRole("button",{name:"Motion",exact:true}).click();await page.getByRole("button",{name:"Cinematic scene",exact:true}).click();
  const initialPause=page.getByRole("button",{name:"Pause edited preview",exact:true});if(await initialPause.count())await initialPause.click();
  if(mode==="scenes"){
   for(const scene of input.snapshot.threeDScenes){
    if(scene.localExport?.jobId){
     const state=await(await fetch(base+`/api/cinematic/jobs/${scene.localExport.jobId}`)).json();
     assert.equal(state.status,"completed");assert.equal(state.outputSha256,scene.localExport.sha256);
     const manifest=await(await fetch(base+`/api/cinematic/jobs/${scene.localExport.jobId}/manifest.json`)).json();
     const {buildCinematicGraph}=require("../../frontend/src/components/threeD/cinematicContract");
     const current={...buildCinematicGraph(scene)},previous={...manifest.graph};delete current.programmeStart;delete previous.programmeStart;
     assert.deepEqual(current,previous);console.log("Reusing verified unchanged 3D shot",scene.id);continue;
    }
    await page.getByLabel("Cinematic scene",{exact:true}).selectOption(scene.id);
    // A real native parameter revision, then exact checkpoint/cold reopen.
    const original=scene.cinematic.camera.focalLength;
    await page.getByLabel("Focal length (mm)",{exact:true}).fill(String(original+1));await page.getByLabel("Focal length (mm)",{exact:true}).press("Tab");
    await page.getByLabel("Focal length (mm)",{exact:true}).fill(String(original));await page.getByLabel("Focal length (mm)",{exact:true}).press("Tab");
    const saved=await checkpoint(page,input.id);assert.equal(saved.snapshot.threeDScenes.find(s=>s.id===scene.id).cinematic.camera.focalLength,original);
    await page.reload();await page.getByRole("button",{name:"Motion",exact:true}).click();await page.getByRole("button",{name:"Cinematic scene",exact:true}).click();
    const reopened=await stored(page,input.id);assert.deepEqual(reopened.snapshot.studioDocument,saved.snapshot.studioDocument);
    await page.getByLabel("Cinematic scene",{exact:true}).selectOption(scene.id);
    const responsePromise=page.waitForResponse(r=>r.url()===base+"/api/cinematic/jobs"&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Render scene export · 720p",exact:true}).click();
    const response=await responsePromise;let job=await response.json();assert(response.ok(),JSON.stringify(job));console.log("Native scene export",scene.id,job.id);
    const deadline=Date.now()+3600000;
    while(!["completed","failed","cancelled"].includes(job.status)){
     if(Date.now()>deadline)throw Error("Scene export exceeded its bounded deadline");
     await delay(1000);job=await(await fetch(base+`/api/cinematic/jobs/${job.id}`)).json();
    }
    assert.equal(job.status,"completed",job.error);await page.getByRole("link",{name:"Download scene movie",exact:true}).waitFor();
    const savedExport=await checkpoint(page,input.id);fs.writeFileSync(path.join(report,`private-local/project-${scene.id}-rendered.json`),JSON.stringify(savedExport,null,2));
    fs.writeFileSync(path.join(report,`review/${scene.id}-render.json`),JSON.stringify(job,null,2));
   }
  }else{
   const responsePromise=page.waitForResponse(r=>r.url()===base+"/api/cinematic/programmes"&&r.request().method()==="POST");
   await page.getByRole("button",{name:"Render programme · 720p",exact:true}).click();const response=await responsePromise;let job=await response.json();assert(response.ok(),JSON.stringify(job));
   const deadline=Date.now()+600000;
   while(!["completed","failed","cancelled"].includes(job.status)){
    if(Date.now()>deadline)throw Error("Programme export exceeded its bounded deadline");await delay(1000);job=await(await fetch(base+`/api/cinematic/jobs/${job.id}`)).json();
   }
   assert.equal(job.status,"completed",job.error);
   await page.getByRole("link",{name:"Download rendered programme · 720p",exact:true}).waitFor();
   const downloadPromise=page.waitForEvent("download");await page.getByRole("link",{name:"Download rendered programme · 720p",exact:true}).click();
   const download=await downloadPromise;const target=path.join(report,"review/UNMUTED - Cinematic Set Revision.mp4");await download.saveAs(target);
   assert.equal(crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex"),job.outputSha256);
   const saved=await checkpoint(page,input.id);fs.writeFileSync(path.join(report,"review/Editable Studio Project.json"),JSON.stringify(saved,null,2));
   fs.writeFileSync(path.join(report,"review/programme-render.json"),JSON.stringify(job,null,2));
   await page.getByRole("button",{name:"After",exact:true}).click();
   await page.waitForFunction(url=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v?.src.endsWith(url)&&v.readyState>=2;},job.movieUrl);
   const pause=page.getByRole("button",{name:"Pause edited preview",exact:true});if(await pause.count())await pause.click();
   await page.getByLabel("Edited output position",{exact:true}).fill("0");await page.getByRole("button",{name:"Play edited preview",exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('[data-testid="studio-after-video"]')?.currentTime>16.2,null,{timeout:30000});
   await page.screenshot({path:path.join(report,"review/native-completed-timeline.png")});
  }
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(report,`review/native-${mode}-verification.json`),JSON.stringify({headless:true,muted:true,external,errors,projectId:input.id,mode,completed:true},null,2));
 }catch(error){await page.screenshot({path:path.join(report,`review/failure-${Date.now()}.png`)}).catch(()=>{});fs.writeFileSync(path.join(report,"private-local/last-error.txt"),error.stack);throw error;}
 finally{recording=await page.video()?.path();await context.close();if(recording)fs.copyFileSync(recording,path.join(report,`review/Actual Studio ${mode} ${Date.now()}.webm`));}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
