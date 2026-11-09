const features = [
  {
    id: "multicam",
    icon: "camera",
    label: "EVERY ANGLE, IN SYNC",
    title: "Multi-Camera Editing",
    copy: "Bring your camera angles together. Detect active speakers and use automatic camera switches or make the cut yourself.",
  },
  {
    id: "moments",
    icon: "cut",
    label: "THE MOMENTS THAT MATTER",
    title: "AI Viral Clip Finder",
    copy: "Find and rank promising moments in your long-form videos. Review the candidates and choose what makes the cut.",
  },
  {
    id: "captions",
    icon: "captions",
    label: "LET EVERY WORD LAND",
    title: "Auto Captions",
    copy: "Generate caption drafts in English or isiXhosa. Review the words, refine the styling, and keep your voice in the edit.",
  },
  {
    id: "audio",
    icon: "audio",
    label: "SOUND AS GOOD AS YOU LOOK",
    title: "External Audio Sync",
    copy: "Use your clean recorder audio as the master track. Align it with your cameras and keep the conversation in sync.",
  },
  {
    id: "director",
    icon: "spark",
    label: "A SECOND CREATIVE PERSPECTIVE",
    title: "AI Director",
    copy: "Review project-aware split and trim suggestions. You decide which proposed edits belong in your timeline.",
  },
  {
    id: "social",
    icon: "export",
    label: "ONE STORY. EVERY FORMAT.",
    title: "Social Export",
    copy: "Reframe for vertical and square video, add captions, and prepare your edit for TikTok, YouTube Shorts and Instagram Reels.",
  },
];

export default function LandingFeatures() {
  return (
    <section
      className="lp-section lp-features-editorial"
      id="features"
      aria-labelledby="features-heading"
    >
      <div className="lp-editorial-section-head">
        <div>
          <p className="lp-eyebrow">LESS FRICTION. MORE CREATIVE FREEDOM.</p>
          <h2 id="features-heading">
            Get to the
            <br />
            <span>good part.</span>
          </h2>
        </div>
        <p>
          Bring your angles, audio and ideas.
          <br />
          Keep your creative decisions in one place.
        </p>
      </div>
      <div className="lp-feature-editorial-list">
        {features.map((feature, index) => (
          <article key={feature.id} id={feature.id === "director" ? "director" : undefined}>
            <span>
              0{index + 1} / {feature.label}
            </span>
            <h3>{feature.title}</h3>
            <p>{feature.copy}</p>
            {feature.id === "director" && <p>Every proposed edit starts with your review.</p>}
          </article>
        ))}
      </div>
      <p className="lp-feature-note">
        Multi-camera and premium creative tools are available on paid plans. Analysis, audio sync
        and server exports use credits.
      </p>
    </section>
  );
}
