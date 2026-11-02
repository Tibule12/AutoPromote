// Author the next bounded two-angle revision through ordinary Studio controls.
// The original project backup and immutable results remain available.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { clickStudioControl } = require('../../test/e2e/playwright/studio-timeline-layout');

async function main() {
  const directory = process.argv[2];
  const sourceFile = path.resolve(process.argv[3]);
  const config = JSON.parse(fs.readFileSync(path.join(directory, 'browser-private.json')));
  const evidence = path.resolve('reports/background-replacement-20261101/private/piece-review-r6');
  fs.mkdirSync(evidence, { recursive: true });
  assert.match(config.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, storageState: path.join(directory, 'browser-state.json'), acceptDownloads: true });
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    return u.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(u.protocol) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => console.log('BROWSER_ERROR', e.message));
  page.on('response', async r => {
    if (r.url().includes('studio-subject') && r.status() >= 400) console.log('SUBJECT_HTTP', r.status(), await r.text());
  });
  const save = async () => {
    const show = page.getByRole('button', { name: 'Show media', exact: true });
    if (await show.isVisible()) await show.click();
    await clickStudioControl(page, page.getByTestId('studio-save-project'));
  };
  const backup = async name => {
    await save();
    const event = page.waitForEvent('download');
    await clickStudioControl(page, page.getByRole('button', { name: 'Download project backup', exact: true, includeHidden: true }));
    await (await event).saveAs(path.join(evidence, `${name}.autopromote.json`));
  };
  try {
    await page.goto(config.origin);
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).first().waitFor({ timeout: 90000 });
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).first().click();
    await page.getByRole('button', { name: 'Credit lifecycle local project', exact: true }).click();
    await page.locator('.viral-studio-container').waitFor();
    const pause = page.getByRole('button', { name: /^Pause (comparison|edited preview)$/ });
    if (await pause.count()) await pause.first().click();
    await backup('before-two-speaker-edit');
    await page.getByRole('button', { name: /Composite/ }).first().click();
    const panel = page.locator('.studio-subject-vfx');
    await panel.getByRole('combobox',{name:'Subject effect scene',exact:true}).selectOption({index:1});
    const frame=panel.getByRole('slider',{name:'Subject prompt frame',exact:true});await frame.press('Home');
    // Correct ONLY object prompts. The moving person and original box remain.
    const prior=JSON.parse(fs.readFileSync('reports/background-replacement-20261101/private/body-edge-r5/two-speaker-final-project.autopromote.json')).snapshot.subjectVfxScenes[1];
    const selections=[
      [...prior.maskComponents[0].points, {position:[130/1440,.910],label:0},{position:[255/1440,.975],label:0}],
      [[28,.810,1],[115,.830,1],[145,.945,1],[43,.680,0],[130,.910,0],[245,.915,0],[265,.975,0]].map(([x,y,label])=>({position:[x/1440,y],label})),
      [[64,.910,1],[115,.830,1],[145,.945,1],[22,.650,0],[130,.910,0],[245,.915,0],[300,.930,0]].map(([x,y,label])=>({position:[x/1440,y],label})),
    ];
    for(const [index,points] of selections.entries()){
      await panel.getByRole('combobox',{name:'Correction target',exact:true}).selectOption({index:index+1});
      await panel.getByRole('button',{name:'Clear points',exact:true}).click();
      for(const {position:[x,y],label} of points){
        await panel.getByRole('button',{name:label?'Subject point':'Background point',exact:true}).click();
        await panel.getByRole('spinbutton',{name:'Subject point X',exact:true}).fill(String(x));
        await panel.getByRole('spinbutton',{name:'Subject point Y',exact:true}).fill(String(y));
        await panel.getByRole('button',{name:'Add point on selected frame',exact:true}).click();
      }
    }
    const maskControl=panel.getByRole('group',{name:'Subject mask',exact:true});
    for(const [i,key] of ['left','top','right','bottom'].entries())await maskControl.getByRole('spinbutton',{name:`Subject box ${key}`,exact:true}).fill(String([.26,.06,.98,1][i]));
    await backup('before-equipment-model');await page.screenshot({path:path.join(evidence,'native-equipment-prompts.png')});
    await maskControl.getByRole('button',{name:'Create subject mask',exact:true}).click();console.log('EQUIPMENT_MODEL_REQUESTED');
    const mask = panel.getByRole('group', { name: 'Subject mask', exact: true });
    for (let i=0;i<3600;i++) {
      if (await mask.getByRole('button', { name: 'Subject mask attached', exact: true }).count()) break;
      const status = (await mask.getByRole('status').allTextContents()).join(' ');
      if (i%30 === 0) console.log('EQUIPMENT_MASK_STATUS', status);
      if (/failed|unavailable|MODEL_|OUTSIDE_/i.test(status)) throw Error(status);
      await page.waitForTimeout(1000);
    }
    await mask.getByRole('button', { name: 'Subject mask attached', exact: true }).waitFor();
    await save();
    console.log('EQUIPMENT_SPEAKER_MASK_ATTACHED');
    await mask.getByRole('spinbutton', { name: 'Edge refinement radius', exact: true }).fill('6');
    await mask.getByRole('button', { name: 'Refine saved mask edges', exact: true }).click();
    console.log('EQUIPMENT_SPEAKER_ALPHA_REQUESTED');
    for(let i=0;i<3600;i++) {
      const status=(await mask.getByRole('status').allTextContents()).join(' ');
      if(i%30===0) console.log('EQUIPMENT_ALPHA_STATUS',status);
      if(status.startsWith('Subject mask saved.')) break;
      if(/failed|unavailable|MODEL_|OUTSIDE_/i.test(status)) throw Error(status);
      await page.waitForTimeout(1000);
    }
    await mask.getByText('Subject mask saved. Adjust the background and render a preview; changing effects reuses this mask.', { exact: true }).waitFor();
    await backup('two-speaker-models-saved');
    console.log('EQUIPMENT_SPEAKER_ALPHA_ATTACHED');
  } catch (e) {
    await page.screenshot({ path: path.join(evidence, 'native-authoring-failure.png') });
    console.log('BODY', (await page.locator('body').innerText()).slice(-8000));
    throw e;
  } finally {
    await context.storageState({ path: path.join(directory, 'browser-state.json'), indexedDB: true });
    await context.close();
    await browser.close();
  }
}
main().catch(e => { console.error(e); process.exitCode=1; });
