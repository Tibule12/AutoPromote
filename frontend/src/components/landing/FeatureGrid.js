const FeatureGrid = ({ items }) => (
  <div className="ap-feature-grid">
    {items.map(card => (
      <article key={card.title} className="ap-feature-card ap-reveal">
        <h3>{card.title}</h3>
        <p>{card.subtitle}</p>
      </article>
    ))}
  </div>
);

export default FeatureGrid;
