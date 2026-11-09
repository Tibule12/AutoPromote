// Reconstruct the first three poses in a genuine duplicate, using real controls.
// Observed screen crops are sources; they never replace the native final engine.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async function(page,{folder,h,q,seek,range,recording,backup,motionTarget}){
  await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Project name"]')?.value.endsWith(' copy'));
  await page.getByLabel('Project name',{exact:true}).fill('ZEST / real control lesson / 20261029');
  const before=await h.save(page,'focus-before');
  const can=before.snapshot.overlays.find(x=>x.name==='Product can');assert(can);
  const poses=[...new Set(before.snapshot.motionKeyframes.filter(k=>k.targetId===can.id).map(k=>k.time))].sort((a,b)=>a-b).slice(0,3).map(time=>({time,keys:before.snapshot.motionKeyframes.filter(k=>k.targetId===can.id&&k.time===time)}));
  await motionTarget(page,can.id);
  for(const pose of poses)await page.getByRole('button',{name:`Remove transform pose at ${pose.time.toFixed(2)} seconds`,exact:true}).click();
  const shots=[];let clock;const stop=await recording(page);clock=Date.now();
  async function shot(id,selectors,fn,minimum){
    const first=page.locator(selectors[0]);await first.evaluate(e=>e.scrollIntoView({block:'center'}));await page.waitForTimeout(300);
    const rects=await Promise.all(selectors.map(s=>page.locator(s).boundingBox()));assert(rects.every(Boolean));
    const crop={x:Math.floor(Math.min(...rects.map(r=>r.x))-12),y:Math.floor(Math.min(...rects.map(r=>r.y))-14)};
    crop.width=Math.ceil(Math.max(...rects.map(r=>r.x+r.width))-crop.x+12);crop.height=Math.ceil(Math.max(...rects.map(r=>r.y+r.height))-crop.y+14);
    const start=(Date.now()-clock)/1000;await fn();await page.waitForTimeout(Math.max(700,minimum*1000-((Date.now()-clock)/1000-start)*1000));
    const end=(Date.now()-clock)/1000;await page.screenshot({path:path.join(folder,'focus-'+id+'.png')});shots.push({id,start,end,crop});console.log('Focused actual controls: '+id);
  }
  const controls=['.inspector-select-field:has(select[aria-label="Target layer"])','.motion-position-grid:has(input[type="number"]):not(:has(input[aria-label]))','.inspector-range:has(b:text-is("Opacity"))'];
  // Locator-safe selectors for the target, four transform numbers and opacity.
  const selectors=['select[aria-label="Target layer"]','.motion-position-grid:has(input:not([aria-label]))','label.inspector-range:has(b:text-is("Opacity"))'];
  try{
    for(const [i,pose] of poses.entries()){
      await seek(page,pose.time);await motionTarget(page,can.id);
      await shot(['start-pose','overshoot-pose','settled-pose'][i],selectors,async()=>{
        for(const [label,property] of [['Y','y'],['Scale','scale'],['Rotate','rotation']]){
          const value=pose.keys.find(k=>k.property===property).value;
          const input=page.getByRole('spinbutton',{name:label,exact:true});await input.fill(String(value));await input.blur();await page.waitForTimeout(450);
        }
        const opacity=pose.keys.find(k=>k.property==='opacity').value;
        await range(page.locator('label.inspector-range').filter({has:page.locator('b',{hasText:/^Opacity$/})}).locator('input[type=range]'),opacity);
      },i===0?5.5:4);
      const button=page.getByRole('button',{name:/^◆ Add transform keyframe at/});
      await button.evaluate(e=>e.scrollIntoView({block:'center'}));
      await shot('commit-'+i,['button.inspector-primary-action'],async()=>{await button.click();},1.7);
      const easing=pose.keys[0].easing;await page.getByLabel(`Transform pose at ${pose.time.toFixed(2)} seconds easing`,{exact:true}).selectOption(easing);
    }
    for(const [name,id] of [['Back lime','rear-timing'],['Front lime','front-timing']]){
      const layer=before.snapshot.overlays.find(l=>l.name===name);await motionTarget(page,layer.id);
      const firstKey=before.snapshot.motionKeyframes.filter(k=>k.targetId===layer.id&&k.property==='x').sort((a,b)=>a.time-b.time)[0];await seek(page,firstKey.time);
      const poseList=page.locator('.motion-pose-list');await poseList.evaluate(e=>e.scrollIntoView({block:'start'}));
      await shot(id,['.motion-pose-list article:first-child','.motion-pose-list article:nth-child(2)'],async()=>{
        await page.getByLabel(`Transform pose at ${firstKey.time.toFixed(2)} seconds easing`,{exact:true}).selectOption(firstKey.easing);},3.5);
    }
    await q.tool(page,'Graphics');await page.locator('.title-layer-list button').filter({has:page.locator('strong',{hasText:'FRESH.'})}).first().click();
    await page.getByRole('button',{name:'Animate this title',exact:true}).click();
    await shot('type-settings',['select[aria-label="Animate text by"]','select[aria-label="Text animation order"]','select[aria-label="Text settling curve"]','input[aria-label="Stagger"]'],async()=>{
      await page.getByLabel('Animate text by',{exact:true}).selectOption('word');await page.waitForTimeout(600);
      await page.getByLabel('Text settling curve',{exact:true}).selectOption('ease_out');await page.waitForTimeout(600);
      const stagger=page.getByLabel('Stagger',{exact:true});await stagger.fill('38');await stagger.blur();
    },4.5);
    await shot('type-build',['button:text-is("Rebuild entrance keys")'],async()=>{
      await page.getByRole('button',{name:'Rebuild entrance keys',exact:true}).click();},2);
  }finally{
    await stop();fs.writeFileSync(path.join(folder,'focused-shots.json'),JSON.stringify({shots,actualNativeControls:true,sourceMovie:'editing-in-studio.mp4',graphInjection:false},null,2));
  }
  const after=await h.save(page,'focus-after');
  const normalize=s=>s.motionKeyframes.filter(k=>k.targetId===can.id).map(({property,time,value,easing})=>({property,time,value,easing})).sort((a,b)=>a.time-b.time||a.property.localeCompare(b.property));
  assert.deepEqual(normalize(after.snapshot),normalize(before.snapshot),'Teaching reconstruction must preserve the actual rendered can poses.');
  await backup(page);
};
