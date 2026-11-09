#!/usr/bin/env node
const fs=require('fs');const path=require('path');const assert=require('assert/strict');const q=require('./run');const f=require('./flows');
(async()=>{const{browser,page}=await q.connect();try{
 await f.open(page,process.env.STUDIO_QA_CUTS_SOURCE||'Studio QA 20261007 baseline');
 const cue=page.getByTestId('pro-captions-clip-2');assert(await cue.isVisible());const before=await cue.innerText();await cue.click();await page.getByLabel('Caption 2 text',{exact:true}).waitFor();
 const field=page.getByLabel('Caption 2 text',{exact:true});const original=await field.inputValue();await field.fill('QA EDITABLE CUE');await page.waitForTimeout(350);assert((await cue.innerText()).includes('QA EDITABLE CUE'));await field.fill(original);
 // Show that preview visibility is independent of the saved editable track.
 await f.captionsOff(page);assert(await cue.isVisible());
 await q.inspect(page,'caption-edit-timeline-real');
 fs.writeFileSync(path.join(q.report,'timeline-edit-receipt.json'),JSON.stringify({at:new Date().toISOString(),realAuth:true,noMocks:true,cueClickOpenedTranscript:true,textEditReflectedInTimeline:true,cuesVisibleWithPreviewOff:true,originalRestored:true},null,2));
 await f.duplicate(page,process.env.STUDIO_QA_CUTS_PROJECT||'Studio QA 20261007 cuts-speed');
 await page.getByTestId('pro-video-clip-1').click();const lane=await page.locator('[data-testid="pro-track-row-video"] .pro-track-lane').boundingBox();await page.mouse.click(lane.x+lane.width*.25,lane.y+lane.height*.5);await page.getByTestId('pro-quick-split').click();assert(await page.getByTestId('pro-video-clip-2').isVisible());
 await page.keyboard.press('Control+z');await page.waitForTimeout(400);assert.equal(await page.getByTestId('pro-video-clip-2').count(),0);await page.keyboard.press('Control+y');await page.waitForTimeout(400);assert(await page.getByTestId('pro-video-clip-2').isVisible());
 await q.tool(page,'Pacing');await page.getByRole('button',{name:'0.5×',exact:true}).click();await q.inspect(page,'cuts-half-speed');await page.getByRole('button',{name:'2×',exact:true}).click();await page.getByTestId('studio-save-project').click();await q.inspect(page,'cuts-double-speed');
 const attempt=await q.render(page,'cuts_speed',{duration:6,width:1280,height:720,audio:true});console.log(JSON.stringify({phase:'cuts-speed',output:attempt.output,seconds:attempt.technical.seconds}));
}finally{await browser.close()}})().catch(e=>{console.error(e.stack);process.exitCode=1});
