const express = require('express');
const request = require('supertest');

jest.mock('../firebaseAdmin', () => ({ db: { collection: jest.fn(), runTransaction: jest.fn() }, admin: {} }));
jest.mock('../authMiddleware', () => jest.fn((_req, _res, next) => next()));
jest.mock('../middlewares/globalRateLimiter', () => ({ rateLimiter: () => (_req, _res, next) => next() }));
jest.mock('../services/discordService', () => ({ postViaBot: jest.fn() }));

const { db } = require('../firebaseAdmin');
const engine = require('../services/communityEngine');
const app = express();
app.use(express.json());
app.use('/api/community', require('../routes/communityRoutes'));

afterEach(() => jest.clearAllMocks());

test.each([
  ['get', '/tasks'], ['post', '/campaign'], ['post', '/claim/old-campaign'],
  ['post', '/confirm/old-proof'], ['delete', '/campaign'],
])('retired %s %s refuses even if the former enable flag is true', async (method, suffix) => {
  const previous = process.env.ENABLE_WOLF_HUNT;
  process.env.ENABLE_WOLF_HUNT = 'true';
  try {
    const result = await request(app)[method]('/api/community/wolf-hunt'+suffix).send({ quantity: 10 });
    expect(result.status).toBe(410);
    expect(result.body.error).toBe('FEATURE_RETIRED');
    expect(db.collection).not.toHaveBeenCalled();
    expect(db.runTransaction).not.toHaveBeenCalled();
  } finally {
    if (previous === undefined) delete process.env.ENABLE_WOLF_HUNT;
    else process.env.ENABLE_WOLF_HUNT = previous;
  }
});

test.each(['createEngagementBounty','claimTask','confirmTaskCompletion','purchaseCredits',
  'deploySquad','processStaleBounties','triggerPriorityBotSurge'])('legacy %s cannot create work or alter balances', async name => {
  await expect(engine[name]('old-user','old-object')).rejects.toMatchObject({ code:'FEATURE_RETIRED', statusCode:410 });
  expect(db.collection).not.toHaveBeenCalled();
  expect(db.runTransaction).not.toHaveBeenCalled();
});

test('editing entitlements and credit allocations survive removal of mission advertising', () => {
  const { SUBSCRIPTION_PLANS, LEGACY_SUBSCRIPTION_PLANS, getPlanCapabilities } = require('../config/subscriptionPlans');
  expect(LEGACY_SUBSCRIPTION_PLANS.free.features.monthlyCredits).toBe(15);
  expect(SUBSCRIPTION_PLANS.free.processing.tokens).toBe(100);
  expect(SUBSCRIPTION_PLANS.free.features.monthlyCredits).toBe(0);
  for (const plan of Object.values(SUBSCRIPTION_PLANS)) {
    expect(plan.features).not.toHaveProperty('wolfHuntTasks');
    const capabilities = getPlanCapabilities(plan.id);
    expect(capabilities).not.toHaveProperty('missions');
    expect(capabilities.editing.features.viralClipStudio.enabled).toBe(true);
  }
});
