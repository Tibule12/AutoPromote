import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import About from "../About";
import Contact from "../Contact";
import { publicEntryRoute } from "../utils/publicEntryRoute";
import InformationPage from "../components/public/InformationPage";
import { FOOTER_GROUPS } from "../components/public/PublicFooter";

describe("company footer pages", () => {
  test("the API footer link describes actual access rather than advertising a missing reference", () => {
    expect(FOOTER_GROUPS.flatMap(([, links]) => links)).toContainEqual(["API Access", "/api-docs"]);
  });

  test("careers and API access state their availability instead of showing inactive applications or keys", () => {
    const careers = render(<InformationPage page="careers" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Careers at AutoPromote" })
    ).toBeInTheDocument();
    expect(screen.getByText(/No specific vacancies are listed/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /apply/i })).not.toBeInTheDocument();
    careers.unmount();
    render(<InformationPage page="api" />);
    expect(screen.getByText(/does not publish an endpoint reference/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Discuss API access/ })).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:thulani@autopromote.org")
    );
  });

  test("analytics and cookies provide labelled reference tables without fabricated customer data", () => {
    const metrics = render(<InformationPage page="metrics" />);
    expect(screen.getByRole("columnheader", { name: "Signal" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Unavailable data" })).toBeInTheDocument();
    expect(screen.getByText(/rather than as a measured zero/)).toBeInTheDocument();
    metrics.unmount();
    render(<InformationPage page="cookies" />);
    expect(screen.getByRole("rowheader", { name: "Studio projects" })).toBeInTheDocument();
    expect(
      screen.getByText(/Back up your projects before clearing local site data/)
    ).toBeInTheDocument();
  });

  test("partnership proposals have a single meaningful contact action", () => {
    render(<InformationPage page="partners" />);
    const main = screen.getByRole("main");
    expect(main.querySelectorAll('a[href^="mailto:"]')).toHaveLength(1);
    expect(within(main).getByRole("link", { name: /Email your proposal/ })).toBeInTheDocument();
    expect(screen.getByText(/do not imply endorsement/)).toBeInTheDocument();
  });

  test("About explains the company purpose instead of repeating the product card template", () => {
    render(<About />);
    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", { level: 1, name: "About AutoPromote" })
    ).toBeInTheDocument();
    expect(
      within(main).getByRole("heading", { name: "Good work deserves a thoughtful release." })
    ).toBeInTheDocument();
    expect(within(main).getByText("Work you can return to")).toBeInTheDocument();
    expect(within(main).getByRole("link", { name: /Contact AutoPromote/ })).toHaveAttribute(
      "href",
      "/contact"
    );
    expect(main.querySelector(".public-grid")).toBeNull();
    expect(main.querySelector("form")).toBeNull();
  });

  test("Contact exposes one real address and prepares an encoded email without submitting data", () => {
    const fetchSpy = jest.spyOn(global, "fetch");
    render(<Contact />);
    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", { level: 1, name: "Contact AutoPromote" })
    ).toBeInTheDocument();
    expect(within(main).getByRole("link", { name: "thulani@autopromote.org" })).toHaveAttribute(
      "href",
      "mailto:thulani@autopromote.org"
    );
    expect(main.querySelectorAll('a[href^="mailto:"]')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("What is this about?"), {
      target: { value: "Privacy request" },
    });
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "My account & data" } });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Please help with my data.\nReference #42 & notes" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Prepare email/ }));
    const link = screen.getByRole("link", { name: /Open email app/ });
    const url = new URL(link.getAttribute("href"));
    expect(url.pathname).toBe("thulani@autopromote.org");
    expect(url.searchParams.get("subject")).toBe(
      "AutoPromote — Privacy request: My account & data"
    );
    expect(url.searchParams.get("body")).toBe("Please help with my data.\nReference #42 & notes");
    expect(screen.getByRole("status")).toHaveTextContent("No message has been sent.");
    expect(fetchSpy).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Revised message" } });
    expect(screen.queryByRole("link", { name: /Open email app/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Subject")).toHaveValue("My account & data");
    fetchSpy.mockRestore();
  });

  test.each([
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    "/docs/studio",
    "/blog/creator-workflow",
    "/pricing/",
  ])("direct %s selects its own page in the existing router", pathname => {
    expect(publicEntryRoute({ pathname })).toBe(`/#${pathname.replace(/\/$/, "")}`);
  });

  test("preserves password-reset parameters and nested documentation anchors", () => {
    expect(
      publicEntryRoute({
        pathname: "/reset-password",
        search: "?oobCode=demo-code&mode=resetPassword",
      })
    ).toBe("/#/reset-password?oobCode=demo-code&mode=resetPassword");
    expect(
      publicEntryRoute({
        pathname: "/docs/studio",
        search: "?topic=timeline",
        hash: "#studio.keyframes",
      })
    ).toBe("/#/docs/studio?topic=timeline#studio.keyframes");
  });

  test.each([
    { pathname: "/", search: "?workspace=workspace-1&invite=invite-1&token=private-invite" },
    { pathname: "/", hash: "#/contact" },
    { pathname: "/about", hash: "#/contact" },
    { pathname: "/oauth/callback", search: "?code=provider-code&state=provider-state" },
    { pathname: "/api/auth/login" },
    { pathname: "/private-project" },
  ])("leaves existing hash links, invites and non-public callbacks unchanged: %j", location => {
    expect(publicEntryRoute(location)).toBeNull();
  });
});
