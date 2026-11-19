import { fireEvent, render, screen, within } from "@testing-library/react";
import WelcomeVideoDialog from "../components/landing/WelcomeVideoDialog";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
});
afterEach(() => jest.restoreAllMocks());
test("every fresh welcome view opens the showcase, close restores scrolling and the launcher reopens it", () => {
  const { unmount } = render(<WelcomeVideoDialog />);
  expect(screen.getByRole("dialog", { name: "See it. Then make it." })).toBeVisible();
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.click(screen.getByRole("button", { name: "Close video showcase" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.body.style.overflow).not.toBe("hidden");
  const launch = screen.getByRole("button", { name: "Watch AutoPromote videos" });
  expect(launch).toHaveFocus();
  fireEvent.click(launch);
  expect(screen.getByRole("dialog")).toBeVisible();
  unmount();
  render(<WelcomeVideoDialog />);
  expect(screen.getByRole("dialog")).toBeVisible();
});
test("only the selected video loads; visitors can enable sound and change to the real Studio tutorial", () => {
  render(<WelcomeVideoDialog />);
  let video = screen.getByLabelText("See Studio in action");
  expect(document.querySelectorAll("video")).toHaveLength(1);
  expect(video.muted).toBe(true);
  expect(video).toHaveAttribute("controls");
  expect(video).toHaveAttribute("crossorigin", "anonymous");
  fireEvent.click(screen.getByRole("button", { name: "♪ Turn sound on" }));
  expect(video.muted).toBe(false);
  fireEvent.click(within(screen.getByRole("navigation", { name: "AutoPromote videos" })).getByRole("button", { name: /Make the Studio edit/ }));
  video = screen.getByLabelText("Make the Studio edit");
  expect(video.getAttribute("src")).toContain("studio-");
  expect(document.querySelectorAll("video")).toHaveLength(1);
  expect(video.muted).toBe(false);
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
});
test("Escape and media failure leave usable navigation", () => {
  render(<WelcomeVideoDialog />);
  fireEvent.error(screen.getByLabelText("See Studio in action"));
  expect(screen.getByRole("alert")).toHaveTextContent("could not load");
  expect(screen.getByRole("link", { name: "Open the video" })).toHaveAttribute("href", expect.stringContaining("firebasestorage.googleapis.com"));
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
