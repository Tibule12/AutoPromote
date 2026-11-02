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
  const evidence = path.resolve('reports/background-replacement-20261101/private/body-edge-r5');
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
    if (process.argv.includes('--correct-tv-frame')) {
      await panel.getByRole('combobox', { name: 'Subject effect scene', exact: true }).selectOption({ index: 1 });
      const cancel=panel.getByRole('button',{name:'Cancel mask request',exact:true});
      if(await cancel.isVisible()) {await cancel.click();await page.waitForTimeout(1500);}
      const frame=panel.getByRole('slider',{name:'Subject prompt frame',exact:true});await frame.press('Home');
      const previous=JSON.parse(fs.readFileSync('reports/background-replacement-20261101/private/two-speaker-r4/two-speaker-final-project.autopromote.json')).snapshot.subjectVfxScenes[1];
      const selections=[previous.scene.prompt,...previous.maskComponents];
      for(const [target,selection] of selections.entries()) {
        await panel.getByRole('combobox',{name:'Correction target',exact:true}).selectOption({index:target});
        await panel.getByRole('button',{name:'Clear points',exact:true}).click();
        const points=target===0?selection.points.map((position,i)=>({position,label:selection.labels[i]})):selection.points;
        const corrected=target===0?points:[...points,...[[300/1440,.89],[350/1440,.91],[350/1440,.86]].map(position=>({position,label:0}))];
        for(const {position:[x,y],label} of corrected) {
          await panel.getByRole('button',{name:label?'Subject point':'Background point',exact:true}).click();
          await panel.getByRole('spinbutton',{name:'Subject point X',exact:true}).fill(String(x));
          await panel.getByRole('spinbutton',{name:'Subject point Y',exact:true}).fill(String(y));
          await panel.getByRole('button',{name:'Add point on selected frame',exact:true}).click();
        }
      }
      // Drop colour-key sleeve reconstruction. Revisit the actual object
      // selection; its source-conditioned alpha must define moving cloth.
      for (const group of (await panel.getByRole('group',{name:'Foreground matte refinement',exact:true}).all()).reverse()) {
        const left=Number(await group.getByRole('spinbutton',{name:'clear box left',exact:true}).inputValue());
        const hue=Number(await group.getByRole('spinbutton',{name:'recover hue',exact:true}).inputValue());
        if(left>0 || hue===26)await group.getByRole('button',{name:'Remove layer',exact:true}).click();
      }
      const maskControls=panel.getByRole('group',{name:'Subject mask',exact:true});
      for(const [i,key] of ['left','top','right','bottom'].entries())
        await maskControls.getByRole('spinbutton',{name:`Subject box ${key}`,exact:true}).fill(String([.26,.06,.98,1][i]));
      await save();await page.screenshot({path:path.join(evidence,'tv-frame-background-corrections.png')});
      await panel.getByRole('group',{name:'Subject mask',exact:true}).getByRole('button',{name:'Create subject mask',exact:true}).click();
      console.log('TV_FRAME_CORRECTION_MASK_REQUESTED');
    } else if (!process.argv.includes('--resume')) {
      const replacing = process.argv.includes('--replace-source');
      if (replacing) {
        const scenes = panel.getByRole('combobox', { name: 'Subject effect scene', exact: true });
        if (await scenes.locator('option').count() > 1) {
          await scenes.selectOption({ index: 1 });
          await panel.getByRole('button', { name: 'Remove scene', exact: true }).click();
        }
        await clickStudioControl(page, page.getByRole('tab', { name: 'Sequence', exact: true }));
        await clickStudioControl(page, page.locator('.studio-project-item').filter({ hasText: 'Speaker 2 - source 53-56s.mp4' }));
      }
      if (!replacing) {
      // This small source-camera holdout lies wholly INSIDE the person/rig for
      // the reviewed 3s interval. It fills two erroneous interior alpha holes;
      // the model/temporal matte continues to define every moving silhouette.
      await panel.getByRole('combobox', { name: 'Subject effect type', exact: true }).selectOption('foreground_holdout');
      await panel.getByRole('button', { name: 'Add layer', exact: true }).click();
      const holdout = panel.getByRole('group', { name: 'Foreground holdout', exact: true }).last();
      for (const [i, corner] of [[.38, .59], [.525, .59], [.525, .71], [.38, .71]].entries()) {
        for (const [axis, value] of corner.entries()) await holdout.getByRole('spinbutton', { name: `Holdout corner ${i + 1} ${axis ? 'Y' : 'X'}`, exact: true }).fill(String(value));
      }
      await holdout.getByRole('spinbutton', { name: 'feather', exact: true }).fill('.5');
      for (const group of await panel.getByRole('group', { name: 'Foreground matte refinement', exact: true }).all()) {
        const hue = Number(await group.getByRole('spinbutton', { name: 'reject hue', exact: true }).inputValue());
        if (hue === 230) await group.getByRole('spinbutton', { name: 'blue spill', exact: true }).fill('.7');
      }
      }
      await save();
      await page.getByTestId('project-media-import-input').setInputFiles(sourceFile);
      const card = page.locator('.studio-media-card').filter({ has: page.locator('strong', { hasText: path.basename(sourceFile) }) });
      await card.getByText('Saved · ready to edit', { exact: true }).waitFor({ timeout: 120000 });
      await card.getByRole('button', { name: replacing ? 'Replace selected clip' : 'Add to sequence', exact: true }).click();
      await save();
      await page.getByRole('button', { name: /Composite/ }).first().click();
      const sources = panel.getByRole('combobox', { name: 'Subject effect source clip', exact: true });
      const value = await sources.locator('option').filter({ hasText: path.basename(sourceFile) }).getAttribute('value');
      assert(value, 'New source must be an ordinary saved project source');
      await sources.selectOption(value);
      const mask = panel.getByRole('group', { name: 'Subject mask', exact: true });
      const box = [.26, .06, .98, 1];
      for (const [i, key] of ['left', 'top', 'right', 'bottom'].entries()) await mask.getByRole('spinbutton', { name: `Subject box ${key}`, exact: true }).fill(String(box[i]));
      await panel.getByRole('button', { name: 'Clear points', exact: true }).click();
      for (const [x, y, keep] of [[.56,.16,1],[.59,.30,1],[.58,.61,1],[.88,.70,1],[.34,.73,1],[.59,.96,1],[.35,.1,0],[.87,.15,0],[.13,.35,0]]) {
        await panel.getByRole('button', { name: keep ? 'Subject point' : 'Background point', exact: true }).click();
        await panel.getByRole('spinbutton', { name: 'Subject point X', exact: true }).fill(String(x));
        await panel.getByRole('spinbutton', { name: 'Subject point Y', exact: true }).fill(String(y));
        await panel.getByRole('button', { name: 'Add point on selected frame', exact: true }).click();
      }
      const details = mask.locator('details');
      if (!await details.evaluate(n => n.open)) await details.locator('summary').click();
      const components = [
        { box: [.08,.48,.69,1], fixed: false, points: [[.60,.64,1],[.35,.748,1],[.14,.91,1],[.20,.69,0],[.31,.65,0]] },
        { box: [0,.68,.20,1], fixed: true, points: [[.02,.81,1],[.13,.91,1],[.03,.68,0]] },
        { box: [0,.62,.26,1], fixed: true, points: [[.045,.91,1],[.08,.83,1],[.015,.65,0]] },
      ];
      for (const component of components) {
        for (const [i, key] of ['left','top','right','bottom'].entries()) await mask.getByRole('spinbutton', { name: `Component box ${key}`, exact: true }).fill(String(component.box[i]));
        await mask.getByRole('checkbox', { name: 'Object stays fixed in this shot', exact: true }).setChecked(component.fixed);
        for (const [x,y,keep] of component.points) {
          await mask.getByRole('spinbutton', { name: 'Component point X', exact: true }).fill(String(x));
          await mask.getByRole('spinbutton', { name: 'Component point Y', exact: true }).fill(String(y));
          await mask.getByRole('checkbox', { name: 'Keep component point', exact: true }).setChecked(!!keep);
          await mask.getByRole('button', { name: 'Add component point', exact: true }).click();
        }
        await mask.getByRole('button', { name: 'Add foreground component', exact: true }).click();
      }
      await save();
      await page.screenshot({ path: path.join(evidence, 'second-speaker-native-selection.png') });
      await mask.getByRole('button', { name: 'Create subject mask', exact: true }).click();
      console.log('SECOND_SPEAKER_MASK_REQUESTED');
    } else {
      const scenes = panel.getByRole('combobox', { name: 'Subject effect scene', exact: true });
      await scenes.selectOption({ index: 1 });
      const resume = panel.getByRole('button', { name: 'Resume subject mask', exact: true });
      if (await resume.isVisible()) await resume.click();
    }
    const mask = panel.getByRole('group', { name: 'Subject mask', exact: true });
    for (let i=0;i<3600;i++) {
      if (await mask.getByRole('button', { name: 'Subject mask attached', exact: true }).count()) break;
      const status = (await mask.getByRole('status').allTextContents()).join(' ');
      if (i%30 === 0) console.log('SECOND_MASK_STATUS', status);
      if (/failed|unavailable|MODEL_|OUTSIDE_/i.test(status)) throw Error(status);
      await page.waitForTimeout(1000);
    }
    await mask.getByRole('button', { name: 'Subject mask attached', exact: true }).waitFor();
    await save();
    console.log('SECOND_SPEAKER_MASK_ATTACHED');
    await mask.getByRole('spinbutton', { name: 'Edge refinement radius', exact: true }).fill('6');
    await mask.getByRole('button', { name: 'Refine saved mask edges', exact: true }).click();
    console.log('SECOND_SPEAKER_ALPHA_REQUESTED');
    for(let i=0;i<3600;i++) {
      const status=(await mask.getByRole('status').allTextContents()).join(' ');
      if(i%30===0) console.log('SECOND_ALPHA_STATUS',status);
      if(status.startsWith('Subject mask saved.')) break;
      if(/failed|unavailable|MODEL_|OUTSIDE_/i.test(status)) throw Error(status);
      await page.waitForTimeout(1000);
    }
    await mask.getByText('Subject mask saved. Adjust the background and render a preview; changing effects reuses this mask.', { exact: true }).waitFor();
    await backup('two-speaker-models-saved');
    console.log('SECOND_SPEAKER_ALPHA_ATTACHED');
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
