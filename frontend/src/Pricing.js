import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PayPalSubscriptionPanel from "./components/PayPalSubscriptionPanel";

const Pricing = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dynamicBackLabel = location.state?.backLabel ? `Back to ${location.state.backLabel}` : "Back";
  const backButtonLabel = location.state?.from ? dynamicBackLabel : "Back";

  const handleBack = () => {
    const fallback = location.state?.from;
    if (fallback) {
      navigate(fallback);
      return;
    }
    if (window?.history?.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ marginBottom: 12 }}>Pricing</h1>
        <button
          type="button"
          onClick={handleBack}
          aria-label={location.state?.backLabel ? `Go back to ${location.state.backLabel}` : "Go back"}
          style={{
            border: "1px solid #4f46e5",
            background: "#4f46e5",
            color: "#ffffff",
            padding: "10px 18px",
            borderRadius: 12,
            fontWeight: 700,
            cursor: "pointer",
            lineHeight: 1,
            fontSize: "0.95rem",
            boxShadow: "0 2px 10px rgba(79, 70, 229, 0.35)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "#4338ca";
            e.currentTarget.style.borderColor = "#4338ca";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "#4f46e5";
            e.currentTarget.style.borderColor = "#4f46e5";
          }}
          onMouseDown={e => {
            e.currentTarget.style.transform = "translateY(1px)";
          }}
          onMouseUp={e => {
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          {backButtonLabel}
        </button>
      </div>
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
