// Minimal smoke tests for payments endpoints: ensure modules load and handlers respond shape-wise.
// NOTE: Does not perform real auth; stubs authMiddleware by setting req.userId manually via direct handler invocation.
// We avoid external HTTP libs to keep dependencies unchanged.

const assert = (c,m)=> { if(!c){ console.error('FAIL', m); process.exit(1);} };

// Directly require routers
const paymentsStatus = require('../src/routes/paymentsStatusRoutes');
const paymentsExtended = require('../src/routes/paymentsExtendedRoutes');

// Extract route stack helpers (Express internal) - fragile but ok for smoke test
function findRoute(router, method, path) {
  const layer = router.stack.find(l => l.route && l.route.path === path && l.route.methods[method]);
  if (!layer) return null; return layer.route.stack[0].handle; // first handler after middlewares
}

async function invoke(handler, { body={}, userId='test-user' }={}) {
  return await new Promise((resolve) => {
    const req = { body, userId, user:{ uid:userId }, headers:{}, requestId:'test-req' };
    const res = { statusCode:200, _json:null, status(c){ this.statusCode=c; return this; }, json(p){ this._json=p; resolve({ status:this.statusCode, body:p }); } };
    handler(req, res, ()=> resolve({ status:500, body:{ error:'next_called' } }));
  });
}

// /status
const statusHandler = findRoute(paymentsStatus, 'get', '/status');
assert(statusHandler, 'status route handler not found');
// Provide fake user doc path by monkey patching composeStatus if needed
const res1 = await invoke(statusHandler, {});
assert(res1.status === 200, '/status should return 200');
assert(res1.body.ok === true, '/status ok true expected');

// /plans
const plansHandler = findRoute(paymentsExtended, 'get', '/plans');
assert(plansHandler, 'plans handler not found');
const res2 = await invoke(plansHandler, { userId:null });
assert(res2.status === 200, '/plans 200 expected');
assert(Array.isArray(res2.body.plans), 'plans array expected');

console.log('Payments routes smoke tests passed.');
