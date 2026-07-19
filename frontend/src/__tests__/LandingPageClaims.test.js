import { render, screen } from "@testing-library/react";
import WelcomePage from "../WelcomePage";

describe("landing page claims", () => {
  test("describes current capabilities without advertising Viral Clip Studio", () => {
    render(<WelcomePage onGetStarted={() => {}} onSignIn={() => {}} />);

    expect(screen.queryByText(/Viral Clip Studio/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Every upload is scored/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/45 min interview to 12/i)).not.toBeInTheDocument();
    expect(screen.getByText("Idea-to-Video")).toBeInTheDocument();
    expect(screen.getByText("Cross-Platform Publishing")).toBeInTheDocument();
  });
});
