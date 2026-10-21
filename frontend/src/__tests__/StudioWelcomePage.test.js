import { fireEvent, render, screen, within } from "@testing-library/react";
import StudioWelcomePage from "../components/landing/StudioWelcomePage";
const ids = ["linkedin", "youtube", "instagram", "tiktok", "facebook", "reddit"];
const release = {
  capturedAt: "2026-10-21T12:16:42Z",
  timezone: "Africa/Johannesburg",
  destinations: ids.map((platform, i) => ({
    platform,
    title: `${platform} audience title`,
    description: `${platform} audience caption\n\nDisclosure`,
    label: `21 Oct, ${14 + i}:35`,
    time: `2026-10-21T${12 + i}:35:00Z`,
    status: "pending",
  })),
};
beforeEach(() => {
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  global.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => release });
  jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => jest.restoreAllMocks());
test("the first screen shows the actual current Queue rather than the rejected sample movie", async () => {
  render(<StudioWelcomePage onGetStarted={() => {}} onSignIn={() => {}} />);
  expect(
    screen.getByRole("heading", { level: 1, name: "More creating. Less posting work." })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("img", { name: /Actual AutoPromote Queue with six real/ })
  ).toHaveAttribute("src", "/_studio-preview/queue.png");
  await screen.findByRole("tab", { name: "LinkedIn" });
  expect(document.querySelector('[src$="studio-story.mp4"]')).toBeNull();
  expect(screen.queryByText(/sample workspace|example plan/i)).not.toBeInTheDocument();
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});
test("platform tabs show the actual fetched copy and separate captured times", async () => {
  render(<StudioWelcomePage onGetStarted={() => {}} onSignIn={() => {}} />);
  const tab = await screen.findByRole("tab", { name: "TikTok" });
  fireEvent.click(tab);
  expect(tab).toHaveAttribute("aria-selected", "true");
  const panel = screen.getByRole("tabpanel");
  expect(within(panel).getByRole("heading", { name: "tiktok audience title" })).toBeInTheDocument();
  expect(within(panel).getByText("21 Oct, 17:35 SAST")).toBeInTheDocument();
  expect(within(panel).getByRole("img")).toHaveAttribute(
    "src",
    "/_studio-preview/destination-tiktok.png"
  );
  expect(fetch).toHaveBeenCalledWith(
    "/_studio-preview/release-data.json",
    expect.objectContaining({ signal: expect.anything() })
  );
});
test("the real Studio film has sound controls and returns focus to its launch button", async () => {
  render(<StudioWelcomePage onGetStarted={() => {}} onSignIn={() => {}} />);
  await screen.findByRole("tab", { name: "LinkedIn" });
  const trigger = screen.getByRole("button", { name: "Watch the Studio film" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog");
  expect(dialog.querySelector("video")).toHaveAttribute("src", "/_studio-preview/film.mp4");
  expect(dialog.querySelector("video")).toHaveAttribute("controls");
  fireEvent.click(within(dialog).getByRole("button", { name: "Close preview" }));
  expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).not.toBe("hidden");
});
test("reduced-motion chapters work and the existing signup and sign-in callbacks are retained", async () => {
  const start = jest.fn(),
    signIn = jest.fn();
  render(<StudioWelcomePage onGetStarted={start} onSignIn={signIn} />);
  await screen.findByRole("tab", { name: "LinkedIn" });
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "Explore the workflow" })).getByRole("button", {
      name: /Choose the moment/,
    })
  );
  expect(screen.getByRole("button", { name: "Open the actual Queue capture" })).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Start creating free" })[0]);
  fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
  expect(start).toHaveBeenCalledTimes(1);
  expect(signIn).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("link", { name: "See plans and credit costs" })).toHaveAttribute(
    "href",
    "/#/pricing"
  );
});
test("a missing capture is unavailable and never replaced with invented posts", async () => {
  fetch.mockRejectedValue(new Error("offline"));
  render(<StudioWelcomePage onGetStarted={() => {}} onSignIn={() => {}} />);
  await screen.findByText("The recorded release is temporarily unavailable.");
  expect(
    screen.queryByRole("tablist", { name: "Actual scheduled platform posts" })
  ).not.toBeInTheDocument();
});
test("calendar full view opens the whole Queue and supports zoom and fit", async () => {
  render(<StudioWelcomePage onGetStarted={() => {}} onSignIn={() => {}} />);
  await screen.findByRole("tab", { name: "LinkedIn" });
  const trigger = screen.getByRole("button", { name: "Open actual release calendar" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByRole("img")).toHaveAttribute("src", "/_studio-preview/queue.png");
  fireEvent.click(within(dialog).getByRole("button", { name: "Zoom in" }));
  expect(within(dialog).getByLabelText("Image zoom")).toHaveTextContent("125%");
  fireEvent.click(within(dialog).getByRole("button", { name: "Fit image to screen" }));
  expect(within(dialog).getByLabelText("Image zoom")).toHaveTextContent("100%");
  fireEvent.click(within(dialog).getByRole("button", { name: "Close preview" }));
  expect(trigger).toHaveFocus();
});
test("the welcome film opens the complete native Studio sequence with sound controls", async () => {
  render(<StudioWelcomePage onGetStarted={() => {}} onSignIn={() => {}} />);
  await screen.findByRole("tab", { name: "LinkedIn" });
  expect(document.querySelector(".wf-reel video")).toHaveAttribute(
    "src",
    "/_studio-preview/welcome-reel.mp4"
  );
  expect(screen.queryByRole("button", { name: "Pause welcome preview" })).not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "Watch the welcome Studio film with sound" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog");
  expect(dialog.querySelector("video")).toHaveAttribute("src", "/_studio-preview/welcome-reel.mp4");
  expect(dialog.querySelector("video")).toHaveAttribute("controls");
  fireEvent.click(within(dialog).getByRole("button", { name: "Close preview" }));
  expect(trigger).toHaveFocus();
});
