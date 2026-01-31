const vm = require('../src/validationMiddleware');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('validatePromotionData', () => {
  test('rejects when sponsor missing for sponsored role in body', () => {
    const req = { body: { platform: 'youtube', role: 'sponsored' } };
    const res = makeRes();
    const next = jest.fn();

    vm.validatePromotionData(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('sponsor') }));
    expect(next).not.toHaveBeenCalled();
  });

  test('accepts when sponsor provided via platform_options for sponsored role', () => {
    const req = { body: { platform: 'facebook', platform_options: { facebook: { role: 'sponsored', sponsor: 'Acme' } } } };
    const res = makeRes();
    const next = jest.fn();

    vm.validatePromotionData(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('rejects when boosted role has neither boostBudget nor targetViews (body)', () => {
    const req = { body: { platform: 'youtube', role: 'boosted' } };
    const res = makeRes();
    const next = jest.fn();

    vm.validatePromotionData(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('boostBudget') }));
    expect(next).not.toHaveBeenCalled();
  });

  test('accepts when boosted role has boostBudget via platform_options', () => {
    const req = { body: { platform: 'facebook', platform_options: { facebook: { role: 'boosted', boostBudget: 25 } } } };
    const res = makeRes();
    const next = jest.fn();

    vm.validatePromotionData(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('rejects unsupported platform', () => {
    const req = { body: { platform: 'myspace' } };
    const res = makeRes();
    const next = jest.fn();

    vm.validatePromotionData(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Unsupported') }));
    expect(next).not.toHaveBeenCalled();
  });
});
