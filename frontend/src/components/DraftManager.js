import React, { useState, useEffect } from "react";
import "./DraftManager.css";

function DraftManager({ onLoadDraft, currentDraft }) {
  const [drafts, setDrafts] = useState([]);
  const [showDrafts, setShowDrafts] = useState(false);

  useEffect(() => {
    loadDrafts();
  }, []);

  const loadDrafts = () => {
    const saved = localStorage.getItem("contentDrafts");
    if (saved) {
      try {
        setDrafts(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load drafts:", e);
      }
    }
  };

  const saveDraft = () => {
    if (!currentDraft || !currentDraft.title) {
      alert("Please add a title before saving draft");
      return;
    }

    const draft = {
      ...currentDraft,
      id: Date.now(),
      savedAt: new Date().toISOString(),
    };

    const updated = [draft, ...drafts].slice(0, 10); // Keep max 10 drafts
    localStorage.setItem("contentDrafts", JSON.stringify(updated));
    setDrafts(updated);
    alert("Draft saved! 💾");
  };

  const loadDraft = draft => {
    onLoadDraft(draft);
    setShowDrafts(false);
  };

  const deleteDraft = id => {
    const updated = drafts.filter(d => d.id !== id);
    localStorage.setItem("contentDrafts", JSON.stringify(updated));
    setDrafts(updated);
  };

  return (
    <div className="draft-manager">
      <div className="draft-actions">
        <button onClick={saveDraft} className="save-draft-btn">
          💾 Save Draft
        </button>
        <button onClick={() => setShowDrafts(!showDrafts)} className="view-drafts-btn">
          📂 Drafts ({drafts.length})
        </button>
      </div>

      {showDrafts && drafts.length > 0 && (
        <div className="drafts-list">
          <div className="drafts-header">
            <h4>Saved Drafts</h4>
            <button onClick={() => setShowDrafts(false)} className="close-drafts">
              ✕
            </button>
          </div>
          {drafts.map(draft => (
            <div key={draft.id} className="draft-item">
              <div className="draft-info">
                <div className="draft-title">{draft.title}</div>
                <div className="draft-meta">
                  {draft.type && <span className="draft-type">{draft.type}</span>}
                  <span className="draft-date">{new Date(draft.savedAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="draft-actions-btn">
                <button onClick={() => loadDraft(draft)} className="load-draft">
                  Load
                </button>
                <button onClick={() => deleteDraft(draft.id)} className="delete-draft">
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DraftManager;
