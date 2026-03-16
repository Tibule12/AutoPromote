import React from "react";
import PayPalSubscriptionPanel from "./components/PayPalSubscriptionPanel";

const Pricing = () => {
  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 12 }}>Pricing</h1>
      <p style={{ fontSize: "1.05rem", maxWidth: 760 }}>
        AutoPromote is priced around cross-platform publishing workload, not hype. Choose the plan
        that matches how often you publish, how many destinations you manage, and how much
        operational visibility you need.
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
            Validate the workflow if you are testing AutoPromote or publishing at low volume.
          </p>
        </div>
        <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 16 }}>
          <h3 style={{ marginTop: 0 }}>Scale Deliberately</h3>
          <p style={{ marginBottom: 0 }}>
            Paid plans are for creators and teams who feel the cost of repeating the same workflow
            across several platforms.
          </p>
        </div>
        <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 16 }}>
          <h3 style={{ marginTop: 0 }}>Pay For Leverage</h3>
          <p style={{ marginBottom: 0 }}>
            Plans scale by upload capacity, platform reach, analytics depth, and support.
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
