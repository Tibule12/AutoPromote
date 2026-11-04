import React from "react";
import CommunityDestinationPicker from "../CommunityDestinationPicker";
export default function TelegramForm({ onChange, initialData = {}, globalDescription = "" }) {
  return (
    <div className="platform-form telegram-form">
      <h4>Telegram publishing</h4>
      <CommunityDestinationPicker
        platform="telegram"
        value={initialData.destinationId || ""}
        onChange={d =>
          onChange({
            destinationId: d?.id || "",
            destinationLabel: d?.label || "",
            chatId: d?.targetId || "",
          })
        }
      />
      <label>
        Media caption
        <textarea
          aria-label="Telegram caption"
          maxLength={1024}
          value={initialData.message ?? globalDescription}
          onChange={e => onChange({ message: e.target.value })}
        />
      </label>
      <small>
        Your media goes to the selected destination. Connecting your private bot chat does not
        authorise a channel.
      </small>
    </div>
  );
}
