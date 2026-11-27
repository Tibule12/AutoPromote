// Ordinary local App identity/workspace/help check; no mocked API responses.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
(async()=>{
 const directory=process.argv[2],origin=process.argv[3];
 const info=JSON.parse(fs.readFileSync(path.join(directory,'browser-private.json')));
 assert.equal(new URL(origin).hostname,'127.0.0.1');assert.ok(info.email.endsWith('@example.test'));
 const reportDirectory='reports/free-first-waste-20261126/client';fs.mkdirSync(reportDirectory,{recursive:true});
 const report={headless:true,muted:true,mockedResponses:false,productionRequests:0,checks:[],errors:[]};
 const browser=await chromium.launch({headless:true,args:['--mute-audio']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Africa/Johannesburg',recordVideo:{dir:reportDirectory+'/recordings',size:{width:1440,height:1000}}});
 await context.route('**/*',r=>{const u=new URL(r.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));
 try{
  await page.goto(origin);const close=page.getByRole('button',{name:'Close video showcase',exact:true});if(await close.isVisible())await close.click();
  await page.getByText('Sign In',{exact:true}).first().click();await page.locator('input[type=email]').fill(info.email);await page.locator('input[type=password]').fill(info.password);
  await page.locator('#agreeTerms').check();await page.getByRole('button',{name:'Enter AutoPromote',exact:true}).click();
  await page.getByRole('button',{name:'Billing',exact:true}).click();await page.getByRole('heading',{name:'Your processing allowance'}).waitFor();
  report.checks.push('ordinary emulator sign-in and Free allowance page');await page.screenshot({path:reportDirectory+'/billing.png'});
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.getByLabel('Choose videos for Studio').setInputFiles('reports/free-first-optimization-20261126/actual-studio60-verified/studio-free-output.mp4');
  await page.getByRole('button',{name:'Open Creator Studio',exact:true}).click();
  await page.getByRole('button',{name:'Graphics',exact:true}).waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.viral-studio-overlay video')].some(v=>v.readyState>=2&&v.videoWidth>0));
  await page.locator('.viral-studio-overlay video').evaluateAll(videos=>videos.forEach(v=>{v.muted=true;v.pause();}));
  await page.screenshot({path:reportDirectory+'/workspace.png'});
  report.checks.push('actual candidate Studio workspace opens retained 60s movie');
  await page.getByRole('button',{name:'Captions',exact:true}).click();
  await page.getByRole('button',{name:'Help: Captions',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Ask AutoPromote'});
  await dialog.getByLabel('Question',{exact:true}).fill('How do I generate captions?');
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/product-assistance/ask'&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'Ask',exact:true}).click();const response=await pending;assert.equal(response.status(),200);const reply=await response.json();assert.equal(reply.features?.[0]?.feature_id,'studio.captions');
  await dialog.locator('.product-assistance-answer').waitFor();await dialog.screenshot({path:reportDirectory+'/contextual-help.png'});report.checks.push('real contextual-help response selects studio.captions');
  assert.deepEqual(report.errors,[]);
 }catch(error){report.failure=error.message;await page.screenshot({path:reportDirectory+'/failure.png'}).catch(()=>{});throw error;}
 finally{await context.close();await browser.close();fs.writeFileSync(reportDirectory+'/verification.json',JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({passed:true,checks:report.checks.length,browserErrors:report.errors.length}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
