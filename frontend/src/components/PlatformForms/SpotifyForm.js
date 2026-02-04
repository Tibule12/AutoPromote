import React, { useState, useEffect, useRef } from "react";
import { API_ENDPOINTS } from "../../config";
import { auth } from "../../firebaseClient";
import "../spotify-card.css";
import MiniPlayer from "../MiniPlayer";

const SpotifyForm = ({
  data,
  onChange,
  selectedTracks = [],
  onTrackSelect,
  onTrackRemove,
  campaignMode = false,
  isDark = false,
}) => {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [errorMessage, setErrorMessage] = useState(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef(null);
  const [previewTrack, setPreviewTrack] = React.useState(null);
  const [liveMessage, setLiveMessage] = React.useState("");
  const [connected, setConnected] = useState(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.trim().length < 1) {
      setResults([]);
      setHighlightedIndex(-1);
      return;
    }
    doSearch(debouncedQuery);
  }, [debouncedQuery]);

  const doSearch = async (q = query) => {
    if (!q || q.trim().length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      let token = null;
      if (auth.currentUser) {
        token = await auth.currentUser.getIdToken();
      }

      // Use API_ENDPOINTS if available, otherwise fallback
      const endpoint = API_ENDPOINTS?.SPOTIFY_SEARCH || "/api/spotify/search";

      const r = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const data = await r.json();
      if (r.ok && data && data.results) {
        setResults(data.results);
        setHighlightedIndex(-1);
        setErrorMessage(null);
      } else {
        setResults([]);
        setHighlightedIndex(-1);
        setErrorMessage(data && data.error ? data.error : "spotify_search_failed");
      }
    } catch (e) {
      console.error("Spotify search error", e);
      setResults([]);
      setHighlightedIndex(-1);
      setErrorMessage("network_error");
    } finally {
      setLoading(false);
    }
  };

  const addTrack = t => {
    const uri = t.uri || t.id;
    if (!uri) return;
    // Check if already selected by looking at ID or URI
    if (selectedTracks.find(st => (st.uri || st.id) === uri)) return;

    // Normalize track object
    const trackObj = {
      uri,
      id: t.id,
      name: t.name,
      artists: t.artists,
      preview_url: t.preview_url,
      popularity: t.popularity,
    };

    if (onTrackSelect) {
      onTrackSelect(trackObj);
    }
    setLiveMessage(`${t.name} added to selection`);
  };

  const removeTrack = (uri, id) => {
    // Try to match by ID or URI
    const trackId = id || uri;
    if (onTrackRemove) {
      onTrackRemove(trackId);
    }
    setLiveMessage(`Removed track`);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const endpoint = API_ENDPOINTS?.SPOTIFY_STATUS || "/api/spotify/status";
        // Also add auth if needed for status
        let token = null;
        if (auth.currentUser) token = await auth.currentUser.getIdToken();

        const r = await fetch(endpoint, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const d = await r.json().catch(() => null);
        if (!mounted) return;
        setConnected(Boolean(r.ok && d && (d.connected || d.status === "connected")));
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className={`platform-form spotify-form ${isDark ? "dark-mode" : ""}`}>
      <h4 className="platform-form-header">
        <span className="icon" style={{ color: "#1DB954" }}>
          <i className="fab fa-spotify"></i>
        </span>{" "}
        Spotify Integration
      </h4>

      <div
        className="spotify-card"
        aria-label="Spotify card"
        style={{ border: "none", boxShadow: "none", padding: 0 }}
      >
        <div className="card-header">
          <div className="small-muted">
            {connected === null
              ? "Checking..."
              : connected
                ? "Connected to Spotify"
                : "Not connected to Spotify"}{" "}
            {connected === false && (
              <button
                className="btn"
                style={{ marginLeft: 8 }}
                onClick={() =>
                  window.open(API_ENDPOINTS?.SPOTIFY_AUTH_START || "/auth/spotify", "_blank")
                }
              >
                Connect
              </button>
            )}
          </div>
        </div>

        <div className="search-row">
          <input
            ref={inputRef}
            className="search-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (results.length === 0) return;
                setHighlightedIndex(prev => (prev < results.length - 1 ? prev + 1 : 0));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (results.length === 0) return;
                setHighlightedIndex(prev => (prev > 0 ? prev - 1 : results.length - 1));
              } else if (e.key === "Enter") {
                if (highlightedIndex >= 0 && results[highlightedIndex]) {
                  e.preventDefault();
                  addTrack(results[highlightedIndex]);
                }
              } else if (e.key === "Escape") {
                setHighlightedIndex(-1);
                setResults([]);
              }
            }}
            placeholder="Search by Song or Artist..."
            aria-label="Search Spotify tracks"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="spotify-search-results"
            aria-activedescendant={
              highlightedIndex >= 0 && results[highlightedIndex]
                ? `spotify-result-${results[highlightedIndex].id}`
                : undefined
            }
            aria-expanded={results.length > 0}
          />
          <button
            className="btn btn-primary"
            onClick={() => doSearch()}
            disabled={loading || !query}
          >
            {loading ? "..." : "Search"}
          </button>
        </div>

        {errorMessage === "spotify_not_connected" && (
          <div
            className="small-muted"
            style={{ padding: 8, display: "flex", gap: 8, alignItems: "center", color: "red" }}
          >
            <div>
              Spotify not connected.{" "}
              <button
                className="btn btn-secondary"
                onClick={() =>
                  window.open(API_ENDPOINTS?.SPOTIFY_AUTH_START || "/auth/spotify", "_blank")
                }
              >
                Connect Spotify
              </button>
            </div>
          </div>
        )}

        {errorMessage && errorMessage !== "spotify_not_connected" && (
          <div className="small-muted" style={{ padding: 8, color: "red" }}>
            Error: {errorMessage}
          </div>
        )}

        <div
          className="results-list"
          id="spotify-search-results"
          role="listbox"
          aria-label="Spotify search results"
          style={{ maxHeight: "250px", overflowY: "auto" }}
        >
          {results.map((r, idx) => (
            <div
              key={r.id}
              id={`spotify-result-${r.id}`}
              className={`result-item ${highlightedIndex === idx ? "highlighted" : ""}`}
              role="option"
              aria-label={`${r.name} by ${Array.isArray(r.artists) ? r.artists.join(", ") : ""}`}
              aria-selected={highlightedIndex === idx}
              onMouseEnter={() => setHighlightedIndex(idx)}
              onClick={() => addTrack(r)}
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTrack(r);
                } else if (e.key === " ") {
                  e.preventDefault();
                  setPreviewTrack(r);
                  setLiveMessage(`Previewing ${r.name}`);
                }
              }}
            >
              <div className="result-img">
                <span style={{ fontSize: "20px" }}>🎵</span>
              </div>
              <div className="result-meta">
                <div className="title">{r.name}</div>
                <div className="sub">
                  {Array.isArray(r.artists) ? r.artists.join(", ") : r.artist}
                </div>
              </div>
              <div>
                <button
                  className="btn btn-secondary"
                  onClick={e => {
                    e.stopPropagation();
                    addTrack(r);
                  }}
                  aria-label={`Add ${r.name} to selected tracks`}
                >
                  Add
                </button>
                {r.preview_url && (
                  <button
                    className="btn"
                    style={{ marginLeft: 8 }}
                    onClick={e => {
                      e.stopPropagation();
                      setPreviewTrack(r);
                      setLiveMessage(`Previewing ${r.name}`);
                    }}
                    aria-label={`Preview ${r.name}`}
                  >
                    ▶
                  </button>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="small-muted" style={{ padding: 8 }}>
              Searching...
            </div>
          )}
          {!loading && results.length === 0 && query && debouncedQuery && (
            <div className="small-muted" style={{ padding: 8 }}>
              No results found.
            </div>
          )}
        </div>

        {selectedTracks.length > 0 && (
          <div className="selected-tracks-container" style={{ marginTop: "15px" }}>
            <h5 style={{ fontSize: "14px", marginBottom: "8px" }}>Selected Tracks</h5>
            <div className="selected-tracks" aria-live="polite">
              {selectedTracks.map(st => (
                <div key={st.id || st.uri} className="track-chip">
                  <div style={{ fontWeight: 600 }}>{st.name}</div>
                  <div style={{ fontSize: 12, color: "#9fcfb9" }}>
                    {Array.isArray(st.artists) ? st.artists.join(", ") : st.artist || ""}
                  </div>
                  <button
                    className="remove"
                    onClick={() => removeTrack(st.uri, st.id)}
                    aria-label={`Remove ${st.name}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {campaignMode && (
          <div className="campaign-options" style={{ marginTop: "15px" }}>
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

        <div
          className="sr-only"
          aria-live="polite"
          aria-atomic="true"
          style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}
        >
          {liveMessage}
        </div>

        {previewTrack && <MiniPlayer track={previewTrack} onClose={() => setPreviewTrack(null)} />}
      </div>
    </div>
  );
};

export default SpotifyForm;
