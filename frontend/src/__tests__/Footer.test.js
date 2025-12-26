import React from "react";
import { render, screen } from "@testing-library/react";
import Footer from "../components/Footer";

describe("Footer", () => {
  test("renders links and copyright", () => {
    render(<Footer />);
    expect(screen.getByText(/Terms of Service/i)).toBeInTheDocument();
    expect(screen.getByText(/Privacy Policy/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`© ${new Date().getFullYear()}`))).toBeInTheDocument();
  });
});
