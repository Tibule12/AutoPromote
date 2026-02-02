const vm = require('../../validationMiddleware');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('validatePromotionData (TikTok)', () => {
  test('rejects when sponsor missing for sponsored role in tiktok platform_options', () => {
    const req = { body: { platform: 'tiktok', platform_options: { tiktok: { role: 'sponsored' } } } };
    const res = makeRes();
    const next = jest.fn();

    vm.validatePromotionData(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('sponsor') }));
  });

  test('accepts when sponsor provided via platform_options for tiktok sponsored role', () => {
    const req = { body: { platform: 'tiktok', platform_options: { tiktok: { role: 'sponsored', sponsor: 'Acme' } } } };
    const res = makeRes();
    const next = jest.fn();

    vm.validatePromotionData(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});