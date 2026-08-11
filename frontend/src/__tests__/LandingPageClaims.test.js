import { render, screen } from "@testing-library/react";
import WelcomePage from "../WelcomePage";

describe("landing page claims", () => {
  test("describes every current dashboard workspace", () => {
    render(<WelcomePage onGetStarted={() => {}} onSignIn={() => {}} />);

    expect(screen.queryByText(/Every upload is scored/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/45 min interview to 12/i)).not.toBeInTheDocument();
    expect(screen.getByText(/13 redesigned pages/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Viral Clip Studio/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Smart Promo/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Idea-to-Video/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Publisher/ })).toBeInTheDocument();
  });
});
