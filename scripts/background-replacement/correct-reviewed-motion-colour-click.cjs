// Remove one reviewed mixed/background colour from an owned demo correction.
// Uses normal authoring, Save and native backup; never alters a mask artifact.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {clickStudioControl} = require('../../test/e2e/playwright/studio-timeline-layout');
async function main() {
  const [demo, previous, out] = process.argv.slice(2).map(p => path.resolve(p));
  fs.mkdirSync(out, {recursive: false, mode: 0o700});
  const config = JSON.parse(fs.readFileSync(path.join(demo, 'browser-private.json')));
  assert.match(config.origin, /^http:\/\/127\.0\.0\.1:/);
  const state = path.join(out, 'native-state.json');
  fs.copyFileSync(path.join(previous, 'native-state.json'), state);
  const browser = await chromium.launch({headless: true, args: ['--mute-audio', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost']});
  const context = await browser.newContext({viewport: {width: 1600, height: 1100}, storageState: state, acceptDownloads: true, recordVideo: {dir: path.join(out, 'ordinary-authoring')}});
  const page = await context.newPage(); page.setDefaultTimeout(30000); page.on('dialog', d => d.accept());
  try {
    await page.goto(config.origin);
    await page.getByRole('button', {name: 'Viral Clip Studio', exact: true}).first().click();
    await page.getByRole('button', {name: 'Podcast moving-edge repair - 4 November', exact: true}).click();
    await page.locator('.viral-studio-container').waitFor();
    async function backup(name) {
      const show = page.getByRole('button', {name: 'Show media', exact: true});
      if (await show.isVisible()) await show.click();
      const menu = page.locator('details.studio-project-rail__head');
      if (!await menu.evaluate(n => n.open)) await menu.locator(':scope > summary').click();
      const [download] = await Promise.all([
        page.waitForEvent('download', {timeout: 60000}),
        page.getByRole('button', {name: 'Download project backup', exact: true}).click(),
      ]);
      const target = path.join(out, name + '.autopromote.json');
      await download.saveAs(target); return JSON.parse(fs.readFileSync(target));
    }
    const before = await backup('before-correction');
    const scene = before.snapshot.subjectVfxScenes[0];
    const id = 'component-b91a524b-c66c-4e30-851b-c99b5c7112b8';
    const component = scene.maskComponents.find(c => c.id === id); assert(component);
    const old = component.shotPrompts.find(p => p.frameIndex === 12); assert(old);
    const corrected = old.points.filter(p => !(p.label === 1 && Math.abs(p.position[0] - 1100/1430) < 1e-5 && Math.abs(p.position[1] - .38) < 1e-5));
    assert.equal(corrected.length, old.points.length - 1);
    await page.getByRole('button', {name: /Composite/}).first().click();
    const panel = page.locator('.studio-subject-vfx');
    await panel.getByRole('combobox', {name: 'Correction target', exact: true}).selectOption(id);
    const slider = panel.getByRole('slider', {name: 'Subject prompt frame', exact: true});
    await slider.press('Home'); for (let i=0;i<12;i++) await slider.press('ArrowRight');
    await panel.getByRole('button', {name: 'Clear points', exact: true}).click();
    for (const point of corrected) {
      await panel.getByRole('button', {name: point.label ? 'Subject point' : 'Background point', exact: true}).click();
      await panel.getByRole('spinbutton', {name: 'Subject point X', exact: true}).fill(String(point.position[0]));
      await panel.getByRole('spinbutton', {name: 'Subject point Y', exact: true}).fill(String(point.position[1]));
      await panel.getByRole('button', {name: 'Add point on selected frame', exact: true}).click();
    }
    const show = page.getByRole('button', {name: 'Show media', exact: true}); if (await show.isVisible()) await show.click();
    await clickStudioControl(page, page.getByTestId('studio-save-project'));
    const after = await backup('corrected-selection');
    assert.deepEqual(after.snapshot.subjectVfxScenes[0].maskComponents.find(c=>c.id===id).shotPrompts.find(p=>p.frameIndex===12).points, corrected);
    fs.writeFileSync(path.join(out,'source-correction.json'), JSON.stringify({sourceFrame:12, removedMixedBoundaryColourPoint:[1100,380], unchangedOtherFramePoints:true, normalStudioControls:true, sourceReviewed:true, newMaskRequired:true, creativeApproval:false},null,2));
    console.log('REVIEWED_SOURCE_CLICK_CORRECTED_AND_SAVED');
  } finally {
    await context.storageState({path: state, indexedDB: true}); await context.close(); await browser.close();
  }
}
main().catch(error => {console.error(error.message);process.exitCode=1;});
