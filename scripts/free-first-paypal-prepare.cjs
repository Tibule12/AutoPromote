// Authorized merchant configuration only. Creates no subscription and charges nobody.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validatePlusPlanDefinition } = require('../src/services/payments/subscriptionVerification');
const privateRoot = '/home/tibule12/.local/share/autopromote-qa/free-first-launch-20261127';
const receiptPath = path.join(privateRoot, 'paypal-plan.private.json');
const approval = require('../reports/free-first-launch-20261127/approval-and-status.json');
if (approval.liveCheckoutAmountUsd !== 4.99 || approval.qualificationMaximumUsd !== 5)
  throw Error('Approved launch terms required');
const apply = process.argv.includes('--prepare');
const activate = process.argv.includes('--activate');
const credentials = require('dotenv').parse(fs.readFileSync('/home/tibule12/Projects/AutoPromte/AutoPromote/.env'));
const base = 'https://api-m.paypal.com';
const plan = require('../config/free-first-release/paypal-plus-plan.draft.json');
const product = require('../config/free-first-release/paypal-product.draft.json');
async function main() {
  if (!apply && !activate) {
    console.log(JSON.stringify({ mode: 'dry-run', priceUsd: 4.99, setupFeeUsd: 0, period: 'MONTH', trial: false }));
    return;
  }
  if (credentials.PAYPAL_MODE !== 'live') throw Error('Existing live merchant credentials required');
  const tokenResponse = await fetch(base + '/v1/oauth2/token', { method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Basic ' + Buffer.from(credentials.PAYPAL_CLIENT_ID + ':' + credentials.PAYPAL_CLIENT_SECRET).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  if (!tokenResponse.ok) throw Error('Merchant OAuth unavailable: ' + tokenResponse.status);
  const access = (await tokenResponse.json()).access_token;
  let state = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath)) : {};
  const save = () => { fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
    fs.writeFileSync(receiptPath, JSON.stringify(state, null, 2), { mode: 0o600 }); };
  async function read(endpoint) {
    const response = await fetch(base + endpoint, { signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + access } });
    if (!response.ok) throw Error('Merchant read failed: ' + response.status);
    return response.json();
  }
  async function create(endpoint, body, field) {
    if (state[field]) return state[field];
    if (state.pending) throw Error('Reconcile the existing merchant mutation before another creation');
    const requestId = crypto.randomUUID();
    state.pending = { endpoint, requestId, field, startedAt: new Date().toISOString() }; save();
    const response = await fetch(base + endpoint, { method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json', 'PayPal-Request-Id': requestId },
      body: JSON.stringify(body) });
    if (!response.ok) throw Error('Merchant creation failed: ' + response.status);
    const created = await response.json();
    if (!created.id) throw Error('Merchant returned no object identity');
    state[field] = created.id; delete state.pending; save(); return created.id;
  }
  if (apply) {
    const productId = await create('/v1/catalogs/products', product, 'productId');
    await create('/v1/billing/plans', { ...plan, product_id: productId, quantity_supported: false }, 'planId');
  }
  if (!state.planId) throw Error('Prepare the one approved plan first');
  let remote = await read('/v1/billing/plans/' + state.planId);
  validatePlusPlanDefinition(remote, { requireActive: false });
  if (activate && remote.status !== 'ACTIVE') {
    const response = await fetch(base + '/v1/billing/plans/' + state.planId + '/activate', { method: 'POST',
      signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' } });
    if (!response.ok) throw Error('Plan activation failed: ' + response.status);
    remote = await read('/v1/billing/plans/' + state.planId);
    validatePlusPlanDefinition(remote);
  }
  state.status = remote.status; state.termsVerifiedAt = new Date().toISOString(); save();
  const output = { mode: 'live', productId: state.productId, planId: state.planId, status: state.status,
    priceUsd: 4.99, setupFeeUsd: 0, period: 'MONTH', trial: false, quantitySupported: false,
    autoBillOutstanding: false, subscriptionsCreated: 0, buyerCharges: 0 };
  fs.writeFileSync(path.resolve('reports/free-first-launch-20261127/paypal-plan-prepared.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(output));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
