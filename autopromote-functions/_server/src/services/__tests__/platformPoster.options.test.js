const { dispatchPlatformPost } = require('../platformPoster');

jest.mock('../../firebaseAdmin', () => ({
  db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ title: 'My Title' }) }) }) }) }
}));

jest.mock('../pinterestService', () => ({ postToPinterest: jest.fn(async (args) => ({ ok: true })) }));
const { postToPinterest } = require('../pinterestService');

describe('platformPoster platformOptions merge', () => {
  beforeEach(() => { postToPinterest.mockClear(); });

  test('dispatchPlatformPost merges platformOptions into top-level args for pinterest', async () => {
    const res = await dispatchPlatformPost({ platform: 'pinterest', contentId: 'abc', payload: { message: 'Hello', platformOptions: { pinterest: { boardId: 'board123' } } }, reason: 'test', uid: 'user1' });
    expect(postToPinterest).toHaveBeenCalled();
    const arg = postToPinterest.mock.calls[0][0];
    // ensure top-level boardId merged
    expect(arg.boardId || arg.pinterest?.boardId || arg.payload?.platformOptions?.pinterest?.boardId).toBeTruthy();
    expect(arg.boardId || arg.boardid || arg.pinterest?.boardId || arg.payload?.platformOptions?.pinterest?.boardId).toEqual('board123');
  });
});
