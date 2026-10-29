import React from "react";
import { Link } from "react-router";
import PublicPage from "./components/public/PublicPage";

const updates = [
  [
    "21 October 2026",
    "Clearer controls. More useful guides.",
    "Studio inspector layouts keep Graphics and Sound controls inside the panel. Motion fields and sound cues are easier to read. The refreshed guides cover inspector navigation, keyframes, Logo Workshop and sound-cue editing.",
  ],
  [
    "21 October 2026",
    "A clearer picture of a release.",
    "Publishing and analytics work distinguishes scheduled, processing and published states, preserves unavailable metrics separately from real zeroes, and keeps destination copy and timing visible.",
  ],
  [
    "18 October 2026",
    "More ways to build motion.",
    "Studio development adds editable vector artwork, stroke trim and offset, text choreography and Logo Workshop. These use ordinary layers and keys in the same project; capability-specific limits remain in the guides.",
  ],
];
export default function Changelog() {
  return (
    <PublicPage
      eyebrow="PRODUCT NOTES / DEVELOPMENT UPDATES"
      title="Product updates"
      intro="Recent work on editing, publishing and the documentation around them. Check the running app and guides for availability in your account."
    >
      <div className="public-prose">
        {updates.map(([date, title, copy]) => (
          <section key={title}>
            <p className="public-section-label">{date}</p>
            <h2>{title}</h2>
            <p>{copy}</p>
          </section>
        ))}
        <div className="public-callout">
          These are development updates, not a guarantee that every change is deployed to every
          account. <Link to="/docs">Read the capability guides</Link> for scope and limitations.
        </div>
      </div>
    </PublicPage>
  );
}
