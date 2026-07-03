import { useState } from "react";

const DEMOS = [
  {
    id: "cam-combiner",
    label: "Cam Combiner",
    eyebrow: "Multi-cam edit demo",
    title: "See the Cam Combiner workflow",
    description: "Watch how multiple camera angles become a polished creator-ready edit.",
    src: "/demos/cam-combiner-demo.webm",
  },
  {
    id: "publish",
    label: "Publish Demo",
    eyebrow: "Publishing demo",
    title: "See publishing before you register",
    description: "Preview the publish flow and how content moves toward connected platforms.",
    src: "/demos/publish-demo.webm",
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
          <span className="ap-demo-badge">Watch before signup</span>
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
            poster="/demo-poster.jpg"
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
