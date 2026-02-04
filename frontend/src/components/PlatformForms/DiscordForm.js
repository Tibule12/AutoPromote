import React, { useState, useEffect } from "react";
import "../../ContentUploadForm.css";

const DiscordForm = ({ onChange, initialData = {} }) => {
  const [channelId, setChannelId] = useState(initialData.channelId || "");

  useEffect(() => {
    onChange({ platform: "discord", channelId });
  }, [channelId, onChange]);

  return (
    <div className="platform-form discord-form">
      <h4 className="platform-form-header">
        <span className="icon">💬</span> Discord Configuration
      </h4>
      <div
        style={{
          backgroundColor: "rgba(88, 101, 242, 0.1)",
          padding: "8px",
          borderRadius: "4px",
          marginBottom: "8px",
          fontSize: "12px",
          color: "#5865F2",
          border: "1px solid rgba(88, 101, 242, 0.2)",
        }}
      >
        <strong>Link & Embed Mode:</strong> Shares content as a rich embed via Webhook. Attachments
        are not uploaded directly to Discord.
      </div>
      <input
        placeholder="Discord channel ID"
        className="modern-input"
        value={channelId}
        onChange={e => setChannelId(e.target.value)}
      />
    </div>
  );
};

export default DiscordForm;
