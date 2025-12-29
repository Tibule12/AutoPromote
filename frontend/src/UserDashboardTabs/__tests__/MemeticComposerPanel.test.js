import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import MemeticComposerPanel from "../MemeticComposerPanel";

jest.mock("../../firebaseClient", () => ({
  auth: { currentUser: { getIdToken: jest.fn().mockResolvedValue("fake-token") } },
}));

describe("MemeticComposerPanel", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test("loads sounds, generates a plan and seeds it", async () => {
    // GET /api/sounds
    global.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ sounds: [{ id: "s1", title: "Sound 1" }] }),
      })
    );

    // POST /api/clips/memetic/plan
    global.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ variants: [{ id: "v1", caption: "Variant 1", score: 42 }] }),
      })
    );

    // POST /api/clips/memetic/seed
    global.fetch.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: async () => ({ experimentId: "e1" }) })
    );

    render(<MemeticComposerPanel onClose={() => {}} />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    // Sound select should contain the sound
    expect(screen.getByLabelText(/Base Sound/i)).toBeInTheDocument();

    // Click generate
    const genButton = screen.getByText(/Generate Plan/i);
    fireEvent.click(genButton);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

    // Variant should show up
    expect(await screen.findByText(/Variant 1/)).toBeInTheDocument();

    // Click Seed Plan
    const seedBtn = screen.getByText(/Seed Plan/i);
    fireEvent.click(seedBtn);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
  });
});
