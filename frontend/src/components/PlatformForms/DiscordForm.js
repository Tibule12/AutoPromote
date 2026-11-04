import React from "react";
import CommunityDestinationPicker from "../CommunityDestinationPicker";
export default function DiscordForm({ onChange, initialData = {}, globalDescription = "" }) {
  return (
    <div className="platform-form discord-form">
      <h4>Discord publishing</h4>
      <CommunityDestinationPicker
        platform="discord"
        value={initialData.destinationId || ""}
        onChange={d =>
          onChange({
            destinationId: d?.id || "",
            destinationLabel: d?.label || "",
            channelId: d?.targetId || "",
          })
        }
      />
      <label>
        Delivery format
        <select
          aria-label="Discord delivery format"
          value={initialData.deliveryMode || "native"}
          onChange={e => onChange({ deliveryMode: e.target.value })}
        >
          <option value="native">Upload media to Discord (up to 10 MiB)</option>
          <option value="link">Share a media link (storage availability applies)</option>
        </select>
      </label>
      <label>
        Message
        <textarea
          aria-label="Discord message"
          maxLength={2000}
          value={initialData.message ?? globalDescription}
          onChange={e => onChange({ message: e.target.value })}
        />
      </label>
    </div>
  );
}
