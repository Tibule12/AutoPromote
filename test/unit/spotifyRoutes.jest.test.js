const request = require('supertest');
const express = require('express');

// Mocks
jest.mock('../../src/firebaseAdmin', () => ({
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn(), // Mock set
        get: jest.fn()  // Mock get
      }))
    }))
  },
  admin: {}
}));

jest.mock('../../src/authMiddleware', () => (req, res, next) => {
  req.user = { uid: 'test-user-id' };
  req.userId = 'test-user-id';
  next();
});

jest.mock('../../src/services/spotifyService', () => ({
  searchTracks: jest.fn(),
  getTracksBatch: jest.fn(),
  postToSpotify: jest.fn()
}));

jest.mock('../../src/services/communityEngine', () => ({
  createSpotifyCampaign: jest.fn()
}));

const spotifyRoutes = require('../../src/routes/spotifyRoutes');
const spotifyService = require('../../src/services/spotifyService');
const communityEngine = require('../../src/services/communityEngine');

const app = express();
app.use(express.json());
app.use('/api/spotify', spotifyRoutes);

describe('Spotify Routes', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /search', () => {
    it('should return 400 if q parameter is missing', async () => {
      const res = await request(app).get('/api/spotify/search');
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/Query required/);
    });

    it('should return results when search is successful', async () => {
      const mockResults = { tracks: [{ id: '1', name: 'Song' }] };
      spotifyService.searchTracks.mockResolvedValue(mockResults);

      const res = await request(app).get('/api/spotify/search?q=test');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        results: mockResults.tracks
      });
      expect(spotifyService.searchTracks).toHaveBeenCalledWith({
        uid: 'test-user-id',
        query: 'test'
      });
    });

    it('should handle service errors gracefully', async () => {
      spotifyService.searchTracks.mockRejectedValue(new Error('Spotify Error'));

      const res = await request(app).get('/api/spotify/search?q=test');
      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Spotify Error');
    });
  });

  describe('POST /batch-metrics', () => {
    it('should return 400 if trackIds are missing', async () => {
      const res = await request(app).post('/api/spotify/batch-metrics').send({});
      expect(res.statusCode).toBe(400);
    });

    it('should return metrics for valid request', async () => {
        const mockMetrics = { '1': { popularity: 50 } };
        spotifyService.getTracksBatch.mockResolvedValue(mockMetrics);

        const res = await request(app)
            .post('/api/spotify/batch-metrics')
            .send({ trackIds: ['1'] });
        
        expect(res.statusCode).toBe(200);
        expect(res.body.metrics).toEqual(mockMetrics);
        expect(spotifyService.getTracksBatch).toHaveBeenCalledWith({
            uid: 'test-user-id',
            trackIds: ['1']
        });
    });
  });

  describe('POST /campaigns', () => {
      it('should create a campaign successfully', async () => {
          const mockCampaign = { campaignId: 'c1', playlistId: 'p1' };
          communityEngine.createSpotifyCampaign.mockReturnValue(mockCampaign);

          const res = await request(app)
            .post('/api/spotify/campaigns')
            .send({ playlistId: 'p1', brandName: 'TestBrand' });
          
          expect(res.statusCode).toBe(200);
          expect(res.body.campaign).toEqual(mockCampaign);
          expect(communityEngine.createSpotifyCampaign).toHaveBeenCalledWith({
              brandName: 'TestBrand',
              playlistId: 'p1',
              rewardPerStream: 0.05
          });
      });
  });
});
