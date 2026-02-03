import React, { useState, useEffect } from "react";

const YouTubeForm = ({
  onChange,
  initialData = {},
  globalTitle,
  globalDescription,
  bountyAmount,
  setBountyAmount,
  bountyNiche,
  setBountyNiche,
}) => {
  const [title, setTitle] = useState(initialData.title || globalTitle || "");
  const [description, setDescription] = useState(
    initialData.description || globalDescription || ""
  );
  const [privacy, setPrivacy] = useState(initialData.privacy || "public");
  const [madeForKids, setMadeForKids] = useState(initialData.madeForKids || false);
  const [tags, setTags] = useState(initialData.tags || "");
  const [category, setCategory] = useState(initialData.category || "22"); // 22 = People & Blogs
  const [paidPromotion, setPaidPromotion] = useState(initialData.paidPromotion || false);

  useEffect(() => {
    onChange({
      platform: "youtube",
      title,
      description,
      privacy,
      madeForKids,
      tags,
      category,
      paidPromotion,
    });
  }, [title, description, privacy, madeForKids, tags, category, paidPromotion]);

  const categories = [
    { id: "1", name: "Film & Animation" },
    { id: "2", name: "Autos & Vehicles" },
    { id: "10", name: "Music" },
    { id: "15", name: "Pets & Animals" },
    { id: "17", name: "Sports" },
    { id: "20", name: "Gaming" },
    { id: "22", name: "People & Blogs" },
    { id: "23", name: "Comedy" },
    { id: "24", name: "Entertainment" },
    { id: "28", name: "Science & Technology" },
    { id: "27", name: "Education" },
  ];

  return (
    <div className="platform-form youtube-form">
      <h4 className="platform-form-header">
        <span className="icon" style={{ color: "red" }}>
          ▶
        </span>{" "}
        YouTube Studio
      </h4>

      <div className="form-group-modern">
        <label>Video Title</label>
        <input
          type="text"
          className="modern-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={100}
          placeholder="Create a title that hooks viewers"
        />
        <div className="char-count">{title.length}/100</div>
      </div>

      <div className="form-group-modern">
        <label>Description</label>
        <textarea
          className="modern-input"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Tell viewers about your video..."
          rows={5}
        />
      </div>

      <div className="form-row-modern two-col">
        <div className="form-group-modern">
          <label>Visibility</label>
          <select
            className="modern-select"
            value={privacy}
            onChange={e => setPrivacy(e.target.value)}
          >
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
          </select>
        </div>
        <div className="form-group-modern">
          <label>Category</label>
          <select
            className="modern-select"
            value={category}
            onChange={e => setCategory(e.target.value)}
          >
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group-modern">
        <label>Tags (comma separated)</label>
        <input
          type="text"
          className="modern-input"
          value={tags}
          onChange={e => setTags(e.target.value)}
          placeholder="gaming, vlog, tutorial"
        />
      </div>

      <div className="compliance-section">
        <h5 className="section-label">Audience & Compliance</h5>

        <label className="checkbox-modern warning-theme">
          <input
            type="checkbox"
            checked={madeForKids}
            onChange={e => setMadeForKids(e.target.checked)}
          />
          <span className="checkmark"></span>
          <span className="label-text">
            Made for Kids
            <span className="tooltip-icon" title="Required by COPPA">
              ?
            </span>
          </span>
        </label>

        <label className="checkbox-modern">
          <input
            type="checkbox"
            checked={paidPromotion}
            onChange={e => setPaidPromotion(e.target.checked)}
          />
          <span className="checkmark"></span>
          <span className="label-text">Includes Paid Promotion</span>
        </label>
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

export default YouTubeForm;
