const http = require('http');

jest.mock(
  'express',
  () => {
    try {
      return require('express');
    } catch {
      return require('../frontend/node_modules/express');
    }
  },
  { virtual: true }
);
const express = require('express');

jest.mock('../src/authMiddleware', () => (req, res, next) => {
  if (req.get('Authorization') !== 'Bearer owner') return res.sendStatus(401);
  req.user = { uid: 'owner' };
  next();
});
jest.mock('../src/services/studioDirectorCreativePlanner', () => ({
  createCreativePlanner: jest.fn(),
  localInference: jest.fn(),
}));

const { createCreativePlanner } = require('../src/services/studioDirectorCreativePlanner');

const app = express();
app.use(express.json());
app.use('/plan', require('../src/routes/studioDirectorCreativeRoutes'));

async function callRoute(method, path, { authHeader, body } = {}) {
  return new Promise(resolve => {
    const headers = { 'content-type': 'application/json' };
    if (authHeader) headers.authorization = authHeader;
    const req = {
      method,
      url: path === '/plan' ? '/' : path,
      originalUrl: path,
      headers,
      body: body !== undefined ? body : {},
      get(name) {
        return headers[String(name).toLowerCase()];
      },
      header(name) {
        return headers[String(name).toLowerCase()];
      },
    };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      sendStatus(code) {
        this.statusCode = code;
        resolve({ status: this.statusCode, body: {} });
        return this;
      },
      json(payload) {
        resolve({ status: this.statusCode, body: payload });
        return this;
      },
      end() {
        resolve({ status: this.statusCode, body: {} });
        return this;
      },
    };
    const router = require('../src/routes/studioDirectorCreativeRoutes');
    router.handle(req, res, () => resolve({ status: 404, body: {} }));
  });
}

afterEach(() => {
  delete process.env.STUDIO_DIRECTOR_LOCAL_PLANNER;
  jest.clearAllMocks();
});

test('both capability status and planning require normal authentication', async () => {
  expect((await callRoute('GET', '/plan')).status).toBe(401);
  expect((await callRoute('POST', '/plan', { body: {} })).status).toBe(401);
  expect(createCreativePlanner).not.toHaveBeenCalled();
});

test('feature is unavailable by default and never invokes inference', async () => {
  expect(
    (await callRoute('GET', '/plan', { authHeader: 'Bearer owner' })).body.available
  ).toBe(false);
  expect(
    (await callRoute('POST', '/plan', { authHeader: 'Bearer owner', body: {} })).status
  ).toBe(503);
  expect(createCreativePlanner).not.toHaveBeenCalled();
});

test('enabled planning returns the model plan without applying edits or inventing a fallback', async () => {
  process.env.STUDIO_DIRECTOR_LOCAL_PLANNER = 'true';
  const planner = jest.fn().mockResolvedValue({ fingerprint: 'a'.repeat(64) });
  createCreativePlanner.mockReturnValue(planner);
  const response = await callRoute('POST', '/plan', {
    authHeader: 'Bearer owner',
    body: { brief: 'Move' },
  });
  expect(response.status).toBe(200);
  expect(response.body.plan.fingerprint).toBe('a'.repeat(64));
  expect(planner).toHaveBeenCalledWith({ brief: 'Move' });
});

test('invalid provider output is refused without a recipe fallback', async () => {
  process.env.STUDIO_DIRECTOR_LOCAL_PLANNER = 'true';
  createCreativePlanner.mockReturnValue(
    jest.fn().mockRejectedValue(Object.assign(new Error('Invalid storyboard'), { status: 422 }))
  );
  const response = await callRoute('POST', '/plan', {
    authHeader: 'Bearer owner',
    body: {},
  });
  expect(response.status).toBe(422);
  expect(response.body.error).toBe('Invalid storyboard');
});
