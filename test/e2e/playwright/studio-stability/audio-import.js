#!/usr/bin/env node
const fs=require('fs'),path=require('path');const q=require('./run'),f=require('./flows');
(async()=>{const{browser,page}=await q.connect();try{
 await f.open(page,process.env.STUDIO_QA_AUDIO_SOURCE||'Studio QA 20261007 baseline');await f.duplicate(page,process.env.STUDIO_QA_AUDIO_PROJECT||'Studio QA 20261007 imported speech');await f.captionsOff(page);await q.tool(page,'Sound');
 await page.getByTestId('sound-effect-input').setInputFiles(process.env.STUDIO_QA_AUDIO_FILE||path.join(q.report,'media/speech.wav'));await page.getByTestId('sound-effect-start').waitFor();await page.getByTestId('sound-effect-start').fill('0');await page.getByTestId('sound-effect-duration').fill('12');
 for(const id of ['sound-effect-fade-in','sound-effect-fade-out']){const field=page.getByTestId(id);await field.focus();await field.press('Home');for(let i=0;i<20;i++)await field.press('ArrowRight');}
 const volume=page.getByTestId('sound-effect-volume');await volume.focus();await volume.press('End');
 await page.getByTestId('pro-track-row-originalAudio').getByRole('button',{name:'Mute track',exact:true}).click();await page.getByTestId('studio-save-project').click();await q.inspect(page,'imported-speech-configured');const a=await q.render(page,'voiceover_sfx');console.log(JSON.stringify({output:a.output,seconds:a.technical.seconds}));
}finally{await browser.close()}})().catch(e=>{console.error(e.stack);process.exitCode=1});
