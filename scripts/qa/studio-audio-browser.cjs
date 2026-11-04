// Actual headless, muted App; fresh demo Auth/Firestore and local media only.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
module.exports = async ({page, context, origin, directory, navigateWorkspace, uid}) => {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const {AUDIO_REMIX_PRESETS} = await import('../../frontend/src/components/audio/audioRemixModel.js');
  const observations = [], blocked = [];
  const requests = request => {if (/preview-audio-remix|\/render|\/analy[sz]/.test(request.url())) blocked.push(request.url());};
  page.on('request', requests);
  await page.evaluate(() => {
    window.studioQaLongTasks = [];
    try { new PerformanceObserver(entries => { for (const entry of entries.getEntries()) window.studioQaLongTasks.push({start:entry.startTime,duration:entry.duration}); }).observe({entryTypes:['longtask']}); } catch (_) {}
  });
  const url = origin + '/qa-studio-audio-source.mp4';
  const storagePath = `uploads/videos/${uid}/sound-reference.mp4`;
  const snapshot = {
    orderedClips:[{id:'source',start:0,end:30,duration:30,sourceDuration:30,url,sourceStoragePath:storagePath}],selectedClipId:'source',
    timeline:[{id:'first',sourceClipId:'source',url,sourceStoragePath:storagePath,startRequest:0,endRequest:15},
      {id:'second',sourceClipId:'source',url,sourceStoragePath:storagePath,startRequest:15,endRequest:30}],
    activeTimelineIndex:0, projectMedia:[{id:'source',name:'Local sound reference',url,storagePath,type:'video',status:'ready',duration:30}],
    overlays:[],motionKeyframes:[],addHook:false,autoCaptions:false,exportSettings:{fps:'24'},
  };
  const backup = {id:'viral-project-audio-qa',name:'Sound transport — isolated reference',snapshot,versions:[]};
  snapshot.studioDocument = require('../../src/generated/studioDirectorReplayKernel.cjs').adaptStudioSnapshotToDocument({snapshot,projectId:backup.id});
  await navigateWorkspace('Viral Clip Studio');
  await page.getByLabel('Restore project backup',{exact:true}).setInputFiles({name:'sound.autopromote.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await page.getByRole('button',{name:backup.name,exact:true}).click();
  await page.getByTestId('viral-studio-workspace').waitFor();
  await page.getByTestId('studio-after-video').evaluate(video => new Promise((resolve,reject) => {
    if(video.readyState>=3)return resolve();
    setTimeout(()=>reject(new Error('Local media readiness timed out')),30000);
    video.addEventListener('canplay',resolve,{once:true});video.addEventListener('error',()=>reject(new Error('Local reference failed')),{once:true});
  }));
  const nav = page.getByRole('navigation',{name:'Creative tools'});
  await nav.getByRole('button',{name:'Sound',exact:true}).click();
  const slider = page.getByLabel('Edited output position',{exact:true});
  async function seekSecondShot() {
    const pause = page.getByRole('button',{name:'Pause comparison',exact:true});
    if(await pause.isVisible()) await pause.click();
    const box=await slider.boundingBox();
    assert.ok(box);
    await slider.click({position:{x:box.width*.57,y:box.height/2}});
    await page.waitForFunction(()=>document.querySelector('[data-testid="studio-after-video"]')?.currentTime>15);
  }
  const unmute=page.getByRole('button',{name:'Unmute preview audio',exact:true});
  if(await unmute.isVisible())await unmute.click();
  for(const preset of AUDIO_REMIX_PRESETS) {
    await seekSecondShot();
    const previous = await page.getByTestId('studio-after-video').getAttribute('data-preview-slot');
    await page.getByTestId('audio-remix-preset-'+preset.id).click();
    await page.getByRole('button',{name:'Pause comparison',exact:true}).waitFor();
    const pitch=preset.keepPitch ? 0 : preset.pitch*preset.intensity/100;
    await page.waitForFunction(pitch=>{
      const video=document.querySelector('[data-testid="studio-after-video"]');
      const graph=video?.__audioRemixGraph;
      return video&&!video.paused&&graph&&(!pitch||Math.abs((graph.pitch?.parameters.get('semitones')?.value??100)-pitch)<.05);
    },pitch);
    await page.getByTestId('studio-after-video').evaluate(video=>{
      const graph=video.__audioRemixGraph;
      if(!graph.qaSpectrum){graph.qaSpectrum=graph.context.createAnalyser();graph.qaSpectrum.fftSize=8192;graph.qaSpectrum.smoothingTimeConstant=0;graph.trackGain.connect(graph.qaSpectrum);}
    });
    const read=()=>page.evaluate(()=>{
      const video=document.querySelector('[data-testid="studio-after-video"]'),graph=video.__audioRemixGraph;
      const spectrum=new Float32Array(graph.qaSpectrum.frequencyBinCount);graph.qaSpectrum.getFloatFrequencyData(spectrum);
      let bin=1;for(let i=2;i<spectrum.length;i++)if(spectrum[i]>spectrum[bin])bin=i;
      return {sourceTime:video.currentTime,playhead:Number(document.querySelector('[aria-label="Edited output position"]').value),
        paused:video.paused,rate:video.playbackRate,preservesPitch:video.preservesPitch,
        pitch:graph.pitch?.parameters.get('semitones')?.value||0,peakDb:spectrum[bin],frequency:bin*graph.context.sampleRate/graph.qaSpectrum.fftSize,
        contextState:graph.context.state,contextTime:graph.context.currentTime,at:performance.now()};
    });
    const start=await read();
    await page.waitForTimeout(1200);
    const finish=await read();
    console.log('Sound measurement '+JSON.stringify({preset:preset.id,start,finish}));
    assert.equal(finish.paused,false,preset.id);
    assert(finish.sourceTime-start.sourceTime>.6,preset.id+' source stalled');
    assert(finish.playhead-start.playhead>.6,preset.id+' timeline stalled');
    assert(Math.abs(finish.rate-preset.speed)<.01,preset.id+' incorrect picture speed');
    assert(finish.peakDb>-65,preset.id+' silent output');
    const expected=440*2**(pitch/12);
    assert(Math.abs(finish.frequency-expected)<25,preset.id+' wrong voice frequency '+finish.frequency+' expected '+expected);
    const tasks=await page.evaluate(start=>window.studioQaLongTasks.filter(task=>task.start>=start),start.at);
    observations.push({preset:preset.id,...finish,sourceAdvance:finish.sourceTime-start.sourceTime,playheadAdvance:finish.playhead-start.playhead,
      longTasks:tasks.length,longestTaskMs:Math.max(0,...tasks.map(task=>task.duration)),previousSlot:previous});
    console.log('PASS: '+preset.name+' audible; native source and timeline advance');
  }
  await page.getByRole('button',{name:'Pause comparison',exact:true}).click();
  const stopped=await page.getByTestId('studio-after-video').evaluate(video=>video.currentTime);
  await page.waitForTimeout(250);
  assert(Math.abs((await page.getByTestId('studio-after-video').evaluate(video=>video.currentTime))-stopped)<.05);
  await page.getByTestId('audio-remix-preset-chipmunk').click();
  await page.getByRole('button',{name:'Pause comparison',exact:true}).waitFor();
  await page.getByTestId('audio-remix-panel').getByRole('button',{name:/Before/}).click();
  await page.waitForFunction(()=>Math.abs(document.querySelector('[data-testid="studio-after-video"]')?.__audioRemixGraph?.pitch?.parameters.get('semitones')?.value||0)<.01);
  for(const tool of ['Pacing','Motion','Sound'])await nav.getByRole('button',{name:tool,exact:true}).click();
  await page.getByTestId('audio-remix-panel').waitFor();
  await page.screenshot({path:path.join(directory,'studio-sound-final.png')});
  const pause=page.getByRole('button',{name:'Pause comparison',exact:true});
  if(await pause.isVisible())await pause.click();
  const showMedia=page.getByRole('button',{name:'Show media',exact:true});
  if(await showMedia.isVisible())await showMedia.click();
  const head=page.locator('.studio-project-rail__head');
  if(!await head.evaluate(element=>element.open))await head.locator(':scope > summary').click();
  await page.getByTestId('studio-save-project').click();
  await page.locator('.studio-project-save-state.is-saved').waitFor({state:'attached'});
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download project backup',exact:true}).click();
  const backupPath=path.join(directory,'sound-final.autopromote.json');
  await (await download).saveAs(backupPath);
  const saved=JSON.parse(fs.readFileSync(backupPath));
  assert.equal(saved.snapshot.audioRemix.preset,'chipmunk');
  assert.equal(saved.snapshot.timeline.length,2);
  await page.evaluate(()=>{window.studioQaContexts=[...document.querySelectorAll('video')].map(video=>video.__audioRemixGraph?.context).filter(Boolean);});
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Close Clip Studio',exact:true}).click();
  await page.getByTestId('viral-studio-workspace').waitFor({state:'hidden'});
  await page.waitForFunction(()=>window.studioQaContexts.length>0&&window.studioQaContexts.every(context=>context.state==='closed'));
  await page.reload();
  await navigateWorkspace('Viral Clip Studio');
  await page.getByRole('button',{name:backup.name,exact:true}).click();
  await page.getByTestId('viral-studio-workspace').waitFor();
  await page.getByRole('navigation',{name:'Creative tools'}).getByRole('button',{name:'Sound',exact:true}).click();
  assert.equal(await page.getByTestId('audio-remix-preset-chipmunk').getAttribute('aria-pressed'),'true');
  console.log('PASS: normal save/backup, audio context release and cold reopen preserve the sound preset');
  assert.equal(blocked.length,0,'Live preset selection invoked rendering/cloud processing');
  fs.writeFileSync(path.join(directory,'studio-audio-summary.json'),JSON.stringify({actualApp:true,source:'30-second local moving 440Hz reference',
    auth:'normal verified demo-emulator session',presets:observations,pauseResume:true,beforeBypassesPitch:true,toolSwitchesResponsive:true,
    saveBackupAndColdReopen:true,audioContextsReleasedOnClose:true,
    cloudProcessingRequests:0,paidWorkloads:0,productionWrites:0,limitations:['Signal-frequency and clock proof is not human listening approval or full worker mastering parity.','This simple two-shot source does not qualify dense motion projects.']},null,2));
  page.off('request',requests);
};
