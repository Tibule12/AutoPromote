// Authorized ordinary-account qualification on the real public website; one bounded export.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const option = (name, fallback) => {const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
(async () => {
  const directory='/home/tibule12/.local/share/autopromote-qa/free-first-launch-20261127';
  const info = JSON.parse(fs.readFileSync(path.join(directory,'ordinary-account.private.json')));
  const origin='https://autopromote.org', source='tmp/free-first-workload-inputs/d563280d6d3f60c275be7900bafb71d4c67bcdc6531b811dcb19b904aeb3c526.mp4';info.origin='https://api.autopromote.org';
  assert.ok(require('../config/free-first-release/activation.json').enabled);
  assert.ok(info.emailVerified&&info.uid);
  const resume=process.argv.includes('--resume');
  const evidenceName=option('--evidence-name',resume?'public-browser-resumed':'public-browser');
  assert.match(evidenceName,/^public-browser(?:-[a-z0-9]+)*$/);
  const folder=path.join(directory,evidenceName);if(fs.existsSync(path.join(folder,'browser-evidence.json')))throw Error('Preserve the prior public attempt; reconcile its job before another export');
  fs.mkdirSync(folder,{recursive:true});
  const report={scope:'Real public App and ordinary account; approved cloud qualification; no additional publication',checks:[],errors:[],dialogs:[]};
  const browser=await chromium.launch({headless:true,args:['--mute-audio']});
  let token;
  try {
    for (const width of [1440,390,360]) {
      const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Africa/Johannesburg',reducedMotion:'reduce'});
      const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
      await page.goto(origin+'/pricing');await page.locator('[data-plan-id=plus]').waitFor();
      assert.equal(await page.locator('[data-plan-id]').count(),2);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await page.screenshot({path:`${folder}/pricing-${width}.png`,fullPage:true});
      report.checks.push({name:'real-public-pricing',width,twoPlans:true,noOverflow:true});
      await context.close();
    }
    const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Africa/Johannesburg',recordVideo:{dir:folder+'/browser-recordings',size:{width:1440,height:1000}}});
    const page=await context.newPage();page.setDefaultTimeout(20000);
    page.on('pageerror',e=>report.errors.push(e.message));
    page.on('response', async response=>{
      if (['/api/media/render-clip','/api/media/process'].includes(new URL(response.url()).pathname) && response.request().method()==='POST') {
        const data=await response.json().catch(()=>null); if(data?.jobId)report.nativeJobId=data.jobId;
      }
    });
    page.on('request',r=>{if(new URL(r.url()).pathname==='/api/users/profile')token=r.headers().authorization;});
    let confirmations=0;page.on('dialog',async dialog=>{report.dialogs.push(dialog.message());if(dialog.type()==='alert')return dialog.accept();if(dialog.message().startsWith('This operation reserves up to 40 processing tokens')&&++confirmations===1)return dialog.accept();return dialog.dismiss();});
    const usage=async()=>{assert.ok(token);const r=await fetch(info.origin+'/api/usage/processing',{headers:{Authorization:token}});assert.equal(r.status,200);return (await r.json());};
    await page.goto(origin);
    await page.locator('dialog[open]').waitFor({timeout:5000}).then(()=>page.keyboard.press('Escape')).catch(()=>{});
    const close=page.getByRole('button',{name:'Close video showcase',exact:true});if(await close.isVisible())await close.click();
    await page.getByText('Sign In',{exact:true}).first().click();
    await page.locator('input[type=email]').fill(info.email);await page.locator('input[type=password]').fill(info.password);
    if(await page.locator('#agreeTerms').count())if(await page.locator('#agreeTerms').count())await page.locator('#agreeTerms').check();await page.locator('button[type=submit]').click();
    await page.getByRole('button',{name:'Billing',exact:true}).click();
    await page.getByRole('heading',{name:'Your processing allowance'}).waitFor();
    const before=await usage();report.before=before;
    await page.screenshot({path:folder+'/billing-final.png',fullPage:true});
    await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
    const projectName=option('--project-name','Free-first allowance workflow');
    if(resume){
      await page.getByRole('button',{name:projectName,exact:true}).click();
      report.checks.push({name:'existing-native-project-reused',noRepeatedUpload:true});
    }else{
    await page.getByLabel('Choose videos for Studio').setInputFiles(source);
    await page.getByRole('button',{name:'Open Creator Studio',exact:true}).click({timeout:180000});
    await page.getByRole('button',{name:'Graphics',exact:true}).click();
    await page.getByRole('button',{name:/Headline.*Bold hook copy/}).click();
    const text=page.getByLabel('Title text',{exact:true});await text.fill('Create for free');await text.blur();
    await page.getByTitle('Undo (Ctrl/Cmd+Z)',{exact:true}).click();
    assert.notEqual(await text.inputValue(),'Create for free');
    await page.getByTitle('Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)',{exact:true}).click();
    assert.equal(await text.inputValue(),'Create for free');
    const show=page.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();
    const details=page.locator('.studio-project-rail__head');if(!await details.evaluate(n=>n.open))await details.locator('summary').click();
    await page.getByLabel('Project name',{exact:true}).fill(projectName);
    await page.getByTestId('studio-save-project').click();
    await page.locator('.studio-project-save-state.is-saved').waitFor();
    const afterEdit=await usage();assert.equal(afterEdit.processing.remaining,before.processing.remaining);
    report.checks.push({name:'free-native-local-edit',sourceUpload:true,titleEdit:true,undoRedo:true,projectSaved:true,noTokensDeducted:true});
    await page.screenshot({path:folder+'/free-edit-timeline.png'});
    }
    await page.reload();
    await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
    await page.getByRole('button',{name:projectName,exact:true}).click();
    await page.getByRole('button',{name:'Graphics',exact:true}).click();
    // A reopened project selects no title until its existing layer is selected.
    const title=page.getByRole('button',{name:/Create for free/}).first();if(await title.isVisible())await title.click();
    await page.screenshot({path:folder+'/free-project-reopened.png'});
    report.checks.push({name:'saved-project-reopened',savedProjectVisible:true});
    await page.getByRole('button',{name:'Export',exact:true}).click();
    console.log('Export panel',await page.locator('.export-btn').allTextContents());
    report.exportPanel=await page.locator('body').innerText().then(t=>t.slice(-1800));
    await page.locator('.export-btn').first().click();
    await page.waitForTimeout(600);
    report.afterExportClick=await page.locator('body').innerText().then(t=>t.slice(-5000));
    console.log('After export click',report.afterExportClick);
    await page.screenshot({path:folder+'/export-click-state.png'});
    // The existing App exports asynchronously; the worker and allowance must both settle.
    let after;
    const exportWait=900;
    assert.ok(Number.isSafeInteger(exportWait)&&exportWait>=45&&exportWait<=900);
    for(let n=0;n<exportWait;n+=5) {
      after=await usage();
      if(after.processing.rollingSpentTokens>before.processing.rollingSpentTokens&&after.processing.activeJobs===0)break;
      const failed=await page.locator('[role=alert]').allTextContents();
      if(after.processing.activeJobs===0&&failed.some(t=>t.startsWith('Export failed:')))
        throw Error(failed.find(t=>t.startsWith('Export failed:')));
      await page.waitForTimeout(5000);
    }
    report.after=after;
    assert.ok(after.processing.remaining<before.processing.remaining,'actual export reconciles a deduction');
    assert.equal(after.balances.purchasedCredits,before.balances.purchasedCredits,'legacy wallet preserved');
    if (report.nativeJobId) {
      const statusResponse=await fetch(info.origin+`/api/media/status/${report.nativeJobId}`,{headers:{Authorization:token}});
      assert.equal(statusResponse.status,200);const job=await statusResponse.json();
      const outputUrl=job.outputUrl||job.output_url||job.job?.outputUrl;
      assert.ok(['api.autopromote.org','storage.googleapis.com'].includes(new URL(outputUrl).hostname));
      const movie=await fetch(outputUrl,{headers:{Authorization:token}});
      assert.equal(movie.status,200);
      const bytes=Buffer.from(await movie.arrayBuffer());
      assert.ok(bytes.length>1024);fs.writeFileSync(folder+'/studio-free-output.mp4',bytes);
      report.download={bytes:bytes.length,sha256:require('node:crypto').createHash('sha256').update(bytes).digest('hex')};
    }
    report.checks.push({name:'actual-studio-export',deduction:before.processing.remaining-after.processing.remaining,legacyWalletPreserved:true});
    await page.screenshot({path:folder+'/free-export-finished.png'});
    await context.close();
    assert.deepEqual(report.errors,[]);
    console.log(JSON.stringify({checks:report.checks,remaining:after.processing.remaining}));
  } catch(error) {report.failure=error.message;throw error;}
  finally {fs.writeFileSync(folder+'/browser-evidence.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
