const SectionHeading = ({ eyebrow, title, copy }) => (
  <div className="ap-section-heading">
    <p className="ap-eyebrow">{eyebrow}</p>
    <h2>{title}</h2>
    <p>{copy}</p>
  </div>
);

export default SectionHeading;
