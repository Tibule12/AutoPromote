const PricingSection = ({ cards, onGetStarted }) => (
  <div className="ap-pricing-grid">
    {cards.map(card => (
      <article key={card.name} className={`ap-pricing-card ${card.featured ? "featured" : ""}`}>
        <p className="plan-badge">{card.name}</p>
        <h3>{card.price}</h3>
        <p className="note">{card.note}</p>
        <p className="subtitle">{card.subtitle}</p>
        <ul>
          {card.bullets.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <button
          className={`ap-btn ${card.featured ? "ap-btn-primary" : "ap-btn-outline"} card`}
          onClick={onGetStarted}
        >
          {card.cta}
        </button>
      </article>
    ))}
  </div>
);

export default PricingSection;
