const svcPath = '../services/videoClippingService';

// Mock firebaseAdmin before requiring the service
jest.mock('../firebaseAdmin', () => {
  let savedAnalysis = null;
  let savedAnalysisAdded = null;
  const createMock = jest.fn(async (obj) => { savedAnalysis = obj; return; });
  const addMock = jest.fn(async (obj) => { savedAnalysisAdded = obj; return { id: 'generated123' }; });
  const db = {
    collection: (name) => {
      if (name === 'content') {
        return { doc: (id) => ({ get: async () => ({ exists: true, data: () => ({ userId: 'user1' }) }) }) };
      }
      if (name === 'clip_analyses') {
        return { doc: (id) => ({ create: createMock, get: async () => ({ exists: true, data: () => ({ userId: 'user1', videoUrl: 'https://storage.googleapis.com/bucket/video.mp4', topClips: [{ id: 'clip1', start: 10, end: 20, score: 80, reason: 'r', platforms: ['tiktok'], captionSuggestion: 'caption', duration: 10 }] }) }) }) };
      }
      if (name === 'generated_clips') {
        return { add: addMock };
      }
      return { doc: (id) => ({ get: async () => ({ exists: false }) }) };
    }
  };
  return { __mocks: { createMock, addMock, getSavedAnalysis: () => savedAnalysis, getSavedAnalysisAdded: () => savedAnalysisAdded }, db, storage: { bucket: () => ({ upload: jest.fn(), file: () => ({ getSignedUrl: async () => ['https://signed.url'] }) }) } };
});

const svc = require(svcPath);

describe('VideoClippingService - analyze & generate integration', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    const fb = require('../firebaseAdmin');
    fb.__mocks.getSavedAnalysis = fb.__mocks.getSavedAnalysis; // noop to keep lint happy
    // Clear mock state
    fb.__mocks.createMock && fb.__mocks.createMock.mockClear && fb.__mocks.createMock.mockClear();
    fb.__mocks.addMock && fb.__mocks.addMock.mockClear && fb.__mocks.addMock.mockClear();
    // reset saved values
    fb.__mocks.getSavedAnalysis && typeof fb.__mocks.getSavedAnalysis === 'function' && (fb.__mocks.getSavedAnalysis._saved = null);
    fb.__mocks.getSavedAnalysisAdded && typeof fb.__mocks.getSavedAnalysisAdded === 'function' && (fb.__mocks.getSavedAnalysisAdded._saved = null);
  });

  test('analyzeVideo saves topClips with id and captionSuggestion', async () => {
    // Mock internals to avoid heavy processing
    jest.spyOn(svc, 'downloadVideo').mockResolvedValue();
    jest.spyOn(svc, 'extractMetadata').mockResolvedValue({ duration: 60 });
    jest.spyOn(svc, 'generateTranscript').mockResolvedValue([{ start: 0, end: 5, text: 'hello world' }]);
    jest.spyOn(svc, 'detectScenes').mockResolvedValue([{ start: 0, end: 15, duration: 15 }]);

    // Return predictable clip suggestion
    jest.spyOn(svc, 'generateClipSuggestions').mockReturnValue([{ id: 'clip1', start: 0, end: 15, duration: 15, viralScore: 85, reason: 'Good', platforms: ['tiktok'], captionSuggestion: 'Nice clip', text: 'hello' }]);

    const res = await svc.analyzeVideo('https://storage.googleapis.com/bucket/video.mp4', 'content123', 'user1');

    expect(res.analysisId).toBeDefined();
    const fb = require('../firebaseAdmin');
    const savedAnalysis = fb.__mocks.getSavedAnalysis();
    expect(savedAnalysis).not.toBeNull();
    expect(Array.isArray(savedAnalysis.topClips)).toBe(true);
    const tc = savedAnalysis.topClips[0];
    expect(tc.id).toBe('clip1');
    expect(tc.captionSuggestion).toBe('Nice clip');
    expect(tc.platforms).toEqual(['tiktok']);
  });

  test('generateClip downloads, renders, uploads and saves metadata', async () => {
    // Prepare analysis doc response is provided by mock above
    jest.spyOn(svc, 'downloadVideo').mockResolvedValue();
    jest.spyOn(svc, 'renderClip').mockResolvedValue();

    const result = await svc.generateClip('analysis-id', 'clip1', { aspectRatio: '9:16' });

    expect(result.success).toBe(true);
    expect(result.url).toBe('https://signed.url');
    // ensure generated_clips.add saved caption and platforms
    const fb = require('../firebaseAdmin');
    const saved = fb.__mocks.getSavedAnalysisAdded();
    expect(saved.caption).toBe('caption');
    expect(saved.platforms).toEqual(['tiktok']);
  });
});
