import React from "react";
import "./Page.css";

const CommunityPage = () => (
  <div className="ap-page-container">
    <header className="ap-page-header">
      <h1>Community</h1>
      <p className="ap-page-subtitle">Join the AutoPromote creator network.</p>
    </header>

    <div className="ap-content-section">
      <h3>Discord Server</h3>
      <p>
        Connect with thousands of other creators, share tips, and get direct support from our team.
        <br />
        <a href="https://discord.gg/autopromote" target="_blank" rel="noopener noreferrer">
          Join Discord →
        </a>
      </p>

      <h3>Creator Spotlight</h3>
      <p>
        Every week we feature top-performing creators on our blog and social channels. Consistent
        posting is the key to getting noticed!
      </p>

      <h3>Events & AMAs</h3>
      <p>
        Tune in for our monthly town halls and &quot;Ask Me Anything&quot; sessions with social
        media experts.
      </p>
    </div>
  </div>
);

export default CommunityPage;
