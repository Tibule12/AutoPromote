// UnifiedPublisher.js
// The "Command Center" for cross-platform publishing.
// This container holds your existing Platform Forms (TikTokForm, YouTubeForm, etc.)
// and orchestrates the flow of data (Global Files -> Specific Platforms).

import React, { useState, useEffect } from "react";
import "./UnifiedPublisher.css";

// --- Configuration & Utils ---
import { API_ENDPOINTS } from "../../config";
import { auth } from "../../firebaseClient";

// --- Hooks ---
import { usePublishingState } from "./hooks/usePublishingState";

// --- Components ---
// We import your EXISTING components directly.
import TikTokForm from "../../components/PlatformForms/TikTokForm";
import YouTubeForm from "../../components/PlatformForms/YouTubeForm";
import InstagramForm from "../../components/PlatformForms/InstagramForm";
import FacebookForm from "../../components/PlatformForms/FacebookForm";
// ... (Add others as needed: LinkedIn, Reddit, Pinterest)

const UnifiedPublisher = () => {
  // 1. Initialize State Logic
  const {
    globalFile,
    globalTitle,
    setGlobalTitle,
    globalDescription,
    setGlobalDescription,
    bountyAmount,
    setBountyAmount,
    bountyNiche,
    setBountyNiche,
    protocol7Enabled,
    setProtocol7Enabled,
    protocol7Volatility,
    setProtocol7Volatility,
    selectedPlatforms,
    togglePlatform,
    updatePlatformData,
    getPlatformEffectiveData,
  } = usePublishingState(["tiktok", "youtube"]); // Default selection

  const [tiktokCreatorInfo, setTiktokCreatorInfo] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");

  // --- Fetch TikTok Creator Info ---
  useEffect(() => {
    let mounted = true;
    const fetchTiktokInfo = async () => {
      // Only fetch if TikTok is selected
      if (!selectedPlatforms.includes("tiktok")) return;

      try {
        const currentUser = auth?.currentUser;
        if (!currentUser) return;

        const token = await currentUser.getIdToken(true);
        const res = await fetch(API_ENDPOINTS.TIKTOK_CREATOR_INFO, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const json = await res.json();
          if (mounted && json.creator) {
            setTiktokCreatorInfo(json.creator);
          }
        }
      } catch (err) {
        console.warn("UnifiedPublisher: Failed to fetch TikTok info", err);
      }
    };
    fetchTiktokInfo();
    return () => {
      mounted = false;
    };
  }, [selectedPlatforms]);

  // 2. Handle File Upload (Global)
  const handleGlobalFileChange = e => {
    const file = e.target.files[0];
    if (file) {
      // "Handoff" file to state hook
      // In a real app, you might validate size/type here first.
      // setGlobalFile(file);
      console.log("Global file selected:", file.name);
    }
  };

  // 3. Render Helpers
  const renderPlatformForm = platformId => {
    // Get the effective data (Global + Overrides)
    const data = getPlatformEffectiveData(platformId);

    // Common props for ALL forms. These map directly to the APIs your existing forms expect.
    const commonProps = {
      // 1. Core Content
      globalTitle,
      globalDescription,
      currentFile: globalFile,
      onFileChange: newFile => updatePlatformData(platformId, { file: newFile }),

      // 2. Global Features (Bounty / Protocol 7)
      bountyAmount,
      setBountyAmount, // Note: If a form changes bounty, it affects global state
      bountyNiche,
      setBountyNiche,
      protocol7Enabled,
      setProtocol7Enabled,
      protocol7Volatility,
      setProtocol7Volatility,

      // 3. State Management
      // The form calls this when the user types something specific (overriding global)
      onChange: newData => updatePlatformData(platformId, newData),
    };

    switch (platformId) {
      case "tiktok":
        return (
          <div className="platform-card-wrapper">
            <h3>TikTok Configuration</h3>
            <TikTokForm
              {...commonProps}
              initialData={data}
              // TikTok Specifics
              creatorInfo={tiktokCreatorInfo}
            />
          </div>
        );
      case "youtube":
        return (
          <div className="platform-card-wrapper">
            <h3>YouTube Configuration</h3>
            <YouTubeForm {...commonProps} initialData={data} />
          </div>
        );
      case "instagram":
        return (
          <div className="platform-card-wrapper">
            <h3>Instagram Configuration</h3>
            <InstagramForm {...commonProps} initialData={data} />
          </div>
        );
      // Add other cases...
      default:
        return <div>Unknown Platform: {platformId}</div>;
    }
  };

  // 4. Publish Action
  const handlePublishAll = async () => {
    if (!globalFile) {
      setFeedbackMessage("Please select a file first.");
      return;
    }
    if (selectedPlatforms.length === 0) {
      setFeedbackMessage("Please select at least one platform.");
      return;
    }

    setIsPublishing(true);
    setFeedbackMessage("Preparing upload...");

    try {
      const currentUser = auth.currentUser;
      const token = await currentUser.getIdToken(true);

      // Build the unified payload
      // We upload the file as FormData if it's a real file,
      // but for this MVP let's assume we send JSON with a pre-signed URL or similar pattern.
      // However, your original form uses `onUpload` which likely handles FormData.
      // Here, we simulate the "Standard" payload structure your backend expects.

      const formData = new FormData();
      formData.append("file", globalFile);
      formData.append("title", globalTitle);
      formData.append("description", globalDescription);
      formData.append("target_platforms", JSON.stringify(selectedPlatforms));

      // Append Platform Specific Options
      // We iterate over selected platforms and grab their specific data from our state
      const platformOptionsComp = {};
      selectedPlatforms.forEach(p => {
        const data = getPlatformEffectiveData(p);
        // Map our internal state to the backend expected structure
        // This mapping depends on what `platformPoster.js` expects in `platform_options`
        platformOptionsComp[p] = {
          ...data,
        };
      });

      formData.append("platform_options", JSON.stringify(platformOptionsComp));

      // API Call
      const res = await fetch(API_ENDPOINTS.CONTENT_UPLOAD, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          // Don't set Content-Type for FormData, browser does it
        },
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Upload failed: ${res.statusText}`);
      }

      const json = await res.json();
      setFeedbackMessage(`Success! Upload ID: ${json.content.id}`);
      setIsPublishing(false);
    } catch (err) {
      console.error(err);
      setFeedbackMessage(`Error: ${err.message}`);
      setIsPublishing(false);
    }
  };

  return (
    <div className="unified-publisher-container">
      {/* --- HEADER: Global Context --- */}
      <header className="publisher-header">
        <h1>Cross-Platform Publisher</h1>
        <p>Upload once, customize everywhere.</p>
      </header>

      <div className="publisher-layout">
        {/* --- LEFT SIDE: The "Global" Input (Optional Helper) --- */}
        <aside className="global-controls">
          <div className="card global-card">
            <h2>1. Master Content</h2>
            <div className="form-group">
              <label>Master File</label>
              <input type="file" onChange={handleGlobalFileChange} />
              <small>Applying to {selectedPlatforms.length} platforms</small>
            </div>

            <div className="form-group">
              <label>Master Title</label>
              <input
                type="text"
                value={globalTitle}
                onChange={e => setGlobalTitle(e.target.value)}
                placeholder="My Awesome Video"
              />
            </div>

            <div className="form-group">
              <label>Master Description</label>
              <textarea
                value={globalDescription}
                onChange={e => setGlobalDescription(e.target.value)}
                placeholder="Check this out..."
              />
            </div>
          </div>

          <div className="card platform-selector">
            <h2>2. Select Networks</h2>
            <div className="platform-toggles">
              {["tiktok", "youtube", "instagram", "facebook"].map(p => (
                <label
                  key={p}
                  className={`toggle-btn ${selectedPlatforms.includes(p) ? "active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.includes(p)}
                    onChange={() => togglePlatform(p)}
                  />
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </label>
              ))}
            </div>
          </div>
        </aside>

        {/* --- RIGHT SIDE: The Platform Cards (Your Existing Forms) --- */}
        <main className="platform-workspace">
          <h2>3. Optimize & Publish</h2>

          {selectedPlatforms.length === 0 ? (
            <div className="empty-state">Select a platform to begin.</div>
          ) : (
            <div className="platform-stack">
              {selectedPlatforms.map(platformId => (
                <div key={platformId} className="platform-section">
                  {renderPlatformForm(platformId)}
                </div>
              ))}
            </div>
          )}

          <div className="publish-actions">
            <button
              className="btn-primary-large"
              onClick={handlePublishAll}
              disabled={isPublishing}
            >
              {isPublishing ? "Publishing..." : `Publish All (${selectedPlatforms.length})`}
            </button>
            {feedbackMessage && <p className="feedback-message">{feedbackMessage}</p>}
          </div>
        </main>
      </div>
    </div>
  );
};

export default UnifiedPublisher;
