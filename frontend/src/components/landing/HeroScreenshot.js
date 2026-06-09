const HeroScreenshot = () => (
  <div className="ap-hero-screenshot" role="img" aria-label="AutoPromote interface preview">
    <div className="ap-mockup-shell">
      <div className="ap-mockup-topbar">
        <span>AutoPromote Studio</span>
      </div>
      <div className="ap-mockup-content">
        <img
          src="/demo-poster.jpg"
          alt="AutoPromote clip creation and publish preview"
          className="ap-mockup-image"
        />
        <div className="ap-mockup-quick-card quick-top">AutoClip score: 92%</div>
        <div className="ap-mockup-quick-card quick-bottom">Cross-post suggestions: 4</div>
      </div>
    </div>
  </div>
);

export default HeroScreenshot;
