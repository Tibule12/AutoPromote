import React from "react";
import "./ScheduleCard.css";

function PlatformBadge({ platform }) {
  const colorMap = {
    tiktok: "#ff0050",
    youtube: "#ff0000",
    instagram: "#E1306C",
    twitter: "#1DA1F2",
    facebook: "#1877F2",
    spotify: "#1DB954",
    pinterest: "#E60023",
    linkedin: "#0077B5",
    reddit: "#FF4500",
    discord: "#5865F2",
    telegram: "#2CA5E0",
    snapchat: "#FFFC00",
  };
  const emojiMap = {
    tiktok: "🎵",
    youtube: "▶️",
    instagram: "📷",
    twitter: "🪶",
    facebook: "📘",
    spotify: "🎧",
    pinterest: "📌",
    linkedin: "🔗",
    reddit: "👽",
    discord: "💬",
    telegram: "✈️",
    snapchat: "👻",
  };
  const color = colorMap[platform] || "#9aa4b2";
  return (
    <span className="platform-badge" style={{ background: color }} title={platform}>
      {emojiMap[platform] || "🌐"} {platform}
    </span>
  );
}

function ScheduleCard({ schedule, content, onPause, onResume, onReschedule, onDelete }) {
  const title = content?.title || schedule?.contentTitle || "Untitled";
  const thumb =
    content?.thumbnailUrl ||
    content?.thumbnail ||
    schedule?.thumbnailUrl ||
    schedule?.thumbnail ||
    "/image.png";
  const when = new Date(
    schedule?.startTime || schedule?.startAt || schedule?.when || Date.now()
  ).toLocaleString();
  const frequency = schedule?.frequency || schedule?.scheduleType || "once";
  const platforms = Array.isArray(schedule?.platform)
    ? schedule.platform
    : schedule?.platform
      ? [schedule.platform]
      : Array.isArray(schedule?.platforms)
        ? schedule.platforms
        : [];
  const isActive = schedule?.isActive !== false;

  return (
    <div className={`schedule-card ${isActive ? "active" : "paused"}`}>
      <div className="card-thumb" style={{ backgroundImage: `url(${thumb})` }}>
        <div className="sparkles">✨</div>
      </div>
      <div className="card-body">
        <div className="card-header">
          <h4 className="card-title">{title}</h4>
          <div className="card-platforms">
            {platforms.map(p => (
              <PlatformBadge key={p} platform={p} />
            ))}
          </div>
        </div>
        <div className="card-meta">
          <div className="meta-when">📅 {when}</div>
          <div className="meta-frequency">🔁 {frequency}</div>
        </div>
        <div className="card-actions">
          {isActive ? (
            <button className="btn small ghost" onClick={() => onPause && onPause(schedule.id)}>
              Pause
            </button>
          ) : (
            <button className="btn small primary" onClick={() => onResume && onResume(schedule.id)}>
              Resume
            </button>
          )}
          <button className="btn small" onClick={() => onReschedule && onReschedule(schedule.id)}>
            Reschedule
          </button>
          <button className="btn small danger" onClick={() => onDelete && onDelete(schedule.id)}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default ScheduleCard;
