import {
  analyzeCaptionSegmentsFaceAndBodySafety,
  buildOccupancyFromRgbaFrame,
  scoreSafeZonesFromOccupancy,
} from "../studioCaptionSafety";

describe("studioCaptionSafety face and body avoidance", () => {
  test("buildOccupancyFromRgbaFrame detects skin face cluster and upper torso envelope", () => {
    const w = 160;
    const h = 90;
    const rgba = new Uint8ClampedArray(w * h * 4);
    // Paint neutral dark background
    for (let i = 0; i < w * h; i += 1) {
      rgba[i * 4] = 28;
      rgba[i * 4 + 1] = 34;
      rgba[i * 4 + 2] = 44;
      rgba[i * 4 + 3] = 255;
    }
    // Paint realistic warm-skin face block on the RIGHT half (x: 105..135, y: 12..34)
    for (let y = 12; y <= 34; y += 1) {
      for (let x = 105; x <= 135; x += 1) {
        const idx = (y * w + x) * 4;
        rgba[idx] = 206;
        rgba[idx + 1] = 148;
        rgba[idx + 2] = 114;
      }
    }

    const occ = buildOccupancyFromRgbaFrame(rgba, w, h);
    expect(occ.faces.length).toBeGreaterThanOrEqual(1);
    const decision = scoreSafeZonesFromOccupancy({
      faceMask: occ.faceMask,
      bodyMask: occ.bodyMask,
      clutterMask: occ.clutterMask,
      width: w,
      height: h,
      styleName: "editorial_duo",
      preferredMode: "smart_safe",
    });
    // Must dodge right-side face/torso onto clean left or lower-left zone
    expect(decision.placement).not.toMatch(/right/);
    expect(decision.faceOverlap).toBeLessThan(0.05);
    expect(decision.safe).toBe(true);
  });

  test("analyzeCaptionSegmentsFaceAndBodySafety prefers server analyzer when credentials and remote clip exist", async () => {
    const origFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        segments: [
          {
            id: "cue-1",
            start: 1,
            end: 3,
            text: "Safe side column",
            captionPlacement: "side_right",
            captionX: 79,
            captionY: 49,
            captionSafety: { placement: "side_right", faceOverlap: 0.0, bodyOverlap: 0.02, safetyScore: 0.99, safe: true },
          },
        ],
        summary: { cuesAnalyzed: 1, averageSafetyScore: 0.99, facesDetectedCues: 1, zeroFaceOverlapCues: 1 },
      }),
    }));
    try {
      const res = await analyzeCaptionSegmentsFaceAndBodySafety({
        apiBaseUrl: "https://api.example.com",
        authToken: "token-123",
        sourceUrl: "https://cdn.example.com/podcast.mp4",
        segments: [{ id: "cue-1", start: 1, end: 3, text: "Safe side column" }],
        preferredMode: "smart_safe",
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(res.segments[0].captionPlacement).toBe("side_right");
      expect(res.summary.engine).toBe("python-yunet-body-worker");
    } finally {
      global.fetch = origFetch;
    }
  });
});
