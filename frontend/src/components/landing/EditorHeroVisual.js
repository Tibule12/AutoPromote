import LandingIcon from "./LandingIcon";
import {
  MultiCamVisual,
  PODCAST_IMAGES,
  SocialExportVisual,
  TimelineVisual,
} from "./ProductVisuals";

export default function EditorHeroVisual() {
  return (
    <figure
      className="lp-editor-scene"
      data-visible="false"
      aria-label="AutoPromote editing illustration"
    >
      <div className="lp-scene-orbit" aria-hidden="true" />
      <div className="lp-scene-depth">
        <div className="lp-source-float">
          <div className="lp-source-heading">
            <LandingIcon name="camera" /> All your angles. One story.
          </div>
          <MultiCamVisual eager />
        </div>
        <div className="lp-editor-window">
          <div className="lp-editor-titlebar">
            <span className="lp-window-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>The conversation · Podcast edit</span>
            <span className="lp-editor-project">AutoPromote Studio</span>
          </div>
          <div className="lp-programme">
            <img
              src={PODCAST_IMAGES.wide}
              alt="Two speakers recording a podcast in a studio"
              width="1122"
              height="468"
              fetchPriority="high"
            />
            <span className="lp-programme-label">
              <i /> Programme preview
            </span>
            <div className="lp-preview-guides" aria-hidden="true" />
            <div className="lp-preview-caption">
              This is a <strong>game changer.</strong>
            </div>
            <div className="lp-programme-controls" aria-hidden="true">
              <LandingIcon name="play" />
              <span>00:12:08</span>
              <span>16:9</span>
              <LandingIcon name="audio" />
            </div>
          </div>
          <TimelineVisual />
        </div>
        <div className="lp-signal lp-signal-speaker">
          <span className="lp-signal-icon">
            <LandingIcon name="audio" />
          </span>
          <div>
            <small>FOLLOW THE CONVERSATION</small>
            <strong>Active speaker detected</strong>
            <span>Cam A · Host</span>
          </div>
        </div>
        <div className="lp-signal lp-signal-moment">
          <span className="lp-signal-icon">
            <LandingIcon name="spark" />
          </span>
          <div>
            <small>AI CLIP FINDER</small>
            <strong>A moment worth sharing</strong>
            <span>Suggested clip · ready to review</span>
          </div>
        </div>
        <div className="lp-social-float">
          <SocialExportVisual compact />
        </div>
        <span className="lp-audio-synced">
          <LandingIcon name="check" /> Clean audio synced <i /> Captions drafted
        </span>
      </div>
      <figcaption>Illustrative edit · Sample podcast footage</figcaption>
    </figure>
  );
}
