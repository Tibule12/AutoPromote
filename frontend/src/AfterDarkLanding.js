import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from './config';
import { auth } from './firebaseClient';

export default function AfterDarkLanding() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cur = auth.currentUser;
        const token = cur ? await cur.getIdToken(true) : null;
        const res = await fetch(`${API_BASE_URL}/afterdark?limit=50`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error('Failed to load shows');
        const j = await res.json();
        if (!cancelled) setShows(Array.isArray(j.shows) ? j.shows : []);
      } catch (e) {
        console.warn('AfterDark load failed', e && e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => (cancelled = true);
  }, []);

  if (loading) return <div>Loading AfterDark shows…</div>;
  return (
    <div className="afterdark-landing">
      <h2>AfterDark</h2>
      <p>This area contains adult content and is only visible to verified users.</p>
      <ul>
        {shows.map(s => (
          <li key={s.id}>
            <strong>{s.title}</strong> — {s.description || 'No description'}
          </li>
        ))}
      </ul>
      {shows.length === 0 && <div>No shows found.</div>}
    </div>
  );
}
