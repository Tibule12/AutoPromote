import React, { useState, useEffect } from "react";

const InstagramForm = ({
  onChange,
  initialData = {},
  globalTitle,
  globalDescription,
  facebookPages = [], // Instagram business accounts often linked to FB Pages
  bountyAmount,
  setBountyAmount,
  bountyNiche,
  setBountyNiche,
}) => {
  const [caption, setCaption] = useState(
    initialData.caption || globalTitle + "\n\n" + globalDescription
  );
  const [location, setLocation] = useState(initialData.location || "");
  const [isReel, setIsReel] = useState(initialData.isReel !== false); // Default to Reel in 2026
  const [shareToFeed, setShareToFeed] = useState(initialData.shareToFeed !== false);
  // Default to first available page ID if provided, ensuring the user knows which account is target
  const [selectedPageId, setSelectedPageId] = useState(
    initialData.pageId || facebookPages[0]?.id || ""
  );

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
      pageId: selectedPageId, // Include identity in payload
    });
  }, [caption, location, isReel, shareToFeed, isPaidPartnership, sponsorUser, selectedPageId]);

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

      {/* IDENTITY SECTION: CRITICAL FOR REVIEWERS */}
      <div className="form-group-modern">
        <label>Publishing to Account (Identity)</label>
        {facebookPages.length > 0 ? (
          <select
            className="modern-select"
            value={selectedPageId}
            onChange={e => setSelectedPageId(e.target.value)}
          >
            {facebookPages.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}{" "}
                {p.instagram_business_account
                  ? `(IG: ${p.instagram_business_account.id})`
                  : "(Linked Page)"}
              </option>
            ))}
          </select>
        ) : (
          <div className="alert-box warning" style={{ fontSize: "0.85rem" }}>
            No connected Instagram Accounts found. Ensure your Facebook Page has an Instagram
            Business account linked.
          </div>
        )}
        <p className="legal-hint" style={{ marginTop: "4px" }}>
          <span style={{ color: "#888" }}>
            IG ID:{" "}
            {facebookPages.find(p => p.id === selectedPageId)?.instagram_business_account?.id ||
              "N/A"}
          </span>
        </p>

        <div
          className="scope-info-box"
          style={{
            marginTop: "8px",
            padding: "12px",
            background: "linear-gradient(to right, #fff0f5, #fff5f8)",
            borderRadius: "8px",
            border: "1px solid #fce7f3",
            fontSize: "0.85rem",
          }}
        >
          <div
            style={{
              fontWeight: "600",
              marginBottom: "6px",
              color: "#cc2366",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>📸</span> Instagram Permissions
          </div>
          <p style={{ margin: 0, color: "#444", lineHeight: "1.4" }}>
            <strong>Why we need this:</strong>
          </p>
          <ul style={{ margin: "6px 0 0 20px", padding: 0, color: "#444", lineHeight: "1.4" }}>
            <li>
              <code
                style={{
                  background: "#fff",
                  padding: "2px 4px",
                  borderRadius: "3px",
                  border: "1px solid #fbcfe8",
                  fontFamily: "monospace",
                  color: "#be185d",
                }}
              >
                instagram_basic
              </code>
              : Used to display the Instagram account name and ID in the dropdown above, confirming
              which account you are targeting.
            </li>
            <li>
              <code
                style={{
                  background: "#fff",
                  padding: "2px 4px",
                  borderRadius: "3px",
                  border: "1px solid #fbcfe8",
                  fontFamily: "monospace",
                  color: "#be185d",
                }}
              >
                instagram_content_publish
              </code>
              : Used to securely upload your media (Reels/Photos) to the selected Professional
              Account.
            </li>
          </ul>
          <p
            style={{
              margin: "8px 0 0 0",
              color: "#831843",
              fontSize: "0.8rem",
              fontStyle: "italic",
              borderTop: "1px solid #fce7f3",
              paddingTop: "6px",
            }}
          >
            <strong>Privacy Guarantee:</strong> We cannot access your Direct Messages (DMs) or view
            your private personal profile data. We only interact with the specific business assets
            you authorize.
          </p>
        </div>
      </div>

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

      {/* VIRAL BOUNTY SECTION */}
      {setBountyAmount && (
        <div
          className="form-group-modern"
          style={{
            marginTop: "16px",
            border: "1px solid #ffd700",
            background: "rgba(255, 215, 0, 0.05)",
            padding: "10px",
            borderRadius: "8px",
          }}
        >
          <label
            style={{
              color: "#d97706",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontWeight: "bold",
            }}
          >
            <span>💰</span> Viral Bounty Pool
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px",
              marginTop: "8px",
            }}
          >
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: "0.75rem", display: "block" }}>Amount ($)</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                className="modern-input"
                value={bountyAmount || ""}
                onChange={e => setBountyAmount(parseFloat(e.target.value) || 0)}
                style={{ borderColor: bountyAmount > 0 ? "#ffd700" : "" }}
              />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: "0.75rem", display: "block" }}>Target Niche</label>
              <select
                className="modern-select"
                value={bountyNiche || "general"}
                onChange={e => setBountyNiche && setBountyNiche(e.target.value)}
                style={{ height: "38px" }}
              >
                <option value="general">General</option>
                <option value="music">Music</option>
                <option value="tech">Tech</option>
                <option value="fashion">Fashion</option>
                <option value="crypto">Crypto</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InstagramForm;
