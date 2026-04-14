import React from "react";
import PayPalSubscriptionPanel from "./components/PayPalSubscriptionPanel";

const Pricing = () => {
  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 12 }}>Pricing</h1>
      <p style={{ fontSize: "1.05rem", maxWidth: 760 }}>
        Every plan includes monthly AI credits for video processing, clip generation, and
        multi-camera editing. Pick a plan that matches your publishing volume and upgrade
        anytime as you grow.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          margin: "24px 0 28px",
        }}
      >
        <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 16 }}>
          <h3 style={{ marginTop: 0 }}>Start Free</h3>
          <p style={{ marginBottom: 0 }}>
            15 AI credits per month. Test the full workflow — smart crop, captions, clip
            generation — before you commit.
          </p>
        </div>
        <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 16 }}>
          <h3 style={{ marginTop: 0 }}>Credits Included</h3>
          <p style={{ marginBottom: 0 }}>
            Every paid plan bundles monthly credits. No surprise charges — you always know
            what you can process before you start.
          </p>
        </div>
        <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 16 }}>
          <h3 style={{ marginTop: 0 }}>Top Up Anytime</h3>
          <p style={{ marginBottom: 0 }}>
            Need more credits mid-month? Grab a top-up pack and keep working without waiting
            for your next billing cycle.
          </p>
        </div>
      </div>
      <div style={{ maxWidth: 840 }}>
        <PayPalSubscriptionPanel />
      </div>
    </div>
  );
};

export default Pricing;
