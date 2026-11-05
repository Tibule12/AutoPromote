import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import CommunityDestinationPicker from "../components/CommunityDestinationPicker";
import UnifiedPublisher from "../features/publishing/UnifiedPublisher";
import { auth } from "../firebaseClient";
import { API_ENDPOINTS } from "../config";
jest.mock("../firebaseClient", () => ({ auth: { currentUser: { getIdToken: jest.fn() } } }));
jest.mock("../components/VideoEditor", () => () => null);
jest.mock("../components/ImageCropper", () => () => null);
jest.mock("../components/PayPalSubscriptionPanel", () => () => null);
jest.mock("../components/HashtagSuggestions", () => () => null);
jest.mock("../components/BestTimeToPost", () => ({
  __esModule: true,
  default: () => null,
  OPTIMAL_TIMES: {},
}));
const destinations = {
  telegram: {
    id: "a".repeat(64),
    targetId: "-100123456789",
    label: "Creator subscribers",
    platform: "telegram",
  },
  discord: {
    id: "b".repeat(64),
    targetId: "123456789012345678",
    label: "Community announcements",
    platform: "discord",
  },
};
const asset = {
  id: "existing-movie",
  title: "Creator release",
  description: "New movie",
  source: "studio",
  url: "https://storage.googleapis.com/demo/source.mp4",
  type: "video",
};
const response = data => ({
  ok: true,
  headers: { get: () => "application/json" },
  json: async () => data,
});
beforeEach(() => {
  auth.currentUser.getIdToken.mockResolvedValue("isolated-token");
  localStorage.clear();
  URL.createObjectURL = jest.fn(() => "blob:preview");
  URL.revokeObjectURL = jest.fn();
  global.fetch = jest.fn(async (url, options = {}) => {
    if (String(url).includes("/publishing-destinations/")) {
      const platform = String(url).split("/").pop();
      return response(
        options.method === "POST"
          ? { destination: destinations[platform] }
          : { destinations: [destinations[platform]] }
      );
    }
    if (url === API_ENDPOINTS.PLATFORM_STATUS)
      return response({ raw: { telegram: { connected: true }, discord: { connected: true } } });
    if (String(url).startsWith(API_ENDPOINTS.MY_CONTENT)) return response({ content: [asset] });
    if (String(url).endsWith("/existing-movie/promotion-schedules"))
      return response({ success: true, schedules: [{ id: "isolated-schedule" }] });
    return response({ readiness: { allowed: true }, meta: {} });
  });
});
test("destinations load with authenticated workspace scope and never auto-select", async () => {
  // Shared publishing is intentionally available only in the owned demo.
  // A production localStorage value must not enable workspace authority.
  const previous = { ...process.env };
  Object.assign(process.env, {
    REACT_APP_TEAM_COLLABORATION_LOCAL: "true",
    REACT_APP_LOCAL_EMULATORS: "true",
    REACT_APP_FIREBASE_PROJECT_ID: "demo-autopromote-credits",
  });
  try {
  localStorage.setItem("autopromote.activeWorkspaceId", "workspace-fixture");
  const change = jest.fn();
  render(<CommunityDestinationPicker platform="telegram" onChange={change} />);
  const select = await screen.findByRole("combobox", { name: "telegram publishing destination" });
  await screen.findByRole("option", { name: /Creator subscribers/ });
  expect(select).toHaveValue("");
  expect(change).not.toHaveBeenCalled();
  expect(fetch.mock.calls[0][1].headers).toEqual(
    expect.objectContaining({
      Authorization: "Bearer isolated-token",
      "X-Workspace-Id": "workspace-fixture",
    })
  );
  fireEvent.change(select, { target: { value: destinations.telegram.id } });
  expect(change).toHaveBeenCalledWith(destinations.telegram);
  } finally {
    for (const key of ["REACT_APP_TEAM_COLLABORATION_LOCAL", "REACT_APP_LOCAL_EMULATORS", "REACT_APP_FIREBASE_PROJECT_ID"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
test("Telegram destination registration is explicit and preserves backend permission errors", async () => {
  render(<CommunityDestinationPicker platform="telegram" />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Verify destination" })).toBeDisabled()
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Telegram channel or group" }), {
    target: { value: "@subscribers" },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Verify destination" })).toBeEnabled()
  );
  fetch.mockImplementationOnce(async () => ({
    ok: false,
    json: async () => ({ error: "You must administer this destination." }),
  }));
  fireEvent.click(screen.getByRole("button", { name: "Verify destination" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("You must administer");
  expect(fetch.mock.calls.at(-1)[1].body).toBe('{"chatId":"@subscribers"}');
});
for (const platform of ["telegram", "discord"]) {
  test(`${platform}: actual Publisher requires a verified destination, reviews it and schedules owned media once`, async () => {
    const onUpload = jest.fn();
    render(<UnifiedPublisher contentList={[asset]} defaultTimezone="UTC" onUpload={onUpload} />);
    fireEvent.click(await screen.findByRole("button", { name: /Creator release/ }));
    fireEvent.click(screen.getByRole("button", { name: /Choose destinations/ }));
    const name = platform === "telegram" ? "Telegram" : "Discord";
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(name) }));
    fireEvent.click(screen.getByRole("button", { name: /Customize destinations/ }));
    const form = await screen.findByRole("region", { name: `${name} form` });
    expect(screen.getByRole("button", { name: /Continue to Delivery/ })).toBeDisabled();
    await within(form).findByRole("option", { name: new RegExp(destinations[platform].label) });
    fireEvent.change(
      within(form).getByRole("combobox", { name: `${platform} publishing destination` }),
      { target: { value: destinations[platform].id } }
    );
    fireEvent.click(screen.getByRole("button", { name: /Continue to Delivery/ }));
    const delivery = screen.getByRole("region", { name: "Delivery settings" });
    fireEvent.click(within(delivery).getByRole("radio", { name: /^Schedule/ }));
    fireEvent.change(within(delivery).getByLabelText("Date"), { target: { value: "2030-11-04" } });
    fireEvent.change(within(delivery).getByLabelText("Time"), { target: { value: "16:00" } });
    fireEvent.click(screen.getByRole("button", { name: /Review release/ }));
    expect(
      within(screen.getByRole("region", { name: "Review release" })).getByText(
        destinations[platform].label
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Schedule 1 posts/ }));
    await screen.findByText(/scheduled from your existing media/);
    expect(onUpload).not.toHaveBeenCalled();
    const writes = fetch.mock.calls.filter(([, opts]) => opts?.method === "POST");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1].body).platformOptions[platform]).toEqual(
      expect.objectContaining({
        destinationId: destinations[platform].id,
        destinationLabel: destinations[platform].label,
      })
    );
  });
}
