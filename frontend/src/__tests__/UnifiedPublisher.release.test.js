import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import UnifiedPublisher from "../features/publishing/UnifiedPublisher";
import { API_ENDPOINTS } from "../config";

jest.mock("../firebaseClient", () => ({ auth: { currentUser: { getIdToken: jest.fn().mockResolvedValue("local-test-token") } } }));
jest.mock("../components/VideoEditor", () => () => null);
jest.mock("../components/ImageCropper", () => () => null);
jest.mock("../components/PayPalSubscriptionPanel", () => () => null);
jest.mock("../components/HashtagSuggestions", () => () => null);
jest.mock("../components/BestTimeToPost", () => ({ __esModule: true, default: () => <span>Local insight fixture</span>, OPTIMAL_TIMES: {} }));

const asset = { id: "coffee-source", title: "Coffee — Final Edit", description: "A better morning", url: "https://example.test/coffee.mp4", type: "video", source: "studio", meta: { template: { name: "Coffee launch" } } };
const platforms = ["facebook", "instagram", "linkedin", "reddit", "tiktok", "youtube"];
const response = data => ({ ok: true, headers: { get: () => "application/json" }, json: async () => data });
let onUpload;
beforeEach(() => {
  localStorage.clear();
  URL.createObjectURL = jest.fn(() => "blob:local-preview");
  URL.revokeObjectURL = jest.fn();
  onUpload = jest.fn().mockResolvedValue({ ok: true });
  global.fetch = jest.fn(async url => {
    if (url === API_ENDPOINTS.PLATFORM_STATUS) return response({ raw: Object.fromEntries(platforms.map(platform => [platform, { connected: true }])), summary: { tiktok: { connected: true, publishReady: true } } });
    if (url === API_ENDPOINTS.FACEBOOK_STATUS) return response({ pages: [{ id: "page-1", name: "Coffee", instagram_business_account: { id: "ig-1", username: "coffee" } }] });
    if (url === API_ENDPOINTS.TIKTOK_CREATOR_INFO) return response({ creator: { privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], creator_username: "coffee" } });
    if (url === API_ENDPOINTS.CONTENT_UPLOAD_READINESS) return response({ readiness: { allowed: true } });
    return response({ meta: { subreddits: [] } });
  });
});

async function startReddit() {
  render(<UnifiedPublisher contentList={[asset]} defaultTimezone="Africa/Johannesburg" onUpload={onUpload} />);
  fireEvent.click(screen.getByRole("button", { name: /Coffee — Final Edit/ }));
  expect(screen.getAllByText("Template: Coffee launch").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: /Choose destinations/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /TikTok/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /YouTube/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Reddit/ }));
  fireEvent.click(screen.getByRole("button", { name: /Customize destinations/ }));
  await waitFor(() => expect(screen.getByRole("region", { name: "Reddit form" })).toBeInTheDocument());
  return screen.getByRole("region", { name: "Reddit form" });
}

test("real platform forms gate delivery; master copy preserves subreddit and media", async () => {
  const form = await startReddit();
  expect(screen.getByRole("button", { name: /Continue to Delivery/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /^4 Delivery$/ }));
  expect(screen.queryByRole("region", { name: "Delivery settings" })).not.toBeInTheDocument();
  fireEvent.change(within(form).getByLabelText("Subreddit *"), { target: { value: "coffee" } });
  fireEvent.change(within(form).getByLabelText("Title *"), { target: { value: "Reddit-specific title" } });
  fireEvent.click(within(form).getByRole("button", { name: "Use master copy" }));
  expect(within(form).getByLabelText("Subreddit *")).toHaveValue("coffee");
  expect(within(form).getByLabelText("Title *")).toHaveValue("Coffee — Final Edit");
  await waitFor(() => expect(screen.getByRole("button", { name: /Continue to Delivery/ })).toBeEnabled());
  expect(onUpload).not.toHaveBeenCalled();
});

test("scheduled submission reuses owned media and passes exact timezone/instant to existing handler", async () => {
  const form = await startReddit();
  fireEvent.change(within(form).getByLabelText("Subreddit *"), { target: { value: "coffee" } });
  fireEvent.change(within(form).getByLabelText("Title *"), { target: { value: "Coffee on Reddit" } });
  fireEvent.click(screen.getByRole("button", { name: /Continue to Delivery/ }));
  const delivery = screen.getByRole("region", { name: "Delivery settings" });
  fireEvent.click(within(delivery).getByRole("radio", { name: /^Schedule/ }));
  expect(screen.getByRole("button", { name: /Review release/ })).toBeDisabled();
  fireEvent.change(within(delivery).getByLabelText("Date"), { target: { value: "2030-10-21" } });
  fireEvent.change(within(delivery).getByLabelText("Time"), { target: { value: "16:00" } });
  fireEvent.click(screen.getByRole("button", { name: /Review release/ }));
  const review = screen.getByRole("region", { name: "Review release" });
  expect(within(review).getByText("Coffee on Reddit")).toBeInTheDocument();
  expect(within(review).getAllByText(/Africa\/Johannesburg \(UTC\+02\)/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: /Schedule 1 posts/ }));
  await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
  const payload = onUpload.mock.calls[0][0];
  expect(payload.url).toBe(asset.url);
  expect(payload.schedule).toEqual(expect.objectContaining({ date: "2030-10-21T14:00:00.000Z", timezone: "Africa/Johannesburg", frequency: "once" }));
  expect(payload.platform_options.reddit).toEqual(expect.objectContaining({ subreddit: "coffee", title: "Coffee on Reddit", kind: "video" }));
  expect(payload.meta.sourceContentId).toBe(asset.id);
  expect(fetch.mock.calls.filter(([, args]) => args?.method === "POST")).toHaveLength(1);
  expect(fetch.mock.calls.filter(([, args]) => args?.method === "POST")[0][0]).toBe(API_ENDPOINTS.CONTENT_UPLOAD_READINESS);
});

test("destination-specific copy survives switching between real forms and workflow steps", async () => {
  const form = await startReddit();
  fireEvent.change(within(form).getByLabelText("Subreddit *"), { target: { value: "coffee" } });
  fireEvent.change(within(form).getByLabelText("Post text"), { target: { value: "Reddit copy remains intact" } });
  fireEvent.click(screen.getByRole("button", { name: /Back to Destinations/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /YouTube/ }));
  fireEvent.click(screen.getByRole("button", { name: /Customize destinations/ }));
  fireEvent.click(screen.getByRole("tab", { name: "YouTube" }));
  fireEvent.click(screen.getByRole("tab", { name: "Reddit" }));
  expect(within(screen.getByRole("region", { name: "Reddit form" })).getByLabelText("Post text")).toHaveValue("Reddit copy remains intact");
  expect(onUpload).not.toHaveBeenCalled();
});
