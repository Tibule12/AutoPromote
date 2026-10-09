#!/usr/bin/env node
// Audit existing controls through normal signed-in UI. This is reachability
// evidence, never a substitute for a capability's real render/output test.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const q=require('./run'),f=require('./flows');
(async()=>{const{browser,page}=await q.connect();const result={at:new Date().toISOString(),headless:true,realAuth:true,noMocks:true,gpuUsed:false,scope:'Existing control reachability/layout only; no feature output qualification',tools:[],layouts:[]};try{
 await f.open(page,'Studio QA 20261008 captions');
 await page.getByTestId('studio-mode-creator').click();
 const hide=page.getByRole('button',{name:'Hide media',exact:true});if(await hide.isVisible())await hide.click();
 const labels=await page.getByRole('navigation',{name:'Creative tools'}).getByRole('button').evaluateAll(es=>es.map(e=>e.querySelector('strong')?.textContent));
 assert.equal(labels.length,14,'Creator mode must expose all existing tools');
 for(const label of labels){
  await q.tool(page,label);
  const sidebar=page.locator('.studio-sidebar');
  await sidebar.evaluate(e=>{e.scrollTop=0});
  const guide=page.getByRole('region',{name:'Editing control guide'});
  assert((await guide.innerText()).includes(label+' controls'));
  assert((await guide.locator('p').innerText()).length>30,'Tool lacks an outcome explanation');
  // Open existing advanced sections to enumerate the actual editable values.
  const sections=sidebar.locator('details');
  for(let pass=0;pass<2;pass++)for(let i=0;i<await sections.count();i++){
    const section=sections.nth(i);
    if(await section.isVisible()&&await section.getAttribute('open')===null)
      await section.locator(':scope > summary').click();
  }
  const controls=await sidebar.locator('input,select,textarea,button').evaluateAll(es=>es.filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>({tag:e.tagName,type:e.type,label:e.getAttribute('aria-label')||[...(e.labels||[])].map(l=>l.textContent.trim()).join(' '),text:e.tagName==='BUTTON'?e.textContent.trim():undefined,disabled:e.disabled,testId:e.dataset.testid,options:e.tagName==='SELECT'?[...e.options].map(o=>o.textContent):undefined})));
  result.tools.push({tool:label,guide:await guide.innerText(),controls});
  await q.inspect(page,'controls-'+label.toLowerCase().replace(/[^a-z]/g,''));
 }
 await q.tool(page,'Captions');await page.getByLabel('Caption 1 text',{exact:true}).click();
 for(const [width,height] of [[1366,640],[1366,768],[1854,961]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(500);
  const layout=await page.evaluate(()=>{const box=s=>document.querySelector(s)?.getBoundingClientRect().toJSON();const scroll=document.querySelector('.studio-pro-timeline .pro-timeline-scroll');return{viewport:{width:innerWidth,height:innerHeight},frame:box('.phone-frame'),timeline:box('.studio-pro-timeline-dock'),sidebar:box('.studio-sidebar'),trackScroll:scroll?{clientHeight:scroll.clientHeight,scrollHeight:scroll.scrollHeight}:null,rows:['video','captions','originalAudio'].map(id=>({id,box:box('[data-testid="pro-track-row-'+id+'"]')})),captionBlocks:document.querySelectorAll('[data-testid^="pro-captions-clip-"]').length,watermarks:document.querySelectorAll('[data-testid="brand-watermark-preview"]').length}});
  assert(layout.frame?.height>=120,'Programme monitor is too small to edit');
  assert(layout.timeline?.height>=200,'Timeline cannot expose usable lanes');
  assert(layout.rows.every(r=>r.box?.height>=28),'Source/CC/audio row missing');
  assert.equal(layout.watermarks,0);
  result.layouts.push(layout);await q.inspect(page,'layout-'+width+'x'+height);
 }
 await page.setViewportSize({width:1366,height:768});
 fs.writeFileSync(path.join(q.report,'existing-controls-audit.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({tools:result.tools.length,layouts:result.layouts.map(l=>({viewport:l.viewport,programmeHeight:l.frame.height,timelineHeight:l.timeline.height})),scope:result.scope}));
}finally{await browser.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
