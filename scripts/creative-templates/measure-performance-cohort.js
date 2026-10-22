#!/usr/bin/env node
// Observe one published release through normal signed-in Analytics controls.
// The two temporary local servers have background posting/paid work disabled.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http'),net=require('node:net');
const {spawn}=require('node:child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),report=path.join(root,'reports/content-performance-test-20261021');
const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1],preflight=args.includes('--preflight');
const platform=preflight?'preflight':arg('--platform'),windowHours=preflight?0:Number(arg('--hours'));
const out=path.join(report,'observations');fs.mkdirSync(out,{recursive:true,mode:0o700});
const build=process.env.PERFORMANCE_MONITOR_BUILD||path.join(require('node:os').homedir(),'.cache/autopromote-performance-monitor-20261021/build-api5144-r2');
async function free(host,port){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,host,()=>s.close(resolve));});}
async function ready(url,children){const end=Date.now()+90000;while(Date.now()<end){if(children.some(c=>c.exitCode!==null))throw Error('Owned local measurement server exited');const ok=await new Promise(resolve=>{const r=http.get(url,res=>{res.resume();resolve(res.statusCode<500);});r.setTimeout(2000,()=>r.destroy());r.on('error',()=>resolve(false));});if(ok)return;await new Promise(resolve=>setTimeout(resolve,500));}throw Error('Local measurement runtime did not become ready');}
async function main(){
 assert(fs.existsSync(path.join(build,'index.html')),'Reviewed local build is unavailable');
 const book=JSON.parse(fs.readFileSync(path.join(report,'publishing/platform-packages.json')));
 const post=preflight?null:book.posts.find(p=>p.platform===platform);assert(preflight||post?.queueVerified,'Only a verified owned schedule may be observed');
 assert(preflight||[24,72].includes(windowHours));
 await free('127.0.0.1',5144);await free('127.0.0.5',5000);
 const log=fs.openSync(path.join(out,`${platform}-${windowHours}h-runtime.private.log`),'a',0o600),children=[];let browser,context;
 const launch=(script,extra,env)=>{const child=spawn(process.execPath,[path.join(root,script),...extra],{cwd:root,env:{...process.env,...env},stdio:['ignore',log,log]});children.push(child);return child;};
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'),prefix=path.join(out,`${platform}-${windowHours}h-${stamp}`);let writes=0,data=null,refresh=null,activeRelease=null;const errors=[];
 try{
  launch('scripts/creative-templates/run-local-backend.js',[],{STUDIO_QA_API_PORT:'5144',STUDIO_QA_CPU_PORT:'8044'});await ready('http://127.0.0.1:5144/health',children);
  launch('scripts/studio-professional/vector-artwork-runtime.js',['serve'],{STUDIO_QA_API_PORT:'5144',STUDIO_QA_APP_HOST:'127.0.0.5',STUDIO_QA_APP_BUILD:build});await ready('http://127.0.0.5:5000/',children);
  browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--host-resolver-rules=MAP localhost 127.0.0.5','--no-proxy-server','--disable-quic','--disable-http2']});
  context=await browser.newContext({storageState:require('./studio-session').sessionPath,viewport:{width:1500,height:1100}});const page=await context.newPage();page.setDefaultTimeout(90000);
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(['POST','PUT','PATCH','DELETE'].includes(r.method())&&/^\/api\/(content|publisher|platform)\//.test(new URL(r.url()).pathname))writes++;});
  page.on('response',async r=>{if(new URL(r.url()).pathname==='/api/analytics/user'&&new URL(r.url()).searchParams.get('contentId')===activeRelease&&r.ok())data=await r.json();});
  await page.goto('http://localhost:5000/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Analytics',exact:true}).click();const select=page.getByLabel('Published release',{exact:true});await select.waitFor();await page.waitForFunction(()=>document.querySelector('select[aria-label="Published release"]')?.options.length>1);assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
  const value=preflight?(await select.locator('option').evaluateAll(es=>es.map(e=>e.value).filter(Boolean)))[0]:post.contentId;
  assert(value,'No owned published release available');assert(await select.locator('option').evaluateAll((es,v)=>es.some(e=>e.value===v),value),'Selected schedule is not yet in published Analytics; do not invent zero counters');
  activeRelease=value;const selected=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/analytics/user'&&new URL(r.url()).searchParams.get('contentId')===value&&r.ok());await select.selectOption(value);data=await(await selected).json();assert.equal(data.selectedReleaseId,value);
  if(!preflight){const waiting=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/analytics/refresh-post-metrics'&&r.request().method()==='POST');await page.getByRole('button',{name:'Sync latest platform statistics',exact:true}).click();const res=await waiting;assert(res.ok());refresh=await res.json();await page.getByRole('button',{name:'Sync latest platform statistics',exact:true}).waitFor();await page.waitForTimeout(1000);}
  assert.equal(data.selectedReleaseId,value);assert(data.topContent.every(row=>row.contentId===value));
  await page.getByText(new RegExp(`Data source: published platform posts only \\(${data.publishedPostCount} posts in this range\\)\\.`)).waitFor();
  assert.equal(writes,0);assert.deepEqual(errors,[]);await page.screenshot({path:prefix+'.private.png',fullPage:true});fs.chmodSync(prefix+'.private.png',0o600);
  const rows=(data.topContent||[]).filter(row=>preflight||row.platform===platform);assert(preflight||rows.length===1,'Expected the exact release/platform publication');
  fs.writeFileSync(prefix+'.private.json',JSON.stringify({analytics:data,refresh},null,2),{mode:0o600});
  const result={at:new Date().toISOString(),preflight,platform,windowHours,scheduledAt:post?.scheduledAt||null,normalSignedInUi:true,authBypass:false,uiScopeMatchesOwnedRelease:true,contentOrScheduleWrites:writes,paidJobs:0,rows:rows.map(row=>({...row,ageHours:row.publishedAt?(Date.now()-Date.parse(row.publishedAt))/3600000:null})),retentionAvailable:false,interpretation:'Unavailable values remain unknown. This observation does not establish algorithm acceptance or a causal lift.'};
  fs.writeFileSync(prefix+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify({preflight,platform,windowHours,observedPosts:rows.length,receipt:prefix+'.json'}));
 }finally{if(context)await context.close();if(browser)await browser.close();for(const c of children.reverse())if(c.exitCode===null)c.kill('SIGTERM');for(const c of children)await new Promise(resolve=>{if(c.exitCode!==null)return resolve();c.once('exit',resolve);setTimeout(()=>{if(c.exitCode===null)c.kill('SIGKILL');resolve();},5000).unref();});fs.closeSync(log);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
