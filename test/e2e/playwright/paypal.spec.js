const {test,expect}=require('@playwright/test');
const offers=require('../../../frontend/src/config/subscriptionOffers.json');
const getBase=()=>process.env.E2E_BASE_URL||'http://localhost:'+(process.env.STATIC_SERVER_PORT||5000);
test.beforeAll(async()=>{await require('./static-server');});
async function fixture(page){
 let paid=false,creates=0,activations=0;
 await page.addInitScript(()=>{
  window.__E2E_BYPASS=true;window.__E2E_TEST_TOKEN='e2e-test-token';
  localStorage.setItem('user',JSON.stringify({uid:'testUser',email:'test@local',name:'Test User',role:'user'}));
 });
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;let data={};
  if(path.endsWith('/plans'))data={plans:offers.map(p=>({...p,provisional:false,purchaseEnabled:p.id==='plus'}))};
  else if(path.endsWith('/processing'))data={processing:{planId:paid?'plus':'free',allowance:paid?500:100,remaining:paid?500:100,remainingPercent:100,rollingSpentTokens:0,reservedTokens:0,rolling30DayLimit:paid?2000:500,nextResetAt:'2026-12-03T08:00:00Z',storage:{limitBytes:1073741824}},balances:{purchasedCredits:23}};
  else if(path.endsWith('/status'))data={subscription:{planId:paid?'plus':'free',status:'active'}};
  else if(path.endsWith('/create-subscription')){creates++;expect(route.request().postDataJSON().planId).toBe('plus');data={subscriptionId:'I-LOCALAPPROVAL',approvalUrl:'https://www.paypal.com/webapps/billing/subscriptions?ba_token=BA-LOCAL-FIXTURE'};}
  else if(path.endsWith('/activate')){activations++;expect(route.request().postDataJSON().subscriptionId).toBe('I-LOCALAPPROVAL');paid=true;data={subscription:{planId:'plus',status:'active'}};}
  else if(path.endsWith('/catalog'))data={packs:[],available:false};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.route('https://www.paypal.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<h1>Isolated PayPal approval fixture</h1>'}));
 return{get creates(){return creates;},get activations(){return activations;}};
}
test('upgrade flow opens the owned Plus checkout and handles a cancelled return without activating',async({page})=>{
 const state=await fixture(page);await page.goto(getBase()+'/#/pricing');
 await expect(page.locator('[data-plan-id]')).toHaveCount(2);
 await expect(page.locator('[data-plan-id=plus]')).toContainText('$4.99');
 await page.getByRole('button',{name:'Choose Plus',exact:true}).click();
 await expect(page).toHaveURL(/www\.paypal\.com.*BA-LOCAL-FIXTURE/);expect(state.creates).toBe(1);
 await page.goto(getBase()+'/#/pricing?payment=cancelled');
 await expect(page.getByText('100 of 100 processing tokens available')).toBeVisible();expect(state.activations).toBe(0);
});
test('activation flow verifies the callback once, refreshes Plus usage and preserves legacy credits',async({page})=>{
 const state=await fixture(page);await page.goto(getBase()+'/#/pricing?subscription_id=I-LOCALAPPROVAL');
 await expect(page.getByText('Payment verified. Your increased allowance is ready.')).toBeVisible();
 await expect(page.getByText('500 of 500 processing tokens available')).toBeVisible();
 await expect(page.getByText(/Existing credits \(legacy wallet\): 23/)).toBeVisible();
 expect(state.activations).toBe(1);expect(state.creates).toBe(0);await expect(page).not.toHaveURL(/subscription_id=/);
});
