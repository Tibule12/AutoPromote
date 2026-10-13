import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import UnifiedPublisher from "../features/publishing/UnifiedPublisher";
import { API_ENDPOINTS } from "../config";
import { auth } from "../firebaseClient";

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
  // CRA resets mock implementations between tests; the root Jest project does not.
  auth.currentUser.getIdToken.mockResolvedValue("local-test-token");
  localStorage.clear();
  URL.createObjectURL = jest.fn(() => "blob:local-preview");
  URL.revokeObjectURL = jest.fn();
  onUpload = jest.fn().mockResolvedValue({ ok: true });
  global.fetch = jest.fn(async url => {
    if (String(url).startsWith(API_ENDPOINTS.MY_CONTENT)) return response({ content: [asset] });
    if (url === API_ENDPOINTS.PLATFORM_STATUS) return response({ raw: Object.fromEntries(platforms.map(platform => [platform, { connected: true }])), summary: { tiktok: { connected: true, publishReady: true } } });
    if (url === API_ENDPOINTS.FACEBOOK_STATUS) return response({ pages: [{ id: "page-1", name: "Coffee", instagram_business_account: { id: "ig-1", username: "coffee" } }] });
    if (url === API_ENDPOINTS.TIKTOK_CREATOR_INFO) return response({ creator: { privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], creator_username: "coffee" } });
    if (url === API_ENDPOINTS.CONTENT_UPLOAD_READINESS) return response({ readiness: { allowed: true } });
    return response({ meta: { subreddits: [] } });
  });
});

async function startReddit() {
  render(<UnifiedPublisher contentList={[asset]} defaultTimezone="Africa/Johannesburg" onUpload={onUpload} />);
  fireEvent.click(await screen.findByRole("button", { name: /Coffee — Final Edit/ }));
  expect(screen.getAllByText("Template: Coffee launch").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: /Choose destinations/ }));
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

test("owned image URLs render in the release preview without duplicate form media tools", async () => {
  URL.createObjectURL.mockImplementation(value => {
    if (!(value instanceof Blob)) throw new TypeError("Expected a Blob");
    return "blob:local-image";
  });
  render(<UnifiedPublisher initialFile={{ url: "https://example.test/owned.png", type: "image/png", name: "Owned image" }} onUpload={onUpload} />);
  fireEvent.click(screen.getByRole("checkbox", { name: /TikTok/ }));
  fireEvent.click(screen.getByRole("button", { name: /Customize destinations/ }));
  await waitFor(() => expect(screen.getByRole("region", { name: "TikTok form" })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Change destinations" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Instagram/ }));
  fireEvent.click(screen.getByRole("button", { name: /Customize destinations/ }));
  fireEvent.click(screen.getByRole("tab", { name: "Instagram" }));
  expect(within(screen.getByRole("region", { name: "Instagram form" })).queryByRole("button", { name: /Crop Image/ })).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Release media" })).toHaveAttribute("src", "https://example.test/owned.png");
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(onUpload).not.toHaveBeenCalled();
});

test("Customize keeps real platform settings and removes repeated media and promotional controls", async () => {
  render(<UnifiedPublisher initialFile={{ url: asset.url, type: "video/mp4", name: "Owned video" }} onUpload={onUpload} />);
  for (const platform of platforms) fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(platform, "i") }));
  fireEvent.click(screen.getByRole("button", { name: /Customize destinations/ }));
  for (const platform of platforms) {
    fireEvent.click(screen.getByRole("tab", { name: new RegExp(platform, "i") }));
    const form = screen.getByRole("region", { name: new RegExp(`${platform} form`, "i") });
    expect(within(form).queryByText(/Media File|Video File|Media for Reddit|Review AI Enhancements|Protocol 7|Data Access & Permissions|Instagram Permissions|Google Permissions|Best time to upload|Trending Hashtags/i)).not.toBeInTheDocument();
    expect(within(form).queryByRole("button", { name: /^Remove$/ })).not.toBeInTheDocument();
    if (platform === "tiktok") {
      expect(within(form).getByLabelText("Privacy (required)")).toBeInTheDocument();
      expect(within(form).getByText("Advanced TikTok disclosures and consent")).toBeInTheDocument();
    }
  }
  expect(within(screen.getByRole("region", { name: "YouTube form" })).getByLabelText("Video Title")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "YouTube form" })).getByText("Made for Kids")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "YouTube form" })).getAllByRole("textbox", { name: "Video Title" })).toHaveLength(1);
  expect(screen.queryByText("Media and optional settings")).not.toBeInTheDocument();
  expect(onUpload).not.toHaveBeenCalled();
});

