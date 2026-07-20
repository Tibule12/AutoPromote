import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import WelcomePage from "../WelcomePage";
import Features from "../Features";
import About from "../About";
import Integrations from "../Integrations";
import Changelog from "../Changelog";
import HelpCenter from "../HelpCenter";
import Docs from "../Docs";
import Blog from "../Blog";

const renderWithPath = (ui, pathname) => {
  const reactRouterDom = require("react-router-dom");
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

  test("welcome page explains current product state conservatively", () => {
    const scrollIntoView = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    render(<WelcomePage onGetStarted={() => {}} onSignIn={() => {}} />);

    expect(screen.getByText(/What Works Today/i)).toBeInTheDocument();
    expect(screen.getByText(/Availability Snapshot/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/Feature Availability|Availability Snapshot|What To Expect In Practice/i)
        .length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/Upload, queue, and schedule content across connected platforms/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/typically 3-7 hours/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/AI-assisted variations focus on stronger hooks/i)
    ).not.toBeInTheDocument();

    expect(screen.getByText(/See the new creator dashboard in action./i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Updated Dashboard video demo/i)).toHaveAttribute(
      "src",
      "/demos/dashboard-demo.webm"
    );

    fireEvent.click(screen.getByRole("tab", { name: /Cam Combiner/i }));
    expect(screen.getByText(/Two cameras in. One directed podcast out./i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Cam Combiner video demo/i)).toHaveAttribute(
      "src",
      "/demos/cam-combiner-demo.webm"
    );
    expect(screen.getByLabelText(/Cam Combiner video demo/i)).toHaveAttribute(
      "poster",
      "/demos/cam-combiner-demo-poster.jpg"
    );

    fireEvent.click(screen.getByRole("button", { name: /Watch Demo/i }));
    expect(scrollIntoView).toHaveBeenCalled();
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

    expect(screen.getByText(/Mission Board/i)).toBeInTheDocument();
    expect(screen.getByText(/Monetization Transition/i)).toBeInTheDocument();
    expect(screen.queryByText(/Viral Bonus System/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Get paid for high-performing views/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/broadcast their voice across the internet with a single click/i)
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Integration depth varies by platform/i)).toBeInTheDocument();
  });

  test("help docs and blog stay aligned with current capability language", () => {
    const helpRender = render(<HelpCenter />);
    expect(screen.getByText(/Support Scope/i)).toBeInTheDocument();
    helpRender.unmount();

    const docsRender = renderWithPath(<Docs />, "/docs");
    expect(screen.getByText(/Before You Dive In/i)).toBeInTheDocument();
    docsRender.unmount();

    renderWithPath(<Blog />, "/blog");
    expect(
      screen.getByText(/Read the latest updates from the AutoPromote team/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/creator monetization and cross-platform promotion/i)
    ).not.toBeInTheDocument();
  });
});
