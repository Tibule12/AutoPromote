import React, { useState } from "react";
import { API_ENDPOINTS } from "../config";

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
    <div className="spotify-search">
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search Spotify Tracks"
          style={{ padding: ".4rem", borderRadius: 8, flex: 1 }}
        />
        <button className="check-quality" onClick={doSearch} disabled={loading || !query}>
          Search
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        {loading ? (
          <div>Searching...</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {results.map(r => (
              <li
                key={r.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: ".25rem 0",
                  borderBottom: "1px dashed rgba(0,0,0,0.05)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {Array.isArray(r.artists) ? r.artists.join(", ") : ""}
                  </div>
                </div>
                <div>
                  <button className="check-quality" onClick={() => addTrack(r)}>
                    Add
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div style={{ marginTop: 8 }}>
        <strong>Selected Tracks</strong>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {selectedTracks.map(st => (
            <li
              key={st.uri}
              style={{ display: "flex", justifyContent: "space-between", padding: ".25rem 0" }}
            >
              <div>
                {st.name}{" "}
                <span style={{ fontSize: 12, color: "#666" }}>
                  by {Array.isArray(st.artists) ? st.artists.join(", ") : ""}
                </span>
              </div>
              <div>
                <button className="logout-btn" onClick={() => removeTrack(st.uri)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default SpotifyTrackSearch;
