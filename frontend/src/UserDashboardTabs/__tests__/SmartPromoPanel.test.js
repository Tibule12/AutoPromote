import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import SmartPromoPanel from "../SmartPromoPanel";

const mockSmartPromo = jest.fn();

jest.mock("../../hooks/useSubscription", () => ({
  useSubscription: () => ({
    credits: { remaining: 100 },
    editing: { features: { smartPromoSummary: { enabled: true, creditCost: 18 } } },
    canUseFeature: () => true,
  }),
}));

jest.mock("../../components/SmartPromoSummaryPanel", () => props => {
  mockSmartPromo(props);
  return <div>Real Smart Promo Studio</div>;
});

describe("SmartPromoPanel", () => {
  beforeEach(() => mockSmartPromo.mockClear());

  test("opens the real Smart Promo component with the selected source", () => {
    const source = new File(["video"], "promo-source.mp4", { type: "video/mp4" });
    render(<SmartPromoPanel initialFile={source} onOpenPublisher={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /open smart promo studio/i }));

    expect(screen.getByText("Real Smart Promo Studio")).toBeInTheDocument();
    expect(mockSmartPromo.mock.calls.at(-1)[0]).toEqual(
      expect.objectContaining({
        sourceFile: source,
        creditBalance: 100,
        creditCosts: { "promo-summary": 18 },
      })
    );
  });
});
