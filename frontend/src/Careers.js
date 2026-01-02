import React from "react";

const Careers = () => {
  return (
    <div className="page-container" style={{ padding: 24 }}>
      <h2>Careers</h2>
      <p>
        We are growing and hiring. If you are interested in joining the team, send your CV to{" "}
        <a href="mailto:thulani@autopromote.org">thulani@autopromote.org</a>.
      </p>
      <h3>Open Roles</h3>
      <ul>
        <li>Frontend Engineer</li>
        <li>Backend Engineer</li>
        <li>Product Designer</li>
      </ul>
      <p>Include a short note about why you are a good fit and links to any relevant work.</p>
    </div>
  );
};

export default Careers;
