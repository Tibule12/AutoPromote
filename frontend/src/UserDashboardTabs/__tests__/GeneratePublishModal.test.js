import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GeneratePublishModal from "../GeneratePublishModal";

// Use an explicit async mock to avoid intermittent undefined resolution
global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ jobId: "job1" }) }));

test("opens modal and starts generation", async () => {
  const onStarted = jest.fn();
  render(
    <GeneratePublishModal
      open={true}
      contentItem={{ id: "c1", title: "Video 1" }}
      onClose={() => {}}
      onStarted={onStarted}
    />
  );

  expect(screen.getByText(/Generate & Publish/i)).toBeInTheDocument();
  // Ensure fetch mock is installed right before the network call
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ jobId: "job1" }) }));
  fireEvent.click(screen.getByText("Confirm"));

  await waitFor(() => expect(onStarted).toHaveBeenCalled());
  expect(screen.getByText(/Processing/i)).toBeInTheDocument();
});