test("late account timezone defaults load without replacing an explicit delivery timezone", async () => {
  const initialFile = { url: asset.url, type: "video/mp4", name: "Owned video", suggestedTitle: "Account defaults" };
  const view = render(<UnifiedPublisher initialFile={initialFile} defaultTimezone="UTC" onUpload={onUpload} />);
  fireEvent.click(screen.getByRole("checkbox", { name: /YouTube/ }));
  fireEvent.click(screen.getByRole("button", { name: /Customize destinations/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: /Continue to Delivery/ })).toBeEnabled());
  view.rerender(<UnifiedPublisher initialFile={initialFile} defaultTimezone="Africa/Johannesburg" onUpload={onUpload} />);
  fireEvent.click(screen.getByRole("button", { name: /Continue to Delivery/ }));
  const delivery = screen.getByRole("region", { name: "Delivery settings" });
  fireEvent.click(within(delivery).getByRole("radio", { name: /^Schedule/ }));
  const timezone = within(delivery).getAllByRole("combobox")[0];
  expect(timezone).toHaveValue("Africa/Johannesburg");
  fireEvent.change(timezone, { target: { value: "America/New_York" } });
  view.rerender(<UnifiedPublisher initialFile={initialFile} defaultTimezone="Europe/London" onUpload={onUpload} />);
  expect(timezone).toHaveValue("America/New_York");
});

test("fresh releases have no selected destinations and show the five-step workflow", async () => {
  render(<UnifiedPublisher contentList={[asset]} onUpload={onUpload} embedded />);
  expect(screen.getByRole("list", { name: "Publishing workflow" })).toHaveTextContent("1Content2Destinations3Customize4Delivery5Review");
  expect(screen.getByText("Choose a video or image to start.")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Release content" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Before delivery" })).not.toBeInTheDocument();
  expect(screen.queryByText("Media and optional settings")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Selected destinations" })).not.toBeInTheDocument();
  expect(screen.queryByText(/2 selected/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Choose destinations/ })).toBeDisabled();
  fireEvent.click(await screen.findByRole("button", { name: /Coffee — Final Edit/ }));
  expect(screen.getByRole("region", { name: "Release content" })).toHaveTextContent("Coffee — Final Edit");
  expect(screen.getByRole("button", { name: /Coffee — Final Edit/ })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: /Choose destinations/ }));
  expect(screen.getByRole("checkbox", { name: /TikTok/ })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: /YouTube/ })).not.toBeChecked();
  expect(screen.queryByRole("region", { name: "Selected destinations" })).not.toBeInTheDocument();
});

test("only explicit destination handoff preselects providers", () => {
  render(<UnifiedPublisher initialFile={{ url: asset.url, name: "Handed-off video", type: "video/mp4" }} initialDestinations={["youtube", "reddit", "youtube", "invalid"]} onUpload={onUpload} />);
  expect(screen.getByRole("region", { name: "Selected destinations" })).toHaveTextContent("2 selected");
  expect(screen.getByRole("tab", { name: "YouTube" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: "Reddit" })).toBeInTheDocument();
});

test("a large asset source can be searched without an endless first-step grid", async () => {
  const many = Array.from({ length: 15 }, (_, index) => ({ ...asset, id: `studio-${index}`, title: `Studio render ${index}`, url: `https://example.test/studio-${index}.mp4` }));
  const originalFetch = global.fetch;
  global.fetch = jest.fn((url, options) => String(url).startsWith(API_ENDPOINTS.MY_CONTENT)
    ? Promise.resolve(response({ content: many })) : originalFetch(url, options));
  render(<UnifiedPublisher contentList={many} onUpload={onUpload} />);
  await screen.findByRole("button", { name: "Show all 15 assets" });
  expect(within(screen.getByRole("region", { name: "Choose release content" })).getAllByRole("button", { name: /Studio render/ })).toHaveLength(12);
  fireEvent.change(screen.getByPlaceholderText("Search by name or template"), { target: { value: "Studio render 14" } });
  expect(screen.getByRole("button", { name: /Studio render 14/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Studio render 13/ })).not.toBeInTheDocument();
});
