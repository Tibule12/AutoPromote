import React, { useEffect, useState } from 'react';
import PreviewCard from './PreviewCard';
import VariantTrends from './VariantTrends';
import { auth } from '../firebaseClient';

export default function VariantAdminPanel() {
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [previewDecision, setPreviewDecision] = useState(null);
  const [previewTest, setPreviewTest] = useState(null);
  const [simulateSamples, setSimulateSamples] = useState(1000);
  const [simulateSeed, setSimulateSeed] = useState(42);
  const [simulateBudgetPct, setSimulateBudgetPct] = useState(0);
  const [serverSimulation, setServerSimulation] = useState(null);
  const [trends, setTrends] = useState(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [autopilotTestId, setAutopilotTestId] = useState('');
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [autopilotThreshold, setAutopilotThreshold] = useState(95);
  const [autopilotMinSample, setAutopilotMinSample] = useState(100);
  const [autopilotMode, setAutopilotMode] = useState('recommend');
  const [autopilotMaxBudgetChange, setAutopilotMaxBudgetChange] = useState(10);
  const [autopilotAllowBudgetIncrease, setAutopilotAllowBudgetIncrease] = useState(false);
  const [autopilotRequiresApproval, setAutopilotRequiresApproval] = useState(false);
  const [autopilotActions, setAutopilotActions] = useState([]);
  const [autopilotApprovedBy, setAutopilotApprovedBy] = useState(null);
  const [autopilotApprovedAt, setAutopilotApprovedAt] = useState(null);

  // Always use main backend URL for API calls
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://www.autopromote.org';
  async function authedFetch(path, options={}) {
    const user = auth.currentUser; if (!user) throw new Error('Not authenticated');
    const token = await user.getIdToken(true);
    const res = await fetch(`${API_BASE_URL}${path}`, {
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

  const setAutopilot = async () => {
    setMessage(null); setError(null);
    try {
      const body = { enabled: autopilotEnabled, confidenceThreshold: Number(autopilotThreshold), minSample: Number(autopilotMinSample), mode: autopilotMode, maxBudgetChangePercent: Number(autopilotMaxBudgetChange), allowBudgetIncrease: Boolean(autopilotAllowBudgetIncrease) };
      const res = await authedFetch(`/api/admin/ab_tests/${autopilotTestId}/autopilot`, { method: 'PUT', body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Failed to update autopilot settings');
      setMessage('Autopilot settings updated');
    } catch(e){ setError(e.message); }
  };

  const previewAutopilot = async () => {
    setMessage(null); setError(null);
    try {
      if (!autopilotTestId) throw new Error('Please enter a test ID');
      const res = await authedFetch(`/api/admin/ab_tests/${autopilotTestId}/autopilot/preview`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to preview autopilot');
      const data = await res.json();
      setPreviewDecision(data.decision);
      setPreviewTest(data.test || null);
      setMessage('Preview loaded');
    } catch(e) { setError(e.message); }
  };

  const simulateAutopilot = async () => {
    setMessage(null); setError(null);
    try {
      if (!autopilotTestId) throw new Error('Please enter a test ID');
      const body = { samples: Number(simulateSamples), seed: Number(simulateSeed), budgetPct: Number(simulateBudgetPct) };
      const res = await authedFetch(`/api/admin/ab_tests/${autopilotTestId}/autopilot/simulate`, { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Failed to simulate autopilot');
      const data = await res.json();
      setServerSimulation(data);
      setMessage('Simulation loaded (server-side)');
    } catch(e) { setError(e.message); }
  };

  const applyAutopilot = async () => {
    setMessage(null); setError(null);
    try {
      if (!autopilotTestId) throw new Error('Please enter a test ID');
      if (!confirm('Are you sure you want to APPLY autopilot for this test? This will auto-apply winners and update promotions.')) return;
      const res = await authedFetch(`/api/admin/ab_tests/${autopilotTestId}/autopilot/apply`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to apply autopilot');
      const data = await res.json();
      setMessage(JSON.stringify(data.result, null, 2));
    } catch(e) { setError(e.message); }
  };

  const rollbackAutopilot = async () => {
    setMessage(null); setError(null);
    try {
      if (!autopilotTestId) throw new Error('Please enter a test ID');
      if (!confirm('Are you sure you want to roll back the most recent autopilot action for this test?')) return;
      const res = await authedFetch(`/api/admin/ab_tests/${autopilotTestId}/autopilot/rollback`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to rollback autopilot');
      const data = await res.json();
      setMessage(JSON.stringify(data.result, null, 2));
    } catch(e) { setError(e.message); }
  };

  const loadAutopilot = async () => {
    setMessage(null); setError(null);
    try {
      if (!autopilotTestId) throw new Error('Please enter a test ID');
      const res = await authedFetch(`/api/admin/ab_tests/${autopilotTestId}`);
      if (!res.ok) throw new Error('Failed to fetch test');
      const data = await res.json();
      const t = data.test;
      setAutopilotEnabled(!!(t && t.autopilot && t.autopilot.enabled));
      setAutopilotThreshold((t && t.autopilot && t.autopilot.confidenceThreshold) || 95);
      setAutopilotMinSample((t && t.autopilot && t.autopilot.minSample) || 100);
      setAutopilotMode((t && t.autopilot && t.autopilot.mode) || 'recommend');
      setAutopilotMaxBudgetChange((t && t.autopilot && t.autopilot.maxBudgetChangePercent) || 10);
      setAutopilotAllowBudgetIncrease((t && t.autopilot && !!t.autopilot.allowBudgetIncrease) || false);
        setAutopilotRequiresApproval((t && t.autopilot && !!t.autopilot.requiresApproval) || false);
      setAutopilotActions((t && t.autopilotActions) || []);
      setAutopilotApprovedBy((t && t.autopilot && t.autopilot.approvedBy) || null);
      setAutopilotApprovedAt((t && t.autopilot && t.autopilot.approvedAt) || null);
      setMessage('Loaded test settings');
    } catch(e){ setError(e.message); }
  };

  const loadTrends = async () => {
    setTrendsLoading(true); setError(null); setMessage(null);
    try {
      if (!autopilotTestId) throw new Error('Please enter a test ID');
      const res = await authedFetch(`/api/admin/ab_tests/${autopilotTestId}/metrics`);
      if (!res.ok) throw new Error('Failed to fetch trends');
      const data = await res.json();
      setTrends(data);
      setMessage('Trend data loaded');
    } catch(e) { setError(e.message); }
    finally { setTrendsLoading(false); }
  };

  const approveAutopilot = async () => {
    setMessage(null); setError(null);
    try {
      if (!autopilotTestId) throw new Error('Please enter a test ID');
      const res = await authedFetch(`/api/admin/ab_tests/${autopilotTestId}/autopilot/approve`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to approve autopilot');
      setMessage('Autopilot approved');
      await loadAutopilot();
    } catch (e) { setError(e.message); }
  };

  const unapproveAutopilot = async () => {
    setMessage(null); setError(null);
    try {
      if (!autopilotTestId) throw new Error('Please enter a test ID');
      const res = await authedFetch(`/api/admin/ab_tests/${autopilotTestId}/autopilot/unapprove`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to unapprove autopilot');
      setMessage('Autopilot unapproved');
      await loadAutopilot();
    } catch (e) { setError(e.message); }
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
      <div style={{ marginBottom: 12, padding: 12, border: '1px dashed #efefef', borderRadius: 6 }}>
        <h4>Autopilot Quick Controls</h4>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder="AB Test ID" value={autopilotTestId} onChange={e=>setAutopilotTestId(e.target.value)} />
          <button onClick={loadAutopilot}>Load</button>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type='checkbox' checked={autopilotEnabled} onChange={e=>setAutopilotEnabled(e.target.checked)} /> Enable</label>
          <select value={autopilotMode} onChange={e => setAutopilotMode(e.target.value)}>
            <option value='recommend'>Recommend</option>
            <option value='auto'>Auto Apply</option>
          </select>
          <input type='number' value={autopilotThreshold} onChange={e=>setAutopilotThreshold(e.target.value)} style={{ width: 80 }} />%
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>MinSample<input type='number' value={autopilotMinSample} onChange={e=>setAutopilotMinSample(e.target.value)} style={{ width: 80 }} /></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>MaxBudgetChange%<input type='number' value={autopilotMaxBudgetChange} onChange={e => setAutopilotMaxBudgetChange(e.target.value)} style={{ width: 80 }} /></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type='checkbox' checked={autopilotAllowBudgetIncrease} onChange={e => setAutopilotAllowBudgetIncrease(e.target.checked)} /> Allow budget increase</label>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type='checkbox' checked={autopilotRequiresApproval} onChange={e => setAutopilotRequiresApproval(e.target.checked)} /> Require approval for auto-apply</label>
          <button onClick={setAutopilot}>Update</button>
          <button onClick={previewAutopilot}>Preview</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Samples <input type='number' value={simulateSamples} onChange={e => setSimulateSamples(e.target.value)} style={{ width: 90 }} /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Seed <input type='number' value={simulateSeed} onChange={e => setSimulateSeed(e.target.value)} style={{ width: 90 }} /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Budget% <input type='number' value={simulateBudgetPct} onChange={e => setSimulateBudgetPct(e.target.value)} style={{ width: 100 }} /></label>
            <button onClick={simulateAutopilot}>Simulate (server)</button>
          </div>
            <button onClick={applyAutopilot}>Apply</button>
            <button onClick={loadTrends} disabled={trendsLoading} style={{ marginLeft: 6 }}>{trendsLoading ? 'Loading...' : 'Load Trends'}</button>
          <button onClick={rollbackAutopilot}>Rollback</button>
        </div>
        {autopilotActions.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h5>Autopilot Actions</h5>
            <ul>
              {autopilotActions.map((a, i) => (
                <li key={i}>{a.triggeredAt ? new Date(a.triggeredAt.seconds ? a.triggeredAt.seconds * 1000 : a.triggeredAt).toLocaleString() : a.triggeredAt} • {a.variantId} • {a.reason} • confidence: {a.confidence || '-'}{a.attemptedBudgetChangePercent ? ` • budgetChange: ${Math.round(a.attemptedBudgetChangePercent)}%` : ''}</li>
              ))}
            </ul>
          </div>
        )}
        {previewDecision && (
          <div style={{ marginTop: 12 }}>
            <PreviewCard decision={previewDecision} test={previewTest} serverSimulation={serverSimulation} />
          </div>
        )}
        {trends && trends.timeseries && (
          <div style={{ marginTop: 12 }}>
            <VariantTrends data={trends.timeseries} variants={trends.variants} actions={trends.actions} metric="views" />
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <strong>Approval Status:</strong> {autopilotApprovedBy ? `Approved by ${autopilotApprovedBy} at ${autopilotApprovedAt ? new Date(autopilotApprovedAt.seconds ? autopilotApprovedAt.seconds * 1000 : autopilotApprovedAt).toLocaleString() : autopilotApprovedAt}` : 'Not approved'}
          <div style={{ marginTop: 8 }}>
            {!autopilotApprovedBy && <button onClick={approveAutopilot} style={{ marginRight: 8 }}>Approve</button>}
            {autopilotApprovedBy && <button onClick={unapproveAutopilot}>Revoke Approval</button>}
          </div>
        </div>
      </div>
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
