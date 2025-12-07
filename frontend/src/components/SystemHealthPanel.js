import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { auth } from '../firebaseClient';

function SystemHealthPanel() {
  const [health, setHealth] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [errors, setErrors] = useState([]);
  const [apiMetrics, setApiMetrics] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [history, setHistory] = useState([]);
  const [scanResults, setScanResults] = useState(null);

  useEffect(() => {
    fetchAllData();
    
    if (autoRefresh) {
      const interval = setInterval(fetchAllData, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const fetchAllData = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      
      const [healthRes, diagnosticsRes, errorsRes, metricsRes, activityRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/system/health`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE_URL}/api/diagnostics/health`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE_URL}/api/admin/system/errors?limit=20`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE_URL}/api/admin/system/api-metrics?timeframe=24h`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE_URL}/api/admin/system/activity?limit=20`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const [healthData, diagnosticsData, errorsData, metricsData, activityData] = await Promise.all([
        healthRes.json(),
        diagnosticsRes.json(),
        errorsRes.json(),
        metricsRes.json(),
        activityRes.json()
      ]);

      if (healthData.success) setHealth(healthData.health);
      setIsAdmin(healthRes.status === 200);
      setDiagnostics(diagnosticsData);
      if (errorsData.success) setErrors(errorsData.errors);
      if (metricsData.success) setApiMetrics(metricsData.metrics);
      if (activityData.success) setActivities(activityData.activities);
      
      setLoading(false);
      // Run integration scan: attempt admin-level scan and fallback to user-level
      try {
        const attemptAdmin = await fetch(`${API_BASE_URL}/api/diagnostics/scan?dashboard=admin`, { headers: { Authorization: `Bearer ${token}` } });
        let scanResp = attemptAdmin;
        if (attemptAdmin.status === 403) {
          scanResp = await fetch(`${API_BASE_URL}/api/diagnostics/scan?dashboard=user`, { headers: { Authorization: `Bearer ${token}` } });
        }
          const scanData = await scanResp.json();
          setScanResults(scanData.results);
          // if we fetched admin/system health earlier and got 200, set isAdmin
          if (healthRes && healthRes.status === 200) setIsAdmin(true);
      } catch (e) {
        console.error('Scan failed:', e);
      }
    } catch (error) {
      console.error('Error fetching system data:', error);
      setLoading(false);
    }
  };

  // runAndStoreScan is defined later with better handling.

  const fetchHistory = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/diagnostics/scans`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 403) return; const d = await res.json(); if (d.scans) setHistory(d.scans);
    } catch (e) { console.error('Fetch scan history failed', e); }
  };

  const runAndStoreScan = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const resp = await fetch(`${API_BASE_URL}/api/diagnostics/scan?dashboard=admin&store=1`, { headers: { Authorization: `Bearer ${token}` } });
      if (resp.status === 200) {
        const data = await resp.json();
        setScanResults(data.results);
      } else {
        console.error('Failed to store scan', resp.status);
      }
    } catch (e) { console.error('Store scan failed', e); }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading system health...</div>;
  }

  return (
    <div style={{ marginTop: 24 }}>
      {/* Auto-refresh Toggle */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          <span>Auto-refresh (10s)</span>
        </label>
        <button onClick={fetchAllData} style={refreshButtonStyle}>
          🔄 Refresh Now
        </button>
        {isAdmin && (
          <>
            <button onClick={runAndStoreScan} style={{ ...refreshButtonStyle, backgroundColor: '#2e7d32', marginLeft: 8 }}>
              💾 Run & Save Scan
            </button>
            <button onClick={fetchHistory} style={{ ...refreshButtonStyle, backgroundColor: '#1976d2', marginLeft: 8 }}>
              🕘 Fetch Scan History
            </button>
          </>
        )}
      </div>

      {/* System Health */}
      {health && (
        <div style={containerStyle}>
          <h3>System Health</h3>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div style={metricBoxStyle}>
              <div style={metricLabelStyle}>Status</div>
              <div style={{ ...metricValueStyle, color: '#2e7d32' }}>
                {health.status === 'healthy' ? '✅ Healthy' : '⚠️ Issues'}
              </div>
            </div>
            <div style={metricBoxStyle}>
              <div style={metricLabelStyle}>Uptime</div>
              <div style={metricValueStyle}>
                {Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m
              </div>
            </div>
            <div style={metricBoxStyle}>
              <div style={metricLabelStyle}>Memory Usage</div>
              <div style={metricValueStyle}>
                {health.memory.percentage.toFixed(1)}%
              </div>
              <div style={metricSubtextStyle}>
                {health.memory.used.toFixed(0)} MB / {health.memory.total.toFixed(0)} MB
              </div>
            </div>
            <div style={metricBoxStyle}>
              <div style={metricLabelStyle}>CPU Cores</div>
              <div style={metricValueStyle}>{health.cpu.cores}</div>
            </div>
            <div style={metricBoxStyle}>
              <div style={metricLabelStyle}>System Memory</div>
              <div style={metricValueStyle}>
                {health.system.freeMemory.toFixed(1)} GB free
              </div>
              <div style={metricSubtextStyle}>
                of {health.system.totalMemory.toFixed(1)} GB
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive System Diagnostics */}
      {diagnostics && (
        <div style={{ ...containerStyle, marginTop: 20 }}>
          <h3>Platform Diagnostics</h3>
          <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={metricBoxStyle}>
              <div style={metricLabelStyle}>Overall Status</div>
              <div style={{ 
                ...metricValueStyle, 
                color: diagnostics.overall_status === 'healthy' ? '#2e7d32' : 
                       diagnostics.overall_status === 'warning' ? '#ed6c02' : '#d32f2f' 
              }}>
                {diagnostics.overall_status === 'healthy' ? '✅' : 
                 diagnostics.overall_status === 'warning' ? '⚠️' : '❌'} {diagnostics.overall_status.toUpperCase()}
              </div>
            </div>
            <div style={metricBoxStyle}>
              <div style={metricLabelStyle}>Checks Passed</div>
              <div style={{ ...metricValueStyle, color: '#2e7d32' }}>
                {diagnostics.summary.passed} / {diagnostics.summary.total_checks}
              </div>
            </div>
            <div style={metricBoxStyle}>
              <div style={metricLabelStyle}>Warnings</div>
              <div style={{ ...metricValueStyle, color: '#ed6c02' }}>
                {diagnostics.summary.warnings}
              </div>
            </div>
            <div style={metricBoxStyle}>
              <div style={metricLabelStyle}>Errors</div>
              <div style={{ ...metricValueStyle, color: '#d32f2f' }}>
                {diagnostics.summary.errors}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            {Object.entries(diagnostics.checks).map(([key, check]) => {
              const isExpanded = expandedSections[key];
              const statusIcon = check.status === 'passed' ? '✅' : 
                                check.status === 'warning' ? '⚠️' : '❌';
              const statusColor = check.status === 'passed' ? '#2e7d32' : 
                                 check.status === 'warning' ? '#ed6c02' : '#d32f2f';

              return (
                <div key={key} style={{ 
                  ...errorCardStyle, 
                  borderLeft: `4px solid ${statusColor}`,
                  marginBottom: 10 
                }}>
                  <div 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}
                    onClick={() => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '1.2rem' }}>{statusIcon}</span>
                      <strong>{key.replace(/_/g, ' ').toUpperCase()}</strong>
                    </div>
                    <span style={{ fontSize: '1.2rem' }}>{isExpanded ? '▼' : '▶'}</span>
                  </div>
                  
                  {isExpanded && (
                    <div style={{ marginTop: 15 }}>
                      <p style={{ marginBottom: 10 }}>{check.message}</p>
                      
                      {check.issues && check.issues.length > 0 && (
                        <div style={{ marginTop: 10, padding: 10, backgroundColor: '#ffebee', borderRadius: 4 }}>
                          <strong style={{ color: '#d32f2f' }}>Issues:</strong>
                          <ul style={{ marginTop: 5, marginLeft: 20 }}>
                            {check.issues.map((issue, idx) => (
                              <li key={idx} style={{ color: '#d32f2f', marginTop: 5 }}>{issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {check.warnings && check.warnings.length > 0 && (
                        <div style={{ marginTop: 10, padding: 10, backgroundColor: '#fff3e0', borderRadius: 4 }}>
                          <strong style={{ color: '#ed6c02' }}>Warnings:</strong>
                          <ul style={{ marginTop: 5, marginLeft: 20 }}>
                            {check.warnings.map((warning, idx) => (
                              <li key={idx} style={{ color: '#ed6c02', marginTop: 5 }}>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {key === 'platform_credentials' && check.platforms && (
                        <div style={{ marginTop: 15 }}>
                          <strong>Platform Status:</strong>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
                            {Object.entries(check.platforms).map(([platform, data]) => (
                              <div key={platform} style={{
                                padding: 10,
                                backgroundColor: data.configured ? '#e8f5e9' : '#ffebee',
                                borderRadius: 4,
                                border: `1px solid ${data.configured ? '#2e7d32' : '#d32f2f'}`
                              }}>
                                <div style={{ fontWeight: 'bold', marginBottom: 5 }}>
                                  {platform.toUpperCase()}
                                </div>
                                <div style={{ color: data.configured ? '#2e7d32' : '#d32f2f' }}>
                                  {data.configured ? '✓ Configured' : '✗ Not Configured'}
                                </div>
                                {!data.configured && data.missing_variables && (
                                  <div style={{ fontSize: '0.85rem', marginTop: 5, color: '#666' }}>
                                    Missing: {data.missing_variables.join(', ')}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {key === 'database_collections' && check.collections && (
                        <div style={{ marginTop: 15 }}>
                          <strong>Database Collections:</strong>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginTop: 10 }}>
                            {Object.entries(check.collections).map(([collection, status]) => (
                              <div key={collection} style={{
                                padding: 8,
                                backgroundColor: status === 'accessible' ? '#e8f5e9' : '#ffebee',
                                borderRadius: 4,
                                textAlign: 'center'
                              }}>
                                <div style={{ fontSize: '0.9rem' }}>{collection}</div>
                                <div style={{ 
                                  fontSize: '0.85rem', 
                                  color: status === 'accessible' ? '#2e7d32' : '#d32f2f',
                                  marginTop: 3
                                }}>
                                  {status}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {key === 'ai_services' && check.services && (
                        <div style={{ marginTop: 15 }}>
                          <strong>AI Services:</strong>
                          <div style={{ marginTop: 10 }}>
                            {Object.entries(check.services).map(([service, enabled]) => (
                              <div key={service} style={{
                                padding: 8,
                                marginBottom: 5,
                                backgroundColor: enabled ? '#e8f5e9' : '#f5f5f5',
                                borderRadius: 4,
                                display: 'flex',
                                justifyContent: 'space-between'
                              }}>
                                <span>{service.replace(/_/g, ' ')}</span>
                                <span style={{ color: enabled ? '#2e7d32' : '#999' }}>
                                  {enabled ? '✓ Enabled' : '✗ Disabled'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {check.details && (
                        <div style={{ marginTop: 15 }}>
                          <details>
                            <summary style={{ cursor: 'pointer', color: '#1976d2', fontWeight: '500' }}>
                              View Details
                            </summary>
                            <pre style={{
                              marginTop: 10,
                              padding: 10,
                              backgroundColor: '#f5f5f5',
                              borderRadius: 4,
                              overflow: 'auto',
                              fontSize: '0.85rem'
                            }}>
                              {JSON.stringify(check.details, null, 2)}
                            </pre>
                          </details>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* API Metrics */}
      {apiMetrics && (
        <div style={{ ...containerStyle, marginTop: 20 }}>
          <h3>API Performance (Last 24h)</h3>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
            <div style={metricBoxStyle}>
              <div style={metricLabelStyle}>Total Requests</div>
              <div style={metricValueStyle}>{apiMetrics.totalRequests.toLocaleString()}</div>
            </div>
            <div style={metricBoxStyle}>
              <div style={metricLabelStyle}>Success Rate</div>
              <div style={{ ...metricValueStyle, color: '#2e7d32' }}>
                {apiMetrics.successRate.toFixed(1)}%
              </div>
            </div>
            <div style={metricBoxStyle}>
              <div style={metricLabelStyle}>Avg Response Time</div>
              <div style={metricValueStyle}>{apiMetrics.avgResponseTime}ms</div>
            </div>
            <div style={metricBoxStyle}>
              <div style={metricLabelStyle}>Failed Requests</div>
              <div style={{ ...metricValueStyle, color: '#d32f2f' }}>
                {apiMetrics.failedRequests}
              </div>
            </div>
          </div>

          {apiMetrics.topEndpoints && apiMetrics.topEndpoints.length > 0 && (
            <>
              <h4 style={{ marginTop: 20 }}>Top Endpoints</h4>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Endpoint</th>
                    <th style={thStyle}>Requests</th>
                    <th style={thStyle}>Avg Response</th>
                    <th style={thStyle}>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {apiMetrics.topEndpoints.map((endpoint, idx) => (
                    <tr key={idx}>
                      <td style={tdStyle}>{endpoint.endpoint}</td>
                      <td style={tdStyle}>{endpoint.count}</td>
                      <td style={tdStyle}>{Math.round(endpoint.avgResponseTime)}ms</td>
                      <td style={{ ...tdStyle, color: endpoint.errors > 0 ? '#d32f2f' : '#2e7d32' }}>
                        {endpoint.errors}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* Recent Errors */}
      {errors && errors.length > 0 && (
        <div style={{ ...containerStyle, marginTop: 20 }}>
          <h3>Recent Errors ({errors.length})</h3>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {errors.map((error, idx) => (
              <div key={error.id || idx} style={errorCardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{
                    ...badgeStyle,
                    backgroundColor: error.severity === 'critical' ? '#d32f2f' :
                                    error.severity === 'error' ? '#ed6c02' : '#1976d2',
                    color: 'white'
                  }}>
                    {error.severity || 'error'}
                  </span>
                  <span style={{ fontSize: '0.85rem', color: '#666' }}>
                    {new Date(error.timestamp).toLocaleString()}
                  </span>
                </div>
                <div style={{ fontWeight: '500', marginBottom: 5 }}>
                  {error.type || 'Unknown Error'}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#666' }}>
                  {error.message}
                </div>
                {error.stack && (
                  <details style={{ marginTop: 10, fontSize: '0.85rem' }}>
                    <summary style={{ cursor: 'pointer', color: '#1976d2' }}>
                      View Stack Trace
                    </summary>
                    <pre style={{ 
                      marginTop: 10, 
                      padding: 10, 
                      backgroundColor: '#f5f5f5', 
                      borderRadius: 4,
                      overflow: 'auto',
                      fontSize: '0.8rem'
                    }}>
                      {error.stack}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Integration Scan Results */}
      {scanResults && (
        <div style={{ ...containerStyle, marginTop: 20 }}>
          <h3>Integration Scan Results</h3>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
            {Object.entries(scanResults.checks).map(([key, check]) => (
              <div key={key} style={{ padding: 10, borderRadius: 6, border: '1px solid #eee', minWidth: 220 }}>
                <div style={{ fontWeight: '600' }}>{key.replace(/_/g,' ').toUpperCase()}</div>
                <div style={{ color: check.status === 'ok' ? '#2e7d32' : check.status === 'warning' ? '#ed6c02' : '#d32f2f', marginTop: 6 }}>{check.message}</div>
                {check.id && <div style={{ fontSize: '0.85rem', marginTop: 8 }}>ID: {check.id}</div>}
                {check.squadId && <div style={{ fontSize: '0.85rem', marginTop: 8 }}>SquadId: {check.squadId}</div>}
                {check.connection && (
                  <div style={{ fontSize: '0.85rem', marginTop: 8 }}>
                    {Object.entries(check.connection).slice(0,4).map(([k,v]) => <div key={k}><strong>{k}</strong>: {String(v)}</div>)}
                  </div>
                )}
                {/* Show remediation suggestion & action for admin */}
                {isAdmin && check.status !== 'ok' && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}><strong>Suggestion:</strong> {check.recommendation}</div>
                    <button onClick={async () => {
                      try {
                        const token = await auth.currentUser?.getIdToken();
                        const scanId = scanResults.scanId || null; // if coming directly from history
                        const targetScanId = scanId || 'UNKNOWN';
                        // If scanning live (not stored), we need to store the scan first to remediate against it
                        let recordId = scanId;
                        if (!recordId) {
                          // store current scan to system_scans
                          const storeResp = await fetch(`${API_BASE_URL}/api/diagnostics/scan?dashboard=admin&store=1`, { headers: { Authorization: `Bearer ${token}` } });
                          const storeData = await storeResp.json();
                          // no guaranteed id; fetch the latest recorded scan instead
                          const historyResp = await fetch(`${API_BASE_URL}/api/diagnostics/scans`, { headers: { Authorization: `Bearer ${token}` } });
                          const historyData = await historyResp.json();
                          if (historyData.scans && historyData.scans.length) recordId = historyData.scans[0].id;
                        }
                        if (!recordId) throw new Error('Unable to obtain scan record id');
                        // call remediation endpoint for this single check
                        const remediationResp = await fetch(`${API_BASE_URL}/api/diagnostics/scans/${recordId}/remediate`, { method: 'POST', headers: { 'content-type':'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ checks: [key] }) });
                        const remediationData = await remediationResp.json();
                        if (remediationData.success) {
                          alert('Remediation applied successfully. Re-run scan to verify.');
                          fetchAllData(); fetchHistory();
                        } else {
                          alert('Remediation failed: ' + JSON.stringify(remediationData));
                        }
                      } catch (e) { console.error('Remediation failed:', e); alert('Remediation failed: ' + (e && e.message)); }
                    }} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, backgroundColor: '#2e7d32', color: 'white', border: 'none' }}>Run suggested fix</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {history && history.length > 0 && (
        <div style={{ ...containerStyle, marginTop: 20 }}>
          <h3>Scan History</h3>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>When</th>
                <th style={thStyle}>Dashboard</th>
                <th style={thStyle}>Overall</th>
                <th style={thStyle}>Details</th>
              </tr>
            </thead>
            <tbody>
              {history.map(scan => (
                <tr key={scan.id}>
                  <td style={tdStyle}>{new Date(scan.createdAt).toLocaleString()}</td>
                  <td style={tdStyle}>{scan.dashboard}</td>
                  <td style={{ ...tdStyle, color: scan.result.overall === 'ok' ? '#2e7d32' : (scan.result.overall === 'warning' ? '#ed6c02' : '#d32f2f') }}>{scan.result.overall}</td>
                  <td style={tdStyle}><details><summary>View</summary><pre style={{ whiteSpace:'pre-wrap' }}>{JSON.stringify(scan.result, null, 2)}</pre></details></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Live Activity Feed */}
      {activities && activities.length > 0 && (
        <div style={{ ...containerStyle, marginTop: 20 }}>
          <h3>Live Activity Feed</h3>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {activities.map((activity, idx) => (
              <div key={activity.id || idx} style={activityCardStyle}>
                <div style={{ display: 'flex', gap: 15 }}>
                  <div style={{ fontSize: '1.5rem' }}>
                    {activity.type === 'upload' ? '📤' :
                     activity.type === 'promotion' ? '📢' :
                     activity.type === 'purchase' ? '💰' :
                     activity.type === 'login' ? '🔐' : '📊'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500' }}>
                      {activity.user?.name || 'Unknown User'}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>
                      {activity.description || activity.type}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#999', marginTop: 5 }}>
                      {new Date(activity.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Styles
const containerStyle = {
  backgroundColor: 'white',
  borderRadius: 12,
  padding: 20,
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
};

const metricBoxStyle = {
  padding: 15,
  backgroundColor: '#f5f5f5',
  borderRadius: 8,
  flex: '1 1 150px',
  minWidth: 150
};

const metricLabelStyle = {
  fontSize: '0.85rem',
  color: '#666',
  marginBottom: 5
};

const metricValueStyle = {
  fontSize: '1.5rem',
  fontWeight: 'bold',
  color: '#1976d2'
};

const metricSubtextStyle = {
  fontSize: '0.8rem',
  color: '#999',
  marginTop: 3
};

const refreshButtonStyle = {
  padding: '8px 16px',
  backgroundColor: '#1976d2',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: '0.9rem'
};

const errorCardStyle = {
  padding: 15,
  borderLeft: '4px solid #d32f2f',
  backgroundColor: '#fff',
  marginBottom: 10,
  borderRadius: 4
};

const activityCardStyle = {
  padding: 12,
  borderBottom: '1px solid #eee'
};

const badgeStyle = {
  padding: '4px 8px',
  borderRadius: 4,
  fontSize: '0.75rem',
  fontWeight: '500'
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: 10
};

const thStyle = {
  textAlign: 'left',
  padding: '12px 8px',
  borderBottom: '2px solid #eee',
  fontWeight: '600',
  fontSize: '0.9rem'
};

const tdStyle = {
  padding: '10px 8px',
  borderBottom: '1px solid #eee',
  fontSize: '0.9rem'
};

export default SystemHealthPanel;
