const middleware = require('../src/validationMiddleware');

function assert(cond, msg){ if(!cond){ console.error('FAIL:', msg); process.exit(1);} }

function makeMock() {
  const res = {
    statusCode: null,
    body: null,
    status(code){ this.statusCode = code; return this; },
    json(obj){ this.body = obj; return this; }
  };
  const next = () => { next.called = true; };
  next.called = false;
  return { res, next };
}

(async function run(){
  console.log('Running validation middleware tests...');

  // Test 1: missing platform => 400
  const req1 = { body: {} };
  const { res: res1, next: next1 } = makeMock();
  await middleware.validatePromotionData(req1, res1, next1);
  assert(res1.statusCode === 400, 'Expected 400 when platform missing');
  assert(res1.body && res1.body.error && res1.body.error.includes('platform'), 'Expected error message about platform');

  // Test 2: discord without channelId => 400
  const req2 = { body: { platform: 'discord' } };
  const { res: res2, next: next2 } = makeMock();
  await middleware.validatePromotionData(req2, res2, next2);
  assert(res2.statusCode === 400, 'Expected 400 when discord missing channelId');

  // Test 3: discord with channelId => next called
  const req3 = { body: { platform: 'discord', channelId: '12345' } };
  const { res: res3, next: next3 } = makeMock();
  await middleware.validatePromotionData(req3, res3, next3);
  assert(next3.called === true, 'Expected next() to be called for valid discord payload');

  // Test 4: unsupported platform => 400
  const req4 = { body: { platform: 'myspace' } };
  const { res: res4, next: next4 } = makeMock();
  await middleware.validatePromotionData(req4, res4, next4);
  assert(res4.statusCode === 400, 'Expected 400 for unsupported platform');

  console.log('All validation middleware tests passed.');
  process.exit(0);
})();