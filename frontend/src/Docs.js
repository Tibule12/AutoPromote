import React from "react";
import "./App.css";

const Docs = () => (
  <div className="docs-page" style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
    <h1>Documentation</h1>
    <p>
      Welcome to the AutoPromote documentation. This section contains guides and references for
      using the platform.
    </p>

    <h2>Quickstart</h2>
    <p>
      To get started, sign up for an account and connect your social platforms under
      &quot;Connections&quot;. Use the content upload flow to schedule promotions and monitor
      performance from the dashboard.
    </p>

    <h2>Upload Formats</h2>
    <ul>
      <li>Video: MP4, up to 2GB</li>
      <li>Image: JPG/PNG</li>
      <li>Audio: MP3</li>
    </ul>

    <h2>APIs</h2>
    <p>
      For developers, the public API endpoints are available under <code>/api</code>. Contact the
      team for API keys and integration help.
    </p>
  </div>
);

export default Docs;
