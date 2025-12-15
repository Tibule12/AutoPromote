import React, { useState, useEffect } from "react";
import "./HashtagSuggestions.css";

const TRENDING_HASHTAGS = {
  general: [
    "AutoPromote",
    "ContentCreator",
    "SocialMediaMarketing",
    "viral",
    "trending",
    "fyp",
    "foryou",
    "explore",
    "instagood",
    "photooftheday",
    "DigitalMarketing",
    "GrowYourBrand",
  ],
  video: [
    "AutoPromote",
    "VideoMarketing",
    "ContentCreation",
    "reels",
    "tiktok",
    "viral",
    "trending",
    "videooftheday",
    "shortsvideo",
    "contentcreator",
    "videography",
    "SocialMediaGrowth",
  ],
  image: [
    "AutoPromote",
    "VisualContent",
    "BrandMarketing",
    "photography",
    "photooftheday",
    "picoftheday",
    "instadaily",
    "aesthetic",
    "art",
    "beautiful",
    "nature",
    "ContentStrategy",
  ],
  audio: [
    "AutoPromote",
    "MusicMarketing",
    "AudioContent",
    "music",
    "newmusic",
    "musician",
    "producer",
    "beats",
    "spotify",
    "soundcloud",
    "audio",
    "MusicPromotion",
  ],
};

function HashtagSuggestions({ contentType, title, description, onAddHashtag }) {
  const [suggestions, setSuggestions] = useState([]);
  const [customHashtag, setCustomHashtag] = useState("");

  useEffect(() => {
    generateSuggestions();
  }, [contentType, title, description]);

  const generateSuggestions = () => {
    const baseHashtags = TRENDING_HASHTAGS[contentType] || TRENDING_HASHTAGS.general;
    const titleWords = title
      .toLowerCase()
      .split(" ")
      .filter(w => w.length > 3);
    const descWords = description
      .toLowerCase()
      .split(" ")
      .filter(w => w.length > 3);

    const contextual = [...new Set([...titleWords, ...descWords])].slice(0, 5);
    const combined = [...baseHashtags.slice(0, 10), ...contextual].slice(0, 15);

    setSuggestions(combined);
  };

  const handleAddCustom = () => {
    if (customHashtag.trim()) {
      const hashtag = customHashtag.trim().replace(/^#/, "");
      onAddHashtag(hashtag);
      setCustomHashtag("");
    }
  };

  return (
    <div className="hashtag-suggestions">
      <div className="hashtag-header">
        <h4>✨ Trending Hashtags</h4>
        <span className="hashtag-hint">Tap to add</span>
      </div>

      <div className="hashtag-chips">
        {suggestions.map((tag, idx) => (
          <button key={idx} className="hashtag-chip" onClick={() => onAddHashtag(tag)}>
            #{tag}
          </button>
        ))}
      </div>

      <div className="custom-hashtag">
        <input
          type="text"
          placeholder="Add custom hashtag..."
          value={customHashtag}
          onChange={e => setCustomHashtag(e.target.value)}
          onKeyPress={e => e.key === "Enter" && handleAddCustom()}
          className="custom-hashtag-input"
        />
        <button onClick={handleAddCustom} className="add-hashtag-btn">
          +
        </button>
      </div>
    </div>
  );
}

export default HashtagSuggestions;
