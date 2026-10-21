import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import WelcomePage from "../WelcomePage";
import { PRODUCT_TOUR } from "../components/landing/productTour";
import Features from "../Features";
import About from "../About";
import Integrations from "../Integrations";
import Changelog from "../Changelog";
import HelpCenter from "../HelpCenter";
import Docs from "../Docs";
import Blog from "../Blog";

const renderWithPath = (ui, pathname) => {
  const reactRouterDom = require("react-router");
  reactRouterDom.useLocation = () => ({ pathname });
  return render(ui);
};

describe("public marketing pages", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
    jest.restoreAllMocks();
  });

  test("explains the complete onboarding path for a workspace invitation", async () => {
    window.history.replaceState(
      {},
      "",
      "/?workspace=workspace-1&invite=invite-1&token=secret-token"
    );
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        workspaceName: "Acme Studio",
        role: "editor",
        maskedEmail: "t***e@example.com",
      }),
    });
    const onGetStarted = jest.fn();
    const onSignIn = jest.fn();

    render(<WelcomePage onGetStarted={onGetStarted} onSignIn={onSignIn} />);

    expect(await screen.findByText(/You’re invited to join Acme Studio/i)).toBeInTheDocument();
    expect(
      screen.getByText(/only work with the email address that received them/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/AutoPromote will accept the invitation/i)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/workspaces/workspace-1/invite/invite-1/preview?token=secret-token"
      ),
      expect.objectContaining({ headers: { Accept: "application/json" } })
    );

    fireEvent.click(screen.getByRole("button", { name: /Sign In to Accept/i }));
    fireEvent.click(screen.getByRole("button", { name: /Create Account to Join/i }));
    await waitFor(() => expect(onSignIn).toHaveBeenCalledTimes(1));
    expect(onGetStarted).toHaveBeenCalledTimes(1);
  });

  test("welcome page opens the recorded product tour on demand", () => {
    // jsdom has no native dialog implementation; browser checks cover the focus trap.
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      writable: true,
      value: jest.fn(function () {
        this.setAttribute("open", "");
      }),
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      writable: true,
      value: jest.fn(function () {
        this.removeAttribute("open");
      }),
    });
    render(<WelcomePage onGetStarted={() => {}} onSignIn={() => {}} />);
    expect(screen.getByLabelText(/AutoPromote product tour/i)).not.toHaveAttribute("src");
    const trigger = screen.getByRole("button", { name: /Watch Demo/ });
    trigger.focus();
    fireEvent.click(trigger);
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole("dialog");
    const video = within(dialog).getByLabelText(/AutoPromote product tour/i);
    const pauseVideo = jest.spyOn(video, "pause").mockImplementation(() => {});
    const releaseVideo = jest.spyOn(video, "load").mockImplementation(() => {});
    pauseVideo.mockClear();
    releaseVideo.mockClear();
    expect(video).not.toHaveAttribute("src");
    fireEvent.click(within(dialog).getByRole("button", { name: /Play product tour/ }));
    expect(video).toHaveAttribute("src", PRODUCT_TOUR.src);
    expect(video).toHaveAttribute("preload", "none");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close demo" }));
    expect(pauseVideo).toHaveBeenCalledTimes(1);
    expect(video).not.toHaveAttribute("src");
    expect(releaseVideo).toHaveBeenCalledTimes(2);
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(trigger).toHaveFocus();
  });

  test("features and changelog avoid retired viral bonus promises", () => {
    render(
      <div>
        <Features />
        <About />
        <Integrations />
        <Changelog />
      </div>
    );

    expect(
      screen.getByRole("heading", { name: "An edit you can keep editing" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reddit", exact: true })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Clearer controls. More useful guides." })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Viral Bonus System/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Get paid for high-performing views/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/broadcast their voice across the internet with a single click/i)
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Integration depth varies by platform/i)).toBeInTheDocument();
  });

  test("help docs and blog stay aligned with current capability language", () => {
    const helpRender = render(<HelpCenter />);
    expect(screen.getByRole("link", { name: /Open support/ })).toHaveAttribute("href", "/support");
    helpRender.unmount();

    const docsRender = renderWithPath(<Docs />, "/docs");
    expect(screen.getByRole("heading", { name: "Studio and the timeline" })).toBeInTheDocument();
    docsRender.unmount();

    renderWithPath(<Blog />, "/blog");
    expect(screen.getByText(/Practical notes on editing, packaging/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/creator monetization and cross-platform promotion/i)
    ).not.toBeInTheDocument();
  });
});
