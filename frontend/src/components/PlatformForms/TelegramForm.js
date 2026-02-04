import React, { useState, useEffect } from "react";
import "../../ContentUploadForm.css";

const TelegramForm = ({ onChange, initialData = {} }) => {
  const [chatId, setChatId] = useState(initialData.chatId || "");

  useEffect(() => {
    onChange({ platform: "telegram", chatId });
  }, [chatId, onChange]);

  return (
    <div className="platform-form telegram-form">
      <h4 className="platform-form-header">
        <span className="icon">✈️</span> Telegram Configuration
      </h4>
      <div
        style={{
          backgroundColor: "rgba(0, 136, 204, 0.1)",
          padding: "8px",
          borderRadius: "4px",
          marginBottom: "8px",
          fontSize: "12px",
          color: "#0088cc",
          border: "1px solid rgba(0, 136, 204, 0.2)",
        }}
      >
        <strong>Native Host:</strong> Supports direct Video, Photo, and Text messages to your
        chat/channel.
      </div>
      <input
        placeholder="Telegram chat ID"
        className="modern-input"
        value={chatId}
        onChange={e => setChatId(e.target.value)}
      />
    </div>
  );
};

export default TelegramForm;
