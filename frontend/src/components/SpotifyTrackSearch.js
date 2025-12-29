import React, { useState } from "react";
import { API_ENDPOINTS } from "../config";
import "./spotify-card.css";

function SpotifyTrackSearch({ selectedTracks = [], onChangeTracks }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);

  const doSearch = async () => {
    if (!query || query.trim().length < 1) return;
    setLoading(true);
    try {
      const r = await fetch(`${API_ENDPOINTS.SPOTIFY_SEARCH}?q=${encodeURIComponent(query)}`);
      const data = await r.json();
      if (r.ok && data && data.results) setResults(data.results);
      else setResults([]);
    } catch (e) {
      console.error("Spotify search error", e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const addTrack = t => {
    const uri = t.uri || t.id || t.uri;
    if (!uri) return;
    if (selectedTracks.find(st => st.uri === uri)) return;
    const newList = [...selectedTracks, { uri, id: t.id, name: t.name, artists: t.artists }];
    onChangeTracks && onChangeTracks(newList);
  };
  const removeTrack = uri => {
    const newList = selectedTracks.filter(st => st.uri !== uri);
    onChangeTracks && onChangeTracks(newList);
  };

  return (
    <div className="spotify-card" aria-label="Spotify card">
      <div className="card-header">
        <div className="spotify-badge">
          <svg viewBox="0 0 168 168" aria-hidden="true">
            <path d="M84 0a84 84 0 1084 84A84.1 84.1 0 0084 0zm38.2 121.4a5.6 5.6 0 01-7.6 2c-20.8-12.7-47-15.7-77-8a5.6 5.6 0 012.7-11c30-7.6 58  -4.5 79.8 8.7a5.6 5.6 0 012.1 8.3zM122 96a6 6 0 01-8.2 2.1c-18.6-11.6-42-14.4-66.8-7a6 6 0 01-3.8-11.4c27.6-9 54.8-6 75 7.7a6 6 0 012.9 8.6zM128 74a7 7 0 01-9.4 2.6c-15.2-9.4-34.4-11.7-54.4-5.6a7 7 0 01-4.9-13.1c22-8.2 43.8-5.5 61.2 6.4A7 7 0 01128 74z" />
          </svg>
          <span>Spotify</span>
        </div>
        <div className="small-muted">Connected</div>
      </div>

      <div className="actions">
        <div style={{ flex: 1 }}>
          <label className="small-muted">Add tracks or choose playlist</label>
        </div>
        <button className="btn btn-secondary" type="button">
          Choose existing
        </button>
        <button className="btn btn-primary" type="button">
          Create playlist
        </button>
      </div>

      <div className="search-row">
        <input
          className="search-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search Spotify tracks"
          aria-label="Search Spotify tracks"
          aria-controls="spotify-search-results"
        />
        <button className="btn btn-primary" onClick={doSearch} disabled={loading || !query}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      <div
        className="results-list"
        id="spotify-search-results"
        role="listbox"
        aria-label="Spotify search results"
      >
        {results.map(r => (
          <div key={r.id} className="result-item" role="option" aria-selected={false} tabIndex={0}>
            <div className="result-art" aria-hidden="true" />
            <div className="result-meta">
              <div className="title">{r.name}</div>
              <div className="sub">{Array.isArray(r.artists) ? r.artists.join(", ") : ""}</div>
            </div>
            <div>
              <button
                className="btn btn-secondary"
                onClick={() => addTrack(r)}
                aria-label={`Add ${r.name} to selected tracks`}
              >
                Add
              </button>
            </div>
          </div>
        ))}

        {loading && (
          <div className="small-muted" style={{ padding: 8 }}>
            Searching...
          </div>
        )}
        {!loading && results.length === 0 && (
          <div className="small-muted" style={{ padding: 8 }}>
            No results
          </div>
        )}
      </div>

      <div className="selected-tracks" aria-live="polite">
        {selectedTracks.map(st => (
          <div key={st.uri} className="track-chip">
            <div style={{ fontWeight: 600 }}>{st.name}</div>
            <div style={{ fontSize: 12, color: "#9fcfb9" }}>
              {Array.isArray(st.artists) ? st.artists.join(", ") : ""}
            </div>
            <button
              className="remove"
              onClick={() => removeTrack(st.uri)}
              aria-label={`Remove ${st.name}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SpotifyTrackSearch;
