const ProofSection = ({ proofChecklist, exampleContent }) => (
  <div className="ap-section ap-section-split" id="proof">
    <div>
      <div className="ap-section-heading">
        <p className="ap-eyebrow">Product signals</p>
        <h2>What your workflow can do</h2>
        <p>These describe the actual workflow steps the page is presenting.</p>
      </div>
      <ul className="ap-proof-checks ap-reveal">
        {proofChecklist.map(item => (
          <li key={item.label}>
            <strong>{item.label}:</strong> {item.text}
          </li>
        ))}
      </ul>
    </div>

    <div className="ap-proof-stack">
      <div>
        <div className="ap-section-heading">
          <p className="ap-eyebrow">Example content outputs</p>
          <h2>Example outputs</h2>
          <p>Sample previews (for illustration, not live usage claims).</p>
        </div>
        <div className="ap-example-grid">
          {exampleContent.map(item => (
            <article key={item.tag} className="ap-example-card ap-reveal">
              <span>{item.tag}</span>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default ProofSection;
