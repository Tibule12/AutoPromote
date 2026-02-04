import React, { useState, useEffect } from "react";
import { auth } from "../../firebaseClient";
import "./PlatformForms.css";

const SpotifyForm = ({
  data,
  onChange,
  selectedTracks = [],
  onTrackSelect,
  onTrackRemove,
  campaignMode = false,
  isDark = false,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // Debounce search if needed, or simple button
  const handleSearch = async e => {
    if (e && e.preventDefault) e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearchError(null);
    try {
      let token = null;
      if (auth.currentUser) {
        token = await auth.currentUser.getIdToken();
      }

      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(searchQuery)}`, {
        method: "GET",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
          "Content-Type": "application/json",
        },
      });

      const json = await res.json();
      if (res.ok) {
        setSearchResults(json.tracks || []);
      } else {
        setSearchError(json.error || "Search failed");
      }
    } catch (e) {
      setSearchError(e.message);
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = track => {
    if (onTrackSelect) {
      onTrackSelect(track);
    }
    // Also update form data if needed
    if (onChange) {
      // logic to update payload
    }
  };

  return (
    <div className={`platform-form spotify-form ${isDark ? "dark-mode" : ""}`}>
      <div className="form-header">
        <i className="fab fa-spotify spotify-icon"></i>
        <h3>Spotify Integration</h3>
      </div>

      <div className="spotify-search-section">
        <label>Search for Tracks</label>
        <div className="search-bar">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by Song or Artist..."
            onKeyDown={e => e.key === "Enter" && handleSearch(e)}
          />
          <button type="button" onClick={handleSearch} disabled={searching}>
            {searching ? "..." : "Search"}
          </button>
        </div>

        {searchError && <div className="error-msg">{searchError}</div>}

        {searchResults.length > 0 && (
          <div className="search-results">
            <ul>
              {searchResults.map(track => {
                const isSelected = selectedTracks.some(t => t.id === track.id);
                return (
                  <li key={track.id} className={isSelected ? "selected" : ""}>
                    <div className="track-info">
                      <span className="track-name">{track.name}</span>
                      <span className="track-artist">{track.artist}</span>
                    </div>
                    <div className="track-meta">
                      <span className="popularity-badge" title="Popularity Score">
                        🔥 {track.popularity}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        !isSelected ? handleSelect(track) : onTrackRemove && onTrackRemove(track.id)
                      }
                      className={`select-btn ${isSelected ? "remove" : "add"}`}
                    >
                      {isSelected ? "Remove" : "Select"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="selected-tracks-summary">
        <h4>Selected Content ({selectedTracks.length})</h4>
        {selectedTracks.length === 0 ? (
          <p className="empty-state">No tracks selected. Search to add music.</p>
        ) : (
          <div className="selected-list">
            {selectedTracks.map(t => (
              <div key={t.id} className="selected-item">
                <span>
                  {t.name} - {t.artist}
                </span>
                {onTrackRemove && (
                  <button type="button" onClick={() => onTrackRemove(t.id)}>
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {campaignMode && (
        <div className="campaign-options">
          <label>
            <input
              type="checkbox"
              checked={data?.isSponsored || false}
              onChange={e => onChange("isSponsored", e.target.checked)}
            />
            Promote this track (Branded Campaign)
          </label>
        </div>
      )}
    </div>
  );
};

export default SpotifyForm;
