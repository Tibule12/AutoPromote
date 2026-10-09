import LandingIcon from "./LandingIcon";

export const PODCAST_IMAGES = {
  host: "/landing/podcast-conversation.webp#host",
  guest: "/landing/podcast-conversation.webp#guest",
  wide: "/landing/podcast-conversation.webp#wide",
};

export function MultiCamVisual({ eager = false }) {
  return (
    <div className="lp-camera-strip" aria-label="Example multi-camera sources">
      {[
        ["A", "Host", "host"],
        ["B", "Guest", "guest"],
        ["C", "Wide", "wide"],
      ].map(([letter, label, image]) => (
        <div className={`lp-camera lp-camera-${letter.toLowerCase()}`} key={letter}>
          <img
            src={PODCAST_IMAGES[image]}
            alt=""
            loading={eager ? "eager" : "lazy"}
            width="176"
            height="100"
          />
          <span>
            <i />
            Cam {letter} <b>{label}</b>
          </span>
        </div>
      ))}
    </div>
  );
}

const bars = Array.from({ length: 76 }, (_, index) => 10 + ((index * 17 + (index % 7) * 13) % 36));
export function Waveform({ className = "" }) {
  return (
    <div className={`lp-waveform ${className}`} aria-hidden="true">
      {bars.map((height, index) => (
        <i key={index} style={{ "--bar-height": `${height}px` }} />
      ))}
    </div>
  );
}

const cuts = ["host", "guest", "host", "wide", "guest", "host", "guest", "host"];
export function TimelineVisual() {
  return (
    <div
      className="lp-timeline"
      aria-label="Illustrative editing timeline with camera cuts, captions and clean audio"
    >
      <div className="lp-timeline-toolbar">
        <span>
          <LandingIcon name="cut" /> Your story, in the making
        </span>
        <span>00:12 / 00:48</span>
      </div>
      <div className="lp-timeline-ruler">
        <span>00:00</span>
        <span>00:12</span>
        <span>00:24</span>
        <span>00:36</span>
        <span>00:48</span>
      </div>
      <div className="lp-timeline-markers">
        <span>Hook</span>
        <span>Viral moment</span>
        <span>Key point</span>
        <span>B-roll</span>
        <span>CTA</span>
      </div>
      <div className="lp-timeline-track">
        <span className="lp-track-name">V1</span>
        <div className="lp-video-cuts">
          {cuts.map((image, index) => (
            <img
              src={PODCAST_IMAGES[image]}
              alt=""
              loading="lazy"
              width="86"
              height="42"
              key={index}
            />
          ))}
        </div>
      </div>
      <div className="lp-timeline-track">
        <span className="lp-track-name">CC</span>
        <div className="lp-caption-track">
          <span>This is a</span>
          <span>game changer.</span>
          <span>Here’s why.</span>
        </div>
      </div>
      <div className="lp-timeline-track">
        <span className="lp-track-name">A1</span>
        <Waveform />
      </div>
      <div className="lp-playhead" aria-hidden="true">
        <i />
      </div>
    </div>
  );
}

export function SocialExportVisual({ compact = false }) {
  return (
    <div
      className={`lp-social-previews ${compact ? "lp-social-compact" : ""}`}
      aria-label="Example vertical cuts for TikTok, YouTube Shorts and Instagram Reels"
    >
      {["TikTok", "YouTube Shorts", "Instagram Reels"].map((platform, index) => (
        <div className={`lp-social-card lp-social-card-${index}`} key={platform}>
          <div className="lp-social-image">
            <img
              src={PODCAST_IMAGES[index === 1 ? "guest" : "host"]}
              alt=""
              width="110"
              height="196"
              loading="lazy"
            />
            <span className="lp-social-ratio">9:16</span>
            <span className="lp-social-caption">
              Make every
              <br />
              <b>moment count.</b>
            </span>
          </div>
          <span className="lp-social-platform">{platform}</span>
        </div>
      ))}
    </div>
  );
}
