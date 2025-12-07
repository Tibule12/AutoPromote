const middleware = require('../src/validationMiddleware');

function makeMock() {
  const res = {
    statusCode: null,
    body: null,
    status(code){ this.statusCode = code; return this; },
    json(obj){ this.body = obj; return this; }
  };
  const next = jest.fn(() => true);
  return { res, next };
}

describe('validation middleware', () => {
  test('returns 400 when platform missing', async () => {
    const { res, next } = makeMock();
    const req = { body: {} };
    await middleware.validatePromotionData(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(res.body).toBeTruthy();
    expect(res.body.error).toMatch(/platform/i);
  });

  test('returns 400 when discord missing channelId', async () => {
    const { res, next } = makeMock();
    const req = { body: { platform: 'discord' } };
    await middleware.validatePromotionData(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  test('calls next when discord has channelId', async () => {
    const { res, next } = makeMock();
    const req = { body: { platform: 'discord', channelId: '12345' } };
    await middleware.validatePromotionData(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 400 for unsupported platform', async () => {
    const { res, next } = makeMock();
    const req = { body: { platform: 'myspace' } };
    await middleware.validatePromotionData(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});