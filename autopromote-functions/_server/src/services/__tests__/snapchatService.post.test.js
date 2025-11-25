const { postToSnapchat } = require('../snapchatService');

jest.mock('../../firebaseAdmin', () => ({
  db: {
    collection: () => ({
      doc: () => ({
        collection: () => ({ doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }), set: async () => true }) }),
        get: async () => ({ exists: false, data: () => ({}) }), set: async () => true
      })
    }), __sets: {}
  }
}));

jest.mock('../../utils/ssrfGuard', () => ({ safeFetch: jest.fn(async () => ({ ok: true, json: async () => ({ id: 'creative_123', creative_id: 'creative_123' }) })) }));

describe('snapchatService.postToSnapchat', () => {
  test('simulates when no tokens', async () => {
    const res = await postToSnapchat({ contentId: 'c123', payload: {}, reason: 'test', uid: 'user_test' });
    expect(res.simulated).toBe(true);
    expect(res.platform).toBe('snapchat');
  });
});
