// Ordinary local App sign-in/workspace/help. No render, payment or provider call.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
(async()=>{
 const info=JSON.parse(fs.readFileSync(path.join(process.argv[2],'browser-private.json')));
 assert.equal(new URL(info.origin).hostname,'127.0.0.1');assert.ok(info.email.endsWith('@example.test'));
 let ready=false;
 for(let attempt=0;attempt<100;attempt++) {
  try{ready=(await fetch(info.origin,{signal:AbortSignal.timeout(500)})).ok;}catch{}
  if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert(ready,'Owned local API did not become ready');
 const directory=process.argv[3];fs.mkdirSync(directory,{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--mute-audio']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Africa/Johannesburg',recordVideo:{dir:directory+'/recordings',size:{width:1440,height:1000}}});
 const report={headless:true,muted:true,mockedResponses:false,checks:[],errors:[],paidOperations:0};
 await context.route('**/*',r=>{const u=new URL(r.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));
 try{
  await page.goto(info.origin);const close=page.getByRole('button',{name:'Close video showcase',exact:true});if(await close.isVisible())await close.click();
  await page.getByText('Sign In',{exact:true}).first().click();await page.locator('input[type=email]').fill(info.email);await page.locator('input[type=password]').fill(info.password);
  await page.locator('#agreeTerms').check();await page.getByRole('button',{name:'Enter AutoPromote',exact:true}).click();
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();report.checks.push('ordinary emulator sign-in');
  await page.getByLabel('Choose videos for Studio').setInputFiles(process.argv[4]);
  await page.getByRole('button',{name:'Open Creator Studio',exact:true}).click();await page.getByRole('button',{name:'Graphics',exact:true}).waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.viral-studio-overlay video')].some(v=>v.readyState>=2&&v.videoWidth>0));
  await page.locator('.viral-studio-overlay video').evaluateAll(videos=>videos.forEach(v=>{v.muted=true;v.pause();}));
  report.checks.push('retained native-movie excerpt decodes in ordinary Studio; UI regression only, no new full workflow claim');await page.screenshot({path:directory+'/workspace.png'});
  await page.getByRole('button',{name:'Captions',exact:true}).click();await page.getByRole('button',{name:'Help: Captions',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Ask AutoPromote'});await dialog.getByLabel('Question',{exact:true}).fill('How do I generate captions?');
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/product-assistance/ask'&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Ask',exact:true}).click();
  const response=await pending;assert.equal(response.status(),200);assert.equal((await response.json()).features?.[0]?.feature_id,'studio.captions');await dialog.locator('.product-assistance-answer').waitFor();
  report.checks.push('real contextual captions-help response');await dialog.screenshot({path:directory+'/help.png'});assert.deepEqual(report.errors,[]);
 }catch(error){report.failure=error.message;await page.screenshot({path:directory+'/failure.png'}).catch(()=>{});throw error;}
 finally{await context.close();await browser.close();fs.writeFileSync(directory+'/verification.json',JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({passed:true,checks:report.checks.length,browserErrors:report.errors.length}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
