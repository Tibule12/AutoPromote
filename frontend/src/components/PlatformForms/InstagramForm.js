import React, { useState, useEffect } from "react";

const InstagramForm = ({
  onChange,
  initialData = {},
  globalTitle,
  globalDescription,
  facebookPages = [], // Instagram business accounts often linked to FB Pages
}) => {
  const [caption, setCaption] = useState(
    initialData.caption || globalTitle + "\n\n" + globalDescription
  );
  const [location, setLocation] = useState(initialData.location || "");
  const [isReel, setIsReel] = useState(initialData.isReel !== false); // Default to Reel in 2026
  const [shareToFeed, setShareToFeed] = useState(initialData.shareToFeed !== false);

  // Branded Content / Partnership
  const [isPaidPartnership, setIsPaidPartnership] = useState(
    initialData.isPaidPartnership || false
  );
  const [sponsorUser, setSponsorUser] = useState(initialData.sponsorUser || "");

  useEffect(() => {
    onChange({
      platform: "instagram",
      caption,
      location,
      isReel,
      shareToFeed,
      isPaidPartnership,
      sponsorUser,
    });
  }, [caption, location, isReel, shareToFeed, isPaidPartnership, sponsorUser]);

  return (
    <div className="platform-form instagram-form">
      <h4 className="platform-form-header">
        <span
          className="icon"
          style={{
            background:
              "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          📷
        </span>{" "}
        Instagram Creator
      </h4>

      <div className="form-group-modern">
        <label>Caption</label>
        <textarea
          className="modern-input"
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="Write a caption..."
          rows={4}
          maxLength={2200}
        />
        <div className="char-count">{caption.length}/2200</div>
      </div>

      <div className="form-row-modern">
        <div className="form-group-modern">
          <label>Location</label>
          <div className="input-with-icon">
            <span className="input-icon">📍</span>
            <input
              type="text"
              className="modern-input"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Add Location"
            />
          </div>
        </div>
      </div>

      <div className="form-group-modern">
        <label>Post Type</label>
        <div className="segment-control">
          <button type="button" className={isReel ? "active" : ""} onClick={() => setIsReel(true)}>
            🎬 Reel (Recommended)
          </button>
          <button
            type="button"
            className={!isReel ? "active" : ""}
            onClick={() => setIsReel(false)}
          >
            🖼️ Post / Carousel
          </button>
        </div>
      </div>

      {isReel && (
        <div
          className="toggle-card"
          style={{
            marginBottom: 16,
            flexDirection: "row",
            justifyContent: "space-between",
            padding: "8px 16px",
          }}
        >
          <span className="toggle-label" style={{ marginBottom: 0 }}>
            Also share to Feed
          </span>
          <label className="toggle-container">
            <input
              type="checkbox"
              checked={shareToFeed}
              onChange={e => setShareToFeed(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      )}

      <div className="commercial-section">
        <label className="checkbox-modern">
          <input
            type="checkbox"
            checked={isPaidPartnership}
            onChange={e => setIsPaidPartnership(e.target.checked)}
          />
          <span className="checkmark"></span>
          <span className="label-text">Add "Paid Partnership" Label</span>
        </label>

        {isPaidPartnership && (
          <div className="sub-settings fade-in">
            <div className="form-group-modern">
              <label>Brand Partner (Username)</label>
              <div className="input-with-icon">
                <span className="input-icon">@</span>
                <input
                  type="text"
                  className="modern-input"
                  placeholder="nike"
                  value={sponsorUser}
                  onChange={e => setSponsorUser(e.target.value)}
                />
              </div>
              <p className="legal-hint">
                This will tag the brand partner and allow them to see metrics.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InstagramForm;
