const ProofSection = ({ testimonials, usageStats, exampleContent }) => (
  <div className="ap-section ap-section-split" id="proof">
    <div>
      <div className="ap-section-heading">
        <p className="ap-eyebrow">Creator testimonials</p>
        <h2>Built by creators, for creators</h2>
        <p>Fast feedback, less guesswork, clearer growth.</p>
      </div>
      <div className="ap-testimonial-grid">
        {testimonials.map(testimonial => (
          <article key={testimonial.creator} className="ap-testimonial ap-reveal">
            <p>“{testimonial.quote}”</p>
            <p className="meta">
              <span>{testimonial.creator}</span>
              <span>•</span>
              <span>{testimonial.role}</span>
            </p>
            <p className="platform">{testimonial.platform}</p>
          </article>
        ))}
      </div>
    </div>

    <div className="ap-proof-stack">
      <div>
        <div className="ap-section-heading">
          <p className="ap-eyebrow">Usage statistics</p>
          <h2>Signal, not vibes</h2>
          <p>Usage that actually matters.</p>
        </div>
        <div className="ap-stat-grid">
          {usageStats.map(stat => (
            <div key={stat.label} className="ap-stat-card ap-reveal">
              <span className="value">{stat.value}</span>
              <span className="label">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="ap-example-grid">
        {exampleContent.map(item => (
          <div key={item.tag} className="ap-example-card ap-reveal">
            <span>{item.tag}</span>
            <p>{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default ProofSection;
