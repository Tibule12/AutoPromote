import React, { useState, useEffect } from "react";

const PinterestForm = ({
  onChange,
  initialData = {},
  globalTitle,
  globalDescription,
  boards = [],
}) => {
  const [boardId, setBoardId] = useState(initialData.boardId || boards[0]?.id || "");
  const [title, setTitle] = useState(initialData.title || globalTitle || "");
  const [description, setDescription] = useState(
    initialData.description || globalDescription || ""
  );
  const [link, setLink] = useState(initialData.link || "");
  const [isPaidPartnership, setIsPaidPartnership] = useState(
    initialData.isPaidPartnership || false
  );

  useEffect(() => {
    onChange({
      platform: "pinterest",
      boardId,
      title,
      description,
      link,
      isPaidPartnership,
    });
  }, [boardId, title, description, link, isPaidPartnership]);

  return (
    <div className="platform-form pinterest-form">
      <h4 className="platform-form-header">
        <span className="icon" style={{ color: "#E60023" }}>
          📌
        </span>{" "}
        Pinterest Pin
      </h4>

      {boards.length === 0 ? (
        <div className="alert-box warning">
          No Boards found. Please ensure you have created boards on Pinterest.
        </div>
      ) : (
        <div className="form-group-modern">
          <label>Board</label>
          <select
            className="modern-select"
            value={boardId}
            onChange={e => setBoardId(e.target.value)}
          >
            <option value="">Select a board...</option>
            {boards.map(b => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="form-group-modern">
        <label>Pin Title</label>
        <input
          type="text"
          className="modern-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Add a catchy title"
          maxLength={100}
        />
      </div>

      <div className="form-group-modern">
        <label>Description</label>
        <textarea
          className="modern-input"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Tell everyone what your Pin is about"
          rows={3}
          maxLength={500}
        />
      </div>

      <div className="form-group-modern">
        <label>Destination Link</label>
        <div className="input-with-icon">
          <span className="input-icon">🔗</span>
          <input
            type="url"
            className="modern-input"
            value={link}
            onChange={e => setLink(e.target.value)}
            placeholder="https://your-site.com"
          />
        </div>
      </div>

      <div className="commercial-section">
        <label className="checkbox-modern">
          <input
            type="checkbox"
            checked={isPaidPartnership}
            onChange={e => setIsPaidPartnership(e.target.checked)}
          />
          <span className="checkmark"></span>
          <span className="label-text">Paid Partnership</span>
        </label>
      </div>
    </div>
  );
};

export default PinterestForm;
