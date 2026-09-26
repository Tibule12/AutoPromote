import {
  clearViralRenderAttempt,
  loadViralRenderAttempt,
  saveViralRenderAttempt,
} from "../viralRenderRecovery";

const REQUEST_A = "render-request-a123";
const REQUEST_B = "render-request-b456";
const STORAGE_PREFIX = "autopromote-viral-render-attempt:";

describe("viral render recovery", () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
  });

  test("persists the request and draft flag for only the signed-in user", () => {
    saveViralRenderAttempt("creator-a", {
      requestId: REQUEST_A,
      captionReviewCopy: true,
    });

    expect(loadViralRenderAttempt("creator-a")).toEqual({
      requestId: REQUEST_A,
      createdAt: Date.now(),
      captionReviewCopy: true,
    });
    expect(loadViralRenderAttempt("creator-b")).toBeNull();

    saveViralRenderAttempt("creator-b", { requestId: REQUEST_B });
    expect(loadViralRenderAttempt("creator-a").requestId).toBe(REQUEST_A);
    expect(loadViralRenderAttempt("creator-b").requestId).toBe(REQUEST_B);
    expect(loadViralRenderAttempt("creator-b").captionReviewCopy).toBe(false);
  });

  test("an old cleanup cannot erase a newer render attempt", () => {
    saveViralRenderAttempt("creator-a", { requestId: REQUEST_A });
    saveViralRenderAttempt("creator-a", { requestId: REQUEST_B });

    clearViralRenderAttempt("creator-a", REQUEST_A);
    expect(loadViralRenderAttempt("creator-a").requestId).toBe(REQUEST_B);

    clearViralRenderAttempt("creator-a", REQUEST_B);
    expect(loadViralRenderAttempt("creator-a")).toBeNull();
  });

  test("expires stale attempts so they cannot revive an unrelated render", () => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000 - 1;
    saveViralRenderAttempt("creator-a", {
      requestId: REQUEST_A,
      createdAt: sevenDaysAgo,
    });

    expect(loadViralRenderAttempt("creator-a")).toBeNull();
    expect(window.localStorage.getItem(`${STORAGE_PREFIX}creator-a`)).toBeNull();
  });

  test("rejects malformed stored requests without exposing them to recovery", () => {
    window.localStorage.setItem(`${STORAGE_PREFIX}creator-a`, "{corrupt json");
    expect(loadViralRenderAttempt("creator-a")).toBeNull();

    window.localStorage.setItem(
      `${STORAGE_PREFIX}creator-a`,
      JSON.stringify({ requestId: "../another-user", createdAt: Date.now() })
    );
    expect(loadViralRenderAttempt("creator-a")).toBeNull();
  });

  test("blocked browser storage does not prevent a render attempt", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage is unavailable");
    });

    expect(() => saveViralRenderAttempt("creator-a", { requestId: REQUEST_A })).not.toThrow();
    expect(loadViralRenderAttempt("creator-a")).toBeNull();
  });
});
