import { useState } from "react";

export const PRODUCT_SCREENS = [
  {
    id: "overview",
    label: "Overview",
    eyebrow: "Your workspace",
    title: "See the whole content operation at a glance.",
    image: "/screenshots/dashboard/overview.jpg",
  },
  {
    id: "cam-combiner",
    label: "Cam Combiner",
    eyebrow: "Podcast production",
    title: "Sync cameras, direct speakers, and finish the master.",
    image: "/screenshots/dashboard/cam-combiner.jpg",
  },
  {
    id: "find-viral-clips",
    label: "Find Viral Clips",
    eyebrow: "AI discovery",
    title: "Find the moments worth turning into short clips.",
    image: "/screenshots/dashboard/find-viral-clips.jpg",
  },
  {
    id: "idea-to-video",
    label: "Idea-to-Video",
    eyebrow: "Creative studio",
    title: "Turn a written brief into a structured video plan.",
    image: "/screenshots/dashboard/idea-to-video.jpg",
  },
  {
    id: "publisher",
    label: "Publisher",
    eyebrow: "Cross-platform publishing",
    title: "Prepare every destination from one focused screen.",
    image: "/screenshots/dashboard/publisher.jpg",
  },
  {
    id: "queue",
    label: "Queue",
    eyebrow: "Publishing control",
    title: "Know what is scheduled, paused, or ready next.",
    image: "/screenshots/dashboard/queue.jpg",
  },
  {
    id: "analytics",
    label: "Analytics",
    eyebrow: "Performance",
    title: "Track views, clicks, and channel performance clearly.",
    image: "/screenshots/dashboard/analytics.jpg",
  },
  {
    id: "connections",
    label: "Connections",
    eyebrow: "Destinations",
    title: "Connect every supported channel from one control room.",
    image: "/screenshots/dashboard/connections.jpg",
  },
  {
    id: "team",
    label: "Team",
    eyebrow: "Collaboration",
    title: "Create a shared workspace and manage access.",
    image: "/screenshots/dashboard/team.jpg",
  },
  {
    id: "billing",
    label: "Billing",
    eyebrow: "Plans and credits",
    title: "See the plan, limits, and payment details together.",
    image: "/screenshots/dashboard/billing.jpg",
  },
  {
    id: "security",
    label: "Security",
    eyebrow: "Account protection",
    title: "Control sessions, privacy, and connected access.",
    image: "/screenshots/dashboard/security.jpg",
  },
];

const FeatureShowcase = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeScreen = PRODUCT_SCREENS[activeIndex];

  const move = direction => {
    setActiveIndex(
      current => (current + direction + PRODUCT_SCREENS.length) % PRODUCT_SCREENS.length
    );
  };

  return (
    <section className="ap-product-tour" id="product-tour" aria-labelledby="product-tour-title">
      <div className="ap-product-tour__topline">
        <div>
          <span className="ap-product-tour__live">
            <i aria-hidden="true" />
            Real product screens
          </span>
          <h2 id="product-tour-title">Click through the workspace.</h2>
        </div>
        <span className="ap-product-tour__count">
          {String(activeIndex + 1).padStart(2, "0")} / {PRODUCT_SCREENS.length}
        </span>
      </div>

      <div className="ap-product-tour__stage" id="product-screen-panel" role="tabpanel">
        <img
          key={activeScreen.image}
          src={activeScreen.image}
          alt={`${activeScreen.label} page in AutoPromote`}
          className="ap-product-tour__image"
        />
        <div className="ap-product-tour__shade" aria-hidden="true" />
        <div className="ap-product-tour__overlay">
          <span>{activeScreen.eyebrow}</span>
          <h3>{activeScreen.label}</h3>
          <p>{activeScreen.title}</p>
        </div>
        <div className="ap-product-tour__arrows">
          <button type="button" onClick={() => move(-1)} aria-label="Previous product screen">
            ←
          </button>
          <button type="button" onClick={() => move(1)} aria-label="Next product screen">
            →
          </button>
        </div>
      </div>

      <div className="ap-product-tour__tabs" role="tablist" aria-label="Choose a product screen">
        {PRODUCT_SCREENS.map((screen, index) => (
          <button
            key={screen.id}
            type="button"
            role="tab"
            aria-selected={index === activeIndex}
            aria-controls="product-screen-panel"
            className={index === activeIndex ? "is-active" : ""}
            onClick={() => setActiveIndex(index)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {screen.label}
          </button>
        ))}
      </div>
    </section>
  );
};

export default FeatureShowcase;
