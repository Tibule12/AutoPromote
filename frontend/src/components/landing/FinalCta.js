const FinalCta = ({ onGetStarted }) => (
  <section className="ap-final-cta">
    <div className="ap-final-copy">
      <h2>AutoPromote your full content engine.</h2>
      <p>Create. Edit. Promote. Learn.</p>
    </div>
    <div className="ap-final-cta-row">
      <button className="ap-btn ap-btn-primary" onClick={onGetStarted}>
        Start Free
      </button>
      <span className="ap-note">No Credit Card Required</span>
    </div>
  </section>
);

export default FinalCta;
