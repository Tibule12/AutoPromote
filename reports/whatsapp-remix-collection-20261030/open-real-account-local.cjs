const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.join(__dirname,'private');
(async()=>{
 const saved=JSON.parse(fs.readFileSync(path.join(root,'real-account-studio-session.private.json')));
 saved.cookies=[];saved.origins=saved.origins.filter(o=>o.origin==='https://autopromote.org').map(o=>({...o,origin:'http://localhost:5008',localStorage:(o.localStorage||[]).filter(v=>v.name.startsWith('firebase:')),indexedDB:(o.indexedDB||[]).filter(db=>db.name==='firebaseLocalStorageDb')}));
 assert.equal(saved.origins.length,1);
 const browser=await chromium.launch({headless:true,args:['--mute-audio']});
 const context=await browser.newContext({storageState:saved,viewport:{width:1600,height:1000}});
 const p=await context.newPage();p.setDefaultTimeout(60000);let profileStatus,profile;
 p.on('response',async r=>{if(new URL(r.url()).pathname==='/api/users/profile'){profileStatus=r.status();if(r.ok())profile=await r.json();}});
 try{
  await p.goto('http://localhost:5008');await p.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().waitFor();
  await p.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().click();await p.locator('.creator-studio-dropzone input[type=file]').waitFor({state:'attached'});
  assert.equal(profileStatus,200);assert(!await p.evaluate(()=>Boolean(window.__E2E_BYPASS)));
  await p.screenshot({path:path.join(root,'localhost-real-account-studio.png')});
  await context.storageState({path:path.join(root,'localhost-real-account-session.private.json'),indexedDB:true});
  fs.writeFileSync(path.join(root,'localhost-real-profile.private.json'),JSON.stringify(profile),{mode:0o600});
  console.log(JSON.stringify({origin:'http://localhost:5008',profileStatus,actualAccountSession:true,emulatorAccount:false,authBypass:false,studioOpened:true,renderSubmitted:false}));
 }catch(e){await p.screenshot({path:path.join(root,'localhost-account-signin-failure.png')}).catch(()=>{});throw e;}
 finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
