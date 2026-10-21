import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import AnalyticsPanel from "../AnalyticsPanel";

jest.mock("../../firebaseClient", () => ({ auth: {
  currentUser: { getIdToken: () => Promise.resolve("test-only-token") },
  onAuthStateChanged: callback => { if (global.analyticsTestAuthObserver) global.analyticsTestAuthObserver(callback); return () => {}; },
} }));
jest.mock("../../utils/workspace", () => ({ withWorkspaceHeaders: value => value }));

function response(views) {
  return { publishedPostCount: 1, totalViews: views, totalClicks: null, ctr: null,
    viralityTracker: { views, nextGoal: 50000 }, referralTracker: { total: 0, nextGoal: 10 },
    topContent: [{ postId: "owned-post", platform: "youtube", title: "Actual edit", views, clicks: null }],
    platformBreakdown: { youtube: { views, clicks: null, ctr: null } },
    measurement: { status: views === null ? "unavailable" : "available", note: "Missing statistics are unavailable." },
    entitlements: { analytics: { allowedRanges: ["7d"], recoveryLab: false, platformBreakdown: true } },
  };
}

afterEach(() => { delete global.analyticsTestAuthObserver; jest.restoreAllMocks(); });

test.each([null, 0])("renders uncollected or genuinely zero statistics without crashing: %s", async views => {
  global.fetch = jest.fn().mockImplementation(async url => ({ ok: true,
    json: async () => String(url).includes("workflow-summary") ? {} : response(views),
  }));
  render(<AnalyticsPanel />);
  expect(await screen.findByRole("button", { name: "Sync latest platform statistics" })).toBeEnabled();
  expect(screen.getByText(`Top Video: ${views === null ? "Unavailable" : "0"} views`)).toBeInTheDocument();
  expect(screen.getByText("Actual edit")).toBeInTheDocument();
});


test("the release selector scopes statistics through the normal owned analytics request", async () => {
  global.fetch = jest.fn().mockImplementation(async url => ({ ok: true,
    json: async () => String(url).includes("workflow-summary") ? {} : { ...response(null), releaseOptions: [{ id: "release-1", title: "Restaurant study" }] },
  }));
  render(<AnalyticsPanel />);
  const select = await screen.findByLabelText("Published release");
  fireEvent.change(select, { target: { value: "release-1" } });
  await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => String(url).includes("contentId=release-1"))).toBe(true));
});


test("a late account response cannot replace the chosen release statistics", async () => {
  let firstResolve, calls = 0;
  const releases = [{ id: "release-1", title: "Restaurant study" }];
  const all = { ...response(99), releaseOptions: releases };
  const selected = { ...response(0), releaseOptions: releases, selectedReleaseId: "release-1" };
  global.analyticsTestAuthObserver = callback => { Promise.resolve().then(() => callback({ uid: "owner" })); };
  global.fetch = jest.fn().mockImplementation(url => {
    if (String(url).includes("workflow-summary")) return Promise.resolve({ ok: true, json: async () => ({}) });
    if (++calls === 1) return new Promise(resolve => { firstResolve = () => resolve({ ok: true, json: async () => all }); });
    return Promise.resolve({ ok: true, json: async () => String(url).includes("contentId=release-1") ? selected : all });
  });
  render(<AnalyticsPanel />);
  fireEvent.change(await screen.findByLabelText("Published release"), { target: { value: "release-1" } });
  expect(await screen.findByText("Top Video: 0 views")).toBeInTheDocument();
  await act(async () => { firstResolve(); await Promise.resolve(); });
  expect(screen.getByText("Top Video: 0 views")).toBeInTheDocument();
  expect(screen.queryByText("Top Video: 99 views")).not.toBeInTheDocument();
});
