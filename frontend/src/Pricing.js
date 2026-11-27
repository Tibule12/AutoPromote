import React from "react";
import PublicPage from "./components/public/PublicPage";
import PayPalSubscriptionPanel from "./components/PayPalSubscriptionPanel";
export default function Pricing() {
  return (
    <PublicPage
      eyebrow="AUTOPROMOTE / FREE AND PLUS"
      title="Plans and pricing"
      intro="Professional creative tools for creators, students, entrepreneurs and small businesses. Pay for additional processing capacity."
    >
      <PayPalSubscriptionPanel showPlanComparison />
    </PublicPage>
  );
}
