const { uploadTikTokVideo } = require('../tiktokService');

describe('tiktokService', () => {
  test('uploadTikTokVideo returns simulated id', async () => {
    const res = await uploadTikTokVideo({ contentId: 'c123', payload: { videoUrl: 'http://example.com/video.mp4' } });
    expect(res).toHaveProperty('videoId');
    expect(res.simulated).toBeTruthy();
  });
});
