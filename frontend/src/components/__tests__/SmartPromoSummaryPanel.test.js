import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import SmartPromoSummaryPanel from "../SmartPromoSummaryPanel";

jest.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: null }),
}));

describe("SmartPromoSummaryPanel", () => {
  test("starts as an embedded setup workspace without false processing or results", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const { container } = render(
      <SmartPromoSummaryPanel
        sourceUrl="https://example.com/source.mp4"
        creditBalance={100}
        creditCosts={{ "promo-summary": 18 }}
        onClose={() => {}}
        onUseClip={() => {}}
        onStatusChange={() => {}}
      />
    );

    expect(screen.getByRole("region", { name: "Smart Promo" })).toHaveClass(
      "promo-summary-overlay--embedded"
    );
    expect(screen.getByRole("heading", { name: "Create a complete promo package" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Generate promo package" })).toBeEnabled();

    await waitFor(() => {
      expect(container.querySelector(".promo-summary-live-shell")).not.toBeInTheDocument();
      expect(container.querySelector(".promo-summary-results")).not.toBeInTheDocument();
    });

    warn.mockRestore();
  });
});
