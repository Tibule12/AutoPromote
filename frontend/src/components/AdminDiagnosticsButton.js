import React, { useState } from 'react';
import { parseJsonSafe } from '../utils/parseJsonSafe';
import { API_BASE_URL } from '../config';
import { auth } from '../firebaseClient';
import './AdminDiagnosticsButton.css';

export default function AdminDiagnosticsButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [envData, setEnvData] = useState(null);
  const [error, setError] = useState(null);

  const handleOpen = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/diagnostics/env`, { headers: { Authorization: token ? `Bearer ${token}` : '' } });
      const parsed = await parseJsonSafe(res);
      if (parsed.ok && parsed.json) {
        setEnvData(parsed.json);
      } else {
        setError(`Status ${parsed.status} ${parsed.textPreview || parsed.error || ''}`);
      }
    } catch (e) {
      setError(e.message || 'Failed to fetch env');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'inline-block', marginLeft: 8 }}>
      <button onClick={() => { if (!open) handleOpen(); else setOpen(false); }} className="admin-diag-btn">
        {open ? 'Close Diagnostics' : 'Run Diagnostics'}
      </button>

      {open && (
        <div className="admin-diag-panel">
          <div style={{ padding: 8 }}>
            <strong>Diagnostics Env Presence</strong>
            {loading && <div>Loading...</div>}
            {error && <div style={{ color: 'red' }}>{error}</div>}
            {envData && (
              <div style={{ marginTop: 8 }}>
                <pre style={{ maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(envData, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
