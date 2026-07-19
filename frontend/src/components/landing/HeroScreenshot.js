import { useState } from "react";

const DEMOS = [
  {
    id: "dashboard",
    label: "Updated Dashboard",
    eyebrow: "Current AutoPromote experience",
    title: "See the new creator dashboard in action.",
    description:
      "Walk through publishing, platform previews, the queue, analytics, and the updated creator workspace.",
    src: "/demos/dashboard-demo.webm",
    poster: "/demos/dashboard-demo-poster.jpg",
  },
  {
    id: "cam-combiner",
    label: "Cam Combiner",
    eyebrow: "Multi-camera podcast editing",
    title: "Two cameras in. One directed podcast out.",
    description:
      "See the finished podcast, live direction, reaction placement, and speaker cuts before you sign up.",
    src: "/demos/cam-combiner-demo.webm",
    poster: "/demos/cam-combiner-demo-poster.jpg",
  },
];

const HeroScreenshot = () => {
  const [activeDemoId, setActiveDemoId] = useState(DEMOS[0].id);
  const activeDemo = DEMOS.find(demo => demo.id === activeDemoId) || DEMOS[0];

  return (
    <div className="ap-hero-screenshot" id="demo-player" aria-label="AutoPromote demo videos">
      <div className="ap-demo-shell">
        <div className="ap-demo-toolbar">
          <div>
            <span className="ap-demo-status-dot" aria-hidden="true" />
            <span className="ap-demo-toolbar-title">{activeDemo.label}</span>
          </div>
          <span className="ap-demo-badge">
            {activeDemo.id === "dashboard" ? "2-minute walkthrough" : "12-second demo"}
          </span>
        </div>

        <div className="ap-demo-selector" role="tablist" aria-label="Choose a demo">
          {DEMOS.map(demo => (
            <button
              key={demo.id}
              type="button"
              className={`ap-demo-tab ${demo.id === activeDemo.id ? "active" : ""}`}
              onClick={() => setActiveDemoId(demo.id)}
              role="tab"
              aria-selected={demo.id === activeDemo.id}
              aria-controls="ap-demo-video"
            >
              <span>{demo.label}</span>
            </button>
          ))}
        </div>

        <div className="ap-demo-copy">
          <p>{activeDemo.eyebrow}</p>
          <h2>{activeDemo.title}</h2>
          <span>{activeDemo.description}</span>
        </div>

        <div className="ap-demo-video-frame">
          <video
            key={activeDemo.src}
            id="ap-demo-video"
            className="ap-demo-video"
            src={activeDemo.src}
            poster={activeDemo.poster}
            aria-label={`${activeDemo.label} video demo`}
            controls
            playsInline
            preload="metadata"
          >
            <a href={activeDemo.src}>Open the {activeDemo.label} demo video</a>
          </video>
        </div>
      </div>
    </div>
  );
};

export default HeroScreenshot;
