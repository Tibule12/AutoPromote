#!/usr/bin/env node
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {chromium}=require("playwright"),{capture}=require("./record-podcast-with-audio.cjs");
const root=path.resolve(__dirname,"../.."),report=path.join(root,"reports/unmuted-cinematic-revision-20261031"),base="http://127.0.0.1:6345";
async function main(){
 const expected=JSON.parse(fs.readFileSync(path.join(report,"review/programme-render.json")));
 const context=await chromium.launchPersistentContext(path.join(report,"private-local/native-browser"),{headless:true,args:["--mute-audio"],viewport:{width:1680,height:1050}});
 const page=context.pages()[0],external=[],errors=[];page.setDefaultTimeout(25000);
 await context.route("**/*",r=>{const u=new URL(r.request().url());if(["http:","https:"].includes(u.protocol)&&u.origin!==base){external.push(u.origin);return r.abort();}return r.continue();});page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(base+"/?project=unmuted-cinematic-revision-20261031");
  await page.getByRole("button",{name:"Motion",exact:true}).click();await page.getByRole("button",{name:"Cinematic scene",exact:true}).click();
  const responsePromise=page.waitForResponse(r=>r.url()===base+"/api/cinematic/programmes"&&r.request().method()==="POST");
  await page.getByRole("button",{name:"Render programme · 720p",exact:true}).click();const response=await responsePromise;const job=await response.json();assert(response.ok(),JSON.stringify(job));assert.equal(job.id,expected.id);assert(job.reused,"Recording must reuse the completed native export");
  await page.getByRole("button",{name:"After",exact:true}).click();
  await page.waitForFunction(u=>{const v=document.querySelector('[data-testid="studio-after-video"]');return v?.src.endsWith(u)&&v.readyState>=2;},job.movieUrl);
  const pause=page.getByRole("button",{name:"Pause edited preview",exact:true});if(await pause.count())await pause.click();
  const result=await capture(page,"cinematic-revision",{report,endTime:391/24-.06});
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(report,"review/studio-sound-capture.json"),JSON.stringify({headless:true,deviceOutputMuted:true,actualMonitorAudioCaptured:true,external,errors,captures:[result]},null,2));
 }finally{await context.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
