import React from "react";
import PayPalSubscriptionPanel from "./components/PayPalSubscriptionPanel";

const Pricing = () => {
  return (
    <div style={{ padding: 24 }}>
      <h2>Pricing</h2>
      <p>Choose a plan that fits your needs. Monthly and yearly options are available.</p>
      <div style={{ maxWidth: 840 }}>
        <PayPalSubscriptionPanel />
      </div>
    </div>
  );
};

export default Pricing;
