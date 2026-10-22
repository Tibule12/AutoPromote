// Use the account's ordinary Analytics refresh control; never dispatch content.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const out = path.resolve(process.env.PERFORMANCE_TEST_DIR || 'reports/content-performance-test-20261021');
async function main() {
  const browser = await chromium.launch({ channel:'chromium', headless:true, args:[
    '--mute-audio', '--host-resolver-rules=MAP localhost 127.0.0.4', '--no-proxy-server', '--disable-quic', '--disable-http2',
  ] });
  const context = await browser.newContext({ storageState:require('./studio-session').sessionPath,
    viewport:{ width:1500, height:1100 } });
  const page = await context.newPage(); page.setDefaultTimeout(90000);
  let contentWrites = 0; const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (['POST','PUT','PATCH','DELETE'].includes(request.method()) &&
      /^\/api\/(content|publisher|platform)\//.test(new URL(request.url()).pathname)) contentWrites++;
  });
  page.on('response', async response => {
    if (new URL(response.url()).pathname === '/api/analytics/user' && response.ok()) {
      fs.writeFileSync(path.join(out,'analytics-current.private.json'), JSON.stringify(await response.json(),null,2), {mode:0o600});
    }
  });
  try {
    await page.goto('http://localhost:5000/', {waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Analytics',exact:true}).click();
    const sync = page.getByRole('button',{name:'Sync latest platform statistics',exact:true});
    await sync.waitFor(); await page.waitForTimeout(1500);
    assert(!await page.evaluate(()=>!!window.__E2E_BYPASS));
    const before = path.join(out,'analytics-before.private.json');
    if (!fs.existsSync(before)) fs.copyFileSync(path.join(out,'analytics-current.private.json'), before);
    const waiting = page.waitForResponse(response => new URL(response.url()).pathname === '/api/analytics/refresh-post-metrics' && response.request().method() === 'POST');
    await sync.click(); const response = await waiting; const data = await response.json(); assert(response.ok());
    await sync.waitFor(); await page.waitForTimeout(4000);
    await page.screenshot({path:path.join(out,'analytics-after.private.png'),fullPage:true});
    fs.chmodSync(path.join(out,'analytics-after.private.png'),0o600);
    assert.equal(contentWrites,0); assert.deepEqual(errors,[]);
    const receipt = {at:new Date().toISOString(),normalSignedInUi:true,authBypass:false,routeInjection:false,
      contentOrScheduleWrites:contentWrites,runtimeErrors:errors,...data};
    const target = path.join(out,'metrics-refresh-receipt.json');
    if (fs.existsSync(target)) fs.renameSync(target,target.replace('.json',`.previous-${Date.now()}.json`));
    fs.writeFileSync(target,JSON.stringify(receipt,null,2)); console.log(JSON.stringify(receipt));
  } finally { await context.close(); await browser.close(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
