import React, { useState, useEffect } from "react";

const RedditForm = ({ onChange, initialData = {}, globalTitle, globalDescription }) => {
  const [subreddit, setSubreddit] = useState(initialData.subreddit || "");
  const [title, setTitle] = useState(initialData.title || globalTitle || "");
  const [flairId, setFlairId] = useState(initialData.flairId || "");
  const [isNSFW, setIsNSFW] = useState(initialData.isNSFW || false);
  const [isSpoiler, setIsSpoiler] = useState(initialData.isSpoiler || false);

  // Mock flairs for now, in real app would fetch based on subreddit
  const [availableFlairs, setAvailableFlairs] = useState([]);

  useEffect(() => {
    onChange({
      platform: "reddit",
      subreddit,
      title,
      flairId,
      isNSFW,
      isSpoiler,
    });
  }, [subreddit, title, flairId, isNSFW, isSpoiler]);

  return (
    <div className="platform-form reddit-form">
      <h4 className="platform-form-header">
        <span className="icon" style={{ color: "#FF4500" }}>
          👽
        </span>{" "}
        Reddit Post
      </h4>

      <div className="form-group-modern">
        <label>Subreddit (r/)</label>
        <div className="input-with-icon">
          <span className="input-icon">r/</span>
          <input
            type="text"
            className="modern-input"
            value={subreddit}
            onChange={e => setSubreddit(e.target.value)}
            placeholder="videos"
          />
        </div>
      </div>

      <div className="form-group-modern">
        <label>Title</label>
        <input
          type="text"
          className="modern-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="An interesting title"
          maxLength={300}
        />
        <div className="char-count">{title.length}/300</div>
      </div>

      {/* Flair selection would go here if we fetched them */}

      <div className="toggles-row">
        <label className="checkbox-pill warning">
          <input type="checkbox" checked={isNSFW} onChange={e => setIsNSFW(e.target.checked)} />
          <span>🔞 NSFW</span>
        </label>

        <label className="checkbox-pill">
          <input
            type="checkbox"
            checked={isSpoiler}
            onChange={e => setIsSpoiler(e.target.checked)}
          />
          <span>⚠️ Spoiler</span>
        </label>
      </div>
    </div>
  );
};

export default RedditForm;
