#!/usr/bin/env node
const fs=require('fs'),path=require('path'),assert=require('assert/strict');const q=require('./run'),f=require('./flows');
(async()=>{const{browser,page}=await q.connect();try{
 await f.open(page,'Studio QA 20261007 baseline');await f.duplicate(page,'Studio QA 20261007 B-roll');await f.captionsOff(page);await q.tool(page,'B-roll');
 await page.getByTestId('broll-video-input').setInputFiles(path.join(q.report,'media/podcast-12s.mp4'));await page.getByLabel('B-roll duration',{exact:true}).waitFor({timeout:40000});
 await page.locator('.inspector-time-grid').filter({has:page.getByLabel('B-roll duration',{exact:true})}).getByLabel('Start',{exact:true}).fill('2');
 await page.getByLabel('B-roll duration',{exact:true}).fill('2');await page.getByLabel('B-roll duration',{exact:true}).press('Tab');
 await page.getByLabel('B-roll source start',{exact:true}).fill('4.6');
 await page.getByRole('button',{name:'Keep original',exact:true}).click();await page.getByRole('button',{name:'Picture-in-picture',exact:true}).click();
 await page.getByTestId('studio-save-project').click();await q.inspect(page,'broll-real-configured');const a=await q.render(page,'b_roll');console.log(JSON.stringify({output:a.output,seconds:a.technical.seconds}));
}finally{await browser.close()}})().catch(e=>{console.error(e.stack);process.exitCode=1});
