import React, { useState } from 'react';
import { auth } from './firebaseClient';

function AdminAuditViewer() {
  const [assistantActions, setAssistantActions] = useState([]);
  const [tiktokChecks, setTiktokChecks] = useState([]);
  const [error, setError] = useState(null);
  const [limit, setLimit] = useState(50);

  const withAuthHeaders = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Not signed in');
    const token = await currentUser.getIdToken(true);
    return { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' };
  };

  const loadAssistant = async () => {
    setError(null);
    try {
      const headers = await withAuthHeaders();
      const res = await fetch(`/api/tiktok/admin/assistant_actions?limit=${encodeURIComponent(limit)}`, { headers });
      if (!res.ok) throw new Error('Failed to load assistant actions');
      const j = await res.json();
      setAssistantActions(j.items || []);
    } catch (e) { setError(e.message); }
  };

  const loadTiktokChecks = async () => {
    setError(null);
    try {
      const headers = await withAuthHeaders();
      const res = await fetch(`/api/tiktok/admin/tiktok_checks?limit=${encodeURIComponent(limit)}`, { headers });
      if (!res.ok) throw new Error('Failed to load tiktok checks');
      const j = await res.json();
      setTiktokChecks(j.items || []);
    } catch (e) { setError(e.message); }
  };

  return (
    <section style={{padding:16}}>
      <h3>Admin Audit Viewer</h3>
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12}}>
        <label style={{fontSize:13}}>Limit</label>
        <input type="number" value={limit} onChange={e=>setLimit(Math.max(1, Math.min(200, parseInt(e.target.value||'50',10)||50)))} style={{width:80}} />
        <button onClick={() => { loadAssistant(); loadTiktokChecks(); }}>Refresh</button>
        <button onClick={async ()=>{ await loadAssistant(); }}>Load Assistant Actions</button>
        <button onClick={async ()=>{ await loadTiktokChecks(); }}>Load TikTok Checks</button>
      </div>
      {error && <div style={{color:'crimson', marginBottom:8}}>{error}</div>}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr', gap:12}}>
        <div style={{background:'#0f1724',padding:12,borderRadius:8}}>
          <h4 style={{marginTop:0}}>Assistant Actions ({assistantActions.length})</h4>
          <div style={{maxHeight:400,overflow:'auto'}}>
            {assistantActions.map(a => (
              <div key={a.id} style={{padding:8,borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                <div style={{fontSize:12,color:'#9aa4b2'}}>{new Date((a.createdAt && a.createdAt._seconds ? a.createdAt._seconds*1000 : Date.now())).toLocaleString()}</div>
                <div><strong>{a.uid || 'unknown'}</strong> — {a.provider} / {a.provider_status}</div>
                <div style={{fontSize:13,color:'#cbd5e1'}}>{a.intent || ''}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{background:'#0f1724',padding:12,borderRadius:8}}>
          <h4 style={{marginTop:0}}>TikTok Creator Info Checks ({tiktokChecks.length})</h4>
          <div style={{maxHeight:400,overflow:'auto'}}>
            {tiktokChecks.map(t => (
              <div key={t.id} style={{padding:8,borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                <div style={{fontSize:12,color:'#9aa4b2'}}>{new Date((t.createdAt && t.createdAt._seconds ? t.createdAt._seconds*1000 : Date.now())).toLocaleString()}</div>
                <div><strong>{t.uid || 'unknown'}</strong> — demo: {t.demo ? 'yes' : 'no'}</div>
                <div style={{fontSize:13,color:'#cbd5e1'}}>Result: {t.result && t.result.creator ? JSON.stringify(t.result.creator) : JSON.stringify(t.result)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default AdminAuditViewer;
