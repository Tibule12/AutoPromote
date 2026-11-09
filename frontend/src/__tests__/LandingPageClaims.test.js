import { fireEvent, render, screen, within } from "@testing-library/react";
import WelcomePage from "../WelcomePage";

describe("public video editing homepage", () => {
  afterEach(() => jest.restoreAllMocks());

  test("communicates the editing workflow without invented social proof or autonomous Director claims", () => {
    render(<WelcomePage onGetStarted={() => {}} onSignIn={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /One recording.*More great clips/i
    );
    for (const name of [
      "Multi-Camera Editing",
      "AI Viral Clip Finder",
      "Auto Captions",
      "External Audio Sync",
      "AI Director",
      "Social Export",
    ]) {
      expect(screen.getAllByRole("heading", { name, exact: true }).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/Generate caption drafts in English or isiXhosa/)).toBeInTheDocument();
    expect(screen.getByText(/Every proposed edit starts with your review/)).toBeInTheDocument();
    expect(
      screen.getByText(/Analysis, audio sync and server exports use credits/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /10,000|500K|10M|4\.9\/5|guaranteed viral|accurate captions|autonomous director/i
      )
    ).not.toBeInTheDocument();
  });

  test("creation buttons and sign in use the existing parent auth callbacks", () => {
    const onGetStarted = jest.fn();
    const onSignIn = jest.fn();
    render(<WelcomePage onGetStarted={onGetStarted} onSignIn={onSignIn} />);
    screen
      .getAllByRole("button", { name: /Start Creating/ })
      .forEach(button => fireEvent.click(button));
    expect(onGetStarted).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  test("section navigation preserves HashRouter and honors reduced motion", () => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
    const scroll = window.HTMLElement.prototype.scrollIntoView;
    const oldMatchMedia = window.matchMedia;
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });
    render(<WelcomePage onGetStarted={() => {}} onSignIn={() => {}} />);
    const navigation = screen.getByRole("navigation", { name: "Primary" });
    const before = window.location.href;
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("button", { name: "Close navigation" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    fireEvent.click(within(navigation).getByRole("button", { name: "Features" }));
    expect(scroll).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    expect(window.location.href).toBe(before);
    expect(screen.getByRole("button", { name: "Open navigation" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(within(navigation).getByRole("link", { name: "Pricing" })).toHaveAttribute(
      "href",
      "/#/pricing"
    );
    window.matchMedia = oldMatchMedia;
  });

  test("mobile navigation closes with Escape and returns focus", () => {
    render(<WelcomePage onGetStarted={() => {}} onSignIn={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Features" }), { key: "Escape" });
    expect(screen.getByRole("button", { name: "Open navigation" })).toHaveFocus();
  });
});
