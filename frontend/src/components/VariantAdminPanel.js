import React, { useEffect, useState } from 'react';
import { auth } from '../firebaseClient';

export default function VariantAdminPanel() {
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  async function authedFetch(path, options={}) {
    const user = auth.currentUser; if (!user) throw new Error('Not authenticated');
    const token = await user.getIdToken(true);
    const res = await fetch(`${process.env.REACT_APP_API_BASE || ''}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers||{})
      }
    });
    return res;
  }

  const loadAnomalies = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authedFetch('/api/admin/variants/anomalies');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAnomalies(data.anomalies || []);
    } catch(e){ setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ loadAnomalies(); },[]);

  const clearAnomaly = async (a) => {
    try {
      const res = await authedFetch('/api/admin/variants/clear-anomaly', { method: 'POST', body: JSON.stringify({ contentId: a.contentId, platform: a.platform, variant: a.variant }) });
      if (!res.ok) throw new Error('Failed');
      setMessage('Anomaly cleared');
      await loadAnomalies();
    } catch(e){ setError(e.message); }
  };

  const unsuppress = async (a) => {
    try {
      const res = await authedFetch('/api/admin/variants/unsuppress', { method: 'POST', body: JSON.stringify({ contentId: a.contentId, platform: a.platform, variant: a.variant }) });
      if (!res.ok) throw new Error('Failed');
      setMessage('Variant unsuppressed');
      await loadAnomalies();
    } catch(e){ setError(e.message); }
  };

  const toggleQuarantine = async (a, make=true) => {
    try {
      const path = make ? '/api/admin/variants/quarantine' : '/api/admin/variants/unquarantine';
      const res = await authedFetch(path, { method: 'POST', body: JSON.stringify({ contentId: a.contentId, platform: a.platform, variant: a.variant }) });
      if (!res.ok) throw new Error('Failed');
      setMessage(make ? 'Variant quarantined' : 'Variant unquarantined');
      await loadAnomalies();
    } catch(e){ setError(e.message); }
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: 16, borderRadius: 8, marginTop: 24 }}>
      <h3>Variant Anomalies</h3>
      {loading && <div>Loading anomalies...</div>}
      {error && <div style={{color:'red'}}>Error: {error}</div>}
      {message && <div style={{color:'green'}}>{message}</div>}
      <button onClick={loadAnomalies} disabled={loading}>Refresh</button>
  <table style={{ width: '100%', marginTop: 12, fontSize: 14 }}>
        <thead>
          <tr>
            <th>Content</th><th>Platform</th><th>Variant</th><th>Posts</th><th>Clicks</th><th>Decayed CTR</th><th>Suppressed</th><th>Quarantined</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {anomalies.map(a => (
            <tr key={`${a.contentId}:${a.platform}:${a.variant}`} style={{ background: a.quarantined ? '#fff4e5' : a.suppressed ? '#ffeaea' : undefined }}>
              <td>{a.contentId}</td>
              <td>{a.platform}</td>
              <td>{a.variant}</td>
              <td>{a.posts}</td>
              <td>{a.clicks}</td>
              <td>{a.decayedCtr != null ? a.decayedCtr.toFixed(3) : '-'}</td>
              <td>{a.suppressed ? 'Yes' : 'No'}</td>
              <td>{a.quarantined ? 'Yes' : 'No'}</td>
              <td>
                <button onClick={()=>clearAnomaly(a)} style={{marginRight:8}}>Clear</button>
                {a.suppressed && <button onClick={()=>unsuppress(a)} style={{marginRight:8}}>Unsuppress</button>}
                {a.quarantined && <button onClick={()=>toggleQuarantine(a,false)} style={{marginRight:8}}>Unquarantine</button>}
                {!a.quarantined && <button onClick={()=>toggleQuarantine(a,true)}>Quarantine</button>}
              </td>
            </tr>
          ))}
          {!loading && anomalies.length === 0 && <tr><td colSpan={9}>No anomalies</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
