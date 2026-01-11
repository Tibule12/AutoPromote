import React from "react";
import { render, screen } from "@testing-library/react";
import Footer from "../components/Footer";

describe("Footer", () => {
  test("renders links and copyright", () => {
    render(<Footer />);

    // Check for column headers
    expect(screen.getByText(/Product/i)).toBeInTheDocument();
    expect(screen.getByText(/Resources/i)).toBeInTheDocument();
    expect(screen.getByText(/Company/i)).toBeInTheDocument();
    expect(screen.getByText(/Legal/i)).toBeInTheDocument();

    // Check for specific links
    expect(screen.getByText(/Terms of Service/i)).toBeInTheDocument();
    expect(screen.getByText(/Privacy Policy/i)).toBeInTheDocument();
    expect(screen.getByText(/Documentation/i)).toBeInTheDocument();
    expect(screen.getByText(/About Us/i)).toBeInTheDocument();

    // Check for newsletter
    expect(screen.getByText(/Subscribe to our newsletter/i)).toBeInTheDocument();

    // Check for copyright
    expect(screen.getByText(new RegExp(`© ${new Date().getFullYear()}`))).toBeInTheDocument();
  });
});
