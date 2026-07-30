const FeatureGrid = ({ items }) => (
  <div className="ap-feature-grid">
    {items.map((card, index) => (
      <article key={card.title} className="ap-feature-card ap-reveal">
        <div className="ap-feature-card__topline">
          <span>{String(index + 1).padStart(2, "0")}</span>
          <small>Connected workflow</small>
        </div>
        <h3>{card.title}</h3>
        <p>{card.subtitle}</p>
        <div className="ap-feature-card__footer" aria-hidden="true">
          <span>Inside your workspace</span>
          <b>→</b>
        </div>
      </article>
    ))}
  </div>
);

export default FeatureGrid;
