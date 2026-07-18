const HeroScreenshot = () => (
  <div className="ap-hero-screenshot" id="demo-player" aria-label="Cam Combiner demo">
    <div className="ap-cam-demo-shell">
      <div className="ap-cam-demo-toolbar">
        <div>
          <span className="ap-cam-demo-status-dot" aria-hidden="true" />
          <span>Cam Combiner</span>
        </div>
        <span className="ap-cam-demo-badge">12-second demo</span>
      </div>

      <div className="ap-cam-demo-copy">
        <p>Multi-camera podcast editing</p>
        <h2>Two cameras in. One directed podcast out.</h2>
        <span>
          See the finished podcast, live direction, reaction placement, and speaker cuts before
          you sign up.
        </span>
      </div>

      <div className="ap-cam-demo-video-frame">
        <video
          className="ap-cam-demo-video"
          src="/demos/cam-combiner-demo.webm"
          poster="/demos/cam-combiner-demo-poster.jpg"
          aria-label="Cam Combiner video demo"
          controls
          playsInline
          preload="metadata"
        >
          <a href="/demos/cam-combiner-demo.webm">Open the Cam Combiner demo video</a>
        </video>
      </div>
    </div>
  </div>
);

export default HeroScreenshot;
