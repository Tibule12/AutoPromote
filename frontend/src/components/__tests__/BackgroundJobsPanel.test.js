import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import BackgroundJobsPanel from "../BackgroundJobsPanel";

jest.mock("../../firebaseClient", () => ({
  auth: {
    currentUser: {
      getIdToken: jest.fn().mockResolvedValue("token-123"),
    },
  },
}));

describe("BackgroundJobsPanel", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  test("renders worker freshness from admin env status", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({
        ok: true,
        backgroundJobsEnabled: true,
        workerStatus: {
          required: ["promotionTasks", "platformMetrics"],
          staleThresholdSec: 900,
          allHealthy: false,
          details: {
            promotionTasks: { found: true, ok: true, lastRun: "2026-03-15T10:00:00.000Z", status: "ok" },
            platformMetrics: { found: true, ok: false, lastRun: "2026-03-15T08:00:00.000Z", status: "lagging" },
          },
        },
      }),
    });

    render(<BackgroundJobsPanel />);

    await waitFor(() => expect(screen.getByText(/Background Jobs/i)).toBeInTheDocument());
    expect(screen.getByText(/Enabled/i)).toBeInTheDocument();
    expect(screen.getByText(/Worker Attention Needed/i)).toBeInTheDocument();
    expect(screen.getByTestId("background-job-promotionTasks")).toHaveTextContent(/OK/i);
    expect(screen.getByTestId("background-job-platformMetrics")).toHaveTextContent(/Stale/i);
  });
});