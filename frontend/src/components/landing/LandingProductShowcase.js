import { useRef, useState } from "react";
import LandingIcon from "./LandingIcon";

const views = [
  {
    id: "edit",
    label: "Make the cut",
    title: "A proper timeline. Your kind of edit.",
    copy: "Compare your source and edit side by side. Split the timeline, refine the framing, and keep the original audio in the story.",
    image: "workspace-studio.png",
    alt: "AutoPromote Studio with source and edit comparison and separate video and audio tracks",
    detail: [
      "Before / after comparison",
      "Precise split and trim",
      "Vertical, square and wide formats",
    ],
  },
  {
    id: "publish",
    label: "Choose your audience",
    title: "One edit. More places to be seen.",
    copy: "Choose your destinations and prepare each post in the Publisher. Give your clip its own caption and presentation for each connected platform.",
    image: "workspace-publisher.png",
    alt: "AutoPromote Publisher with media and destination selection",
    detail: ["Platform-specific posts", "Review before publishing", "Connected social accounts"],
  },
  {
    id: "schedule",
    label: "Plan the release",
    title: "The next release, already in view.",
    copy: "See your scheduled posts together. Switch between the queue and calendar, review the timing, and keep your upcoming releases organized.",
    image: "workspace-calendar.png",
    alt: "AutoPromote publishing calendar showing sample upcoming YouTube, Instagram and TikTok posts",
    detail: ["Calendar and queue views", "Release timing", "Sample posts shown"],
  },
  {
    id: "measure",
    label: "Learn what lands",
    title: "See what your audience comes back for.",
    copy: "Explore performance by platform and date range. Use your connected-account data to decide where to focus your next release.",
    image: "workspace-analytics.png",
    alt: "AutoPromote Analytics with sample platform performance and date filters",
    detail: ["Platform breakdowns", "Date-range comparison", "Sample metrics shown"],
  },
];

export default function LandingProductShowcase({ onWatchDemo }) {
  const [active, setActive] = useState(0);
  const tabs = useRef([]);
  const current = views[active];
  const navigate = (event, index) => {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % views.length;
    if (event.key === "ArrowLeft") next = (index + views.length - 1) % views.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = views.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };
  return (
    <section className="lp-product-showcase" id="workspace" aria-labelledby="workspace-heading">
      <div className="lp-editorial-section-head">
        <div>
          <p className="lp-eyebrow">FROM THE FIRST CUT TO THE NEXT RELEASE</p>
          <h2 id="workspace-heading">
            The whole story.
            <br />
            <span>One workspace.</span>
          </h2>
        </div>
        <p>
          Your footage deserves more than a quick crop.
          <br />
          Explore the tools behind your next release.
        </p>
      </div>
      <div className="lp-showcase-tabs" role="tablist" aria-label="Explore AutoPromote">
        {views.map((view, index) => (
          <button
            key={view.id}
            ref={element => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`workspace-tab-${view.id}`}
            aria-selected={active === index}
            aria-controls={`workspace-panel-${view.id}`}
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={event => navigate(event, index)}
          >
            <span>0{index + 1}</span>
            {view.label}
            <LandingIcon name="arrow" />
          </button>
        ))}
      </div>
      <div
        className="lp-showcase-panel"
        role="tabpanel"
        id={`workspace-panel-${current.id}`}
        aria-labelledby={`workspace-tab-${current.id}`}
        tabIndex={0}
      >
        <div className="lp-showcase-picture">
          <img
            key={current.image}
            src={`/landing/${current.image}`}
            alt={current.alt}
            width="1600"
            height="900"
            loading="lazy"
          />
          <span>RECORDED IN AUTOPROMOTE / SAMPLE WORKSPACE</span>
        </div>
        <div className="lp-showcase-copy">
          <h3>{current.title}</h3>
          <p>{current.copy}</p>
          <ul>
            {current.detail.map(item => (
              <li key={item}>
                <LandingIcon name="check" />
                {item}
              </li>
            ))}
          </ul>
          <button type="button" className="lp-text-button" onClick={onWatchDemo}>
            Watch the walkthrough <LandingIcon name="play" />
          </button>
        </div>
      </div>
    </section>
  );
}
