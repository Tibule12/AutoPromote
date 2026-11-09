#!/usr/bin/env node
// Real UI mutations, intended for the private normally signed-in QA browser.
// Shared scenarios cover several capabilities without pretending a render exit
// code or a screenshot is a quality verdict. run.js records/reviews the outputs.
const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');
const q=require('./run');
async function mediaRail(page) {
  const show=page.getByRole('button',{name:'Show media',exact:true});
  if(await show.isVisible())await show.click();
  const head=page.locator('.studio-project-rail__head');
  if(await head.getAttribute('open')===null)await head.locator(':scope > summary').click();
}
async function open(page,name) {
  await mediaRail(page);
  const saved=page.locator('.studio-saved-projects');
  if(await saved.getAttribute('open')===null)await saved.locator(':scope > summary').click();
  const exactName = new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
  const button=saved.locator('button').filter({has:page.locator('strong',{hasText:exactName})}).first();
  await button.click();
  // Loading an owned saved project is asynchronous. The previous project's
  // already-decoded video must not qualify the new project as ready.
  await page.waitForFunction(name => document.querySelector('[aria-label="Project name"]')?.value === name,
    name, {timeout:60000});
  await page.waitForFunction(()=>document.querySelector('[data-testid="studio-after-video"]')?.readyState>=3,
    undefined, {timeout:60000});
}
async function duplicate(page,name) {
  await mediaRail(page);
  const originalName=await page.getByLabel('Project name',{exact:true}).inputValue();
  await page.locator('.studio-project-actions').getByRole('button',{name:'Duplicate',exact:true}).click();
  await page.waitForFunction(expected=>document.querySelector('[aria-label="Project name"]')?.value===expected,originalName+' copy');
  // The action receipt can live in a collapsed inspector. The new project
  // identity and enabled name field establish completion on every tool tab.
  await page.getByText('Project duplicated with its complete editable timeline.',{exact:true}).waitFor({state:'attached'});
  await page.getByLabel('Project name',{exact:true}).fill(name);
  assert.equal(await page.getByLabel('Project name',{exact:true}).inputValue(),name);
  await mediaRail(page);
  await page.getByTestId('studio-save-project').click();
}
async function seek(page,seconds) {
  const field=page.getByLabel('Edited output position',{exact:true});
  // Native keyboard action on the actual programme scrubber, not media state injection.
  const pause=page.getByRole('button',{name:'Pause comparison',exact:true});
  if(await pause.isVisible())await pause.click();
  const step=Number(await field.getAttribute('step'))||.01;
  const min=Number(await field.getAttribute('min'))||0,max=Number(await field.getAttribute('max'));
  await field.scrollIntoViewIfNeeded();
  const box=await field.boundingBox();assert(box&&seconds>=min&&seconds<=max);
  // Jump near the intended time with the same pointer gesture as a user,
  // then use a few native arrow steps for precision. Hundreds of seeks made
  // the old harness needlessly expensive on the user's laptop.
  await page.mouse.click(box.x+8+(box.width-16)*(seconds-min)/(max-min),box.y+box.height/2);
  await field.focus();
  const difference=Math.round((seconds-Number(await field.inputValue()))/step);
  assert(Math.abs(difference)<100,'Scrubber pointer did not reach the requested region');
  for(let n=0;n<Math.abs(difference);n++)await page.keyboard.press(difference>0?'ArrowRight':'ArrowLeft');
  assert(Math.abs(Number(await field.inputValue())-seconds)<step/2,'Scrubber did not reach the requested time');
  // A scrubber value changes before a remote decoder has produced the new
  // picture. Screenshots of that interval falsely compared old camera pixels
  // with the new caption/time label. Wait for actual decode before inspection.
  await page.waitForFunction(()=>{
    const video=document.querySelector('[data-testid="studio-after-video"]');
    return video && !video.seeking && video.readyState>=2;
  },undefined,{timeout:60000});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function captionsOff(page) {
  await q.tool(page,'Captions');
  await page.getByText('Preview captions',{exact:true}).locator('..').locator('..').locator('input[type=checkbox]').uncheck();
}
async function prepareSubject(page, sourceName='Studio QA 20261007 baseline', projectName='Studio QA 20261007 subject') {
  await open(page,sourceName);
  await duplicate(page,projectName);
  await captionsOff(page);
  await page.getByTestId('pro-video-clip-1').click();
  await seek(page,3);
  await page.getByTestId('pro-quick-split').click();
  await q.tool(page,'Composite');
  const select=page.getByLabel('Subject effect source clip',{exact:true});
  const options=await select.locator('option').evaluateAll(es=>es.map(e=>({value:e.value,text:e.textContent})));
  const first=options.find(o=>o.value && /3\.0s/.test(o.text));assert(first,'Three-second real source clip missing');
  await select.selectOption(first.value);
  await page.getByLabel('Subject point X',{exact:true}).fill('0.79');
  await page.getByLabel('Subject point Y',{exact:true}).fill('0.65');
  await page.getByRole('button',{name:'Add first-frame point',exact:true}).click();
  await page.getByLabel('Subject point X',{exact:true}).fill('0.69');
  await page.getByLabel('Subject point Y',{exact:true}).fill('0.28');
  await page.getByRole('button',{name:'Add first-frame point',exact:true}).click();
  await q.inspect(page,'subject-configured');
  await page.getByTestId('studio-save-project').click();
}
async function reframe(page) {
  await open(page,'Studio QA 20261007 baseline');
  await duplicate(page,'Studio QA 20261007 vertical');await captionsOff(page);
  await q.tool(page,'Reframe');
  await page.getByTestId('reframe-aspect-9-16').click();
  await q.inspect(page,'reframe-configured');
}
async function persistence(page) {
  await mediaRail(page);await page.getByTestId('studio-save-project').click();
  const before=await page.getByLabel('Project name',{exact:true}).inputValue();
  await page.reload();await page.waitForTimeout(2000);
  // App startup and login remain real. Resume via the normal Studio entry.
  const entry=page.getByRole('button',{name:'Viral Clip Studio',exact:true});
  await entry.waitFor({timeout:30000});await entry.click();
  await page.getByRole('region',{name:'Saved Studio projects'}).getByRole('button',{name:before,exact:true}).click();
  await page.getByRole('navigation',{name:'Creative tools'}).waitFor({timeout:30000});
  await q.inspect(page,'persistence-after-app-reload');
  return before;
}
async function main() {
  const [phase,name]=process.argv.slice(2);const{browser,page}=await q.connect();
  try {
    if(phase==='open')await open(page,name);
    else if(phase==='duplicate')await duplicate(page,name);
    else if(phase==='subject')await prepareSubject(page);
    else if(phase==='reframe')await reframe(page);
    else if(phase==='reload')console.log(await persistence(page));
    else if(phase==='captions-off')await captionsOff(page);
    else if(phase==='seek')await seek(page,Number(name));
    else throw new Error('Use open, duplicate, subject, reframe, reload, captions-off or seek');
    await q.inspect(page,'flow-'+phase);
    console.log(JSON.stringify({phase,at:new Date().toISOString(),realUI:true,noMocks:true}));
  } finally {await browser.close()}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={open,duplicate,seek,captionsOff,prepareSubject,reframe,persistence,mediaRail};
