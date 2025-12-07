// Minimal smoke tests for payments endpoints: ensure modules load and handlers respond shape-wise.
// NOTE: Does not perform real auth; stubs authMiddleware by setting req.userId manually via direct handler invocation.
// We avoid external HTTP libs to keep dependencies unchanged.

process.env.DEBUG_TEST_LOGS = '1';
const assert = (c,m)=> { if(!c){ throw new Error('FAIL: '+m); } };

// Directly require routers
const paymentsStatus = require('../src/routes/paymentsStatusRoutes');
const paymentsExtended = require('../src/routes/paymentsExtendedRoutes');

// Extract route stack helpers (Express internal) - fragile but ok for smoke test
const { composeStatus } = require('../src/services/payments');
function findRoute(router, method, path) {
  const layer = router.stack.find(l => l.route && l.route.path === path && l.route.methods[method]);
  if (!layer) return null;
  // Return the final handler in the route stack (last middleware registered is the actual request handler)
  const lastIndex = (layer.route.stack && layer.route.stack.length) ? layer.route.stack.length - 1 : 0;
  return layer.route.stack[lastIndex].handle;
}

async function invoke(handler, { body={}, userId='test-user' }={}) {
  return await new Promise((resolve) => {
    const req = { body, userId, user:{ uid:userId }, headers:{}, requestId:'test-req' };
    const res = { statusCode:200, _json:null, status(c){ this.statusCode=c; return this; }, json(p){ this._json=p; resolve({ status:this.statusCode, body:p }); } };
    try {
      handler(req, res, ()=> resolve({ status:500, body:{ error:'next_called' } }));
    } catch (e) {
      resolve({ status:500, body:{ error: e && e.message ? e.message : String(e), stack: e && e.stack } });
    }
  });
}

describe('payments routes smoke tests', () => {
  test('/status returns ok true', async () => {
    const statusHandler = findRoute(paymentsStatus, 'get', '/status');
    expect(statusHandler).toBeTruthy();
    // Debug: call composeStatus directly to ensure it doesn't throw
    try {
      const cs = await composeStatus(null);
      if (!cs || typeof cs !== 'object') console.log('composeStatus returned unexpected:', cs);
    } catch (e) {
      console.log('composeStatus threw:', e && e.message);
    }
    const res1 = await invoke(statusHandler, {});  
    if (res1.status !== 200) { console.log('status error body:', res1.body); }
    expect(res1.status).toBe(200);
    expect(res1.body.ok).toBe(true);
  });

  test('/plans returns plans array', async () => {
    const plansHandler = findRoute(paymentsExtended, 'get', '/plans');
    expect(plansHandler).toBeTruthy();
    const res2 = await invoke(plansHandler, { userId:null });
    expect(res2.status).toBe(200);
    expect(Array.isArray(res2.body.plans)).toBe(true);
  });
});
