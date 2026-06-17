import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PayPalSubscriptionPanel from "./components/PayPalSubscriptionPanel";

const pricingFacts = [
  {
    title: "Starter Is Limited",
    copy: "Starter includes 15 monthly credits, 3 uploads, and 1 connected platform. Multi-camera editing and the premium creative suite start on paid plans.",
  },
  {
    title: "Paid Plans Include Credits",
    copy: "Paid plans include the monthly credits and limits shown on each plan card below. Higher tiers add more credits, platform connections, uploads, seats, analytics, and support.",
  },
  {
    title: "Renders Spend Credits",
    copy: "Drafting scenes and shot lists can stay lightweight, but server renders, AI video previews, clip analysis, clean-audio sync, and MP4 exports spend credits.",
  },
];

const creditCostFacts = [
  "Idea-to-Video preview: 5 credits",
  "Idea-to-Video full render: starts at 25 credits",
  "Find Viral Clips: 8 credits",
  "Final clip render: 5 credits",
  "Video processing: 10 credits",
  "Clean-audio sync: 18 credits",
  "Cam Combiner server MP4: 150 credits",
];

const Pricing = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dynamicBackLabel = location.state?.backLabel
    ? `Back to ${location.state.backLabel}`
    : "Back";
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
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
      >
        <h1 style={{ marginBottom: 12 }}>Pricing</h1>
        <button
          type="button"
          onClick={handleBack}
          aria-label={
            location.state?.backLabel ? `Go back to ${location.state.backLabel}` : "Go back"
          }
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
        Plans are based on publishing volume, connected platform limits, editing access, and monthly
        credits. Drafting and planning can stay lightweight, while heavier server renders use
        credits so you always know what costs compute before you run it.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          margin: "24px 0 28px",
        }}
      >
        {pricingFacts.map(item => (
          <div
            key={item.title}
            style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 16 }}
          >
            <h3 style={{ marginTop: 0 }}>{item.title}</h3>
            <p style={{ marginBottom: 0 }}>{item.copy}</p>
          </div>
        ))}
      </div>
      <div
        style={{
          padding: 16,
          border: "1px solid #dbeafe",
          background: "#eff6ff",
          borderRadius: 16,
          margin: "0 0 28px",
        }}
      >
        <h2 style={{ fontSize: 20, margin: "0 0 12px" }}>Common Credit Costs</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          {creditCostFacts.map(item => (
            <div
              key={item}
              style={{
                border: "1px solid #bfdbfe",
                background: "#ffffff",
                borderRadius: 10,
                padding: "10px 12px",
                fontWeight: 700,
                color: "#1e3a8a",
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
      <div style={{ maxWidth: 840 }}>
        <PayPalSubscriptionPanel />
      </div>
    </div>
  );
};

export default Pricing;
