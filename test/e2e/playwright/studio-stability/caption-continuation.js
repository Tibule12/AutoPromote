#!/usr/bin/env node
// Real signed-in Studio actions. Never starts an instance, injects auth or mocks requests.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const q=require('./run'),f=require('./flows');
const name='Studio QA 20261008 captions';
(async()=>{const {browser,page}=await q.connect();try{
 if(process.argv[2]==='prepare'){
  if(!await page.getByRole('navigation',{name:'Creative tools'}).count()){
  await page.getByRole('button',{name:'Viral Clip Studio',exact:true}).click();
  await page.locator('.creator-studio-dropzone input[type=file]').setInputFiles(path.join(q.root,'reports/studio-stability-20261007/media/podcast-12s.mp4'));
  const open=page.getByRole('button',{name:'Open Creator Studio',exact:true});await open.waitFor({timeout:90000});await open.click();
  await page.getByRole('navigation',{name:'Creative tools'}).waitFor();
  }
  const show=page.getByRole('button',{name:'Show media',exact:true});if(await show.isVisible())await show.click();
  const head=page.locator('.studio-project-rail__head');if(await head.getAttribute('open')===null)await head.locator(':scope > summary').click();
  await page.getByLabel('Project name',{exact:true}).fill(name);
  await q.tool(page,'Captions');
  const file=path.join(q.report,'manual-qa-cues.srt');
  fs.writeFileSync(file,'1\n00:00:00,000 --> 00:00:04,000\nSTUDIO QA CAPTION RETEST\n\n2\n00:00:04,000 --> 00:00:08,000\nCHECK SECOND CUE TIMING\n\n3\n00:00:08,000 --> 00:00:12,000\nCHECK SAVE RELOAD EXPORT\n');
  await page.locator('input[accept=".srt,.vtt,.txt"]').setInputFiles(file);
  await page.getByLabel('Caption 1 text',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Bold Pop',exact:true}).click();
  await page.getByTestId('studio-save-project').click();
  await q.inspect(page,'captions-prepared');
  console.log(JSON.stringify({realAuth:true,noMocks:true,source:'real-podcast-12s',captions:'Explicit synthetic QA markers; not transcript approval',project:name}));
 }else if(process.argv[2]==='render'){
  await f.open(page,name);
  await q.tool(page,'Reframe');await page.getByTestId('reframe-aspect-16-9').click();
  await page.getByTestId('studio-save-project').click();
  await q.tool(page,'Captions');await page.getByLabel('Caption 1 text',{exact:true}).click();
  await q.inspect(page,'captions-wide-editable');
  await q.tool(page,'Export');await q.render(page,'captions');
  assert.equal(await page.getByTestId('live-caption-preview').count(),0,'Completed output is covered by a second live-caption overlay');
  await q.inspect(page,'captions-completed-no-double-overlay');
  console.log('Actual caption render/download completed; no duplicate DOM captions over the completed output.');
 }else throw new Error('Use prepare or render');
 }finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
